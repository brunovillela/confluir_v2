import "server-only"
import { tenantAtual } from "@/lib/tenant"

import {
  estatisticasFontes,
  listarFontesPagadoras,
  nomesDeEmpresas,
} from "@/lib/db/fontes"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Receitas — remessas de recebimento de contribuições.
 *
 * Modelo (medido em 2026-07-15):
 *  - `filiacao_recebe_remessa` (74): mês/ano/tipo (Associativa 56,
 *    Assistencial 13, Sindical 5); `ordem` = AAAAMM numérico; `mes` é o
 *    NOME do mês em português.
 *  - `filiacao_recebe` (609k): o RELATÓRIO — um lançamento por trabalhador
 *    descontado, com `remessa_id`, `fonte_pg_id`, `filiado_id` e `valor`.
 *  - `filiacao_recebe_comprovacao` (358): o DEPÓSITO — data, valor e
 *    comprovante por fonte/remessa. Veio 100% vazia do Bubble; o registro
 *    passa a ser feito por aqui.
 *
 * A tabela de lançamentos não tem índice em remessa_id: as linhas da
 * remessa são carregadas em lotes e agregadas em memória, com cache de
 * 10 minutos por remessa (contagens via PostgREST estouram timeout).
 */

export type RemessaLinha = {
  id: string
  ano: string | null
  mes: string | null
  tipo: string | null
  aberto: boolean | null
  ordem: number | null
  /** "5/2026" derivado de `ordem`. */
  rotulo: string
}

export type FonteDaRemessa = {
  id: string
  nome: string
  pagantes: number
  total: number
  media: number
  maior: number
  menor: number
  recebimento: Recebimento | null
}

export type Recebimento = {
  id: string
  data: string | null
  valor: number | null
  comprovante: string | null
}

export type DetalheRemessa = {
  remessa: RemessaLinha
  /** Estatísticas gerais dos valores informados. */
  totais: {
    valorInformado: number
    pagantes: number
    media: number
    maior: number
    menor: number
  }
  fontes: FonteDaRemessa[]
  /** Fontes pagadoras ativas que NÃO informaram pagamentos nesta remessa. */
  fontesSemInformacao: { id: string; nome: string }[]
  /**
   * Mensagem quando os lançamentos não puderam ser carregados (statement
   * timeout — o banco ainda não tem o índice de remessa_id; ver
   * supabase/indices-filiacao.sql).
   */
  erroCarga: string | null
}

export type LancamentoRelatorio = {
  id: string
  filiadoId: string | null
  nome: string | null
  condicao: string | null
  matriculaSindical: string | null
  matriculaFonte: string | null
  cpf: string | null
  valor: number | null
}

export type RelatorioFonte = {
  /** Todos os lançamentos com filiado identificado. */
  lancamentos: LancamentoRelatorio[]
  /** Pagaram mas não foram encontrados no cadastro (filiado_id null). */
  naoEncontrados: LancamentoRelatorio[]
  /** Pagaram mas o registro não está com condição "Ativo". */
  pagantesNaoAtivos: LancamentoRelatorio[]
  /** Ativos com vínculo em aberto na fonte que NÃO aparecem na relação. */
  ativosNaoPagantes: {
    id: string
    nome: string | null
    matriculaSindical: string | null
    matriculaFonte: string | null
  }[]
}

function rotuloRemessa(ordem: number | null, ano: string | null): string {
  if (ordem) return `${ordem % 100}/${Math.floor(ordem / 100)}`
  return ano ?? "—"
}

export async function listarRemessas(): Promise<RemessaLinha[]> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("filiacao_recebe_remessa")
    .select("id, ano, mes, tipo, aberto, ordem")
    .eq("emp_proprietaria_id", await tenantAtual())
    .order("ordem", { ascending: false, nullsFirst: false })
  if (error) throw new Error(`Falha ao listar remessas: ${error.message}`)
  return (data ?? []).map((r) => ({
    ...r,
    rotulo: rotuloRemessa(r.ordem, r.ano),
  }))
}

type LancamentoBruto = {
  id: string
  filiado_id: string | null
  fonte_pg_id: string | null
  valor: number | null
  cpf: string | null
  fonte_pg_matricula: string | null
}

/** Lançamentos da remessa (sem índice — lotes de 1000 com cache). */
const cacheLancamentos = new Map<
  string,
  { expira: number; linhas: LancamentoBruto[] }
>()

async function lancamentosDaRemessa(
  remessaId: string
): Promise<LancamentoBruto[]> {
  const cacheado = cacheLancamentos.get(remessaId)
  if (cacheado && cacheado.expira > Date.now()) return cacheado.linhas

  const admin = await createAdminClient()
  const linhas: LancamentoBruto[] = []
  const LOTE = 1000
  for (let de = 0; ; de += LOTE) {
    // .order é OBRIGATÓRIO: sem ele o PostgREST não garante ordem estável
    // entre páginas (linhas repetiam e sumiam entre lotes). Ordenar por
    // remessa_id PRIMEIRO alinha com o índice — order só por id faz o
    // planner varrer a PK inteira e estourar o timeout.
    //
    // Com cache frio o primeiro lote pode estourar o statement timeout
    // (leituras aleatórias no heap de 609k linhas); cada tentativa aquece
    // o cache do Postgres, então repetir resolve. O índice cobrindo de
    // supabase/indices-filiacao.sql elimina isso de vez.
    let data: LancamentoBruto[] | null = null
    for (let tentativa = 1; ; tentativa++) {
      const resposta = await admin
        .from("filiacao_recebe")
        .select("id, filiado_id, fonte_pg_id, valor, cpf, fonte_pg_matricula")
        .eq("remessa_id", remessaId)
        .eq("emp_proprietaria_id", await tenantAtual())
        .order("remessa_id", { ascending: true })
        .order("id", { ascending: true })
        .range(de, de + LOTE - 1)
      if (!resposta.error) {
        data = resposta.data
        break
      }
      if (tentativa >= 3 || !resposta.error.message.includes("timeout")) {
        throw new Error(`Falha ao carregar a remessa: ${resposta.error.message}`)
      }
    }
    linhas.push(...(data ?? []))
    if (!data || data.length < LOTE) break
  }
  cacheLancamentos.set(remessaId, {
    expira: Date.now() + 10 * 60_000,
    linhas,
  })
  return linhas
}

export function invalidarCacheRemessa(remessaId: string) {
  cacheLancamentos.delete(remessaId)
}

export async function buscarRemessa(id: string): Promise<RemessaLinha | null> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("filiacao_recebe_remessa")
    .select("id, ano, mes, tipo, aberto, ordem")
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (!data) return null
  return { ...data, rotulo: rotuloRemessa(data.ordem, data.ano) }
}

export async function recebimentosDaRemessa(
  remessaId: string
): Promise<Map<string, Recebimento>> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("filiacao_recebe_comprovacao")
    .select("id, data, valor, comprovante, fonte_pg_id")
    .eq("remessa_id", remessaId)
    .eq("emp_proprietaria_id", await tenantAtual())
  const porFonte = new Map<string, Recebimento>()
  for (const c of data ?? []) {
    if (c.fonte_pg_id) {
      porFonte.set(c.fonte_pg_id, {
        id: c.id,
        data: c.data,
        valor: c.valor,
        comprovante: c.comprovante,
      })
    }
  }
  return porFonte
}

export async function detalheRemessa(
  id: string
): Promise<DetalheRemessa | null> {
  const remessa = await buscarRemessa(id)
  if (!remessa) return null

  const [cargaLancamentos, recebimentos, fontesAtivas] = await Promise.all([
    lancamentosDaRemessa(id).then(
      (linhas) => ({ linhas, erro: null as string | null }),
      (e: unknown) => ({
        linhas: [] as LancamentoBruto[],
        erro:
          e instanceof Error && e.message.includes("timeout")
            ? "A consulta dos lançamentos excedeu o tempo limite do banco — rode supabase/indices-filiacao.sql no SQL Editor do Supabase para criar o índice de remessas e recarregue."
            : e instanceof Error
              ? e.message
              : "Falha ao carregar os lançamentos.",
      })
    ),
    recebimentosDaRemessa(id),
    listarFontesPagadoras(),
  ])
  const lancamentos = cargaLancamentos.linhas

  // Agrega por fonte
  const porFonte = new Map<
    string,
    { pagantes: number; total: number; maior: number; menor: number }
  >()
  let valorInformado = 0
  let maiorGeral = 0
  let menorGeral = Number.POSITIVE_INFINITY
  let pagantes = 0
  for (const l of lancamentos) {
    const valor = l.valor ?? 0
    valorInformado += valor
    pagantes++
    if (valor > maiorGeral) maiorGeral = valor
    if (valor < menorGeral) menorGeral = valor
    const chave = l.fonte_pg_id ?? "sem_fonte"
    const atual = porFonte.get(chave) ?? {
      pagantes: 0,
      total: 0,
      maior: 0,
      menor: Number.POSITIVE_INFINITY,
    }
    atual.pagantes++
    atual.total += valor
    if (valor > atual.maior) atual.maior = valor
    if (valor < atual.menor) atual.menor = valor
    porFonte.set(chave, atual)
  }

  const nomes = await nomesDeEmpresas(
    [...porFonte.keys()].filter((k) => k !== "sem_fonte")
  )

  const fontes: FonteDaRemessa[] = [...porFonte.entries()]
    .map(([fonteId, v]) => ({
      id: fonteId,
      nome:
        fonteId === "sem_fonte"
          ? "(sem fonte identificada)"
          : (nomes.get(fonteId) ?? "(sem nome)"),
      pagantes: v.pagantes,
      total: v.total,
      media: v.pagantes > 0 ? v.total / v.pagantes : 0,
      maior: v.maior,
      menor: Number.isFinite(v.menor) ? v.menor : 0,
      recebimento: recebimentos.get(fonteId) ?? null,
    }))
    .sort((a, b) => b.total - a.total)

  const comInformacao = new Set(porFonte.keys())
  const fontesSemInformacao = cargaLancamentos.erro
    ? []
    : fontesAtivas
        .filter((f) => f.inativa !== true && !comInformacao.has(f.id))
        .map((f) => ({
          id: f.id,
          nome: f.nome_fantasia ?? f.nome_razao ?? "(sem nome)",
        }))
        .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))

  return {
    remessa,
    totais: {
      valorInformado,
      pagantes,
      media: pagantes > 0 ? valorInformado / pagantes : 0,
      maior: maiorGeral,
      menor: Number.isFinite(menorGeral) ? menorGeral : 0,
    },
    fontes,
    fontesSemInformacao,
    erroCarga: cargaLancamentos.erro,
  }
}

/**
 * Relatório da fonte na remessa: trabalhadores descontados, pagantes não
 * encontrados/não ativos e os ativos da fonte que não pagaram.
 */
export async function relatorioFonteRemessa(
  remessaId: string,
  fonteId: string
): Promise<RelatorioFonte> {
  const admin = await createAdminClient()
  const [todos, stats, vinculosRes] = await Promise.all([
    lancamentosDaRemessa(remessaId),
    estatisticasFontes(),
    // Vínculos em aberto na fonte (matrícula do trabalhador na empresa)
    admin
      .from("filiacao_vinculos")
      .select("filiado_id, matricula, fonte_pg_matricula")
      .eq("fonte_pagadora_id", fonteId)
      .eq("emp_proprietaria_id", await tenantAtual())
      .is("data_desfiliacao", null)
      .is("filiacao_data_saida", null),
  ])

  const registroPorId = new Map(stats.registros.map((r) => [r.id, r]))
  const ordenar = (a: LancamentoRelatorio, b: LancamentoRelatorio) => {
    if (a.nome === null && b.nome === null) return 0
    if (a.nome === null) return 1
    if (b.nome === null) return -1
    return a.nome.localeCompare(b.nome, "pt-BR")
  }

  const daFonte = todos.filter((l) => l.fonte_pg_id === fonteId)
  const linhas: LancamentoRelatorio[] = daFonte.map((l) => {
    const registro = l.filiado_id ? registroPorId.get(l.filiado_id) : undefined
    return {
      id: l.id,
      filiadoId: l.filiado_id,
      nome: registro?.nome_completo ?? null,
      condicao: registro?.filiacao_condicao ?? null,
      matriculaSindical: registro?.matricula_sindical ?? null,
      matriculaFonte: l.fonte_pg_matricula,
      cpf: l.cpf,
      valor: l.valor,
    }
  })

  const lancamentos = linhas.filter((l) => l.filiadoId !== null).sort(ordenar)
  const naoEncontrados = linhas
    .filter((l) => l.filiadoId === null)
    .sort(
      (a, b) =>
        (a.matriculaFonte ?? a.cpf ?? "").localeCompare(
          b.matriculaFonte ?? b.cpf ?? ""
        ) || 0
    )
  const pagantesNaoAtivos = lancamentos.filter(
    (l) => l.condicao !== "Ativo"
  )

  const pagaram = new Set(
    lancamentos.map((l) => l.filiadoId).filter((v): v is string => Boolean(v))
  )
  const vistos = new Set<string>()
  const ativosNaoPagantes: RelatorioFonte["ativosNaoPagantes"] = []
  for (const v of vinculosRes.data ?? []) {
    if (!v.filiado_id || vistos.has(v.filiado_id)) continue
    vistos.add(v.filiado_id)
    const registro = registroPorId.get(v.filiado_id)
    if (!registro || registro.filiacao_condicao !== "Ativo") continue
    if (pagaram.has(v.filiado_id)) continue
    ativosNaoPagantes.push({
      id: v.filiado_id,
      nome: registro.nome_completo,
      matriculaSindical: registro.matricula_sindical,
      matriculaFonte: v.matricula ?? v.fonte_pg_matricula,
    })
  }
  ativosNaoPagantes.sort((a, b) =>
    (a.nome ?? "").localeCompare(b.nome ?? "", "pt-BR")
  )

  return { lancamentos, naoEncontrados, pagantesNaoAtivos, ativosNaoPagantes }
}

/** Remessa anterior do mesmo tipo (mapa matrícula→filiado vem de lá). */
async function lancamentosRemessaAnterior(
  remessaId: string
): Promise<LancamentoBruto[]> {
  const remessa = await buscarRemessa(remessaId)
  if (!remessa?.ordem || !remessa.tipo) return []
  const admin = await createAdminClient()
  const { data } = await admin
    .from("filiacao_recebe_remessa")
    .select("id")
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("tipo", remessa.tipo)
    .lt("ordem", remessa.ordem)
    .order("ordem", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!data) return []
  return lancamentosDaRemessa(data.id).catch(() => [])
}

/**
 * Resolve os filiados de contribuições: CPF (11 dígitos) tem prioridade;
 * senão a matrícula do trabalhador NA FONTE, comparada sem zeros à
 * esquerda. O mapa de matrículas vem dos vínculos da fonte E dos
 * lançamentos já identificados (desta remessa e da anterior do mesmo
 * tipo) — no dado migrado os vínculos quase não têm matrícula; o
 * histórico de pagamentos é quem ensina o mapeamento. null = não
 * encontrado no cadastro.
 */
export type IndicadoresAnuais = {
  ano: string | null
  totalRecebido: number
  contribuicoes: number
  remessas: number
  media: number
}

/**
 * Indicadores agregados de um ano (ou de tudo, se `ano` vier vazio): soma os
 * totais já calculados de cada remessa daquele ano (detalheRemessa é cacheado).
 */
export async function indicadoresAnuais(
  ano?: string
): Promise<IndicadoresAnuais> {
  const todas = await listarRemessas()
  const alvo = ano
    ? todas.filter((r) => String(Math.floor((r.ordem ?? 0) / 100)) === ano)
    : todas
  let totalRecebido = 0
  let contribuicoes = 0
  for (const r of alvo) {
    const det = await detalheRemessa(r.id).catch(() => null)
    if (!det) continue
    totalRecebido += det.totais.valorInformado
    contribuicoes += det.totais.pagantes
  }
  return {
    ano: ano ?? null,
    totalRecebido,
    contribuicoes,
    remessas: alvo.length,
    media: contribuicoes > 0 ? totalRecebido / contribuicoes : 0,
  }
}

/** Normaliza nome p/ casar: sem acento, maiúsculo, espaços colapsados. */
function normalizarNome(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim()
}

export type ViaCasamento = "cpf" | "matricula" | "nome" | null
export type ResolucaoFiliado = { filiadoId: string | null; via: ViaCasamento }

type ItemResolver = {
  cpf: string | null
  matriculaFonte: string | null
  nome?: string | null
}

/**
 * Identifica cada linha do relatório contra o cadastro. Ordem de prioridade:
 * CPF → matrícula (vínculos + remessas) → NOME (último recurso). Nomes que
 * apontam para mais de um filiado ficam AMBÍGUOS e não casam (evita registrar
 * no filiado errado). Devolve também COMO casou, p/ o preview revisar por-nome.
 */
export async function resolverFiliadosLoteDetalhado(
  fonteId: string,
  remessaId: string,
  itens: ItemResolver[]
): Promise<ResolucaoFiliado[]> {
  const admin = await createAdminClient()
  const [stats, vinculosRes, atuais, anteriores] = await Promise.all([
    estatisticasFontes(),
    admin
      .from("filiacao_vinculos")
      .select("filiado_id, matricula, fonte_pg_matricula")
      .eq("fonte_pagadora_id", fonteId)
      .eq("emp_proprietaria_id", await tenantAtual())
      .not("filiado_id", "is", null),
    lancamentosDaRemessa(remessaId).catch(() => [] as LancamentoBruto[]),
    lancamentosRemessaAnterior(remessaId),
  ])

  const porCpf = new Map<string, string>()
  const porNome = new Map<string, string>()
  const nomesAmbiguos = new Set<string>()
  for (const r of stats.registros) {
    if (r.cpf && !porCpf.has(r.cpf)) porCpf.set(r.cpf, r.id)
    const nomeChave = normalizarNome(r.nome_completo)
    if (nomeChave) {
      const existente = porNome.get(nomeChave)
      if (existente === undefined) porNome.set(nomeChave, r.id)
      else if (existente !== r.id) nomesAmbiguos.add(nomeChave)
    }
  }

  const porMatricula = new Map<string, string>()
  const aprender = (matricula: string | null, filiadoId: string | null) => {
    if (!matricula || !filiadoId) return
    const chave = matricula.replace(/^0+/, "")
    if (chave && !porMatricula.has(chave)) porMatricula.set(chave, filiadoId)
  }
  for (const v of vinculosRes.data ?? []) {
    aprender(v.matricula, v.filiado_id)
    aprender(v.fonte_pg_matricula, v.filiado_id)
  }
  for (const l of [...atuais, ...anteriores]) {
    if (l.fonte_pg_id === fonteId) aprender(l.fonte_pg_matricula, l.filiado_id)
  }

  return itens.map((item) => {
    if (item.cpf && porCpf.has(item.cpf)) {
      return { filiadoId: porCpf.get(item.cpf)!, via: "cpf" as const }
    }
    if (item.matriculaFonte) {
      const chave = item.matriculaFonte.replace(/^0+/, "")
      if (chave && porMatricula.has(chave)) {
        return { filiadoId: porMatricula.get(chave)!, via: "matricula" as const }
      }
    }
    const nomeChave = normalizarNome(item.nome)
    if (nomeChave && !nomesAmbiguos.has(nomeChave) && porNome.has(nomeChave)) {
      return { filiadoId: porNome.get(nomeChave)!, via: "nome" as const }
    }
    return { filiadoId: null, via: null }
  })
}

/** Compat: mesma assinatura de antes (usada pela importação manual de CSV). */
export async function resolverFiliadosLote(
  fonteId: string,
  remessaId: string,
  itens: { cpf: string | null; matriculaFonte: string | null }[]
): Promise<(string | null)[]> {
  const det = await resolverFiliadosLoteDetalhado(fonteId, remessaId, itens)
  return det.map((d) => d.filiadoId)
}
