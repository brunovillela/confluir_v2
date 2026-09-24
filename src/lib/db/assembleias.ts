import { cache as cacheReact } from "react"

import "server-only"
import { horaCurta } from "@/lib/assembleias-constantes"
import {
  colunasHorario,
  janelaDaAssembleia,
  situacaoDaAssembleia,
} from "@/lib/db/assembleias-horarios"
import { esquemaAusente } from "@/lib/db/comum"
import { tenantAtual } from "@/lib/tenant"
import { semAcento } from "@/lib/texto"

import {
  derivarModalidade,
  MOTIVO_ASSEMBLEIAS_BLOQUEADAS,
  MOTIVO_PERGUNTAS_BLOQUEADAS,
  periodoTerminado,
  PRAZO_EM_BREVE_MS,
  ROTULOS_MODALIDADE,
  temVotoOnline,
  type Modalidade,
} from "@/lib/assembleias-constantes"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Assembleias e votação (Fase 3D — painel interno, online primeiro).
 *
 * Hierarquia: `voto_campanha` (tema + fontes pagadoras via
 * `voto_campanha_fontes`) → `voto_rod_assembleias` (período; dona das
 * perguntas e da lista de aptos) → `voto_assembleias` (online, urna ou
 * reunião de trabalhadores).
 *
 * Legado: os vínculos vinham em campos `*_raw` (JSON de bubble_ids) —
 * `supabase/assembleias.sql` cria as colunas normalizadas
 * (`voto_assembleias.rod_assembleia_id`, `voto_rod_assembleias.inicio`),
 * a junção campanha↔fontes e roda o backfill (re-rodável — o Bubble segue
 * sincronizando até a virada). `eleitor_id` referencia `usuarios`.
 */

// ── Tipos ──────────────────────────────────────────────────────────────────

/**
 * A assembleia que faz a campanha merecer destaque na lista: a que está
 * votando agora ou a próxima a abrir dentro de `DIAS_EM_BREVE`.
 */
export type AtividadeCampanha = {
  tipo: "em_curso" | "em_breve"
  assembleia: string | null
  /** Abertura (ISO) — em "em breve", é a data que a lista mostra. */
  inicio: string | null
  /** Fechamento (ISO) — em "em curso", é até quando dá para votar. */
  termino: string | null
}

export type CampanhaLinha = {
  id: string
  tema: string | null
  finalizado: boolean
  fontes: string[]
  rodadas: number
  created_at: string | null
  atividade: AtividadeCampanha | null
}

/** Colunas da tabela de campanhas pelas quais dá para ordenar. */
export const ORDENS_CAMPANHA = [
  "atividade",
  "tema",
  "rodadas",
  "situacao",
  "registro",
] as const
export type OrdemCampanha = (typeof ORDENS_CAMPANHA)[number]

export const POR_PAGINA_OPCOES = [25, 50, 100] as const

export type CampanhaDetalhe = {
  id: string
  tema: string | null
  finalizado: boolean
  fonteIds: string[]
  fontes: { id: string; nome: string }[]
  created_at: string | null
}

export type RodadaLinha = {
  id: string
  nome: string | null
  codigo: string | null
  inicio: string | null
  termino: string | null
  apuracao_encerrada: boolean
  perguntas: number
  assembleias: number
  aptos: number
  votosOnline: number
}

export type RodadaDetalhe = {
  id: string
  nome: string | null
  descricao: string | null
  codigo: string | null
  inicio: string | null
  termino: string | null
  apuracao_encerrada: boolean
  edital_url: string | null
  card_grafico_url: string | null
  video_indicativo_url: string | null
  campanha_id: string | null
  campanhaTema: string | null
  /** Nomes das fontes pagadoras vinculadas à campanha da rodada. */
  fontes: string[]
  aptos: number
  votosOnline: number
  /** ACT em discussão tem cláusula de filiação coletiva (nascedouro). */
  clausula_filiacao_coletiva: boolean
  filiacao_coletiva_dias: number | null
}

export type OpcaoResposta = {
  id: string
  opcao_resposta: string | null
  votos: number
}

export type Pergunta = {
  id: string
  pergunta: string | null
  ordem: number | null
  opcoes: OpcaoResposta[]
  votos: number
}

export type AssembleiaLinha = {
  id: string
  nome: string | null
  descricao: string | null
  modalidade: Modalidade
  data_inicio: string | null
  data_termino: string | null
  /** Hora de abertura/encerramento (HH:MM); nulo = dia inteiro. */
  hora_inicio: string | null
  hora_termino: string | null
  voto_em_separado: boolean
  /** Pleito interno: só filiados votam, e a carência se aplica. */
  somente_filiados: boolean
  edital: string | null
  ata: string | null
}

export type AptoLinha = {
  id: string
  cpf: string | null
  nome_completo: string | null
  matricula: string | null
  email_corporativo: string | null
  telefone?: string | null
  hora_voto: string | null
  /** CPF informado no primeiro acesso que colidiu com outro apto (gestão resolve). */
  cpf_conflito?: string | null
  conflito_motivo?: string | null
}

// ── Resumo (hub) ───────────────────────────────────────────────────────────

export type ResumoAssembleias = {
  campanhas: number
  campanhasAbertas: number
  rodadasAbertas: number
  votosOnline: number
  /** null = supabase/assembleias.sql ainda não rodado. */
  esquemaPronto: boolean
}

export async function resumoAssembleias(): Promise<ResumoAssembleias> {
  const admin = await createAdminClient()
  const conta = (q: PromiseLike<{ count: number | null }>) =>
    q.then((r) => r.count ?? 0)

  const [campanhas, campanhasAbertas, rodadasAbertas, votosOnline, junta] =
    await Promise.all([
      conta(
        admin
          .from("voto_campanha")
          .select("id", { count: "exact", head: true })
          .eq("emp_proprietaria_id", await tenantAtual())
      ),
      conta(
        admin
          .from("voto_campanha")
          .select("id", { count: "exact", head: true })
          .eq("emp_proprietaria_id", await tenantAtual())
          .not("finalizado", "is", true)
      ),
      conta(
        admin
          .from("voto_rod_assembleias")
          .select("id", { count: "exact", head: true })
          .eq("emp_proprietaria_id", await tenantAtual())
          .not("apuracao_encerrada", "is", true)
      ),
      conta(
        admin
          .from("voto_online")
          .select("id", { count: "exact", head: true })
          .eq("emp_proprietaria_id", await tenantAtual())
      ),
      // Sonda do esquema: precisa ser GET — respostas HEAD não trazem o
      // código de erro que esquemaAusente() lê.
      admin.from("voto_campanha_fontes").select("id").limit(1),
    ])

  return {
    campanhas,
    campanhasAbertas,
    rodadasAbertas,
    votosOnline,
    esquemaPronto: !esquemaAusente(junta.error),
  }
}

// ── Campanhas ──────────────────────────────────────────────────────────────

const POR_PAGINA = 25

/**
 * Teto de campanhas carregadas de uma vez quando a ordenação é por um dado
 * CALCULADO (rodadas, atividade) — esses não existem como coluna, então a
 * ordem precisa ser feita em memória sobre o conjunto inteiro. Hoje o maior
 * tenant tem 67 campanhas; o teto existe só para não crescer sem limite, e
 * `.range` explícito é obrigatório porque o PostgREST corta em 1.000 linhas.
 */
const TETO_ORDEM_EM_MEMORIA = 2000

/** Colunas reais do banco por trás de cada ordem (as demais são calculadas). */
const COLUNA_DA_ORDEM: Partial<Record<OrdemCampanha, string>> = {
  tema: "tema",
  situacao: "finalizado",
  registro: "created_at",
}

export async function listarCampanhas(filtros: {
  busca?: string
  situacao?: "abertas" | "finalizadas" | "todas"
  /** Só campanhas com esta empresa entre as fontes pagadoras. */
  empresaId?: string
  pagina?: number
  porPagina?: number
  ordem?: OrdemCampanha
  /** true = crescente. O padrão de cada ordem vale quando não vem nada. */
  asc?: boolean
}): Promise<{
  linhas: CampanhaLinha[]
  total: number
  pagina: number
  totalPaginas: number
  porPagina: number
  ordem: OrdemCampanha
  asc: boolean
}> {
  const admin = await createAdminClient()
  const pagina = filtros.pagina && filtros.pagina > 0 ? filtros.pagina : 1
  const porPagina = POR_PAGINA_OPCOES.includes(
    filtros.porPagina as (typeof POR_PAGINA_OPCOES)[number]
  )
    ? (filtros.porPagina as number)
    : POR_PAGINA
  // O padrão é por atividade: o que está em votação, e o que abre em breve,
  // sobe para o topo. Empate cai no mais recente, que é a ordem de sempre.
  const ordem: OrdemCampanha = ORDENS_CAMPANHA.includes(
    filtros.ordem as OrdemCampanha
  )
    ? (filtros.ordem as OrdemCampanha)
    : "atividade"
  // Padrões que fazem sentido em cada coluna: tema de A a Z; o resto do maior
  // para o menor (mais recente, mais rodadas, em curso primeiro).
  const asc = filtros.asc ?? ordem === "tema"

  let q = admin
    .from("voto_campanha")
    .select("id, tema, finalizado, created_at", { count: "exact" })
    .eq("emp_proprietaria_id", await tenantAtual())
  if (filtros.busca) q = q.ilike("tema", `%${filtros.busca}%`)
  if (filtros.empresaId) {
    // O vínculo com a empresa vive em voto_campanha_fontes.
    const { data: vinculos, error: erroVinculo } = await admin
      .from("voto_campanha_fontes")
      .select("campanha_id")
      .eq("empresa_id", filtros.empresaId)
    if (erroVinculo && !esquemaAusente(erroVinculo)) {
      throw new Error(`Falha ao filtrar por empresa: ${erroVinculo.message}`)
    }
    const ids = [...new Set((vinculos ?? []).map((v) => String(v.campanha_id)))]
    // Sem campanha alguma para a empresa: devolve vazio sem ir ao banco.
    if (ids.length === 0) {
      return { linhas: [], total: 0, pagina, totalPaginas: 1, porPagina, ordem, asc }
    }
    q = q.in("id", ids)
  }
  if (filtros.situacao === "abertas") q = q.not("finalizado", "is", true)
  if (filtros.situacao === "finalizadas") q = q.eq("finalizado", true)

  // Rodadas e atividade não são colunas: para ordenar por elas, carrega o
  // conjunto filtrado e ordena em memória. Nas colunas reais, o banco ordena e
  // pagina — é o caminho que escala.
  const colunaDb = COLUNA_DA_ORDEM[ordem]
  const de = (pagina - 1) * porPagina
  const { data, error, count } = colunaDb
    ? await q
        .order(colunaDb, { ascending: asc, nullsFirst: false })
        .range(de, de + porPagina - 1)
    : await q
        .order("created_at", { ascending: false })
        .range(0, TETO_ORDEM_EM_MEMORIA - 1)
  if (error) throw new Error(`Falha ao listar campanhas: ${error.message}`)

  const ids = (data ?? []).map((c) => c.id)
  const [fontesPorCampanha, rodadasPorCampanha, atividadePorCampanha] =
    await Promise.all([
      fontesDasCampanhas(ids),
      contarPorCampo("voto_rod_assembleias", "campanha_id", ids),
      atividadeDasCampanhas(ids),
    ])

  let linhas: CampanhaLinha[] = (data ?? []).map((c) => ({
    id: c.id,
    tema: c.tema,
    finalizado: c.finalizado === true,
    fontes: fontesPorCampanha.get(c.id) ?? [],
    rodadas: rodadasPorCampanha.get(c.id) ?? 0,
    created_at: c.created_at,
    atividade: atividadePorCampanha.get(c.id) ?? null,
  }))

  const total = count ?? linhas.length
  let totalPaginas = Math.max(1, Math.ceil(total / porPagina))
  if (!colunaDb) {
    linhas.sort(comparadorCalculado(ordem, asc))
    totalPaginas = Math.max(1, Math.ceil(linhas.length / porPagina))
    linhas = linhas.slice(de, de + porPagina)
  }

  return { linhas, total, pagina, totalPaginas, porPagina, ordem, asc }
}

/** Peso da atividade na ordenação: em curso vem antes de em breve, e do resto. */
function pesoAtividade(a: AtividadeCampanha | null): number {
  if (a?.tipo === "em_curso") return 2
  if (a?.tipo === "em_breve") return 1
  return 0
}

function comparadorCalculado(
  ordem: OrdemCampanha,
  asc: boolean
): (a: CampanhaLinha, b: CampanhaLinha) => number {
  const sinal = asc ? 1 : -1
  return (a, b) => {
    const diferenca =
      ordem === "rodadas"
        ? a.rodadas - b.rodadas
        : pesoAtividade(a.atividade) - pesoAtividade(b.atividade)
    if (diferenca !== 0) return sinal * diferenca
    // Empate: a mais recente primeiro, para a ordem não sair sorteada.
    return (b.created_at ?? "").localeCompare(a.created_at ?? "")
  }
}

/**
 * Para cada campanha, a assembleia que está votando AGORA ou a próxima a abrir
 * dentro de `DIAS_EM_BREVE`. Assembleia sem data de início não conta: o dado
 * migrado do Bubble tem muitas assim, e elas não estão "em curso" — só não têm
 * data. Sem término próprio, vale o término da rodada.
 */
async function atividadeDasCampanhas(
  campanhaIds: string[]
): Promise<Map<string, AtividadeCampanha>> {
  const porCampanha = new Map<string, AtividadeCampanha>()
  if (campanhaIds.length === 0) return porCampanha
  const admin = await createAdminClient()

  const { data: rodadas, error: erroRodadas } = await admin
    .from("voto_rod_assembleias")
    .select("id, campanha_id, termino")
    .in("campanha_id", campanhaIds)
  if (erroRodadas) {
    if (esquemaAusente(erroRodadas)) return porCampanha
    throw new Error(`Falha ao ler as rodadas: ${erroRodadas.message}`)
  }
  const campanhaDaRodada = new Map<string, string>()
  const terminoDaRodada = new Map<string, string | null>()
  for (const r of linhasBrutas(rodadas)) {
    const id = String(r.id)
    campanhaDaRodada.set(id, String(r.campanha_id))
    terminoDaRodada.set(id, (r.termino as string | null) ?? null)
  }
  const rodadaIds = [...campanhaDaRodada.keys()]
  if (rodadaIds.length === 0) return porCampanha

  const { data: assembleias, error } = await admin
    .from("voto_assembleias")
    .select(
      "nome_assembleia, rod_assembleia_id, data_inicio, data_termino" +
        (await colunasHorario())
    )
    .in("rod_assembleia_id", rodadaIds)
  if (error) {
    if (esquemaAusente(error)) return porCampanha
    throw new Error(`Falha ao ler as assembleias: ${error.message}`)
  }

  const agora = Date.now()
  for (const a of linhasBrutas(assembleias)) {
    const rodadaId = String(a.rod_assembleia_id)
    const campanhaId = campanhaDaRodada.get(rodadaId)
    if (!campanhaId) continue
    const janela = janelaDaAssembleia(a, terminoDaRodada.get(rodadaId))
    if (janela.inicio === null) continue

    let candidata: AtividadeCampanha | null = null
    if (janela.inicio <= agora) {
      // Em curso: começou e ainda não fechou. Sem término, não dá para afirmar
      // que está aberta — assembleia antiga sem data de fim cairia aqui para
      // sempre.
      if (janela.termino !== null && janela.termino >= agora) {
        candidata = {
          tipo: "em_curso",
          assembleia: (a.nome_assembleia as string | null) ?? null,
          inicio: new Date(janela.inicio).toISOString(),
          termino: new Date(janela.termino).toISOString(),
        }
      }
    } else if (janela.inicio - agora <= PRAZO_EM_BREVE_MS) {
      candidata = {
        tipo: "em_breve",
        assembleia: (a.nome_assembleia as string | null) ?? null,
        inicio: new Date(janela.inicio).toISOString(),
        termino: janela.termino === null ? null : new Date(janela.termino).toISOString(),
      }
    }
    if (!candidata) continue

    const atual = porCampanha.get(campanhaId)
    if (!atual || melhorAtividade(candidata, atual)) {
      porCampanha.set(campanhaId, candidata)
    }
  }
  return porCampanha
}

/** Em curso ganha de em breve; entre iguais, a que acontece primeiro. */
function melhorAtividade(nova: AtividadeCampanha, atual: AtividadeCampanha): boolean {
  if (pesoAtividade(nova) !== pesoAtividade(atual)) {
    return pesoAtividade(nova) > pesoAtividade(atual)
  }
  const chave = (a: AtividadeCampanha) =>
    a.tipo === "em_curso" ? (a.termino ?? "") : (a.inicio ?? "")
  return chave(nova) < chave(atual)
}

/** Nomes das fontes vinculadas, por campanha. Vazio se o SQL não rodou. */
async function fontesDasCampanhas(
  campanhaIds: string[]
): Promise<Map<string, string[]>> {
  const porCampanha = new Map<string, string[]>()
  if (campanhaIds.length === 0) return porCampanha
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("voto_campanha_fontes")
    .select("campanha_id, empresa:empresa_id (nome_fantasia, nome_razao)")
    .in("campanha_id", campanhaIds)
  if (error) {
    if (esquemaAusente(error)) return porCampanha
    throw new Error(`Falha ao buscar fontes das campanhas: ${error.message}`)
  }
  for (const v of data ?? []) {
    const e = v.empresa as unknown as {
      nome_fantasia: string | null
      nome_razao: string | null
    } | null
    const nome = e?.nome_fantasia?.trim() || e?.nome_razao?.trim()
    if (!nome) continue
    const lista = porCampanha.get(v.campanha_id) ?? []
    lista.push(nome)
    porCampanha.set(v.campanha_id, lista)
  }
  return porCampanha
}

async function contarPorCampo(
  tabela: string,
  campo: string,
  ids: string[]
): Promise<Map<string, number>> {
  const contagens = new Map<string, number>()
  if (ids.length === 0) return contagens
  const admin = await createAdminClient()
  const { data, error } = await admin.from(tabela).select(campo).in(campo, ids)
  if (error) {
    if (esquemaAusente(error)) return contagens
    throw new Error(`Falha ao contar ${tabela}: ${error.message}`)
  }
  for (const linha of (data ?? []) as unknown as Record<string, unknown>[]) {
    const id = String(linha[campo])
    contagens.set(id, (contagens.get(id) ?? 0) + 1)
  }
  return contagens
}

export async function obterCampanha(
  id: string
): Promise<CampanhaDetalhe | null> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("voto_campanha")
    .select("id, tema, finalizado, created_at")
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (error) throw new Error(`Falha ao buscar campanha: ${error.message}`)
  if (!data) return null

  const { data: vinculos, error: erroVinculos } = await admin
    .from("voto_campanha_fontes")
    .select("empresa_id, empresa:empresa_id (nome_fantasia, nome_razao)")
    .eq("campanha_id", id)
  const fontes =
    erroVinculos && esquemaAusente(erroVinculos)
      ? []
      : (vinculos ?? []).map((v) => {
          const e = v.empresa as unknown as {
            nome_fantasia: string | null
            nome_razao: string | null
          } | null
          return {
            id: v.empresa_id as string,
            nome:
              e?.nome_fantasia?.trim() ||
              e?.nome_razao?.trim() ||
              "(sem nome)",
          }
        })

  return {
    id: data.id,
    tema: data.tema,
    finalizado: data.finalizado === true,
    fonteIds: fontes.map((f) => f.id),
    fontes,
    created_at: data.created_at,
  }
}

export async function criarCampanha(dados: {
  tema: string
  fonteIds: string[]
}): Promise<{ id?: string; erro?: string }> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("voto_campanha")
    .insert({
      tema: dados.tema,
      finalizado: false,
      emp_proprietaria_id: await tenantAtual(),
    })
    .select("id")
    .single()
  if (error || !data) {
    return { erro: `Falha ao criar a campanha: ${error?.message}` }
  }
  const erroFontes = await sincronizarFontes(data.id, dados.fonteIds)
  if (erroFontes) return { id: data.id, erro: erroFontes }
  return { id: data.id }
}

export async function atualizarCampanha(
  id: string,
  dados: { tema: string; finalizado: boolean; fonteIds: string[] }
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin
    .from("voto_campanha")
    .update({ tema: dados.tema, finalizado: dados.finalizado })
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: `Falha ao salvar a campanha: ${error.message}` }
  const erroFontes = await sincronizarFontes(id, dados.fonteIds)
  return erroFontes ? { erro: erroFontes } : {}
}

/** Deixa a junção campanha↔fontes igual à seleção do formulário. */
async function sincronizarFontes(
  campanhaId: string,
  fonteIds: string[]
): Promise<string | null> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("voto_campanha_fontes")
    .select("id, empresa_id")
    .eq("campanha_id", campanhaId)
  if (error) {
    return esquemaAusente(error)
      ? "Campanha salva, mas o vínculo com fontes precisa de supabase/assembleias.sql — rode o script no SQL Editor."
      : `Falha ao ler fontes vinculadas: ${error.message}`
  }

  const atuais = new Map((data ?? []).map((v) => [v.empresa_id as string, v.id]))
  const desejadas = new Set(fonteIds)
  const remover = [...atuais.entries()]
    .filter(([empresaId]) => !desejadas.has(empresaId))
    .map(([, vinculoId]) => vinculoId)
  const adicionar = fonteIds.filter((f) => !atuais.has(f))

  if (remover.length > 0) {
    const { error: e } = await admin
      .from("voto_campanha_fontes")
      .delete()
      .in("id", remover)
    if (e) return `Falha ao remover fontes: ${e.message}`
  }
  if (adicionar.length > 0) {
    const { error: e } = await admin.from("voto_campanha_fontes").insert(
      adicionar.map((empresaId) => ({
        campanha_id: campanhaId,
        empresa_id: empresaId,
      }))
    )
    if (e) return `Falha ao vincular fontes: ${e.message}`
  }
  return null
}

// ── Rodadas ────────────────────────────────────────────────────────────────

/** Código no padrão herdado do Bubble: AAAA.MMDD.HHMM.NNNN. */
function gerarCodigo(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, "0")
  const rand = String(Math.floor(Math.random() * 10_000)).padStart(4, "0")
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}${p(d.getDate())}.${p(d.getHours())}${p(d.getMinutes())}.${rand}`
}

export async function listarRodadasDaCampanha(
  campanhaId: string
): Promise<RodadaLinha[]> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("voto_rod_assembleias")
    .select("id, nome_assembleia, codigo, termino, apuracao_encerrada")
    .eq("campanha_id", campanhaId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .order("created_at", { ascending: false })
  if (error) throw new Error(`Falha ao listar rodadas: ${error.message}`)

  // `inicio` só existe após assembleias.sql — busca separada tolerante.
  const inicios = new Map<string, string | null>()
  if ((data ?? []).length > 0) {
    const { data: comInicio, error: erroInicio } = await admin
      .from("voto_rod_assembleias")
      .select("id, inicio")
      .in(
        "id",
        (data ?? []).map((r) => r.id)
      )
    if (!erroInicio) {
      for (const r of comInicio ?? []) inicios.set(r.id, r.inicio)
    } else if (!esquemaAusente(erroInicio)) {
      throw new Error(`Falha ao listar rodadas: ${erroInicio.message}`)
    }
  }

  const ids = (data ?? []).map((r) => r.id)
  const [perguntas, assembleias, aptos, votos] = await Promise.all([
    contarPorCampo("voto_assembleias_perguntas", "rod_assembleia_id", ids),
    contarPorCampo("voto_assembleias", "rod_assembleia_id", ids),
    contarPorCampo("voto_assembleias_aptos", "rod_assembleia_id", ids),
    contarPorCampo("voto_online", "rod_assembleia_id", ids),
  ])

  return (data ?? []).map((r) => ({
    id: r.id,
    nome: r.nome_assembleia,
    codigo: r.codigo,
    inicio: inicios.get(r.id) ?? null,
    termino: r.termino,
    apuracao_encerrada: r.apuracao_encerrada === true,
    perguntas: perguntas.get(r.id) ?? 0,
    assembleias: assembleias.get(r.id) ?? 0,
    aptos: aptos.get(r.id) ?? 0,
    votosOnline: votos.get(r.id) ?? 0,
  }))
}

export async function criarRodada(dados: {
  campanha_id: string
  nome: string
  descricao: string | null
  inicio: string | null
  termino: string | null
  /** Cláusula de filiação coletiva no ACT em discussão. */
  clausula_filiacao_coletiva?: boolean
  filiacao_coletiva_dias?: number | null
}): Promise<{ id?: string; erro?: string }> {
  const admin = await createAdminClient()
  const base = {
    campanha_id: dados.campanha_id,
    nome_assembleia: dados.nome,
    descricao: dados.descricao,
    termino: dados.termino,
    codigo: gerarCodigo(),
    apuracao_encerrada: false,
    clausula_filiacao_coletiva: dados.clausula_filiacao_coletiva === true,
    filiacao_coletiva_dias: dados.filiacao_coletiva_dias ?? null,
    emp_proprietaria_id: await tenantAtual(),
  }
  // Tenta com `inicio` (coluna de assembleias.sql); sem ela, grava o resto.
  let res = await admin
    .from("voto_rod_assembleias")
    .insert({ ...base, inicio: dados.inicio })
    .select("id")
    .single()
  if (res.error && esquemaAusente(res.error)) {
    res = await admin
      .from("voto_rod_assembleias")
      .insert(base)
      .select("id")
      .single()
  }
  if (res.error || !res.data) {
    return { erro: `Falha ao criar a rodada: ${res.error?.message}` }
  }
  return { id: res.data.id }
}

export async function obterRodada(id: string): Promise<RodadaDetalhe | null> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("voto_rod_assembleias")
    .select(
      "id, nome_assembleia, descricao, codigo, termino, apuracao_encerrada, edital_url, card_grafico_url, video_indicativo_url, campanha_id, clausula_filiacao_coletiva, filiacao_coletiva_dias, campanha:campanha_id (tema)"
    )
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (error) throw new Error(`Falha ao buscar a rodada: ${error.message}`)
  if (!data) return null

  const [{ data: comInicio }, aptos, votos, fontesPorCampanha] =
    await Promise.all([
      admin
        .from("voto_rod_assembleias")
        .select("inicio")
        .eq("id", id)
        .maybeSingle(),
      admin
        .from("voto_assembleias_aptos")
        .select("id", { count: "exact", head: true })
        .eq("rod_assembleia_id", id),
      admin
        .from("voto_online")
        .select("id", { count: "exact", head: true })
        .eq("rod_assembleia_id", id),
      data.campanha_id
        ? fontesDasCampanhas([data.campanha_id])
        : Promise.resolve(new Map<string, string[]>()),
    ])

  const campanha = data.campanha as unknown as { tema: string | null } | null
  return {
    id: data.id,
    nome: data.nome_assembleia,
    descricao: data.descricao,
    codigo: data.codigo,
    inicio: (comInicio as { inicio?: string | null } | null)?.inicio ?? null,
    termino: data.termino,
    apuracao_encerrada: data.apuracao_encerrada === true,
    edital_url: data.edital_url,
    card_grafico_url: data.card_grafico_url,
    video_indicativo_url: data.video_indicativo_url,
    campanha_id: data.campanha_id,
    campanhaTema: campanha?.tema ?? null,
    fontes: data.campanha_id
      ? (fontesPorCampanha.get(data.campanha_id) ?? [])
      : [],
    aptos: aptos.count ?? 0,
    votosOnline: votos.count ?? 0,
    clausula_filiacao_coletiva: data.clausula_filiacao_coletiva === true,
    filiacao_coletiva_dias:
      (data.filiacao_coletiva_dias as number | null) ?? null,
  }
}

export async function atualizarRodada(
  id: string,
  dados: {
    nome: string
    descricao: string | null
    inicio: string | null
    termino: string | null
    video_indicativo_url: string | null
    apuracao_encerrada: boolean
    clausula_filiacao_coletiva?: boolean
    filiacao_coletiva_dias?: number | null
    edital_url?: string
    card_grafico_url?: string
  }
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const base: Record<string, unknown> = {
    nome_assembleia: dados.nome,
    descricao: dados.descricao,
    termino: dados.termino,
    video_indicativo_url: dados.video_indicativo_url,
    apuracao_encerrada: dados.apuracao_encerrada,
  }
  if (dados.clausula_filiacao_coletiva !== undefined) {
    base.clausula_filiacao_coletiva = dados.clausula_filiacao_coletiva
    base.filiacao_coletiva_dias = dados.filiacao_coletiva_dias ?? null
  }
  if (dados.edital_url !== undefined) base.edital_url = dados.edital_url
  if (dados.card_grafico_url !== undefined) {
    base.card_grafico_url = dados.card_grafico_url
  }

  let res = await admin
    .from("voto_rod_assembleias")
    .update({ ...base, inicio: dados.inicio })
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (res.error && esquemaAusente(res.error)) {
    res = await admin
      .from("voto_rod_assembleias")
      .update(base)
      .eq("id", id)
      .eq("emp_proprietaria_id", await tenantAtual())
  }
  return res.error
    ? { erro: `Falha ao salvar a rodada: ${res.error.message}` }
    : {}
}

// ── Travas de edição da rodada ─────────────────────────────────────────────

/** `inicio`/`termino` da rodada tolerando a coluna `inicio` ausente. */
async function periodoDaRodada(
  rodadaId: string
): Promise<{ inicio: string | null; termino: string | null }> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("voto_rod_assembleias")
    .select("termino")
    .eq("id", rodadaId)
    .maybeSingle()
  const { data: comInicio, error } = await admin
    .from("voto_rod_assembleias")
    .select("inicio")
    .eq("id", rodadaId)
    .maybeSingle()
  if (error && !esquemaAusente(error)) {
    throw new Error(`Falha ao ler o período da rodada: ${error.message}`)
  }
  return {
    inicio: (comInicio as { inicio?: string | null } | null)?.inicio ?? null,
    termino: data?.termino ?? null,
  }
}

/**
 * Perguntas e opções só mudam enquanto a rodada não tem assembleias
 * cadastradas e o período não começou. `null` = liberado.
 */
export async function validarEdicaoPerguntas(
  rodadaId: string
): Promise<string | null> {
  const admin = await createAdminClient()
  const { termino } = await periodoDaRodada(rodadaId)

  // Voto registrado fecha a porta na hora, mesmo que a janela ainda pareça
  // aberta (urna, reunião, ajuste de horário depois do começo).
  const { count: votos } = await admin
    .from("voto_online")
    .select("id", { count: "exact", head: true })
    .eq("rod_assembleia_id", rodadaId)
  if ((votos ?? 0) > 0) return MOTIVO_PERGUNTAS_BLOQUEADAS.votos

  const { data, error } = await admin
    .from("voto_assembleias")
    .select(
      "id, data_inicio, data_termino" + (await colunasHorario())
    )
    .eq("rod_assembleia_id", rodadaId)
  if (error) {
    if (esquemaAusente(error)) return null
    throw new Error(`Falha ao conferir as assembleias: ${error.message}`)
  }
  const agora = Date.now()
  const comecou = (linhasBrutas(data)).some(
    (a) => situacaoDaAssembleia(a, termino, agora) !== "antes"
  )
  return comecou ? MOTIVO_PERGUNTAS_BLOQUEADAS.assembleiaIniciada : null
}

/** A coluna de telefone existe? (supabase/aptos-telefone.sql) */
const temTelefone = cacheReact(async (): Promise<boolean> => {
  const admin = await createAdminClient()
  const { error } = await admin.from("voto_assembleias_aptos").select("telefone").limit(1)
  return !error
})

/** Só manda o telefone quando a coluna existe — senão o insert falha inteiro. */
async function telefoneSeExistir(telefone: string | null): Promise<Record<string, unknown>> {
  return (await temTelefone()) ? { telefone } : {}
}

/** Select montado (horários só depois do SQL): o tipo vem solto. */
function linhasBrutas(data: unknown): Record<string, unknown>[] {
  return (data ?? []) as Record<string, unknown>[]
}

/**
 * Assembleias só mudam com pelo menos uma pergunta com opções e enquanto o
 * período da rodada não terminou. `null` = liberado.
 */
export async function validarEdicaoAssembleias(
  rodadaId: string
): Promise<string | null> {
  const admin = await createAdminClient()
  const { termino } = await periodoDaRodada(rodadaId)
  if (periodoTerminado(termino)) return MOTIVO_ASSEMBLEIAS_BLOQUEADAS.periodo

  const { data: perguntas, error } = await admin
    .from("voto_assembleias_perguntas")
    .select("id")
    .eq("rod_assembleia_id", rodadaId)
  if (error) {
    throw new Error(`Falha ao conferir as perguntas: ${error.message}`)
  }
  if ((perguntas ?? []).length === 0) {
    return MOTIVO_ASSEMBLEIAS_BLOQUEADAS.semPerguntas
  }
  const { count } = await admin
    .from("voto_opcoes_resposta")
    .select("id", { count: "exact", head: true })
    .in(
      "pergunta_id",
      (perguntas ?? []).map((p) => p.id)
    )
  if ((count ?? 0) === 0) return MOTIVO_ASSEMBLEIAS_BLOQUEADAS.semPerguntas
  return null
}

// ── Perguntas e opções ─────────────────────────────────────────────────────

export async function listarPerguntas(
  rodadaId: string
): Promise<Pergunta[]> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("voto_assembleias_perguntas")
    .select("id, pergunta, ordem")
    .eq("rod_assembleia_id", rodadaId)
    .order("ordem", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true })
  if (error) throw new Error(`Falha ao listar perguntas: ${error.message}`)
  const perguntaIds = (data ?? []).map((p) => p.id)

  const opcoesPorPergunta = new Map<string, OpcaoResposta[]>()
  const votosPorPergunta = new Map<string, number>()
  const votosPorOpcao = new Map<string, number>()
  if (perguntaIds.length > 0) {
    const [opcoes, votos] = await Promise.all([
      admin
        .from("voto_opcoes_resposta")
        .select("id, opcao_resposta, pergunta_id")
        .in("pergunta_id", perguntaIds)
        .order("created_at", { ascending: true }),
      admin
        .from("voto_online")
        .select("pergunta_id, resposta_id")
        .in("pergunta_id", perguntaIds),
    ])
    if (opcoes.error) {
      throw new Error(`Falha ao listar opções: ${opcoes.error.message}`)
    }
    if (votos.error) {
      throw new Error(`Falha ao contar votos: ${votos.error.message}`)
    }
    for (const v of votos.data ?? []) {
      if (v.pergunta_id) {
        votosPorPergunta.set(
          v.pergunta_id,
          (votosPorPergunta.get(v.pergunta_id) ?? 0) + 1
        )
      }
      if (v.resposta_id) {
        votosPorOpcao.set(
          v.resposta_id,
          (votosPorOpcao.get(v.resposta_id) ?? 0) + 1
        )
      }
    }
    for (const o of opcoes.data ?? []) {
      const lista = opcoesPorPergunta.get(o.pergunta_id) ?? []
      lista.push({
        id: o.id,
        opcao_resposta: o.opcao_resposta,
        votos: votosPorOpcao.get(o.id) ?? 0,
      })
      opcoesPorPergunta.set(o.pergunta_id, lista)
    }
  }

  return (data ?? []).map((p) => ({
    id: p.id,
    pergunta: p.pergunta,
    ordem: p.ordem,
    opcoes: opcoesPorPergunta.get(p.id) ?? [],
    votos: votosPorPergunta.get(p.id) ?? 0,
  }))
}

export async function criarPergunta(dados: {
  rod_assembleia_id: string
  pergunta: string
  ordem: number | null
  /** Opções iniciais (uma por linha do formulário). */
  opcoes: string[]
}): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("voto_assembleias_perguntas")
    .insert({
      rod_assembleia_id: dados.rod_assembleia_id,
      pergunta: dados.pergunta,
      ordem: dados.ordem,
      emp_proprietaria_id: await tenantAtual(),
    })
    .select("id")
    .single()
  if (error || !data) {
    return { erro: `Falha ao criar a pergunta: ${error?.message}` }
  }
  if (dados.opcoes.length > 0) {
    const empId = await tenantAtual()
    const { error: e } = await admin.from("voto_opcoes_resposta").insert(
      dados.opcoes.map((opcao) => ({
        pergunta_id: data.id,
        opcao_resposta: opcao,
        emp_proprietaria_id: empId,
      }))
    )
    if (e) return { erro: `Pergunta criada, mas falhou uma opção: ${e.message}` }
  }
  return {}
}

export async function atualizarPergunta(
  id: string,
  dados: { pergunta: string; ordem: number | null }
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin
    .from("voto_assembleias_perguntas")
    .update({ pergunta: dados.pergunta, ordem: dados.ordem })
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  return error ? { erro: `Falha ao salvar a pergunta: ${error.message}` } : {}
}

/** Bloqueia exclusão quando a pergunta já tem voto registrado. */
export async function excluirPergunta(id: string): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { count } = await admin
    .from("voto_online")
    .select("id", { count: "exact", head: true })
    .eq("pergunta_id", id)
  if ((count ?? 0) > 0) {
    return { erro: "Esta pergunta já tem votos — não pode ser excluída." }
  }
  const { error: erroOpcoes } = await admin
    .from("voto_opcoes_resposta")
    .delete()
    .eq("pergunta_id", id)
  if (erroOpcoes) {
    return { erro: `Falha ao excluir as opções: ${erroOpcoes.message}` }
  }
  const { error } = await admin
    .from("voto_assembleias_perguntas")
    .delete()
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  return error ? { erro: `Falha ao excluir a pergunta: ${error.message}` } : {}
}

export async function criarOpcao(dados: {
  pergunta_id: string
  opcao_resposta: string
}): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin.from("voto_opcoes_resposta").insert({
    pergunta_id: dados.pergunta_id,
    opcao_resposta: dados.opcao_resposta,
    emp_proprietaria_id: await tenantAtual(),
  })
  return error ? { erro: `Falha ao criar a opção: ${error.message}` } : {}
}

/** Bloqueia exclusão quando a opção já recebeu voto. */
export async function excluirOpcao(id: string): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { count } = await admin
    .from("voto_online")
    .select("id", { count: "exact", head: true })
    .eq("resposta_id", id)
  if ((count ?? 0) > 0) {
    return { erro: "Esta opção já recebeu votos — não pode ser excluída." }
  }
  const { error } = await admin
    .from("voto_opcoes_resposta")
    .delete()
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  return error ? { erro: `Falha ao excluir a opção: ${error.message}` } : {}
}

// ── Assembleias da rodada ──────────────────────────────────────────────────

export async function listarAssembleiasDaRodada(rodadaId: string): Promise<{
  linhas: AssembleiaLinha[]
  /** false = coluna rod_assembleia_id ausente (rodar assembleias.sql). */
  esquemaPronto: boolean
}> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("voto_assembleias")
    .select(
      "id, nome_assembleia, descricao, online, urnas_de_votacao, voto_em_separado, somente_filiados, data_inicio, data_termino, edital, ata" +
        (await colunasHorario())
    )
    .eq("rod_assembleia_id", rodadaId)
    .order("data_inicio", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true })
  if (error) {
    if (esquemaAusente(error)) return { linhas: [], esquemaPronto: false }
    throw new Error(`Falha ao listar assembleias: ${error.message}`)
  }
  // Select montado (horários só depois do SQL): tipo solto de propósito.
  const linhasBrutas = (data ?? []) as unknown as Record<string, unknown>[]
  return {
    esquemaPronto: true,
    linhas: linhasBrutas.map((a) => ({
      id: String(a.id),
      nome: (a.nome_assembleia as string | null) ?? null,
      descricao: (a.descricao as string | null) ?? null,
      modalidade: derivarModalidade(a),
      data_inicio: (a.data_inicio as string | null) ?? null,
      data_termino: (a.data_termino as string | null) ?? null,
      hora_inicio: horaCurta(a.hora_inicio as string | null),
      hora_termino: horaCurta(a.hora_termino as string | null),
      voto_em_separado: a.voto_em_separado === true,
      somente_filiados: a.somente_filiados === true,
      edital: (a.edital as string | null) ?? null,
      ata: (a.ata as string | null) ?? null,
    })),
  }
}

/**
 * Horários só entram na gravação depois do SQL que cria as colunas
 * (supabase/voto-horarios-comprovante.sql) — antes disso o insert/update
 * falharia inteiro por causa de um campo extra.
 */
async function horariosSeExistirem(dados: {
  hora_inicio: string | null
  hora_termino: string | null
}): Promise<Record<string, unknown>> {
  if (!(await colunasHorario())) return {}
  return { hora_inicio: dados.hora_inicio, hora_termino: dados.hora_termino }
}

export async function criarAssembleia(dados: {
  rod_assembleia_id: string
  nome: string
  descricao: string | null
  online: boolean
  urnas_de_votacao: boolean
  voto_em_separado: boolean
  /** Pleito INTERNO: só filiados votam, e a carência se aplica. */
  somente_filiados: boolean
  data_inicio: string | null
  data_termino: string | null
  hora_inicio: string | null
  hora_termino: string | null
}): Promise<{ id?: string; erro?: string }> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("voto_assembleias")
    .insert({
      rod_assembleia_id: dados.rod_assembleia_id,
      nome_assembleia: dados.nome,
      descricao: dados.descricao,
      online: dados.online,
      urnas_de_votacao: dados.urnas_de_votacao,
      voto_em_separado: dados.voto_em_separado,
      somente_filiados: dados.somente_filiados,
      data_inicio: dados.data_inicio,
      data_termino: dados.data_termino,
      ...(await horariosSeExistirem(dados)),
      codigo: gerarCodigo(),
      apuracao_encerrada: false,
      contador_votos: 0,
      emp_proprietaria_id: await tenantAtual(),
    })
    .select("id")
    .single()
  if (error && esquemaAusente(error)) {
    return {
      erro: "Rode supabase/assembleias.sql no SQL Editor do Supabase antes de criar assembleias (coluna de vínculo com a rodada).",
    }
  }
  if (error || !data) {
    return { erro: `Falha ao criar a assembleia: ${error?.message}` }
  }
  // Publica o evento na agenda do aplicativo (portal do associado).
  await sincronizarAgendaDaAssembleia(data.id)
  return { id: data.id }
}

export async function atualizarAssembleia(
  id: string,
  dados: {
    nome: string
    descricao: string | null
    online: boolean
    urnas_de_votacao: boolean
    voto_em_separado: boolean
    data_inicio: string | null
    data_termino: string | null
    hora_inicio: string | null
    hora_termino: string | null
    edital?: string
    ata?: string
  }
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const atualizacao: Record<string, unknown> = {
    nome_assembleia: dados.nome,
    descricao: dados.descricao,
    online: dados.online,
    urnas_de_votacao: dados.urnas_de_votacao,
    voto_em_separado: dados.voto_em_separado,
    data_inicio: dados.data_inicio,
    data_termino: dados.data_termino,
    ...(await horariosSeExistirem(dados)),
  }
  if (dados.edital !== undefined) atualizacao.edital = dados.edital
  if (dados.ata !== undefined) atualizacao.ata = dados.ata
  const { error } = await admin
    .from("voto_assembleias")
    .update(atualizacao)
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: `Falha ao salvar a assembleia: ${error.message}` }
  // Mantém o evento da agenda em dia com nome, datas e modalidade.
  await sincronizarAgendaDaAssembleia(id)
  return {}
}

/** Bloqueia exclusão quando a assembleia tem voto vinculado. */
export async function excluirAssembleia(
  id: string
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const [online, respostas] = await Promise.all([
    admin
      .from("voto_online")
      .select("id", { count: "exact", head: true })
      .eq("assembleia_id", id),
    admin
      .from("voto_votacao_respostas")
      .select("id", { count: "exact", head: true })
      .eq("assembleia_id", id),
  ])
  if ((online.count ?? 0) > 0 || (respostas.count ?? 0) > 0) {
    return { erro: "Esta assembleia já tem votos — não pode ser excluída." }
  }
  // Tira o evento da agenda antes de remover a assembleia.
  await removerAgendaDaAssembleia(id)
  const { error } = await admin
    .from("voto_assembleias")
    .delete()
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  return error
    ? { erro: `Falha ao excluir a assembleia: ${error.message}` }
    : {}
}

// ── Sincronização com a agenda (portal do associado) ───────────────────────

/**
 * Publica ou atualiza a assembleia como um evento na `agenda` com
 * `aplicativo = true`, para que os associados vejam no portal. Assembleia
 * sem data de início não vira evento (e sai da agenda se já estava lá).
 * Tolerante à coluna `agenda.assembleia_id` ausente (supabase/assembleias.sql
 * ainda não rodado) — nesse caso apenas não sincroniza.
 */
export async function sincronizarAgendaDaAssembleia(
  assembleiaId: string
): Promise<void> {
  const admin = await createAdminClient()

  const { data: a, error: erroA } = await admin
    .from("voto_assembleias")
    .select(
      "id, nome_assembleia, descricao, data_inicio, data_termino, online, urnas_de_votacao, rod_assembleia_id"
    )
    .eq("id", assembleiaId)
    .maybeSingle()
  if (erroA || !a) return

  // Localiza um evento já vinculado a esta assembleia.
  const { data: existente, error: erroBusca } = await admin
    .from("agenda")
    .select("id")
    .eq("assembleia_id", assembleiaId)
    .maybeSingle()
  if (erroBusca) {
    // Coluna ainda não existe: silencioso até rodar o SQL.
    if (esquemaAusente(erroBusca)) return
    throw new Error(`Falha ao sincronizar a agenda: ${erroBusca.message}`)
  }

  // Sem data de início não há evento a exibir.
  if (!a.data_inicio) {
    if (existente) {
      await admin.from("agenda").delete().eq("id", existente.id)
    }
    return
  }

  const modalidade = derivarModalidade(a)
  const [tituloBase, campanhaTema] = await tituloDaAssembleia(a)
  const detalhes = [
    `Modalidade: ${ROTULOS_MODALIDADE[modalidade]}.`,
    campanhaTema ? `Campanha: ${campanhaTema}.` : null,
    a.descricao?.trim() || null,
  ]
    .filter(Boolean)
    .join(" ")

  // Datas puras viram meio-dia local para não deslizar de dia por fuso.
  const linha = {
    atividade: tituloBase,
    informacoes_gerais: detalhes || null,
    inicio: `${a.data_inicio}T12:00:00-03:00`,
    termino: a.data_termino ? `${a.data_termino}T12:00:00-03:00` : null,
    dia_todo: true,
    aplicativo: true,
    tipo: "Atividade sindical",
    assembleia_id: assembleiaId,
    emp_proprietaria_id: await tenantAtual(),
  }

  const res = existente
    ? await admin.from("agenda").update(linha).eq("id", existente.id)
    : await admin.from("agenda").insert(linha)
  if (res.error && !esquemaAusente(res.error)) {
    throw new Error(`Falha ao sincronizar a agenda: ${res.error.message}`)
  }
}

/** Título do evento + tema da campanha (para o corpo do evento). */
async function tituloDaAssembleia(a: {
  nome_assembleia: string | null
  rod_assembleia_id: string | null
}): Promise<[string, string | null]> {
  const admin = await createAdminClient()
  let campanhaTema: string | null = null
  let rodadaNome: string | null = null
  if (a.rod_assembleia_id) {
    const { data: r } = await admin
      .from("voto_rod_assembleias")
      .select("nome_assembleia, campanha:campanha_id (tema)")
      .eq("id", a.rod_assembleia_id)
      .maybeSingle()
    rodadaNome = r?.nome_assembleia ?? null
    const campanha = r?.campanha as unknown as { tema: string | null } | null
    campanhaTema = campanha?.tema ?? null
  }
  const base =
    a.nome_assembleia?.trim() ||
    rodadaNome?.trim() ||
    campanhaTema?.trim() ||
    "Assembleia"
  return [`Assembleia: ${base}`, campanhaTema]
}

/** Remove o evento da agenda vinculado a uma assembleia (tolerante). */
export async function removerAgendaDaAssembleia(
  assembleiaId: string
): Promise<void> {
  const admin = await createAdminClient()
  const { error } = await admin
    .from("agenda")
    .delete()
    .eq("assembleia_id", assembleiaId)
  if (error && !esquemaAusente(error)) {
    throw new Error(`Falha ao remover o evento da agenda: ${error.message}`)
  }
}

// ── Aptos a votar ──────────────────────────────────────────────────────────

const APTOS_POR_PAGINA = 50

export async function listarAptos(
  rodadaId: string,
  filtros: {
    busca?: string
    pagina?: number
    porPagina?: number
    /** "sim" = já votou (hora_voto preenchida); "nao" = ainda não votou. */
    votou?: "sim" | "nao"
  }
): Promise<{
  linhas: AptoLinha[]
  total: number
  pagina: number
  totalPaginas: number
}> {
  const admin = await createAdminClient()
  const pagina = filtros.pagina && filtros.pagina > 0 ? filtros.pagina : 1
  const porPagina =
    filtros.porPagina && filtros.porPagina > 0
      ? filtros.porPagina
      : APTOS_POR_PAGINA

  let q = admin
    .from("voto_assembleias_aptos")
    // "*": as colunas do conflito (supabase/aptos-primeiro-acesso.sql) podem
    // ainda não existir.
    .select("*", { count: "exact" })
    .eq("rod_assembleia_id", rodadaId)
  if (filtros.busca?.trim()) {
    const termo = filtros.busca.trim()
    const digitos = termo.replace(/\D/g, "")
    const soNumerico = digitos.length >= 3 && /^[\d.\-\s/]+$/.test(termo)
    if (soNumerico) {
      q = q.or(`cpf.like.%${digitos}%,matricula.like.%${digitos}%`)
    } else {
      // tokens (AND) na coluna normalizada — sem acento e fora de ordem
      for (const palavra of semAcento(termo).split(/\s+/).filter(Boolean)) {
        q = q.ilike(
          "nome_completo_norm",
          `%${palavra.replace(/[%_\\]/g, "\\$&")}%`
        )
      }
    }
  }
  if (filtros.votou === "sim") q = q.not("hora_voto", "is", null)
  if (filtros.votou === "nao") q = q.is("hora_voto", null)

  const de = (pagina - 1) * porPagina
  const { data, error, count } = await q
    .order("nome_completo", { ascending: true, nullsFirst: false })
    .range(de, de + porPagina - 1)
  if (error) throw new Error(`Falha ao listar aptos: ${error.message}`)

  return {
    linhas: ((data ?? []) as Record<string, unknown>[]).map((a) => ({
      id: String(a.id),
      cpf: (a.cpf as string | null) ?? null,
      nome_completo: (a.nome_completo as string | null) ?? null,
      matricula: (a.matricula as string | null) ?? null,
      email_corporativo: (a.email_corporativo as string | null) ?? null,
      telefone: (a.telefone as string | null) ?? null,
      hora_voto: (a.hora_voto as string | null) ?? null,
      cpf_conflito: (a.cpf_conflito as string | null) ?? null,
      conflito_motivo: (a.conflito_motivo as string | null) ?? null,
    })),
    total: count ?? 0,
    pagina,
    totalPaginas: Math.max(1, Math.ceil((count ?? 0) / porPagina)),
  }
}

/** Contagem de votantes e ausentes na rodada (para os filtros/indicador). */
export async function contarAptosPorVoto(
  rodadaId: string
): Promise<{ total: number; votaram: number; ausentes: number }> {
  const admin = await createAdminClient()
  const [total, votaram] = await Promise.all([
    admin
      .from("voto_assembleias_aptos")
      .select("id", { count: "exact", head: true })
      .eq("rod_assembleia_id", rodadaId),
    admin
      .from("voto_assembleias_aptos")
      .select("id", { count: "exact", head: true })
      .eq("rod_assembleia_id", rodadaId)
      .not("hora_voto", "is", null),
  ])
  const t = total.count ?? 0
  const v = votaram.count ?? 0
  return { total: t, votaram: v, ausentes: t - v }
}

/** Outro eleitor da mesma rodada com o mesmo CPF ou e-mail? Devolve o aviso. */
async function aptoRepetido(
  rodadaId: string,
  cpf: string | null,
  email: string | null,
  ignorarId: string | null
): Promise<string | null> {
  const admin = await createAdminClient()
  const procurar = async (coluna: "cpf" | "email_corporativo", valor: string) => {
    let q = admin
      .from("voto_assembleias_aptos")
      .select("id")
      .eq("rod_assembleia_id", rodadaId)
      .ilike(coluna, valor)
    if (ignorarId) q = q.neq("id", ignorarId)
    const { data } = await q.limit(1).maybeSingle()
    return Boolean(data)
  }
  if (cpf && (await procurar("cpf", cpf))) return "Já há outro eleitor com este CPF nesta rodada."
  if (email && (await procurar("email_corporativo", email.trim().toLowerCase()))) {
    return "Já há outro eleitor com este e-mail nesta rodada."
  }
  return null
}

/**
 * Cadastra um único eleitor na rodada. O CPF é OPCIONAL (as empregadoras não
 * enviam — LGPD): quando vem, é único na rodada; sem ele, o e-mail corporativo
 * é que não pode repetir, porque é por ele que a pessoa entra para votar.
 */
export async function cadastrarApto(
  rodadaId: string,
  dados: {
    cpf: string | null
    nome_completo: string | null
    matricula: string | null
    email: string | null
    telefone?: string | null
  }
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const repetido = await aptoRepetido(rodadaId, dados.cpf, dados.email, null)
  if (repetido) return { erro: repetido }
  const { error } = await admin.from("voto_assembleias_aptos").insert({
    rod_assembleia_id: rodadaId,
    cpf: dados.cpf,
    nome_completo: dados.nome_completo,
    matricula: dados.matricula,
    email_corporativo: dados.email,
    ...(await telefoneSeExistir(dados.telefone ?? null)),
    emp_proprietaria_id: await tenantAtual(),
  })
  return error ? { erro: `Falha ao cadastrar o eleitor: ${error.message}` } : {}
}

/** Edita os dados de um eleitor da lista (CPF continua único na rodada). */
export async function atualizarApto(
  id: string,
  dados: {
    cpf: string | null
    nome_completo: string | null
    matricula: string | null
    email: string | null
    telefone?: string | null
  }
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { data: atual } = await admin
    .from("voto_assembleias_aptos")
    .select("rod_assembleia_id")
    .eq("id", id)
    .maybeSingle()
  if (!atual) return { erro: "Eleitor não encontrado." }

  const repetido = await aptoRepetido(String(atual.rod_assembleia_id), dados.cpf, dados.email, id)
  if (repetido) return { erro: repetido }

  const { error } = await admin
    .from("voto_assembleias_aptos")
    .update({
      cpf: dados.cpf,
      nome_completo: dados.nome_completo,
      matricula: dados.matricula,
      email_corporativo: dados.email,
      ...(await telefoneSeExistir(dados.telefone ?? null)),
    })
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  return error ? { erro: `Falha ao salvar o eleitor: ${error.message}` } : {}
}

export type ResultadoImportacaoAptos = {
  totalLinhas: number
  inseridos: number
  ignorados: number
  erros: { linha: number; motivo: string }[]
}

/** Insere aptos na rodada; CPF repetido na mesma rodada é ignorado. */
export async function importarAptos(
  rodadaId: string,
  linhas: {
    linha: number
    /** Pode ser null: a empresa nem sempre envia o CPF dos aptos. */
    cpf: string | null
    nome_completo: string | null
    matricula: string | null
    email: string | null
    telefone?: string | null
  }[]
): Promise<{ resultado?: ResultadoImportacaoAptos; erro?: string }> {
  const admin = await createAdminClient()

  const { data: existentes, error: erroExistentes } = await admin
    .from("voto_assembleias_aptos")
    .select("cpf")
    .eq("rod_assembleia_id", rodadaId)
    .not("cpf", "is", null)
  if (erroExistentes) {
    return { erro: `Falha ao conferir aptos existentes: ${erroExistentes.message}` }
  }
  const jaAptos = new Set((existentes ?? []).map((a) => a.cpf as string))

  const resultado: ResultadoImportacaoAptos = {
    totalLinhas: linhas.length,
    inseridos: 0,
    ignorados: 0,
    erros: [],
  }
  const inserir: Record<string, unknown>[] = []
  const vistosNoArquivo = new Set<string>()
  for (const l of linhas) {
    // sem CPF não há como deduplicar com segurança — a linha entra e a
    // conciliação da filiação coletiva resolve por nome/matrícula depois
    if (l.cpf && (jaAptos.has(l.cpf) || vistosNoArquivo.has(l.cpf))) {
      resultado.ignorados++
      continue
    }
    if (l.cpf) vistosNoArquivo.add(l.cpf)
    inserir.push({
      rod_assembleia_id: rodadaId,
      cpf: l.cpf,
      nome_completo: l.nome_completo,
      matricula: l.matricula,
      email_corporativo: l.email,
      ...(await telefoneSeExistir(l.telefone ?? null)),
      emp_proprietaria_id: await tenantAtual(),
    })
  }

  for (let i = 0; i < inserir.length; i += 500) {
    const lote = inserir.slice(i, i + 500)
    const { error } = await admin.from("voto_assembleias_aptos").insert(lote)
    if (error) {
      return {
        erro: `Falha ao inserir aptos (a partir da posição ${i + 1}): ${error.message}`,
      }
    }
    resultado.inseridos += lote.length
  }
  return { resultado }
}

/** Bloqueia remoção quando o apto já votou (hora_voto registrada). */
export async function removerApto(id: string): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("voto_assembleias_aptos")
    .select("hora_voto")
    .eq("id", id)
    .maybeSingle()
  if (data?.hora_voto) {
    return { erro: "Este apto já votou — não pode ser removido da lista." }
  }
  const { error } = await admin
    .from("voto_assembleias_aptos")
    .delete()
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  return error ? { erro: `Falha ao remover o apto: ${error.message}` } : {}
}

// ── Arquivos (bucket 'assembleias') ────────────────────────────────────────

/** URL assinada (1h); caminhos http(s) legados do Bubble passam direto. */
export async function urlArquivoAssembleias(
  caminho: string | null
): Promise<string | null> {
  if (!caminho) return null
  if (/^(https?:)?\/\//.test(caminho)) {
    return caminho.startsWith("//") ? `https:${caminho}` : caminho
  }
  const admin = await createAdminClient()
  const { data } = await admin.storage
    .from("assembleias")
    .createSignedUrl(caminho, 3600)
  return data?.signedUrl ?? null
}

const TIPOS_ARQUIVO: Record<string, string> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
}

/** Sobe PDF ou imagem no bucket 'assembleias' e devolve o caminho gravável. */
export async function subirArquivoAssembleias(
  prefixo: string,
  arquivo: File
): Promise<{ caminho?: string; erro?: string }> {
  const extensao = TIPOS_ARQUIVO[arquivo.type]
  if (!extensao) {
    return { erro: "O arquivo deve ser PDF ou imagem (PNG, JPG, WEBP)." }
  }
  if (arquivo.size > 10 * 1024 * 1024) {
    return { erro: "O arquivo deve ter no máximo 10 MB." }
  }
  const caminho = `${prefixo}/${Date.now()}.${extensao}`
  const admin = await createAdminClient()
  const { error } = await admin.storage
    .from("assembleias")
    .upload(caminho, arquivo, { contentType: arquivo.type })
  if (error) return { erro: `Falha ao subir o arquivo: ${error.message}` }
  return { caminho }
}

// ── Apuração / fechamento de uma assembleia ────────────────────────────────
//
// O voto individual (online/urna) vive em `voto_online` (secreto — eleitor_id
// nulo nos votos novos). A apuração conta por opção, o gestor confirma o
// resultado agregado (aprovado/reprovado/branco/abstenção) e ENCERRA — o que
// libera o resultado FINAL para o filiado em "Minhas votações".

export type ApuracaoOpcao = { id: string; texto: string | null; votos: number }
export type ApuracaoPergunta = {
  id: string
  pergunta: string | null
  ordem: number | null
  opcoes: ApuracaoOpcao[]
  /** Votos em branco (sem marcação) e nulos (marcação inválida) — presencial. */
  branco: number
  nulo: number
  totalVotos: number
}
export type ApuracaoAssembleia = {
  id: string
  nome: string | null
  modalidade: Modalidade
  online: boolean
  apuracaoEncerrada: boolean
  /**
   * Regra do usuário (2026-08-29): a apuração dos votos individuais só fica
   * disponível DEPOIS do término da rodada — nada de resultado parcial. Antes
   * disso a contagem por opção nem é lida do banco (`perguntas` vem zerada);
   * só o comparecimento (aptos/votantes) aparece.
   */
  apuracaoDisponivel: boolean
  rodadaTermino: string | null
  aptos: number
  votantes: number
  perguntas: ApuracaoPergunta[]
}

export async function dadosApuracao(
  assembleiaId: string
): Promise<ApuracaoAssembleia | null> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data: a } = await admin
    .from("voto_assembleias")
    .select(
      "id, nome_assembleia, online, urnas_de_votacao, apuracao_encerrada, rod_assembleia_id"
    )
    .eq("id", assembleiaId)
    .eq("emp_proprietaria_id", emp)
    .maybeSingle()
  if (!a) return null
  const rodId = a.rod_assembleia_id ? String(a.rod_assembleia_id) : null

  // Término da rodada → só depois dele a contagem individual fica disponível.
  const { data: rod } = rodId
    ? await admin
        .from("voto_rod_assembleias")
        .select("termino")
        .eq("id", rodId)
        .eq("emp_proprietaria_id", emp)
        .maybeSingle()
    : { data: null }
  const rodadaTermino = rod?.termino ? String(rod.termino) : null
  const apuracaoDisponivel =
    a.apuracao_encerrada === true || periodoTerminado(rodadaTermino)

  const { data: perguntas } = rodId
    ? await admin
        .from("voto_assembleias_perguntas")
        .select("id, pergunta, ordem")
        .eq("rod_assembleia_id", rodId)
        .order("ordem", { ascending: true, nullsFirst: false })
    : { data: [] }
  const pIds = (perguntas ?? []).map((p) => p.id)

  const opcoesPorPergunta = new Map<string, ApuracaoOpcao[]>()
  if (pIds.length) {
    const { data: opcoes } = await admin
      .from("voto_opcoes_resposta")
      .select("id, opcao_resposta, pergunta_id")
      .in("pergunta_id", pIds)
      .order("created_at", { ascending: true })
    for (const o of opcoes ?? []) {
      const l = opcoesPorPergunta.get(String(o.pergunta_id)) ?? []
      l.push({ id: String(o.id), texto: o.opcao_resposta, votos: 0 })
      opcoesPorPergunta.set(String(o.pergunta_id), l)
    }
  }

  // A contagem por opção só é lida depois do término — antes disso nem sai do
  // banco, para não vazar resultado parcial nem para o operador da apuração.
  // Votos EM SEPARADO só entram na conta se o cadastro foi DEFERIDO.
  const votosPorOpcao = new Map<string, number>()
  if (apuracaoDisponivel) {
    const { data: votos } = await admin
      .from("voto_online")
      .select("resposta_id, em_separado_id")
      .eq("emp_proprietaria_id", emp)
      .eq("assembleia_id", assembleiaId)
      .not("valido", "is", false)
    const emSepIds = [
      ...new Set(
        (votos ?? [])
          .map((v) => (v.em_separado_id ? String(v.em_separado_id) : null))
          .filter(Boolean) as string[]
      ),
    ]
    const statusPorId = new Map<string, string>()
    if (emSepIds.length) {
      const { data: regs } = await admin
        .from("voto_em_separado")
        .select("id, status")
        .eq("emp_proprietaria_id", emp)
        .in("id", emSepIds)
      for (const r of regs ?? []) statusPorId.set(String(r.id), String(r.status))
    }
    for (const v of votos ?? []) {
      if (!v.resposta_id) continue
      // Voto em separado só conta se DEFERIDO (pendente/indeferido fora).
      if (v.em_separado_id) {
        if (statusPorId.get(String(v.em_separado_id)) !== "deferido") continue
      }
      const k = String(v.resposta_id)
      votosPorOpcao.set(k, (votosPorOpcao.get(k) ?? 0) + 1)
    }
  }

  // Contagem manual das urnas FÍSICAS desta assembleia (por opção + branco/nulo),
  // somada à contagem digital acima. Também só depois do término.
  const brancoPorPergunta = new Map<string, number>()
  const nuloPorPergunta = new Map<string, number>()
  if (apuracaoDisponivel) {
    const { data: urnasFis } = await admin
      .from("voto_urnas")
      .select("id")
      .eq("emp_proprietaria_id", emp)
      .eq("assembleia_id", assembleiaId)
      .eq("tipo", "fisica")
    const urnaIds = (urnasFis ?? []).map((u) => String(u.id))
    if (urnaIds.length) {
      const { data: sessoes } = await admin
        .from("voto_apuracao_urna")
        .select("id")
        .eq("emp_proprietaria_id", emp)
        .in("urna_id", urnaIds)
      const sessaoIds = (sessoes ?? []).map((s) => String(s.id))
      if (sessaoIds.length) {
        const { data: cont } = await admin
          .from("voto_apuracao_contagem")
          .select("pergunta_id, opcao_id, tipo, quantidade")
          .eq("emp_proprietaria_id", emp)
          .in("apuracao_urna_id", sessaoIds)
        for (const c of cont ?? []) {
          const q = typeof c.quantidade === "number" ? c.quantidade : 0
          if (c.tipo === "branco") {
            const k = String(c.pergunta_id)
            brancoPorPergunta.set(k, (brancoPorPergunta.get(k) ?? 0) + q)
          } else if (c.tipo === "nulo") {
            const k = String(c.pergunta_id)
            nuloPorPergunta.set(k, (nuloPorPergunta.get(k) ?? 0) + q)
          } else if (c.opcao_id) {
            const k = String(c.opcao_id)
            votosPorOpcao.set(k, (votosPorOpcao.get(k) ?? 0) + q)
          }
        }
      }
    }
  }

  const [aptosRes, votantesRes] = await Promise.all([
    admin
      .from("voto_assembleias_aptos")
      .select("id", { count: "exact", head: true })
      .eq("emp_proprietaria_id", emp)
      .eq("assembleia_id", assembleiaId),
    admin
      .from("voto_assembleias_aptos")
      .select("id", { count: "exact", head: true })
      .eq("emp_proprietaria_id", emp)
      .eq("assembleia_id", assembleiaId)
      .not("hora_voto", "is", null),
  ])

  const perguntasOut: ApuracaoPergunta[] = (perguntas ?? []).map((p) => {
    const ops = (opcoesPorPergunta.get(String(p.id)) ?? []).map((o) => ({
      ...o,
      votos: votosPorOpcao.get(o.id) ?? 0,
    }))
    const branco = brancoPorPergunta.get(String(p.id)) ?? 0
    const nulo = nuloPorPergunta.get(String(p.id)) ?? 0
    return {
      id: String(p.id),
      pergunta: p.pergunta,
      ordem: p.ordem,
      opcoes: ops,
      branco,
      nulo,
      totalVotos: ops.reduce((s, o) => s + o.votos, 0) + branco + nulo,
    }
  })

  return {
    id: String(a.id),
    nome: a.nome_assembleia,
    modalidade: derivarModalidade(a),
    online: temVotoOnline(derivarModalidade(a)),
    apuracaoEncerrada: a.apuracao_encerrada === true,
    apuracaoDisponivel,
    rodadaTermino,
    aptos: aptosRes.count ?? 0,
    votantes: votantesRes.count ?? 0,
    perguntas: perguntasOut,
  }
}

/**
 * Encerra a apuração: tira um SNAPSHOT do resultado dinâmico (por opção +
 * branco + nulo) em voto_resultado_final e marca apuracao_encerrada. É esse
 * snapshot que o filiado vê em "Minhas votações".
 */
export async function encerrarApuracao(
  assembleiaId: string
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()

  const dados = await dadosApuracao(assembleiaId)
  if (!dados) return { erro: "Assembleia não encontrada." }

  // Trava: não se encerra a apuração antes de a rodada terminar.
  if (!periodoTerminado(dados.rodadaTermino)) {
    return {
      erro: "A apuração só pode ser encerrada após o término da rodada.",
    }
  }

  // Regrava o snapshot do zero.
  await admin
    .from("voto_resultado_final")
    .delete()
    .eq("emp_proprietaria_id", emp)
    .eq("assembleia_id", assembleiaId)
  const linhas: Record<string, unknown>[] = []
  for (const p of dados.perguntas) {
    for (const o of p.opcoes) {
      linhas.push({
        emp_proprietaria_id: emp,
        assembleia_id: assembleiaId,
        pergunta_id: p.id,
        opcao_id: o.id,
        tipo: "opcao",
        quantidade: o.votos,
      })
    }
    if (p.branco > 0)
      linhas.push({
        emp_proprietaria_id: emp,
        assembleia_id: assembleiaId,
        pergunta_id: p.id,
        opcao_id: null,
        tipo: "branco",
        quantidade: p.branco,
      })
    if (p.nulo > 0)
      linhas.push({
        emp_proprietaria_id: emp,
        assembleia_id: assembleiaId,
        pergunta_id: p.id,
        opcao_id: null,
        tipo: "nulo",
        quantidade: p.nulo,
      })
  }
  if (linhas.length) {
    const { error: erroSnap } = await admin
      .from("voto_resultado_final")
      .insert(linhas)
    if (erroSnap) return { erro: `Não foi possível gravar: ${erroSnap.message}` }
  }

  const { error } = await admin
    .from("voto_assembleias")
    .update({ apuracao_encerrada: true })
    .eq("id", assembleiaId)
    .eq("emp_proprietaria_id", emp)
  if (error) return { erro: `Não foi possível encerrar: ${error.message}` }
  return {}
}

export async function reabrirApuracao(
  assembleiaId: string
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin
    .from("voto_assembleias")
    .update({ apuracao_encerrada: false })
    .eq("id", assembleiaId)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: `Não foi possível reabrir: ${error.message}` }
  return {}
}

/**
 * A janela da assembleia tem de caber no período da RODADA (regra do usuário,
 * 23/09/2026). Sem isso dava para marcar uma assembleia que começa antes ou
 * termina depois do que o edital anunciou — e a votação online usa o término
 * da rodada como limite, então a assembleia "extra" nunca abriria de verdade.
 * `null` = pode salvar.
 */
export async function validarJanelaDaAssembleia(
  rodadaId: string,
  dados: {
    data_inicio: string | null
    data_termino: string | null
    hora_inicio: string | null
    hora_termino: string | null
  }
): Promise<string | null> {
  const { inicio, termino } = await periodoDaRodada(rodadaId)
  const dia = (v: string | null) => (v ?? "").slice(0, 10) || null
  const ini = dia(dados.data_inicio)
  const fim = dia(dados.data_termino)

  if (ini && fim && ini > fim) {
    return "O início da assembleia não pode ser depois do término."
  }
  if (ini && fim && ini === fim && dados.hora_inicio && dados.hora_termino) {
    if (dados.hora_inicio >= dados.hora_termino) {
      return "No mesmo dia, a hora de início precisa ser antes da hora de término."
    }
  }
  const periodo = `${inicio ? formatarDataBR(inicio) : "?"} a ${termino ? formatarDataBR(termino) : "?"}`
  if (inicio && ini && ini < dia(inicio)!) {
    return `${MOTIVO_ASSEMBLEIAS_BLOQUEADAS.foraDaRodada} A rodada vai de ${periodo}.`
  }
  if (termino && fim && fim > dia(termino)!) {
    return `${MOTIVO_ASSEMBLEIAS_BLOQUEADAS.foraDaRodada} A rodada vai de ${periodo}.`
  }
  return null
}

/** '2026-09-22' → '22/09/2026' (mensagem de erro, sem depender do cliente). */
function formatarDataBR(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split("-")
  return d && m && a ? `${d}/${m}/${a}` : iso
}

/** Empresas que aparecem como fonte pagadora em alguma campanha (filtro). */
export async function empresasDasCampanhas(): Promise<
  { id: string; nome: string }[]
> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("voto_campanha_fontes")
    .select("empresa_id, empresa:empresa_id (nome_fantasia, nome_razao)")
    .limit(2000)
  if (error) {
    if (esquemaAusente(error)) return []
    throw new Error(`Falha ao listar as empresas das campanhas: ${error.message}`)
  }
  const porId = new Map<string, string>()
  for (const v of data ?? []) {
    const e = v.empresa as unknown as {
      nome_fantasia: string | null
      nome_razao: string | null
    } | null
    const nome = e?.nome_fantasia?.trim() || e?.nome_razao?.trim()
    if (v.empresa_id && nome) porId.set(String(v.empresa_id), nome)
  }
  return [...porId.entries()]
    .map(([id, nome]) => ({ id, nome }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
}
