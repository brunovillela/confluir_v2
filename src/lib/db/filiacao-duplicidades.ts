import "server-only"

import { cpfConfiavel } from "@/lib/cpf"
import { esquemaAusente, texto } from "@/lib/db/comum"
import { invalidarCacheCadastrosPendentes } from "@/lib/db/filiacao-cadastros-pendentes"
import { normalizarMatricula } from "@/lib/db/filiacao-matricula"
import { lerLotes } from "@/lib/db/fontes"
import { createAdminClient, createServiceClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"
import { semAcento } from "@/lib/texto"

/**
 * Possíveis duplicidades de cadastro e a mesclagem — ver
 * supabase/filiacao-duplicidades.sql e filiacao-identidade.ts.
 *
 * Três formas de achar a mesma pessoa em mais de um cadastro:
 *  - CPF válido repetido (a mais forte);
 *  - matrícula sindical repetida (a numeração é da entidade: repetida é erro,
 *    seja a mesma pessoa, seja outra);
 *  - mesmo nome sem CPF válido que os diferencie — mais forte quando a data de
 *    nascimento também bate.
 *
 * CPF impossível ("0", máscara vazia) NÃO forma grupo: é lixo de digitação, não
 * a mesma pessoa. Esses cadastros são limpos pelo scripts/limpar-identidade-filiados.mjs.
 */

export type TipoDuplicidade = "cpf" | "matricula" | "nome"

export const ROTULO_DUPLICIDADE: Record<TipoDuplicidade, string> = {
  cpf: "Mesmo CPF",
  matricula: "Mesma matrícula sindical",
  nome: "Mesmo nome",
}

export type CadastroDuplicado = {
  id: string
  nome: string | null
  cpf: string | null
  matricula: string | null
  nascimento: string | null
  condicao: string | null
  criadoEm: string | null
  vinculos: number
}

export type GrupoDuplicidade = {
  tipo: TipoDuplicidade
  chave: string
  /** Só em "nome": todos com a mesma data de nascimento? */
  mesmoNascimento: boolean
  /** Nomes diferentes no grupo: provável CPF ou matrícula trocados, não duplicata. */
  pessoasDiferentes: boolean
  cadastros: CadastroDuplicado[]
}

export type Duplicidades = {
  disponivel: boolean
  grupos: GrupoDuplicidade[]
  totais: Record<TipoDuplicidade, number>
  geradoEm: string
}

const VALIDADE_CACHE_MS = 10 * 60 * 1000
let cache: { dados: Duplicidades; expira: number; emp: string } | null = null

export function invalidarCacheDuplicidades() {
  cache = null
}

const nomeNormalizado = (v: string | null) => semAcento(v ?? "").replace(/\s+/g, " ")

type Linha = {
  id: string
  nome_completo: string | null
  cpf: string | null
  matricula_sindical: string | null
  nascimento_data: string | null
  filiacao_condicao: string | null
  created_at: string | null
}

export async function listarDuplicidades(): Promise<Duplicidades> {
  const emp = await tenantAtual()
  if (cache && cache.emp === emp && cache.expira > Date.now()) return cache.dados

  const admin = await createAdminClient()
  const [cadastros, vinculos, ignoradas] = await Promise.all([
    lerLotes<Linha>((de, ate) =>
      admin
        .from("filiacoes")
        .select("id, nome_completo, cpf, matricula_sindical, nascimento_data, filiacao_condicao, created_at")
        .eq("emp_proprietaria_id", emp)
        .not("filiacao_excluida", "is", true)
        .order("id", { ascending: true })
        .range(de, ate)
    ),
    lerLotes<{ filiado_id: string }>((de, ate) =>
      admin
        .from("filiacao_vinculos")
        .select("filiado_id")
        .eq("emp_proprietaria_id", emp)
        .not("filiado_id", "is", null)
        .order("id", { ascending: true })
        .range(de, ate)
    ),
    admin.from("filiacao_duplicidades_ignoradas").select("tipo, chave, cadastros").eq("emp_proprietaria_id", emp),
  ])
  const disponivel = !(ignoradas.error && esquemaAusente(ignoradas.error))

  const vinculosDe = new Map<string, number>()
  for (const v of vinculos) vinculosDe.set(v.filiado_id, (vinculosDe.get(v.filiado_id) ?? 0) + 1)
  const paraCadastro = (l: Linha): CadastroDuplicado => ({
    id: l.id,
    nome: l.nome_completo,
    cpf: l.cpf,
    matricula: l.matricula_sindical,
    nascimento: l.nascimento_data,
    condicao: l.filiacao_condicao,
    criadoEm: l.created_at,
    vinculos: vinculosDe.get(l.id) ?? 0,
  })

  const ignorado = (tipo: string, chave: string, ids: string[]) =>
    (ignoradas.data ?? []).some(
      (i) =>
        i.tipo === tipo &&
        i.chave === chave &&
        // Um cadastro novo entrando no grupo faz ele voltar à lista.
        ids.every((id) => ((i.cadastros as string[]) ?? []).includes(id))
    )

  const agrupar = (chave: (l: Linha) => string | null) => {
    const m = new Map<string, Linha[]>()
    for (const l of cadastros) {
      const k = chave(l)
      if (k) m.set(k, [...(m.get(k) ?? []), l])
    }
    return [...m.entries()].filter(([, lista]) => lista.length > 1)
  }

  const grupos: GrupoDuplicidade[] = []
  const conjuntosVistos = new Set<string>()
  const registrar = (tipo: TipoDuplicidade, chave: string, lista: Linha[], mesmoNascimento = false) => {
    const ids = lista.map((l) => l.id).sort()
    const conjunto = ids.join(",")
    // O mesmo conjunto achado por CPF e por matrícula aparece uma vez só.
    if (conjuntosVistos.has(conjunto) || ignorado(tipo, chave, ids)) return
    conjuntosVistos.add(conjunto)
    grupos.push({
      tipo,
      chave,
      mesmoNascimento,
      pessoasDiferentes: new Set(lista.map((l) => nomeNormalizado(l.nome_completo))).size > 1,
      cadastros: lista
        .map(paraCadastro)
        .sort((a, b) => (a.criadoEm ?? "").localeCompare(b.criadoEm ?? "")),
    })
  }

  for (const [cpf, lista] of agrupar((l) => cpfConfiavel(l.cpf))) registrar("cpf", cpf, lista)
  for (const [mat, lista] of agrupar((l) => normalizarMatricula(l.matricula_sindical))) {
    registrar("matricula", mat, lista)
  }
  for (const [nome, lista] of agrupar((l) => nomeNormalizado(l.nome_completo) || null)) {
    const cpfs = new Set(lista.map((l) => cpfConfiavel(l.cpf)).filter(Boolean))
    if (cpfs.size > 1) continue // homônimos com CPFs válidos diferentes
    const nascimentos = new Set(lista.map((l) => l.nascimento_data).filter(Boolean))
    registrar("nome", nome, lista, nascimentos.size === 1 && lista.every((l) => l.nascimento_data))
  }

  // Ordem de trabalho: mais de um ativo primeiro, depois evidência mais forte.
  const ativos = (g: GrupoDuplicidade) => g.cadastros.filter((c) => c.condicao === "Ativo").length
  const forca = (g: GrupoDuplicidade) => (g.tipo === "cpf" ? 3 : g.tipo === "matricula" ? 2 : g.mesmoNascimento ? 1 : 0)
  grupos.sort((a, b) => ativos(b) - ativos(a) || forca(b) - forca(a))

  const totais: Record<TipoDuplicidade, number> = { cpf: 0, matricula: 0, nome: 0 }
  for (const g of grupos) totais[g.tipo]++

  const dados: Duplicidades = { disponivel, grupos, totais, geradoEm: new Date().toISOString() }
  cache = { dados, expira: Date.now() + VALIDADE_CACHE_MS, emp }
  return dados
}

// ── Mesclagem ───────────────────────────────────────────────────────────────

/** Campos que a mesclagem deixa escolher (espelha `permitidos` na função SQL). */
export const CAMPOS_MESCLAGEM = [
  { campo: "nome_completo", rotulo: "Nome completo" },
  { campo: "nome_social", rotulo: "Nome social" },
  { campo: "cpf", rotulo: "CPF" },
  { campo: "matricula_sindical", rotulo: "Matrícula sindical" },
  { campo: "filiacao_condicao", rotulo: "Condição" },
  { campo: "nascimento_data", rotulo: "Nascimento" },
  { campo: "sexo", rotulo: "Sexo" },
  { campo: "email_pessoal", rotulo: "E-mail pessoal" },
  { campo: "email_corporativo", rotulo: "E-mail corporativo" },
  { campo: "telefone_1", rotulo: "Telefone 1" },
  { campo: "telefone_2", rotulo: "Telefone 2" },
  { campo: "endereco_cep", rotulo: "CEP" },
  { campo: "endereco_logradouro", rotulo: "Logradouro" },
  { campo: "endereco_numero", rotulo: "Número" },
  { campo: "endereco_complemento", rotulo: "Complemento" },
  { campo: "endereco_bairro", rotulo: "Bairro" },
  { campo: "endereco_cidade", rotulo: "Cidade" },
  { campo: "endereco_estado", rotulo: "UF" },
  { campo: "tl_lgpd_id", rotulo: "Termo LGPD" },
  { campo: "tl_desconto_id", rotulo: "Termo de desconto" },
] as const

export type CadastroParaMesclar = {
  id: string
  valores: Record<string, string | null>
  condicao: string | null
  criadoEm: string | null
  vinculos: number
  contribuicoes: number
  prontuario: number
}

/** Os cadastros escolhidos, com o que cada um carrega (para decidir o principal). */
export async function cadastrosParaMesclar(ids: string[]): Promise<CadastroParaMesclar[]> {
  const unicos = [...new Set(ids)].slice(0, 10)
  if (unicos.length < 2) return []
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data } = await admin
    .from("filiacoes")
    .select("*")
    .eq("emp_proprietaria_id", emp)
    .in("id", unicos)
    .not("filiacao_excluida", "is", true)
  const linhas = (data ?? []) as Record<string, unknown>[]

  const contar = async (tabela: string, coluna: string, id: string) => {
    const { count } = await admin.from(tabela).select("id", { count: "exact", head: true }).eq(coluna, id)
    return count ?? 0
  }
  return Promise.all(
    linhas.map(async (l) => {
      const id = String(l.id)
      const [vinculos, contribuicoes, prontuario] = await Promise.all([
        contar("filiacao_vinculos", "filiado_id", id),
        contar("filiacao_recebe", "filiado_id", id),
        contar("filiacao_prontuario", "filiacao_id", id),
      ])
      const valores: Record<string, string | null> = {}
      for (const { campo } of CAMPOS_MESCLAGEM) {
        const v = l[campo]
        valores[campo] = v === null || v === undefined || v === "" ? null : String(v)
      }
      return {
        id,
        valores,
        condicao: texto(l.filiacao_condicao),
        criadoEm: texto(l.created_at),
        vinculos,
        contribuicoes,
        prontuario,
      }
    })
  )
}

export type ResultadoMesclagem = {
  erro?: string
  movidos?: Record<string, number>
  pendentes?: string[]
  /** Vínculos do mesmo emprego (mesma fonte e matrícula) que estavam em dois cadastros e viraram um. */
  vinculosUnificados?: number
}

export async function mesclarCadastros(dados: {
  principal: string
  secundarios: string[]
  campos: Record<string, string | null>
  usuarioId: string | null
}): Promise<ResultadoMesclagem> {
  const permitidos = new Set<string>(CAMPOS_MESCLAGEM.map((c) => c.campo))
  const campos = Object.fromEntries(Object.entries(dados.campos).filter(([k]) => permitidos.has(k)))

  // CPF e matrícula escolhidos precisam ser válidos — a mesclagem não pode
  // perpetuar o "0" nem uma matrícula que é CPF.
  if (campos.cpf && !cpfConfiavel(campos.cpf)) {
    return { erro: "O CPF escolhido não é válido. Escolha outro ou deixe em branco." }
  }
  if (campos.matricula_sindical) {
    const m = normalizarMatricula(campos.matricula_sindical)
    if (!m || m.length > 7) return { erro: "A matrícula sindical escolhida não é válida." }
    campos.matricula_sindical = m
  }
  if (campos.cpf) campos.cpf = cpfConfiavel(campos.cpf)

  // Chamada com service role: a função é revogada para `authenticated` e
  // valida sozinha que principal e incorporados são do tenant passado.
  const service = createServiceClient()
  const { data, error } = await service.rpc("mesclar_filiacoes", {
    p_emp: await tenantAtual(),
    p_principal: dados.principal,
    p_secundarios: dados.secundarios,
    p_campos: campos,
    p_usuario: dados.usuarioId,
  })
  if (error) {
    if (/could not find the function/i.test(error.message)) {
      return { erro: "Mesclagem ainda não configurada — rode supabase/filiacao-duplicidades.sql." }
    }
    return { erro: error.message }
  }
  invalidarCacheDuplicidades()
  invalidarCacheCadastrosPendentes()
  const resultado = (data ?? {}) as {
    movidos?: Record<string, number>
    pendentes?: string[]
    vinculos_unificados?: number
  }
  return {
    movidos: resultado.movidos ?? {},
    pendentes: resultado.pendentes ?? [],
    vinculosUnificados: resultado.vinculos_unificados ?? 0,
  }
}

/** "Não é duplicidade": o grupo some da lista até entrar outro cadastro nele. */
export async function ignorarDuplicidade(dados: {
  tipo: TipoDuplicidade
  chave: string
  cadastros: string[]
  motivo: string | null
  usuarioId: string | null
}): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin.from("filiacao_duplicidades_ignoradas").upsert(
    {
      emp_proprietaria_id: await tenantAtual(),
      tipo: dados.tipo,
      chave: dados.chave,
      cadastros: dados.cadastros,
      motivo: dados.motivo,
      criado_por: dados.usuarioId,
    },
    { onConflict: "emp_proprietaria_id,tipo,chave" }
  )
  if (error) {
    return {
      erro: esquemaAusente(error)
        ? "Rode supabase/filiacao-duplicidades.sql antes de marcar grupos."
        : error.message,
    }
  }
  invalidarCacheDuplicidades()
  return {}
}
