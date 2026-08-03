import "server-only"
import { tenantAtual } from "@/lib/tenant"

import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Fontes pagadoras = empresas que pagam os filiados (empregadores ou fundos
 * de pensão). Não existe flag própria no schema migrado do Bubble
 * (`empresa.tipo` veio 100% null), então o conjunto é a UNIÃO de:
 *  - empresas referenciadas em `filiacao_vinculos.fonte_pagadora_id` (39 no
 *    snapshot migrado — inclui os fundos Petros e INSS);
 *  - empresas criadas por aqui, marcadas com `tipo = 'Fonte pagadora'`.
 */
export const TIPO_FONTE_PAGADORA = "Fonte pagadora"

async function lerLotes<T>(
  consulta: (de: number, ate: number) => PromiseLike<{
    data: T[] | null
    error: { message: string } | null
  }>
): Promise<T[]> {
  const LOTE = 1000
  const linhas: T[] = []
  for (let de = 0; ; de += LOTE) {
    const { data, error } = await consulta(de, de + LOTE - 1)
    if (error) throw new Error(`Falha na agregação de fontes: ${error.message}`)
    linhas.push(...(data ?? []))
    if (!data || data.length < LOTE) break
  }
  return linhas
}

export type EstatisticasFontes = {
  /** Fontes com pelo menos um filiado ativo (pessoa com condição 'Ativo'). */
  fontesComFiliados: number
  /** Top 10 — filiados ativos (pessoas) por fonte, com nome resolvido. */
  porFonte: { id: string; fonte: string; total: number }[]
  /** Filiados ativos por fonte (todas), para a lista de fontes. */
  ativosPorFonteId: Map<string, number>
  /** Toda empresa já referenciada como fonte pagadora em vínculos. */
  fontesReferenciadas: string[]
  /** fonte → registros de filiação com a fonte no HISTÓRICO de vínculos. */
  registrosPorFonte: Map<string, Set<string>>
  /** Snapshot dos registros (p/ listagem por fonte em memória, sem join). */
  registros: RegistroSnapshot[]
}

/** Campos da linha da listagem + sexo (filtros em memória). */
export type RegistroSnapshot = {
  id: string
  nome_completo: string | null
  cpf: string | null
  matricula_sindical: string | null
  filiacao_lotacao: string | null
  filiacao_condicao: string | null
  filiacao_excluida: boolean | null
  sexo: string | null
  created_at: string | null
}

/**
 * Agregação por PESSOA (CPF): filiado ativo = algum registro do CPF com
 * `filiacao_condicao = 'Ativo'`; a fonte vem dos vínculos de filiação em
 * aberto. PostgREST do projeto não permite agregações — leitura em lotes
 * com cache em memória por 10 minutos.
 */
let cacheFontes: { expira: number; dados: EstatisticasFontes } | null = null

export async function estatisticasFontes(): Promise<EstatisticasFontes> {
  if (cacheFontes && cacheFontes.expira > Date.now()) return cacheFontes.dados

  const admin = await createAdminClient()
  const empId = await tenantAtual()

  // .order("id") garante paginação estável (sem ele, linhas repetem/somem)
  const [filiacoes, vinculos] = await Promise.all([
    lerLotes<RegistroSnapshot>((de, ate) =>
      admin
        .from("filiacoes")
        .select(
          "id, nome_completo, cpf, matricula_sindical, filiacao_lotacao, filiacao_condicao, filiacao_excluida, sexo, created_at"
        )
        .eq("emp_proprietaria_id", empId)
        .order("id", { ascending: true })
        .range(de, ate)
    ),
    lerLotes<{
      filiado_id: string
      fonte_pagadora_id: string
      data_desfiliacao: string | null
      filiacao_data_saida: string | null
    }>((de, ate) =>
      admin
        .from("filiacao_vinculos")
        .select("filiado_id, fonte_pagadora_id, data_desfiliacao, filiacao_data_saida")
        .eq("emp_proprietaria_id", empId)
        .not("fonte_pagadora_id", "is", null)
        .not("filiado_id", "is", null)
        .order("id", { ascending: true })
        .range(de, ate)
    ),
  ])

  const cpfPorRegistro = new Map(filiacoes.map((f) => [f.id, f.cpf]))
  const pessoa = (filiadoId: string) =>
    cpfPorRegistro.get(filiadoId) ?? `registro:${filiadoId}`

  const pessoasAtivas = new Set<string>()
  for (const f of filiacoes) {
    if (f.filiacao_condicao === "Ativo") pessoasAtivas.add(f.cpf ?? `registro:${f.id}`)
  }

  const fontesReferenciadas = new Set<string>()
  const ativosPorFonte = new Map<string, Set<string>>()
  const registrosPorFonte = new Map<string, Set<string>>()
  for (const v of vinculos) {
    fontesReferenciadas.add(v.fonte_pagadora_id)
    if (!registrosPorFonte.has(v.fonte_pagadora_id)) {
      registrosPorFonte.set(v.fonte_pagadora_id, new Set())
    }
    registrosPorFonte.get(v.fonte_pagadora_id)!.add(v.filiado_id)
    const aberto = !v.data_desfiliacao && !v.filiacao_data_saida
    const p = pessoa(v.filiado_id)
    if (!aberto || !pessoasAtivas.has(p)) continue
    if (!ativosPorFonte.has(v.fonte_pagadora_id)) {
      ativosPorFonte.set(v.fonte_pagadora_id, new Set())
    }
    ativosPorFonte.get(v.fonte_pagadora_id)!.add(p)
  }

  const ativosPorFonteId = new Map(
    [...ativosPorFonte.entries()].map(([id, pessoas]) => [id, pessoas.size])
  )

  const top = [...ativosPorFonteId.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)

  const nomes = await nomesDeEmpresas(top.map(([id]) => id))

  const dados: EstatisticasFontes = {
    fontesComFiliados: ativosPorFonteId.size,
    porFonte: top.map(([id, total]) => ({
      id,
      fonte: nomes.get(id) ?? "(sem nome)",
      total,
    })),
    ativosPorFonteId,
    fontesReferenciadas: [...fontesReferenciadas],
    registrosPorFonte,
    registros: filiacoes,
  }
  cacheFontes = { expira: Date.now() + 10 * 60_000, dados }
  return dados
}

/** Invalida o cache após criar/editar fontes. */
export function invalidarCacheFontes() {
  cacheFontes = null
}

export async function nomesDeEmpresas(
  ids: string[]
): Promise<Map<string, string>> {
  const nomes = new Map<string, string>()
  if (ids.length === 0) return nomes
  const admin = await createAdminClient()
  const { data } = await admin
    .from("empresa")
    .select("id, nome_fantasia, nome_razao")
    .in("id", ids)
  for (const e of data ?? []) {
    const nome = [e.nome_fantasia, e.nome_razao].find(
      (v): v is string => typeof v === "string" && v.trim() !== ""
    )
    if (nome) nomes.set(e.id, nome)
  }
  return nomes
}

export type FontePagadora = {
  id: string
  nome_fantasia: string | null
  nome_razao: string | null
  cnpj_cpf: string | null
  fundo_pensao: boolean | null
  inativa: boolean | null
  inativa_data: string | null
  created_at: string | null
  filiadosAtivos: number
}

export async function listarFontesPagadoras(): Promise<FontePagadora[]> {
  const stats = await estatisticasFontes()
  const admin = await createAdminClient()

  const [referenciadas, marcadas] = await Promise.all([
    stats.fontesReferenciadas.length
      ? admin
          .from("empresa")
          .select(
            "id, nome_fantasia, nome_razao, cnpj_cpf, fundo_pensao, inativa, inativa_data, created_at"
          )
          .in("id", stats.fontesReferenciadas)
      : Promise.resolve({ data: [], error: null }),
    admin
      .from("empresa")
      .select(
        "id, nome_fantasia, nome_razao, cnpj_cpf, fundo_pensao, inativa, inativa_data, created_at"
      )
      .eq("tipo", TIPO_FONTE_PAGADORA),
  ])
  if (referenciadas.error) {
    throw new Error(`Falha ao listar fontes: ${referenciadas.error.message}`)
  }
  if (marcadas.error) {
    throw new Error(`Falha ao listar fontes: ${marcadas.error.message}`)
  }

  const vistas = new Set<string>()
  const fontes: FontePagadora[] = []
  for (const e of [...(referenciadas.data ?? []), ...(marcadas.data ?? [])]) {
    if (vistas.has(e.id)) continue
    vistas.add(e.id)
    fontes.push({ ...e, filiadosAtivos: stats.ativosPorFonteId.get(e.id) ?? 0 })
  }

  return fontes.sort(
    (a, b) =>
      b.filiadosAtivos - a.filiadosAtivos ||
      (a.nome_fantasia ?? a.nome_razao ?? "").localeCompare(
        b.nome_fantasia ?? b.nome_razao ?? "",
        "pt-BR"
      )
  )
}

// ── Página da fonte ────────────────────────────────────────────────────────

export type DetalheFonte = {
  filiadosAtivos: number
  vinculosAbertos: number
  vinculosTotal: number
  /** null = a contagem falhou nesta carga (timeout) — exibir "—". */
  contribuicoes: number | null
}

/**
 * Grandes indicadores da página da fonte. A contagem de contribuições varre
 * filiacao_recebe (609k linhas sem índice em fonte_pg_id) — cache 10 min.
 */
const cacheDetalhe = new Map<string, { expira: number; dados: DetalheFonte }>()

export async function estatisticasFonteDetalhe(
  id: string
): Promise<DetalheFonte> {
  const cacheado = cacheDetalhe.get(id)
  if (cacheado && cacheado.expira > Date.now()) return cacheado.dados

  const admin = await createAdminClient()
  const vinculos = () =>
    admin
      .from("filiacao_vinculos")
      .select("id", { count: "exact", head: true })
      .eq("fonte_pagadora_id", id)

  const [total, abertos, contribuicoes, stats] = await Promise.all([
    vinculos(),
    vinculos().is("data_desfiliacao", null).is("filiacao_data_saida", null),
    admin
      .from("filiacao_recebe")
      .select("id", { count: "exact", head: true })
      .eq("fonte_pg_id", id),
    estatisticasFontes(),
  ])
  if (total.error || abertos.error) {
    throw new Error(
      `Falha nos indicadores da fonte: ${(total.error ?? abertos.error)!.message}`
    )
  }

  const dados: DetalheFonte = {
    filiadosAtivos: stats.ativosPorFonteId.get(id) ?? 0,
    vinculosAbertos: abertos.count ?? 0,
    vinculosTotal: total.count ?? 0,
    // A varredura de 609k linhas pode estourar o statement timeout sob
    // carga — null vira "—" na tela e a falha não entra no cache.
    contribuicoes: contribuicoes.error ? null : (contribuicoes.count ?? 0),
  }
  if (dados.contribuicoes !== null) {
    cacheDetalhe.set(id, { expira: Date.now() + 10 * 60_000, dados })
  }
  return dados
}

// ── Importação em massa (CSV) ──────────────────────────────────────────────

/** Linha já validada/normalizada pela action (CPF com 11 dígitos etc). */
export type LinhaImportacao = {
  linha: number
  nome_completo: string
  cpf: string
  matricula_sindical: string | null
  sexo: string | null
  nascimento_data: string | null
  email_pessoal: string | null
  telefone_1: string | null
  cargo: string | null
  lotacao: string | null
  matricula_fonte: string | null
  data_admissao: string | null
  data_filiacao: string | null
  condicao: string | null
}

export type ResultadoImportacao = {
  totalLinhas: number
  criados: number
  vinculados: number
  ignorados: number
  erros: { linha: number; motivo: string }[]
}

/**
 * Importa filiados vinculados à fonte:
 *  - CPF já cadastrado → reaproveita o registro (nada é sobrescrito) e cria
 *    o vínculo com a fonte, a menos que já exista vínculo EM ABERTO nela;
 *  - CPF novo → cria o registro de filiação (condição da planilha ou
 *    'Ativo') e o vínculo.
 */
export async function importarFiliadosDaFonte(
  fonteId: string,
  linhas: LinhaImportacao[],
  errosPrevios: { linha: number; motivo: string }[]
): Promise<ResultadoImportacao> {
  const admin = await createAdminClient()
  const empId = await tenantAtual()
  const erros = [...errosPrevios]

  // CPF repetido dentro da própria planilha
  const vistos = new Map<string, number>()
  const validas: LinhaImportacao[] = []
  for (const l of linhas) {
    const primeira = vistos.get(l.cpf)
    if (primeira !== undefined) {
      erros.push({
        linha: l.linha,
        motivo: `CPF repetido na planilha (mesmo da linha ${primeira})`,
      })
      continue
    }
    vistos.set(l.cpf, l.linha)
    validas.push(l)
  }

  // Registros já existentes por CPF
  const existentesPorCpf = new Map<string, string>()
  const cpfs = validas.map((l) => l.cpf)
  for (let de = 0; de < cpfs.length; de += 200) {
    const { data, error } = await admin
      .from("filiacoes")
      .select("id, cpf")
      .eq("emp_proprietaria_id", await tenantAtual())
      .in("cpf", cpfs.slice(de, de + 200))
    if (error) throw new Error(`Falha ao conferir CPFs: ${error.message}`)
    for (const f of data ?? []) {
      if (f.cpf && !existentesPorCpf.has(f.cpf)) existentesPorCpf.set(f.cpf, f.id)
    }
  }

  // Dos existentes, quem já tem vínculo EM ABERTO nesta fonte
  const idsExistentes = [...existentesPorCpf.values()]
  const jaVinculados = new Set<string>()
  for (let de = 0; de < idsExistentes.length; de += 200) {
    const { data, error } = await admin
      .from("filiacao_vinculos")
      .select("filiado_id")
      .eq("fonte_pagadora_id", fonteId)
      .in("filiado_id", idsExistentes.slice(de, de + 200))
      .is("data_desfiliacao", null)
      .is("filiacao_data_saida", null)
    if (error) throw new Error(`Falha ao conferir vínculos: ${error.message}`)
    for (const v of data ?? []) jaVinculados.add(v.filiado_id)
  }

  // Cria os registros novos (em lotes, retornando os ids)
  const novas = validas.filter((l) => !existentesPorCpf.has(l.cpf))
  const idPorCpf = new Map(existentesPorCpf)
  for (let de = 0; de < novas.length; de += 300) {
    const lote = novas.slice(de, de + 300)
    const { data, error } = await admin
      .from("filiacoes")
      .insert(
        lote.map((l) => {
          const nasc = l.nascimento_data
          return {
            nome_completo: l.nome_completo,
            cpf: l.cpf,
            matricula_sindical: l.matricula_sindical,
            sexo: l.sexo,
            nascimento_data: nasc,
            nascimento_dia: nasc ? Number(nasc.slice(8, 10)) : null,
            nascimento_mes: nasc ? Number(nasc.slice(5, 7)) : null,
            email_pessoal: l.email_pessoal,
            telefone_1: l.telefone_1,
            filiacao_condicao: l.condicao ?? "Ativo",
            emp_proprietaria_id: empId,
          }
        })
      )
      .select("id, cpf")
    if (error) throw new Error(`Falha ao criar filiados: ${error.message}`)
    for (const f of data ?? []) {
      if (f.cpf) idPorCpf.set(f.cpf, f.id)
    }
  }

  // Vínculos com a fonte (novos + existentes sem vínculo aberto nela)
  let vinculados = 0
  let ignorados = 0
  const paraVincular: LinhaImportacao[] = []
  for (const l of validas) {
    const existenteId = existentesPorCpf.get(l.cpf)
    if (existenteId && jaVinculados.has(existenteId)) {
      ignorados++
      continue
    }
    paraVincular.push(l)
    if (existenteId) vinculados++
  }
  for (let de = 0; de < paraVincular.length; de += 300) {
    const lote = paraVincular.slice(de, de + 300)
    const { error } = await admin.from("filiacao_vinculos").insert(
      lote.map((l) => ({
        filiado_id: idPorCpf.get(l.cpf)!,
        fonte_pagadora_id: fonteId,
        cargo: l.cargo,
        lotacao: l.lotacao,
        matricula: l.matricula_fonte,
        data_entrada_admissao: l.data_admissao,
        data_filiacao: l.data_filiacao,
        filiacao_condicao: l.condicao ?? "Ativo",
        emp_proprietaria_id: empId,
      }))
    )
    if (error) throw new Error(`Falha ao criar vínculos: ${error.message}`)
  }

  invalidarCacheFontes()
  cacheDetalhe.delete(fonteId)

  return {
    totalLinhas: linhas.length + errosPrevios.length,
    criados: novas.length,
    vinculados,
    ignorados,
    erros: erros.sort((a, b) => a.linha - b.linha),
  }
}

export async function buscarFontePagadora(
  id: string
): Promise<FontePagadora | null> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("empresa")
    .select(
      "id, nome_fantasia, nome_razao, cnpj_cpf, fundo_pensao, inativa, inativa_data, created_at"
    )
    .eq("id", id)
    .maybeSingle()
  if (!data) return null
  const stats = await estatisticasFontes()
  return { ...data, filiadosAtivos: stats.ativosPorFonteId.get(data.id) ?? 0 }
}
