import "server-only"
import { tenantAtual } from "@/lib/tenant"

import { estatisticasFontes, lerLotes, nomesDeEmpresas } from "@/lib/db/fontes"
import {
  FILIACAO_CONDICOES,
  GRUPOS_CONDICAO,
  pendenciasDoVinculo,
} from "@/lib/filiacao"
import { contatosDoFiliado, type ContatosDoFiliado } from "@/lib/db/filiacao-contatos"
import {
  ehArquivo,
  ehDoBubble,
  urlDocumentoDoVinculo,
} from "@/lib/db/filiacao-documentos"
import { hojeSP } from "@/lib/db/comum"
import { reembolsosDoFiliado, type ReembolsoFiliado } from "@/lib/db/filiacao-reembolsos"
import { createAdminClient, createServiceClient } from "@/lib/supabase/admin"
import { semAcento } from "@/lib/texto"

export const FILIADOS_POR_PAGINA = 50

export type FiliadoLinha = {
  id: string
  nome_completo: string | null
  cpf: string | null
  matricula_sindical: string | null
  filiacao_lotacao: string | null
  filiacao_condicao: string | null
  filiacao_excluida: boolean | null
  created_at: string | null
}

export type FiltrosFiliados = {
  busca?: string
  situacao?: "todas" | "ativas" | "excluidas"
  /** Valor de filiacao_condicao, "todas" ou "nenhuma" (condição null). */
  condicao?: string
  /** "Masculino" | "Feminino" | "Outro" | "nenhum" (sem sexo) | "todos". */
  sexo?: string
  /** id da fonte pagadora — filtra quem tem a fonte no HISTÓRICO de vínculos. */
  fonte?: string
  pagina?: number
  ordem?: "nome" | "matricula" | "cadastro"
  dir?: "asc" | "desc"
}

export type ListaFiliados = {
  linhas: FiliadoLinha[]
  total: number
  pagina: number
  totalPaginas: number
}

const COLUNAS_ORDEM: Record<string, string> = {
  nome: "nome_completo",
  matricula: "matricula_sindical",
  cadastro: "created_at",
}

/** Escapa curingas do LIKE para busca literal. */
function escaparLike(termo: string): string {
  return termo.replace(/[%_\\]/g, "\\$&")
}

/**
 * Termo com cara de identificador: CPF, matrícula sindical ou matrícula na
 * fonte. Vale para número com máscara ("123.456.789-00", "850") e para
 * qualquer termo sem espaço que tenha dígito ("BR12345"). Nome não tem
 * dígito, então não disputa com a busca por nome.
 */
function ehIdentificador(termo: string): boolean {
  const digitos = termo.replace(/\D/g, "")
  const soNumerico = digitos.length >= 3 && /^[\d.\-\s/]+$/.test(termo)
  return soNumerico || (/\d/.test(termo) && !/\s/.test(termo))
}

/** Matrícula comparável: sem máscara, maiúscula e sem zeros à esquerda. */
function normalizarMatricula(valor: string): string {
  return valor
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .replace(/^0+/, "")
}

/** Teto de registros trazidos pela matrícula na fonte (vão num `id.in`). */
const LIMITE_VINCULOS_BUSCA = 200

/**
 * Registros de filiação cuja matrícula NA FONTE (a matrícula do empregador:
 * filiacao_vinculos.matricula, ou o legado fonte_pg_matricula) começa pelo
 * termo. Devolve id do registro → matrícula encontrada.
 *
 * Caminho principal: RPC `filiados_por_matricula_vinculo`
 * (supabase/busca-matricula-vinculo.sql), que ignora máscara, caixa e zeros
 * à esquerda e usa índice. A RPC roda pelo service role e filtra a
 * organização em p_emp. Sem a função no banco, cai num ilike por prefixo no
 * texto cru: acha menos (depende da máscara), mas não quebra a busca.
 */
async function registrosPorMatriculaVinculo(
  termo: string,
  empId: string
): Promise<Map<string, string>> {
  const resultado = new Map<string, string>()
  const norm = normalizarMatricula(termo)
  if (norm.length < 3) return resultado

  const { data, error } = await createServiceClient().rpc(
    "filiados_por_matricula_vinculo",
    { p_emp: empId, p_termo: norm, p_limite: LIMITE_VINCULOS_BUSCA }
  )
  if (!error) {
    for (const l of (data ?? []) as {
      filiado_id: string | null
      matricula: string | null
    }[]) {
      if (l.filiado_id && !resultado.has(l.filiado_id)) {
        resultado.set(l.filiado_id, l.matricula ?? "")
      }
    }
    return resultado
  }

  console.warn(
    "[busca filiados] RPC filiados_por_matricula_vinculo indisponível, usando ilike:",
    error.message
  )
  // Só caracteres de matrícula: o termo vai dentro do filtro `or` do PostgREST.
  const seguro = termo.replace(/[^A-Za-z0-9.\-/]/g, "")
  if (seguro.length < 3) return resultado
  const admin = await createAdminClient()
  const { data: linhas } = await admin
    .from("filiacao_vinculos")
    .select("filiado_id, matricula, fonte_pg_matricula")
    .eq("emp_proprietaria_id", empId)
    .or(`matricula.ilike.${seguro}%,fonte_pg_matricula.ilike.${seguro}%`)
    .limit(LIMITE_VINCULOS_BUSCA)
  for (const l of (linhas ?? []) as {
    filiado_id: string | null
    matricula: string | null
    fonte_pg_matricula: string | null
  }[]) {
    if (l.filiado_id && !resultado.has(l.filiado_id)) {
      resultado.set(l.filiado_id, l.matricula ?? l.fonte_pg_matricula ?? "")
    }
  }
  return resultado
}

/** Pré-busca da listagem: ids pela matrícula na fonte, só para identificador. */
async function idsPorMatriculaVinculo(
  busca: string | undefined,
  empId: string
): Promise<string[]> {
  const termo = (busca ?? "").trim()
  if (!termo || !ehIdentificador(termo)) return []
  return [...(await registrosPorMatriculaVinculo(termo, empId)).keys()]
}

/** Subconjunto do builder do PostgREST usado pelos filtros da listagem. */
type BuilderFiltros = {
  eq(coluna: string, valor: unknown): BuilderFiltros
  in(coluna: string, valores: readonly unknown[]): BuilderFiltros
  is(coluna: string, valor: unknown): BuilderFiltros
  not(coluna: string, operador: string, valor: unknown): BuilderFiltros
  or(filtros: string): BuilderFiltros
  ilike(coluna: string, padrao: string): BuilderFiltros
}

/**
 * Aplica tenant, situação e busca ao builder. O cast evita a tipagem
 * recursiva do PostgREST (excessively deep) — o retorno preserva o tipo
 * do builder recebido.
 */
function aplicarFiltros<T>(
  builder: T,
  {
    busca = "",
    situacao = "todas",
    condicao = "todas",
    sexo = "todos",
    fonte = "",
  }: FiltrosFiliados,
  empId: string,
  /** Registros achados pela matrícula na fonte (pré-busca assíncrona). */
  idsVinculo: readonly string[] = []
): T {
  let q = builder as unknown as BuilderFiltros
  q = q.eq("emp_proprietaria_id", empId)

  if (situacao === "ativas") q = q.not("filiacao_excluida", "is", true)
  if (situacao === "excluidas") q = q.eq("filiacao_excluida", true)

  if (condicao === "nenhuma") q = q.is("filiacao_condicao", null)
  else if (condicao in GRUPOS_CONDICAO) {
    q = q.in("filiacao_condicao", GRUPOS_CONDICAO[condicao].condicoes)
  } else if (condicao !== "todas") q = q.eq("filiacao_condicao", condicao)

  if (sexo === "nenhum") q = q.is("sexo", null)
  else if (sexo !== "todos" && sexo) q = q.eq("sexo", sexo)

  // O filtro por fonte NÃO passa por aqui: sem índice nas FKs, o join
  // com filiacao_vinculos estoura o statement timeout — esse caminho é
  // servido em memória (ver listarFiliadosPorFonte).
  void fonte

  const termo = busca.trim()
  if (termo) {
    const digitos = termo.replace(/\D/g, "")
    if (ehIdentificador(termo)) {
      // CPF e matrícula sindical por prefixo (com ou sem máscara), mais os
      // registros achados pela matrícula na fonte (idsVinculo).
      const partes: string[] = []
      if (digitos.length >= 3) {
        partes.push(`cpf.like.${digitos}%`, `matricula_sindical.like.${digitos}%`)
      }
      if (idsVinculo.length > 0) partes.push(`id.in.(${idsVinculo.join(",")})`)
      q = partes.length > 0 ? q.or(partes.join(",")) : q.in("id", [])
    } else {
      // Cada palavra vira um AND — "Sergio Borges" acha "Sergio Borges Cordeiro"
      // e também composições não adjacentes ("Sergio Cordeiro"). Busca na coluna
      // normalizada (sem acento) com o termo também sem acento.
      for (const palavra of semAcento(termo).split(/\s+/).filter(Boolean)) {
        q = q.ilike("nome_completo_norm", `%${escaparLike(palavra)}%`)
      }
    }
  }
  return q as unknown as T
}

const SELECT_LINHAS =
  "id, nome_completo, cpf, matricula_sindical, filiacao_lotacao, filiacao_condicao, filiacao_excluida, created_at"

/**
 * Filtro por fonte pagadora, em memória: replica os filtros da listagem
 * sobre o snapshot de registros do cache de fontes (10 min) cruzado com o
 * conjunto de registros que têm a fonte no histórico de vínculos. Motivo:
 * o join filiacao_vinculos×filiacoes roda sem índice nas FKs no snapshot
 * migrado e estoura o statement timeout do Supabase.
 */
async function filtrarPorFonteEmMemoria(
  filtros: FiltrosFiliados
): Promise<FiliadoLinha[]> {
  const { ordem = "nome", dir = "asc" } = filtros
  const stats = await estatisticasFontes()
  const membros = stats.registrosPorFonte.get(filtros.fonte!) ?? new Set()

  const situacao = filtros.situacao ?? "todas"
  const condicao = filtros.condicao ?? "todas"
  const sexo = filtros.sexo ?? "todos"
  const termo = (filtros.busca ?? "").trim()
  const digitos = termo.replace(/\D/g, "")
  const identificador = termo !== "" && ehIdentificador(termo)
  const palavras = identificador
    ? []
    : semAcento(termo).split(/\s+/).filter(Boolean)
  const idsVinculo = new Set(
    identificador ? await idsPorMatriculaVinculo(termo, await tenantAtual()) : []
  )

  const linhas = stats.registros.filter((f) => {
    if (!membros.has(f.id)) return false
    if (situacao === "ativas" && f.filiacao_excluida === true) return false
    if (situacao === "excluidas" && f.filiacao_excluida !== true) return false
    if (condicao === "nenhuma" && f.filiacao_condicao !== null) return false
    if (condicao in GRUPOS_CONDICAO) {
      if (
        !GRUPOS_CONDICAO[condicao].condicoes.includes(
          f.filiacao_condicao as never
        )
      ) {
        return false
      }
    } else if (
      condicao !== "todas" &&
      condicao !== "nenhuma" &&
      f.filiacao_condicao !== condicao
    ) {
      return false
    }
    if (sexo === "nenhum" && f.sexo !== null) return false
    if (sexo !== "todos" && sexo !== "nenhum" && f.sexo !== sexo) return false
    if (identificador) {
      return (
        (digitos.length >= 3 &&
          ((f.cpf ?? "").startsWith(digitos) ||
            (f.matricula_sindical ?? "").startsWith(digitos))) ||
        idsVinculo.has(f.id)
      )
    }
    if (palavras.length > 0) {
      const nome = semAcento(f.nome_completo ?? "")
      return palavras.every((p) => nome.includes(p))
    }
    return true
  })

  const campo = (f: FiliadoLinha) =>
    ordem === "matricula"
      ? f.matricula_sindical
      : ordem === "cadastro"
        ? f.created_at
        : f.nome_completo
  const sinal = dir === "desc" ? -1 : 1
  linhas.sort((a, b) => {
    const va = campo(a)
    const vb = campo(b)
    if (va === null && vb === null) return 0
    if (va === null) return 1 // nulls sempre no fim, como no banco
    if (vb === null) return -1
    return sinal * va.localeCompare(vb, "pt-BR")
  })
  return linhas
}

export async function listarFiliados(
  filtros: FiltrosFiliados
): Promise<ListaFiliados> {
  const { pagina = 1, ordem = "nome", dir = "asc" } = filtros

  if (filtros.fonte) {
    const linhas = await filtrarPorFonteEmMemoria(filtros)
    const de = (pagina - 1) * FILIADOS_POR_PAGINA
    return {
      linhas: linhas.slice(de, de + FILIADOS_POR_PAGINA),
      total: linhas.length,
      pagina,
      totalPaginas: Math.max(1, Math.ceil(linhas.length / FILIADOS_POR_PAGINA)),
    }
  }

  const admin = await createAdminClient()

  let q = admin
    .from("filiacoes")
    .select(SELECT_LINHAS, { count: "exact" })
  const empId = await tenantAtual()
  const idsVinculo = await idsPorMatriculaVinculo(filtros.busca, empId)
  q = aplicarFiltros(q, filtros, empId, idsVinculo)
  q = q
    .order(COLUNAS_ORDEM[ordem] ?? "nome_completo", {
      ascending: dir !== "desc",
      nullsFirst: false,
    })
    // desempate estável entre páginas (nomes repetidos embaralhavam)
    .order("id", { ascending: true })

  const de = (pagina - 1) * FILIADOS_POR_PAGINA
  const { data, count, error } = await q.range(de, de + FILIADOS_POR_PAGINA - 1)
  if (error) throw new Error(`Falha ao listar filiados: ${error.message}`)

  const total = count ?? 0
  return {
    linhas: (data ?? []) as unknown as FiliadoLinha[],
    total,
    pagina,
    totalPaginas: Math.max(1, Math.ceil(total / FILIADOS_POR_PAGINA)),
  }
}

/** Exportação: mesmas condições da listagem, sem paginação (lotes de 1000). */
export async function listarFiliadosParaExportar(
  filtros: FiltrosFiliados
): Promise<FiliadoLinha[]> {
  if (filtros.fonte) return filtrarPorFonteEmMemoria(filtros)

  const admin = await createAdminClient()
  const linhas: FiliadoLinha[] = []
  const LOTE = 1000
  const empId = await tenantAtual()
  const idsVinculo = await idsPorMatriculaVinculo(filtros.busca, empId)

  for (let de = 0; ; de += LOTE) {
    let q = admin.from("filiacoes").select(SELECT_LINHAS)
    q = aplicarFiltros(q, filtros, empId, idsVinculo)
    const { data, error } = await q
      .order("nome_completo", { ascending: true, nullsFirst: false })
      .order("id", { ascending: true })
      .range(de, de + LOTE - 1)
    if (error) throw new Error(`Falha na exportação: ${error.message}`)
    linhas.push(...((data ?? []) as unknown as FiliadoLinha[]))
    if (!data || data.length < LOTE) break
  }
  return linhas
}

export type SugestaoFiliado = {
  id: string
  nome_completo: string | null
  cpf: string | null
  matricula_sindical: string | null
  filiacao_condicao: string | null
  /** Matrícula na fonte que casou com a busca (só quando achado por ela). */
  matricula_fonte?: string | null
}

/**
 * Sugestões da busca rápida (nome composto, CPF, matrícula sindical ou
 * matrícula na fonte do vínculo).
 * Termo numérico: quem tem a matrícula sindical ou o CPF EXATAMENTE igual
 * vem primeiro — a busca por prefixo, ordenada por nome e cortada em
 * `limite`, soterrava a matrícula 850 sob 8504, 8505 e CPFs 850…
 */
export async function sugerirFiliados(
  busca: string,
  limite = 8
): Promise<SugestaoFiliado[]> {
  const termo = busca.trim()
  if (termo.length < 3) return []
  const admin = await createAdminClient()
  const empId = await tenantAtual()
  const colunas = "id, nome_completo, cpf, matricula_sindical, filiacao_condicao"

  // Termo identificador (CPF, matrícula sindical ou na fonte): quem tem um
  // deles EXATAMENTE igual vem primeiro. (As barras destas regex tinham se
  // perdido em 2026: /D/g e /^[d.-s/]+$/ tratavam "Maria" como número e não
  // tiravam a máscara do CPF.)
  const digitos = termo.replace(/\D/g, "")
  const identificador = ehIdentificador(termo)
  const porVinculo = identificador
    ? await registrosPorMatriculaVinculo(termo, empId)
    : new Map<string, string>()

  let exatos: SugestaoFiliado[] = []
  if (identificador) {
    const partes: string[] = []
    if (digitos.length >= 3) {
      const matricula = digitos.replace(/^0+/, "") || digitos
      partes.push(`matricula_sindical.eq.${matricula}`, `cpf.eq.${digitos}`)
    }
    const norm = normalizarMatricula(termo)
    const idsExatosVinculo = [...porVinculo]
      .filter(([, m]) => normalizarMatricula(m) === norm)
      .map(([id]) => id)
    if (idsExatosVinculo.length > 0) {
      partes.push(`id.in.(${idsExatosVinculo.join(",")})`)
    }
    if (partes.length > 0) {
      const { data, error } = await admin
        .from("filiacoes")
        .select(colunas)
        .eq("emp_proprietaria_id", empId)
        .not("filiacao_excluida", "is", true)
        .or(partes.join(","))
        .order("nome_completo", { ascending: true, nullsFirst: false })
        .limit(limite)
      if (error) throw new Error(`Falha na busca: ${error.message}`)
      exatos = (data ?? []) as SugestaoFiliado[]
    }
  }

  let q = admin.from("filiacoes").select(colunas)
  q = aplicarFiltros(
    q,
    { busca: termo, situacao: "ativas" },
    empId,
    [...porVinculo.keys()]
  )
  const { data, error } = await q
    .order("nome_completo", { ascending: true, nullsFirst: false })
    .limit(limite)
  if (error) throw new Error(`Falha na busca: ${error.message}`)

  const vistos = new Set(exatos.map((e) => e.id))
  const demais = ((data ?? []) as SugestaoFiliado[]).filter((s) => !vistos.has(s.id))
  return [...exatos, ...demais].slice(0, limite).map((s) => ({
    ...s,
    matricula_fonte: porVinculo.get(s.id) ?? null,
  }))
}

/** Um filiado pelo id (para exibir/pré-selecionar um vínculo). Sem filtro de
 * situação — um vínculo existente deve aparecer mesmo que a filiação não esteja
 * mais ativa. */
export async function buscarSugestaoFiliado(
  id: string
): Promise<SugestaoFiliado | null> {
  if (!id) return null
  const admin = await createAdminClient()
  const { data } = await admin
    .from("filiacoes")
    .select("id, nome_completo, cpf, matricula_sindical, filiacao_condicao")
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  return (data as SugestaoFiliado | null) ?? null
}

/** Filiações ATIVAS com um CPF exato — para sugerir vínculo automático quando
 * um documento traz o CPF. Pode devolver mais de uma (CPFs repetidos no
 * legado); nesse caso o vínculo continua sendo escolha humana. */
export async function filiadosAtivosPorCpf(
  cpf: string | null
): Promise<SugestaoFiliado[]> {
  const digitos = (cpf ?? "").replace(/\D/g, "")
  if (digitos.length !== 11) return []
  const admin = await createAdminClient()
  const { data } = await admin
    .from("filiacoes")
    .select("id, nome_completo, cpf, matricula_sindical, filiacao_condicao")
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("cpf", digitos)
    .not("filiacao_excluida", "is", true)
    .limit(5)
  return (data ?? []) as SugestaoFiliado[]
}

export type Vinculo = {
  id: string
  cargo: string | null
  lotacao: string | null
  matricula: string | null
  data_filiacao: string | null
  data_desfiliacao: string | null
  filiacao_data_adesao: string | null
  filiacao_data_saida: string | null
  data_entrada_admissao: string | null
  data_saida_demissao: string | null
  fonte_pg_cargo: string | null
  fonte_pg_admissao: string | null
  fonte_pagadora_id: string | null
  fontePagadora: string | null
  /** A fonte é fundo de pensão: cargo e lotação aparecem como "não aplicável". */
  fundoPensao: boolean
  condicao_na_fonte: string | null
  regime_trabalho: string | null
  /** Campos obrigatórios que faltam (ver pendenciasDoVinculo). */
  pendencias: string[]
  /**
   * Veio do backfill do cadastro antigo, não de alguém que o registrou.
   * Quem atende precisa saber: o vínculo tem só data e fonte pagadora,
   * porque era só isso que o cadastro de origem guardava.
   */
  reconstruido: boolean
  /** Tem ficha de filiação anexada? */
  temFicha: boolean
  /** Tem carta de desfiliação anexada? */
  temCarta: boolean
  /** Links para abrir os documentos (assinados ou do Bubble); null = sem arquivo. */
  fichaUrl: string | null
  cartaUrl: string | null
  /** Algum dos dois ainda mora no CDN do Bubble, e não no nosso bucket. */
  documentoNoBubble: boolean
}

export type VinculoTrabalhista = {
  id: string
  cargo: string | null
  lotacao: string | null
  matricula: string | null
  regime_trabalho: string | null
  contrato_admissao: string | null
  contrato_demissao: string | null
  empregador_id: string | null
  empregador: string | null
}

export type Contribuicao = {
  id: string
  valor: number | null
  competencia: string | null
  tipo: string | null
  fonte: string | null
}

export type Reembolso = {
  id: string
  codigo: string | null
  descricao: string | null
  tipo: string | null
  situacao: string | null
  valor_pago: number | null
  vencimento: string | null
  data_pagamento: string | null
}

export type PerfilFiliado = {
  filiacao: Record<string, unknown> & FiliadoLinha
  outrosRegistros: FiliadoLinha[]
  vinculos: Vinculo[]
  vinculosTrabalhistas: VinculoTrabalhista[]
  contribuicoes: { total: number; ultimas: Contribuicao[] }
  /** Reembolsos a filiado (tabela própria, desde 08/09) — o que a entidade pagou à pessoa por participação. */
  reembolsosFiliacao: { total: number; ultimos: ReembolsoFiliado[]; totalPago: number }
  /** E-mails, telefones e endereços além dos que cabem no cadastro. */
  contatos: ContatosDoFiliado
  reembolsos: { total: number; ultimos: Reembolso[] }
}

export type ContribuicaoDetalhada = Contribuicao & { ordem: number | null }

/**
 * TODAS as contribuições da pessoa (registro + irmãos de CPF), ordenadas
 * por competência (ordem AAAAMM da remessa) decrescente. created_at é
 * quase todo null no snapshot — nunca ordenar por ele.
 */
async function contribuicoesDaPessoa(
  idsDaPessoa: string[]
): Promise<ContribuicaoDetalhada[]> {
  const admin = await createAdminClient()

  type Bruto = {
    id: string
    valor: number | null
    remessa_id: string | null
    fonte_pg_id: string | null
  }
  const brutos: Bruto[] = []
  const LOTE = 1000
  for (let de = 0; ; de += LOTE) {
    const { data, error } = await admin
      .from("filiacao_recebe")
      .select("id, valor, remessa_id, fonte_pg_id")
      .in("filiado_id", idsDaPessoa)
      .eq("emp_proprietaria_id", await tenantAtual())
      .order("filiado_id", { ascending: true })
      .order("id", { ascending: true })
      .range(de, de + LOTE - 1)
    if (error) {
      throw new Error(`Falha ao carregar contribuições: ${error.message}`)
    }
    brutos.push(...(data ?? []))
    if (!data || data.length < LOTE) break
  }

  const remessaIds = [
    ...new Set(brutos.map((c) => c.remessa_id).filter((v): v is string => Boolean(v))),
  ]
  const remessas = new Map<
    string,
    { ano: string | null; mes: string | null; tipo: string | null; ordem: number | null }
  >()
  for (let de = 0; de < remessaIds.length; de += 100) {
    const { data } = await admin
      .from("filiacao_recebe_remessa")
      .select("id, ano, mes, tipo, ordem")
      .in("id", remessaIds.slice(de, de + 100))
    for (const r of data ?? []) remessas.set(r.id, r)
  }

  const nomesFontes = await nomesDeEmpresas([
    ...new Set(brutos.map((c) => c.fonte_pg_id).filter((v): v is string => Boolean(v))),
  ])

  return brutos
    .map((c) => {
      const remessa = c.remessa_id ? remessas.get(c.remessa_id) : undefined
      const ordem = remessa?.ordem ?? null
      const competencia = ordem
        ? `${String(ordem % 100).padStart(2, "0")}/${Math.floor(ordem / 100)}`
        : (remessa?.ano ?? null)
      return {
        id: c.id,
        valor: c.valor,
        competencia,
        tipo: remessa?.tipo ?? null,
        fonte: c.fonte_pg_id ? (nomesFontes.get(c.fonte_pg_id) ?? null) : null,
        ordem,
      }
    })
    .sort((a, b) => {
      if (a.ordem === null && b.ordem === null) return 0
      if (a.ordem === null) return 1
      if (b.ordem === null) return -1
      return b.ordem - a.ordem
    })
}

/** Contribuições completas do filiado, para a página dedicada. */
export async function listarContribuicoesFiliado(id: string): Promise<{
  filiado: { id: string; nome_completo: string | null }
  contribuicoes: ContribuicaoDetalhada[]
  totalValor: number
} | null> {
  const admin = await createAdminClient()
  const { data: filiacao } = await admin
    .from("filiacoes")
    .select("id, nome_completo, cpf")
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (!filiacao) return null

  const idsDaPessoa = [id]
  if (filiacao.cpf) {
    const { data: outros } = await admin
      .from("filiacoes")
      .select("id")
      .eq("cpf", filiacao.cpf)
      .eq("emp_proprietaria_id", await tenantAtual())
      .neq("id", id)
    idsDaPessoa.push(...(outros ?? []).map((o) => o.id))
  }

  const contribuicoes = await contribuicoesDaPessoa(idsDaPessoa)
  return {
    filiado: { id: filiacao.id, nome_completo: filiacao.nome_completo },
    contribuicoes,
    totalValor: contribuicoes.reduce((s, c) => s + (c.valor ?? 0), 0),
  }
}

export async function buscarPerfilFiliado(
  id: string
): Promise<PerfilFiliado | null> {
  const admin = await createAdminClient()

  const { data: filiacao } = await admin
    .from("filiacoes")
    .select("*")
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (!filiacao) return null

  // Outros registros da mesma pessoa (mesmo CPF)
  let outrosRegistros: FiliadoLinha[] = []
  const idsDaPessoa = [id]
  if (filiacao.cpf) {
    const { data: outros } = await admin
      .from("filiacoes")
      .select(
        "id, nome_completo, cpf, matricula_sindical, filiacao_lotacao, filiacao_condicao, filiacao_excluida, created_at"
      )
      .eq("cpf", filiacao.cpf)
      .eq("emp_proprietaria_id", await tenantAtual())
      .neq("id", id)
      .order("created_at", { ascending: false })
    outrosRegistros = (outros ?? []) as FiliadoLinha[]
    idsDaPessoa.push(...outrosRegistros.map((o) => o.id))
  }

  const [vinculosRes, trabalhistasRes, todasContribuicoes, usuariosDoCpf] =
    await Promise.all([
      // Histórico de vínculos de filiação de todos os registros da pessoa
      admin
        .from("filiacao_vinculos")
        .select(
          "id, cargo, lotacao, matricula, data_filiacao, data_desfiliacao, filiacao_data_adesao, filiacao_data_saida, data_entrada_admissao, data_saida_demissao, fonte_pg_cargo, fonte_pg_admissao, fonte_pagadora_id, ficha_filiacao, carta_desfiliacao, reconstruido_de, condicao_na_fonte, regime_trabalho"
        )
        .in("filiado_id", idsDaPessoa)
        .order("created_at", { ascending: false }),
      // Vínculos empregatícios (tabela própria — ver caso Wilson, 2026-07-13)
      admin
        .from("vinculos_trabalhistas")
        .select(
          "id, cargo, lotacao, matricula, regime_trabalho, contrato_admissao, contrato_demissao, empregador_id"
        )
        .in("filiado_id", idsDaPessoa)
        .order("contrato_admissao", { ascending: false, nullsFirst: false }),
      // Contribuições ordenadas por competência (o vínculo é filiado_id;
      // recebe.cpf é 100% null no snapshot)
      contribuicoesDaPessoa(idsDaPessoa),
      // Reembolsos: ordens de pagamento cujo beneficiário é a pessoa (via usuarios)
      filiacao.cpf
        ? admin.from("usuarios").select("id").eq("cpf", filiacao.cpf)
        : Promise.resolve({ data: [] as { id: string }[] }),
    ])

  const usuarioIds = (usuariosDoCpf.data ?? []).map((u) => u.id)
  const reembolsosRes = usuarioIds.length
    ? await admin
        .from("ordens_pagamento")
        .select(
          "id, codigo, descricao, tipo, situacao, valor_pago, vencimento, data_pagamento",
          { count: "exact" }
        )
        .eq("emp_proprietaria_id", await tenantAtual())
        .not("excluido", "is", true)
        .in("beneficiario_usuario_id", usuarioIds)
        .order("vencimento", { ascending: false, nullsFirst: false })
        .limit(10)
    : { data: [], count: 0 }

  // Resolução de nomes de empresas (fontes pagadoras + empregadores) num lote só
  const empresaIds = [
    ...new Set(
      [
        ...(vinculosRes.data ?? []).map((v) => v.fonte_pagadora_id),
        ...(trabalhistasRes.data ?? []).map((v) => v.empregador_id),
      ].filter((v): v is string => Boolean(v))
    ),
  ]
  const nomesEmpresas = new Map<string, string>()
  const fundosPensao = new Set<string>()
  if (empresaIds.length > 0) {
    const { data: empresas } = await admin
      .from("empresa")
      .select("id, empresa, nome_fantasia, nome_razao, fundo_pensao")
      .in("id", empresaIds)
    for (const e of empresas ?? []) {
      const nome = [e.empresa, e.nome_fantasia, e.nome_razao].find(
        (v): v is string => typeof v === "string" && v.trim() !== ""
      )
      if (nome) nomesEmpresas.set(e.id, nome)
      if (e.fundo_pensao === true) fundosPensao.add(e.id)
    }
  }
  const nomeEmpresa = (id: string | null) =>
    id ? (nomesEmpresas.get(id) ?? null) : null

  const noBubble = (valor: unknown) =>
    ehDoBubble(typeof valor === "string" ? valor : null)

  const vinculos: Vinculo[] = await Promise.all(
    (vinculosRes.data ?? []).map(async (v) => {
      const ficha = typeof v.ficha_filiacao === "string" ? v.ficha_filiacao : null
      const carta = typeof v.carta_desfiliacao === "string" ? v.carta_desfiliacao : null
      const temFicha = ehArquivo(ficha)
      const temCarta = ehArquivo(carta)
      // As tags "ficha"/"carta" da página abrem o documento: resolve o link
      // aqui (URL assinada de 1h, ou a do CDN do Bubble enquanto não migra).
      const [fichaUrl, cartaUrl] = await Promise.all([
        temFicha ? urlDocumentoDoVinculo(ficha) : Promise.resolve(null),
        temCarta ? urlDocumentoDoVinculo(carta) : Promise.resolve(null),
      ])
      return {
        ...v,
        fontePagadora: nomeEmpresa(v.fonte_pagadora_id),
        fundoPensao: v.fonte_pagadora_id
          ? fundosPensao.has(v.fonte_pagadora_id)
          : false,
        reconstruido: Boolean(v.reconstruido_de),
        temFicha,
        temCarta,
        fichaUrl,
        cartaUrl,
        documentoNoBubble: noBubble(v.ficha_filiacao) || noBubble(v.carta_desfiliacao),
        pendencias: pendenciasDoVinculo({
          ...v,
          temFicha,
          fundoPensao: v.fonte_pagadora_id
            ? fundosPensao.has(v.fonte_pagadora_id)
            : false,
        }),
      }
    })
  )

  const vinculosTrabalhistas: VinculoTrabalhista[] = (
    trabalhistasRes.data ?? []
  ).map((v) => ({
    ...v,
    empregador: nomeEmpresa(v.empregador_id),
  }))

  const contribuicoes = {
    total: todasContribuicoes.length,
    ultimas: todasContribuicoes.slice(0, 12),
  }

  // Reembolsos e contatos são da PESSOA, não do registro: todos os ids do CPF.
  const [reembolsosFiliacao, contatos] = await Promise.all([
    reembolsosDoFiliado(idsDaPessoa),
    contatosDoFiliado(idsDaPessoa, filiacao as Record<string, string | null>),
  ])

  return {
    filiacao: filiacao as PerfilFiliado["filiacao"],
    outrosRegistros,
    vinculos,
    vinculosTrabalhistas,
    contribuicoes,
    reembolsosFiliacao,
    contatos,
    reembolsos: {
      total: reembolsosRes.count ?? 0,
      ultimos: (reembolsosRes.data ?? []) as Reembolso[],
    },
  }
}

// ── Dashboard do módulo ────────────────────────────────────────────────────

export type ResumoFiliados = {
  registros: number
  /** Registros de filiação com condição 'Ativo'. */
  filiacoesAtivas: number
  /** Fontes pagadoras com pelo menos um filiado ativo. */
  fontesComFiliados: number
  /** Divisão por sexo dos registros ativos (condição 'Ativo'). */
  porSexo: { rotulo: string; total: number }[]
  /** Vínculos ABERTOS de filiados ativos, por regime de trabalho. */
  porRegime: { rotulo: string; total: number }[]
  /** Vínculos ABERTOS de filiados ativos, por condição na fonte pagadora. */
  porCondicaoFonte: { rotulo: string; total: number }[]
  /** Filiações × desfiliações no período (pela data do evento). */
  movimento: { periodo: PeriodoMovimento; filiacoes: number; desfiliacoes: number; inicio: string; fim: string }
  /** Filiados ativos (pessoas) por fonte pagadora — 10 maiores. */
  porFonte: { id: string; fonte: string; total: number }[]
  /** Registros por condição de filiação (inclui excluídas — link usa situacao=todas). */
  porCondicao: { condicao: string | null; total: number }[]
  aniversariantes: { total: number; hoje: string; nomes: Aniversariante[] }
}

export type Aniversariante = { id: string; nome_completo: string | null }

export type PeriodoMovimento = "semana" | "mes" | "ano"

/** Início e fim (ISO, inclusive) do período em America/Sao_Paulo. */
function limitesDoPeriodo(periodo: PeriodoMovimento): { inicio: string; fim: string } {
  const hoje = hojeSP()
  const [a, m, d] = hoje.split("-").map(Number)
  const iso = (dt: Date) => dt.toISOString().slice(0, 10)
  if (periodo === "ano") return { inicio: `${a}-01-01`, fim: `${a}-12-31` }
  if (periodo === "mes") {
    const ultimo = new Date(Date.UTC(a, m, 0))
    return { inicio: `${a}-${String(m).padStart(2, "0")}-01`, fim: iso(ultimo) }
  }
  // semana: segunda a domingo
  const data = new Date(Date.UTC(a, m - 1, d))
  const diaSemana = (data.getUTCDay() + 6) % 7 // 0 = segunda
  const segunda = new Date(data.getTime() - diaSemana * 86_400_000)
  const domingo = new Date(segunda.getTime() + 6 * 86_400_000)
  return { inicio: iso(segunda), fim: iso(domingo) }
}

/** Dia e mês de hoje em America/Sao_Paulo (o servidor pode estar em UTC). */
function hojeSaoPaulo(): { dia: number; mes: number; rotulo: string } {
  const partes = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "numeric",
    month: "numeric",
  }).formatToParts(new Date())
  const dia = Number(partes.find((p) => p.type === "day")?.value)
  const mes = Number(partes.find((p) => p.type === "month")?.value)
  return { dia, mes, rotulo: `${String(dia).padStart(2, "0")}/${String(mes).padStart(2, "0")}` }
}

export async function resumoFiliados(
  periodo: PeriodoMovimento = "mes"
): Promise<ResumoFiliados> {
  const admin = await createAdminClient()
  const hoje = hojeSaoPaulo()
  const empId = await tenantAtual()
  const limites = limitesDoPeriodo(periodo)

  const base = () =>
    admin
      .from("filiacoes")
      .select("id", { count: "exact", head: true })
      .eq("emp_proprietaria_id", empId)

  const ativos = () => base().eq("filiacao_condicao", "Ativo")

  const [
    [registros, masculino, feminino, outro, semSexo, aniversariantes],
    fontes,
    condicoes,
    vinculosAbertos,
    [filiacoesNoPeriodo, desfiliacoesNoPeriodo],
  ] = await Promise.all([
    Promise.all([
      base().not("filiacao_excluida", "is", true),
      ativos().eq("sexo", "Masculino"),
      ativos().eq("sexo", "Feminino"),
      ativos().eq("sexo", "Outro"),
      ativos().is("sexo", null),
      admin
        .from("filiacoes")
        .select("id, nome_completo", { count: "exact" })
        .eq("emp_proprietaria_id", await tenantAtual())
        .eq("filiacao_condicao", "Ativo")
        .eq("nascimento_dia", hoje.dia)
        .eq("nascimento_mes", hoje.mes)
        .order("nome_completo", { ascending: true })
        .limit(500),
    ]),
    estatisticasFontes(),
    Promise.all([
      ...FILIACAO_CONDICOES.map((c) => base().eq("filiacao_condicao", c)),
      base().is("filiacao_condicao", null),
    ]),
    // Vínculos em aberto (sem data de saída) — regime e condição na fonte.
    lerLotes<{
      filiado_id: string
      regime_trabalho: string | null
      condicao_na_fonte: string | null
    }>((de, ate) =>
      admin
        .from("filiacao_vinculos")
        .select("filiado_id, regime_trabalho, condicao_na_fonte")
        .eq("emp_proprietaria_id", empId)
        .is("data_desfiliacao", null)
        .is("filiacao_data_saida", null)
        .order("id", { ascending: true })
        .range(de, ate)
    ).catch(() => []),
    // Movimento: pela DATA DO EVENTO — um acerto lançado hoje com data antiga
    // cai fora do período, e é isso que separa acerto de filiação nova.
    Promise.all([
      admin
        .from("filiacao_vinculos")
        .select("id", { count: "exact", head: true })
        .eq("emp_proprietaria_id", empId)
        .gte("data_filiacao", limites.inicio)
        .lte("data_filiacao", limites.fim),
      admin
        .from("filiacao_vinculos")
        .select("id", { count: "exact", head: true })
        .eq("emp_proprietaria_id", empId)
        .gte("data_desfiliacao", limites.inicio)
        .lte("data_desfiliacao", limites.fim),
    ]),
  ])

  // Só vínculos de filiados ATIVOS entram nos donuts de regime e condição.
  const ativosIds = new Set(
    fontes.registros.filter((r) => r.filiacao_condicao === "Ativo").map((r) => r.id)
  )
  const contar = (chave: "regime_trabalho" | "condicao_na_fonte") => {
    const m = new Map<string, number>()
    for (const v of vinculosAbertos) {
      if (!ativosIds.has(v.filiado_id)) continue
      const k = v[chave] ?? "Não informado"
      m.set(k, (m.get(k) ?? 0) + 1)
    }
    return [...m.entries()]
      .map(([rotulo, total]) => ({ rotulo, total }))
      .sort((a, b) => b.total - a.total)
  }
  const porRegime = contar("regime_trabalho")
  const porCondicaoFonte = contar("condicao_na_fonte")

  const porSexo = [
    { rotulo: "Masculino", total: masculino.count ?? 0 },
    { rotulo: "Feminino", total: feminino.count ?? 0 },
    { rotulo: "Outro", total: outro.count ?? 0 },
    { rotulo: "Não informado", total: semSexo.count ?? 0 },
  ].filter((s) => s.total > 0)

  const porCondicao = [
    ...FILIACAO_CONDICOES.map((c, i) => ({
      condicao: c as string | null,
      total: condicoes[i].count ?? 0,
    })),
    {
      condicao: null,
      total: condicoes[FILIACAO_CONDICOES.length].count ?? 0,
    },
  ].filter((c) => c.total > 0)

  return {
    registros: registros.count ?? 0,
    filiacoesAtivas: porSexo.reduce((soma, s) => soma + s.total, 0),
    fontesComFiliados: fontes.fontesComFiliados,
    porSexo,
    porRegime,
    porCondicaoFonte,
    movimento: {
      periodo,
      filiacoes: filiacoesNoPeriodo.count ?? 0,
      desfiliacoes: desfiliacoesNoPeriodo.count ?? 0,
      inicio: limites.inicio,
      fim: limites.fim,
    },
    porFonte: fontes.porFonte,
    porCondicao,
    aniversariantes: {
      total: aniversariantes.count ?? 0,
      hoje: hoje.rotulo,
      nomes: (aniversariantes.data ?? []) as Aniversariante[],
    },
  }
}
