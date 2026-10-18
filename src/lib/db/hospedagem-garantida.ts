import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import { buscarFiliadoPorCpf } from "@/lib/contas"
import { cpfConfiavel } from "@/lib/cpf"
import { contextoDoTenant } from "@/lib/db/comunicacao-mensagens"
import { registrosDoCpf } from "@/lib/db/filiado-portal"
import { buscarHotel, contratoDoHotel, type Hotel } from "@/lib/db/hospedagem"
import {
  conferirCondicoesHospedagem,
  lerCondicoesHospedagem,
} from "@/lib/db/hospedagem-condicoes"
import {
  avisarFiliado,
  contatoDoFiliado,
  type AvisoPortal,
  type ResultadoAviso,
} from "@/lib/db/portal-avisos"
import { lerConfigPortal } from "@/lib/db/portal-partes"
import {
  avaliarCondicoesHospedagem,
  contarCondicoesAtivas,
  janelaDoPeriodo,
  type CondicoesHospedagem,
  type PeriodoQuantidade,
} from "@/lib/hospedagem-condicoes-constantes"
import { enviarEmail, type ContextoEmail } from "@/lib/email"
import {
  botaoEmail,
  caixaAviso,
  escaparHtml,
  linkReserva,
  paragrafo,
  textoSuave,
  tituloEmail,
} from "@/lib/email-layout"
import {
  REGRA_NAO_COMPARECIMENTO_PADRAO,
  alocarEstadia,
  avaliarNaoComparecimento,
  dataBR,
  dataHoraBR,
  descreverRegraNaoComparecimento,
  hojeEmSP,
  instanteSP,
  momentoNaoComparecimento,
  noitesDaEstadia,
  prazoCancelamento,
  quartosNaNoite,
  sexoValido,
  somarDias,
  type ConfigGarantida,
  type Ocupacao,
  type RegraNaoComparecimento,
  type ReservaDoHistorico,
  type Sexo,
} from "@/lib/hospedagem-garantida-constantes"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"
import { origemAtual } from "@/lib/tenant-url"

/**
 * Hospedagem por DEMANDA GARANTIDA — banco.
 *
 * O pedido do filiado JÁ É a reserva: `reservarEstadia` lê a ocupação, escolhe
 * o quarto (regras puras em hospedagem-garantida-constantes.ts) e grava pela
 * função `hospedagem_gravar_alocacao`, que só aceita se a versão do hotel não
 * mudou desde a leitura. Se mudou, relê e decide de novo — ninguém pega a
 * mesma vaga nem fura a trava do último quarto.
 *
 * Tempo: tudo que depende de horário (oferta da lista de espera vencida,
 * trava liberada, falta) é conferido na hora em que é usado. A lista de
 * espera é processada onde a disponibilidade muda — cancelamento de reserva,
 * de oferta ou de pedido da fila, confirmação fora do prazo — e, para o que
 * só o relógio muda (oferta que venceu, trava que abriu), pelo tick da
 * Comunicação a cada 15 minutos (`rodarFilasDeEspera`, achado A134). A tela
 * do portal só LÊ. Os AVISOS que dependem do relógio (falta registrada,
 * oferta perto de vencer) saem pelos `lembretes*` do fim do arquivo.
 *
 * SQL: supabase/hospedagem-demanda-garantida.sql
 */

type Linha = Record<string, unknown>

function faltaTabela(e: { code?: string } | null): boolean {
  return e?.code === "PGRST205" || e?.code === "42P01" || e?.code === "42703"
}

const AVISO_SQL =
  "A demanda garantida ainda não está instalada no banco — rode supabase/hospedagem-demanda-garantida.sql."

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATA = /^\d{4}-\d{2}-\d{2}$/

const txt = (v: unknown): string | null =>
  typeof v === "string" && v !== "" ? v : null

/**
 * Client e entidade de quem mexe na fila. Na requisição saem do host
 * (`createAdminClient`/`tenantAtual`); no tick da Comunicação, que percorre
 * todas as entidades sem requisição, vêm explícitos — lá `tenantAtual()`
 * devolveria o tenant do host, não o da volta do laço. Mesmo desenho de
 * `avisarFiliado` (lib/db/portal-avisos.ts).
 */
export type AmbienteFila = {
  client: SupabaseClient
  tenantId: string
  contexto?: ContextoEmail
}

async function clienteDe(amb?: AmbienteFila): Promise<SupabaseClient> {
  return amb?.client ?? (await createAdminClient())
}

async function tenantDe(amb?: AmbienteFila): Promise<string> {
  return amb?.tenantId ?? (await tenantAtual())
}

// ── Configuração do hotel ────────────────────────────────────────────────────

export function ehGarantida(hotel: Pick<Hotel, "modalidade"> | null | undefined): boolean {
  return hotel?.modalidade === "garantida"
}

export function configDoHotel(h: Hotel): ConfigGarantida {
  const semana = Array.isArray(h.quartos_por_dia_semana) && h.quartos_por_dia_semana.length === 7
    ? h.quartos_por_dia_semana.map((n) => (typeof n === "number" ? n : null))
    : null
  return {
    quartosPadrao: h.quant_quartos_dedicados ?? 0,
    quartosPorDiaSemana: semana,
    vagasPorQuarto: h.max_hospedes_por_quarto ?? 0,
    regra: h.regra_distribuicao === "distribuicao" ? "distribuicao" : "lotacao",
    travaUltimoQuarto: h.trava_ultimo_quarto !== false,
    travaDiasAntes: h.trava_dias_antes ?? 3,
    travaHora: (h.trava_hora ?? "12:00").slice(0, 5),
    maxNoites: h.max_noites ?? 7,
    horarioCheckin: (h.horario_checkin ?? "14:00").slice(0, 5),
    cancelamentoHoras: h.cancelamento_horas ?? 24,
    esperaPrazoHoras: h.espera_prazo_horas ?? 12,
  }
}

// ── Leituras de apoio ────────────────────────────────────────────────────────

/** Leitura completa em lotes (PostgREST devolve no máximo 1.000 linhas). */
async function lerTudo(
  consulta: (de: number, ate: number) => PromiseLike<{
    data: Linha[] | null
    error: { message: string; code?: string } | null
  }>
): Promise<Linha[]> {
  const linhas: Linha[] = []
  for (let de = 0; ; de += 1000) {
    const { data, error } = await consulta(de, de + 999)
    if (error) {
      if (faltaTabela(error)) return linhas
      throw new Error(`Falha na leitura da hospedagem: ${error.message}`)
    }
    linhas.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }
  return linhas
}

/** Cupons que ainda ocupam vaga: não cancelados e sem oferta vencida. */
async function cuponsQueOcupam(ids: string[], amb?: AmbienteFila): Promise<Set<string>> {
  const ativos = new Set<string>()
  if (ids.length === 0) return ativos
  const admin = await clienteDe(amb)
  const agora = Date.now()
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await admin
      .from("hospedagem_cupom")
      .select("id, cancelado, confirmar_ate")
      .in("id", ids.slice(i, i + 200))
    for (const c of data ?? []) {
      const vencida = c.confirmar_ate && new Date(c.confirmar_ate as string).getTime() <= agora
      if (c.cancelado !== true && !vencida) ativos.add(c.id as string)
    }
  }
  return ativos
}

async function ocupacaoDoHotel(
  hotelId: string,
  noites: string[],
  ignorarCupom?: string,
  amb?: AmbienteFila
): Promise<Ocupacao> {
  const ocupacao: Ocupacao = new Map()
  if (noites.length === 0) return ocupacao
  const admin = await clienteDe(amb)
  const linhas = await lerTudo((de, ate) =>
    admin
      .from("hospedagem_alocacoes")
      .select("id, cupom_id, noite, quarto, sexo")
      .eq("hotel_id", hotelId)
      .gte("noite", noites[0])
      .lte("noite", noites[noites.length - 1])
      .order("id", { ascending: true })
      .range(de, ate)
  )
  const ativos = await cuponsQueOcupam(
    [...new Set(linhas.map((l) => l.cupom_id as string))],
    amb
  )
  for (const l of linhas) {
    const cupom = l.cupom_id as string
    if (cupom === ignorarCupom || !ativos.has(cupom) || !sexoValido(l.sexo as string)) {
      continue
    }
    const noite = l.noite as string
    const lista = ocupacao.get(noite) ?? []
    lista.push({ quarto: Number(l.quarto), sexo: l.sexo as Sexo })
    ocupacao.set(noite, lista)
  }
  return ocupacao
}

async function nomesDeFiliados(
  ids: string[]
): Promise<Map<string, { nome: string | null; cpf: string | null }>> {
  const mapa = new Map<string, { nome: string | null; cpf: string | null }>()
  const admin = await createAdminClient()
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await admin
      .from("filiacoes")
      .select("id, nome_completo, cpf")
      .in("id", ids.slice(i, i + 200))
    for (const f of data ?? []) {
      mapa.set(f.id as string, {
        nome: txt(f.nome_completo),
        cpf: txt(f.cpf),
      })
    }
  }
  return mapa
}

function mascararCpf(cpf: string | null): string {
  const d = (cpf ?? "").replace(/\D/g, "")
  if (d.length !== 11) return "—"
  return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`
}

// ── Conferências antes de reservar ───────────────────────────────────────────

/** Fora de requisição (tick), passe `client` e `tenantId`. */
export async function lerRegraNaoComparecimento(
  amb: { client?: SupabaseClient; tenantId?: string } = {}
): Promise<RegraNaoComparecimento> {
  const admin = amb.client ?? (await createAdminClient())
  const { data, error } = await admin
    .from("hospedagem_condicoes")
    .select(
      "punir_nao_comparecimento, nao_comparecimento_quantidade, nao_comparecimento_janela_meses, nao_comparecimento_penalidade, nao_comparecimento_periodo, nao_comparecimento_suspensao_dias"
    )
    .eq("emp_proprietaria_id", amb.tenantId ?? (await tenantAtual()))
    .maybeSingle()
  if (error || !data) return { ...REGRA_NAO_COMPARECIMENTO_PADRAO }
  const penalidade = data.nao_comparecimento_penalidade
  return {
    ativa: data.punir_nao_comparecimento === true,
    quantidade: Number(data.nao_comparecimento_quantidade ?? 1),
    janelaMeses: Number(data.nao_comparecimento_janela_meses ?? 12),
    penalidade:
      penalidade === "consumir_periodo" || penalidade === "desabilitar"
        ? penalidade
        : "suspender",
    periodo: data.nao_comparecimento_periodo === "ano" ? "ano" : "mes",
    suspensaoDias: Number(data.nao_comparecimento_suspensao_dias ?? 30),
  }
}

export async function salvarRegraNaoComparecimento(
  regra: RegraNaoComparecimento,
  usuarioId: string
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin.from("hospedagem_condicoes").upsert(
    {
      emp_proprietaria_id: await tenantAtual(),
      punir_nao_comparecimento: regra.ativa,
      nao_comparecimento_quantidade: regra.quantidade,
      nao_comparecimento_janela_meses: regra.janelaMeses,
      nao_comparecimento_penalidade: regra.penalidade,
      nao_comparecimento_periodo: regra.periodo,
      nao_comparecimento_suspensao_dias: regra.suspensaoDias,
      atualizada_por: usuarioId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "emp_proprietaria_id" }
  )
  if (error) return { erro: faltaTabela(error) ? AVISO_SQL : error.message }
  return {}
}

/**
 * Reservas garantidas da pessoa (todos os registros do CPF) e a última
 * liberação da equipe — o que a regra de não comparecimento avalia. Null se
 * a leitura falhar (sem tabela: ninguém é barrado por isso).
 */
async function lerHistoricoDeFaltas(
  p: { cpf: string | null; registros: string[] },
  amb?: AmbienteFila
): Promise<{ historico: ReservaDoHistorico[]; liberadoEm: Date | null } | null> {
  const admin = await clienteDe(amb)
  const [{ data: reservas, error }, liberacao] = await Promise.all([
    admin
      .from("hospedagem_cupom")
      .select("check_in, presenca_em, cancelado, confirmar_ate, nao_comparecimento_abonado_em")
      .in("filiado_id", p.registros)
      .eq("reserva_garantida", true),
    p.cpf
      ? admin
          .from("hospedagem_penalidade_liberacoes")
          .select("created_at")
          .eq("emp_proprietaria_id", await tenantDe(amb))
          .eq("cpf", p.cpf)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ])
  if (error) return null
  const historico = (reservas ?? [])
    .filter((r) => txt(r.check_in))
    .map((r) => ({
      checkIn: r.check_in as string,
      presenca: Boolean(r.presenca_em),
      // Oferta da lista de espera nunca confirmada não é falta.
      cancelada: r.cancelado === true || Boolean(r.confirmar_ate),
      abonada: Boolean(r.nao_comparecimento_abonado_em),
    }))
  const liberadoEm = liberacao.data?.created_at
    ? new Date(liberacao.data.created_at as string)
    : null
  return { historico, liberadoEm }
}

/** Faltas contam por PESSOA (todos os registros do CPF). */
export async function conferirNaoComparecimento(
  p: {
    cpf: string | null
    registros: string[]
    checkIn: string
  },
  amb?: AmbienteFila
): Promise<{ erro?: string }> {
  const regra = await lerRegraNaoComparecimento(amb)
  if (!regra.ativa || p.registros.length === 0) return {}
  const h = await lerHistoricoDeFaltas(p, amb)
  if (!h) return {}
  const r = avaliarNaoComparecimento(regra, h.historico, h.liberadoEm, p.checkIn, new Date())
  return r.ok ? {} : { erro: r.motivo }
}

/**
 * As condições da entidade com client e entidade EXPLÍCITOS, para a fila
 * processada no tick (sem requisição). `conferirCondicoesHospedagem`
 * (lib/db/hospedagem-condicoes.ts) lê a entidade do host — no tick, a errada.
 * A regra é a mesma função pura; só a leitura dos dados é repetida aqui.
 */
async function conferirCondicoesNoTenant(
  p: { cpf: string | null; registros: string[]; checkIn: string },
  amb: AmbienteFila
): Promise<{ erro?: string }> {
  const { client, tenantId } = amb
  const { data: linha, error } = await client
    .from("hospedagem_condicoes")
    .select(
      "restringir_fontes, fontes_ids, limitar_quantidade, quantidade_maxima, quantidade_periodo, restringir_regimes, regimes, somente_beneficiarios"
    )
    .eq("emp_proprietaria_id", tenantId)
    .maybeSingle()
  if (error || !linha) return {}
  const c: CondicoesHospedagem = {
    restringirFontes: linha.restringir_fontes === true,
    fontesIds: (linha.fontes_ids as string[] | null) ?? [],
    limitarQuantidade: linha.limitar_quantidade === true,
    quantidadeMaxima: Number(linha.quantidade_maxima ?? 1),
    quantidadePeriodo: linha.quantidade_periodo === "ano" ? "ano" : "mes",
    restringirRegimes: linha.restringir_regimes === true,
    regimes: (linha.regimes as string[] | null) ?? [],
    somenteBeneficiarios: linha.somente_beneficiarios === true,
    observacao: null,
  }
  if (contarCondicoesAtivas(c) === 0) return {}
  const registros = p.registros

  const [vinculos, cupons, lista, fontes] = await Promise.all([
    (c.restringirFontes || c.restringirRegimes) && registros.length > 0
      ? client
          .from("filiacao_vinculos")
          .select("fonte_pagadora_id, regime_trabalho")
          .in("filiado_id", registros)
          .eq("emp_proprietaria_id", tenantId)
          .is("data_desfiliacao", null)
          .is("filiacao_data_saida", null)
      : Promise.resolve({ data: [] as Linha[] }),
    c.limitarQuantidade && registros.length > 0
      ? (() => {
          const janela = janelaDoPeriodo(p.checkIn, c.quantidadePeriodo)
          return client
            .from("hospedagem_cupom")
            .select("id", { count: "exact", head: true })
            .in("filiado_id", registros)
            .eq("cancelado", false)
            .gte("check_in", janela.inicio)
            .lt("check_in", janela.fim)
        })()
      : Promise.resolve({ count: 0 }),
    c.somenteBeneficiarios && p.cpf
      ? client
          .from("hospedagem_beneficiarios")
          .select("id")
          .eq("emp_proprietaria_id", tenantId)
          .eq("cpf", p.cpf)
          .limit(1)
      : Promise.resolve({ data: [] as Linha[] }),
    c.restringirFontes && c.fontesIds.length > 0
      ? client.from("empresa").select("id, nome_fantasia, nome_razao").in("id", c.fontesIds)
      : Promise.resolve({ data: [] as Linha[] }),
  ])
  const nomes = new Map(
    (fontes.data ?? []).map((e) => [
      e.id as string,
      txt(e.nome_fantasia) ?? txt(e.nome_razao) ?? "fonte sem nome",
    ])
  )
  const resultado = avaliarCondicoesHospedagem(
    c,
    {
      vinculosAbertos: (vinculos.data ?? []).map((v) => ({
        fonteId: txt(v.fonte_pagadora_id),
        regime: txt(v.regime_trabalho),
      })),
      cuponsNoPeriodo: cupons.count ?? 0,
      naListaDeBeneficiarios: (lista.data ?? []).length > 0,
    },
    (id) => nomes.get(id) ?? "fonte sem nome"
  )
  return resultado.ok ? {} : { erro: resultado.motivo }
}

/**
 * Condições da entidade + regra de não comparecimento. Com `amb` (tick), as
 * condições são lidas da entidade recebida.
 */
export async function conferirPodeReservar(
  p: {
    cpf: string | null
    registros: string[]
    checkIn: string
  },
  amb?: AmbienteFila
): Promise<{ erro?: string }> {
  const condicoes = amb ? await conferirCondicoesNoTenant(p, amb) : await conferirCondicoesHospedagem(p)
  if (condicoes.erro) return condicoes
  return conferirNaoComparecimento(p, amb)
}

// ── Estado do direito (portal, antes de pedir) ───────────────────────────────

/** Limite de cupons por período e os check-ins que já contam nele. */
export type CotaHospedagem = {
  limite: number
  periodo: PeriodoQuantidade
  /** Check-ins (AAAA-MM-DD) dos cupons não cancelados, do período atual em diante. */
  checkIns: string[]
}

/** O que a regra de não comparecimento avalia, para avaliar no navegador. */
export type FaltasHospedagem = {
  regra: RegraNaoComparecimento
  historico: ReservaDoHistorico[]
  /** ISO da última liberação da equipe. */
  liberadoEm: string | null
}

export type DireitoHospedagem = {
  /** Recusa das condições da entidade para um check-in HOJE (pode ser só a cota). */
  condicoesHoje: string | null
  cota: CotaHospedagem | null
  /** Só quando a regra está ligada e há hotel de demanda garantida. */
  faltas: FaltasHospedagem | null
}

/**
 * O "saldo" do associado (achado A38): as mesmas conferências da action,
 * feitas ANTES, para a tela dizer o que barraria o pedido — condições da
 * entidade, cota do período e faltas — em vez de o associado descobrir no
 * erro depois de preencher tudo. A cota e as faltas dependem da data
 * escolhida: vão os dados, e o formulário reavalia a cada data com as
 * mesmas funções puras do servidor.
 */
export async function direitoHospedagem(p: {
  cpf: string
  registros: string[]
  hoje: string
  comFaltas: boolean
}): Promise<DireitoHospedagem> {
  const [condicoes, condicoesHoje, regra] = await Promise.all([
    lerCondicoesHospedagem(),
    conferirCondicoesHospedagem({ cpf: p.cpf, registros: p.registros, checkIn: p.hoje }),
    p.comFaltas ? lerRegraNaoComparecimento() : Promise.resolve(null),
  ])

  let cota: CotaHospedagem | null = null
  if (condicoes.limitarQuantidade) {
    const checkIns: string[] = []
    if (p.registros.length > 0) {
      const admin = await createAdminClient()
      const { inicio } = janelaDoPeriodo(p.hoje, condicoes.quantidadePeriodo)
      const { data } = await admin
        .from("hospedagem_cupom")
        .select("check_in")
        .in("filiado_id", p.registros)
        .eq("cancelado", false)
        .gte("check_in", inicio)
        .limit(1000)
      for (const c of data ?? []) {
        const d = txt(c.check_in)
        if (d) checkIns.push(d.slice(0, 10))
      }
    }
    cota = {
      limite: condicoes.quantidadeMaxima,
      periodo: condicoes.quantidadePeriodo,
      checkIns,
    }
  }

  let faltas: FaltasHospedagem | null = null
  if (regra?.ativa && p.registros.length > 0) {
    const h = await lerHistoricoDeFaltas({ cpf: p.cpf, registros: p.registros })
    if (h) {
      faltas = {
        regra,
        historico: h.historico,
        liberadoEm: h.liberadoEm ? h.liberadoEm.toISOString() : null,
      }
    }
  }

  return { condicoesHoje: condicoesHoje.erro ?? null, cota, faltas }
}

// ── Reserva ──────────────────────────────────────────────────────────────────

export type ResultadoReserva =
  | { ok: true; cupomId: string; token: string; quarto: number }
  /**
   * `campo`: o `name` do campo do formulário que causou a recusa.
   * `ofertaPendente`: a coincidência é só com vaga da fila ainda guardada
   * para a pessoa (pode ser a de outra passada da fila, em andamento).
   */
  | { ok: false; erro: string; semVaga?: boolean; campo?: string; ofertaPendente?: boolean }

/**
 * O portal não deixa o associado mudar o sexo do cadastro: a correção é
 * pedida em Atendimento (assunto Cadastro).
 */
const MENSAGEM_SEXO =
  "Para reservar em hotel de demanda garantida, o sexo precisa estar informado no cadastro (Masculino ou Feminino). Peça a correção em Atendimento, no assunto Cadastro."

/**
 * Cria a reserva e escolhe o quarto. Não confere condições nem faltas — quem
 * chama faz isso antes (portal, painel e lista de espera têm mensagens
 * próprias). `confirmarAte` guarda a vaga de uma oferta da lista de espera.
 * `amb`: a fila processada no tick, sem requisição.
 */
export async function reservarEstadia(p: {
  hotel: Hotel
  filiadoId: string
  registros: string[]
  sexo: string | null
  checkIn: string
  checkOut: string
  confirmarAte?: string | null
  amb?: AmbienteFila
}): Promise<ResultadoReserva> {
  const { hotel, amb } = p
  if (!ehGarantida(hotel)) return { ok: false, erro: "Este hotel não é de demanda garantida." }
  if (!sexoValido(p.sexo)) return { ok: false, erro: MENSAGEM_SEXO }
  if (!DATA.test(p.checkIn) || !DATA.test(p.checkOut)) {
    return {
      ok: false,
      erro: "Informe as datas de check-in e check-out.",
      campo: DATA.test(p.checkIn) ? "check_out" : "check_in",
    }
  }
  if (p.checkOut <= p.checkIn) {
    return { ok: false, erro: "O check-out precisa ser depois do check-in.", campo: "check_out" }
  }
  if (p.checkIn < hojeEmSP()) {
    return { ok: false, erro: "O check-in precisa ser de hoje em diante.", campo: "check_in" }
  }

  const cfg = configDoHotel(hotel)
  const noites = noitesDaEstadia(p.checkIn, p.checkOut)
  if (noites.length > cfg.maxNoites) {
    return {
      ok: false,
      erro: `Neste hotel a estadia é de até ${cfg.maxNoites} noite${cfg.maxNoites === 1 ? "" : "s"}.`,
      campo: "check_out",
    }
  }
  if (cfg.vagasPorQuarto < 1 || noites.some((n) => quartosNaNoite(cfg, n) < 1)) {
    return {
      ok: false,
      erro: "Este hotel não tem quartos dedicados para todas as noites escolhidas.",
      semVaga: true,
    }
  }

  const contrato = await contratoDoHotel(hotel.id, amb)
  if (!contrato || !contrato.vigente) {
    return {
      ok: false,
      erro: "Este hotel está fora do período de convênio no momento.",
      campo: "hotel_id",
    }
  }
  const ultimaNoite = noites[noites.length - 1]
  if (contrato.vigenciaTermino && ultimaNoite > contrato.vigenciaTermino) {
    return {
      ok: false,
      erro: `A última noite precisa ser até o fim da vigência do convênio (${dataBR(contrato.vigenciaTermino)}).`,
      campo: "check_out",
    }
  }

  const admin = await clienteDe(amb)
  if (p.registros.length > 0) {
    const { data: sobrepostas, error: erroSob } = await admin
      .from("hospedagem_cupom")
      .select("id, confirmar_ate")
      .in("filiado_id", p.registros)
      .eq("reserva_garantida", true)
      .eq("cancelado", false)
      .lt("check_in", p.checkOut)
      .gt("check_out", p.checkIn)
      .limit(20)
    if (erroSob && faltaTabela(erroSob)) return { ok: false, erro: AVISO_SQL }
    // Vaga da fila já vencida não conta: a tela não processa mais a fila
    // (A134), e ela fica de pé até a próxima passada derrubá-la.
    const agoraMs = Date.now()
    const coincidentes = (sobrepostas ?? []).filter(
      (c) => !c.confirmar_ate || new Date(c.confirmar_ate as string).getTime() > agoraMs
    )
    if (coincidentes.length > 0) {
      return {
        ok: false,
        erro: "Já existe uma reserva sua que coincide com essas datas.",
        ofertaPendente: coincidentes.every((c) => !!c.confirmar_ate),
      }
    }
  }

  const emp = await tenantDe(amb)
  let cupom: { id: string; token: string } | null = null
  const descartar = async () => {
    if (cupom) await admin.from("hospedagem_cupom").delete().eq("id", cupom.id)
  }

  for (let tentativa = 0; tentativa < 4; tentativa++) {
    const { data: versaoLinha, error: erroVersao } = await admin
      .from("hospedagem_hotel")
      .select("alocacao_versao")
      .eq("id", hotel.id)
      .maybeSingle()
    if (erroVersao) {
      await descartar()
      return { ok: false, erro: faltaTabela(erroVersao) ? AVISO_SQL : erroVersao.message }
    }
    const versao = Number(versaoLinha?.alocacao_versao ?? 0)
    const ocupacao = await ocupacaoDoHotel(hotel.id, noites, undefined, amb)
    const escolha = alocarEstadia(cfg, ocupacao, { sexo: p.sexo, noites }, new Date())

    if (!escolha.ok) {
      await descartar()
      if (escolha.motivo === "trava") {
        const doSexo = p.sexo === "Feminino" ? "mulheres" : "homens"
        const outro = p.sexo === "Feminino" ? "homens" : "mulheres"
        return {
          ok: false,
          semVaga: true,
          erro: `Não há vaga para ${doSexo} em todas as noites escolhidas. O último quarto está guardado para ${outro} até ${dataHoraBR(escolha.liberaEm)} e, se não for ocupado, abre para todos.`,
        }
      }
      return { ok: false, semVaga: true, erro: "Não há vaga em todas as noites escolhidas." }
    }

    if (!cupom) {
      const { data: criado, error } = await admin
        .from("hospedagem_cupom")
        .insert({
          filiado_id: p.filiadoId,
          hotel_id: hotel.id,
          check_in: p.checkIn,
          check_out: p.checkOut,
          sexo: p.sexo,
          aceita_quarto_coletivo: true,
          cancelado: false,
          compareceu: false,
          reserva_garantida: true,
          confirmar_ate: p.confirmarAte ?? null,
        })
        .select("id, token")
        .single()
      if (error || !criado) {
        return {
          ok: false,
          erro: faltaTabela(error) ? AVISO_SQL : `Não foi possível reservar: ${error?.message}`,
        }
      }
      cupom = { id: criado.id as string, token: criado.token as string }
    }

    const { data: resultado, error: erroRpc } = await admin.rpc(
      "hospedagem_gravar_alocacao",
      {
        p_emp: emp,
        p_hotel: hotel.id,
        p_versao: versao,
        p_cupom: cupom.id,
        p_quarto: escolha.quarto,
        p_sexo: p.sexo,
        p_noites: noites,
      }
    )
    if (erroRpc) {
      await descartar()
      return { ok: false, erro: faltaTabela(erroRpc) ? AVISO_SQL : erroRpc.message }
    }
    if (resultado === "ok") {
      return { ok: true, cupomId: cupom.id, token: cupom.token, quarto: escolha.quarto }
    }
    // "conflito": outra reserva gravou no meio — relê e decide de novo.
  }

  await descartar()
  return {
    ok: false,
    erro: "Muitas reservas ao mesmo tempo neste hotel. Tente de novo em instantes.",
  }
}

/** Link direto da reserva (QR Code, sem login) — o que se manda por WhatsApp. */
export async function linkDaReserva(token: string): Promise<string> {
  return `${await origemAtual()}/hospedagem/reserva/${token}`
}

// ── Avisos ao filiado ────────────────────────────────────────────────────────

/**
 * Client, entidade e identidade do e-mail. Na requisição tudo sai do host;
 * no tick diário (sem requisição) quem chama passa os três — o mesmo
 * desenho de `avisarFiliado` e de lib/db/cobrancas.ts.
 */
export type AmbienteAvisoHospedagem = {
  client?: SupabaseClient
  tenantId?: string
  contexto?: ContextoEmail
}

/** Página da reserva garantida no portal (QR, situação, cancelar). */
function linkReservaNoPortal(cupomId: string): string {
  return `/portal/hospedagem/reserva/${cupomId}`
}

/** CPF de cada cadastro (o cupom guarda só `filiado_id`; o portal, o CPF). */
async function cpfDosCadastros(
  ids: (string | null | undefined)[],
  amb: AmbienteAvisoHospedagem = {}
): Promise<Map<string, string>> {
  const mapa = new Map<string, string>()
  const lista = [...new Set(ids.filter((v): v is string => !!v && UUID.test(v)))]
  if (lista.length === 0) return mapa
  const client = amb.client ?? (await createAdminClient())
  const tenantId = amb.tenantId ?? (await tenantAtual())
  for (let i = 0; i < lista.length; i += 200) {
    const { data } = await client
      .from("filiacoes")
      .select("id, cpf")
      .in("id", lista.slice(i, i + 200))
      .eq("emp_proprietaria_id", tenantId)
    for (const f of data ?? []) {
      const cpf = txt(f.cpf)
      if (cpf) mapa.set(f.id as string, cpf)
    }
  }
  return mapa
}

/**
 * Avisa o dono de um cupom (sino + e-mail pela preferência do evento
 * "hospedagem") quando OUTRA pessoa mexe nele — hoje, a equipe cancelando a
 * reserva garantida ou o cupom comum (achado A21). Um aviso que falha nunca
 * derruba a ação que o gerou.
 *
 * Todo chamador é a equipe mudando uma viagem já marcada, que continua
 * valendo no hotel mesmo com a Hospedagem desabilitada no portal: por isso o
 * aviso sai assim mesmo (`mesmoComParteDesabilitada`). Com o portal fora do
 * ar, continua só o sino.
 */
export async function avisarDonoDoCupom(
  filiadoId: string | null | undefined,
  aviso: Omit<AvisoPortal, "cpf" | "evento">,
  amb: AmbienteAvisoHospedagem = {}
): Promise<ResultadoAviso> {
  if (!filiadoId) return false
  try {
    const cpf = (await cpfDosCadastros([filiadoId], amb)).get(filiadoId)
    if (!cpf) return false
    return await avisarFiliado({ ...aviso, cpf, evento: "hospedagem", mesmoComParteDesabilitada: true }, amb)
  } catch (e) {
    console.error("aviso do cupom de hospedagem:", e)
    return false
  }
}

/** Id do cupom pelo token do QR (quem só tem o token ainda leva o aviso ao item). */
async function cupomDoToken(token: string): Promise<string | null> {
  if (!UUID.test(token)) return null
  const admin = await createAdminClient()
  const { data } = await admin
    .from("hospedagem_cupom")
    .select("id")
    .eq("token", token)
    .eq("reserva_garantida", true)
    .maybeSingle()
  return txt(data?.id)
}

/**
 * E-mail "Reserva confirmada". Com o `token`, o botão leva direto à reserva
 * (QR Code sem login); sem ele, ao portal. O aviso do sino leva à página da
 * reserva no portal (`cupomId`, ou o cupom do `token`). Devolve o e-mail usado.
 */
export async function enviarEmailReservaConfirmada(p: {
  cpf: string | null
  hotelNome: string
  checkIn: string
  checkOut: string
  token?: string | null
  cupomId?: string | null
}): Promise<{ email?: string }> {
  if (!p.cpf) return {}
  const cupomId = p.cupomId ?? (p.token ? await cupomDoToken(p.token) : null)
  await avisarFiliado({
    cpf: p.cpf,
    evento: "hospedagem",
    texto: `Reserva confirmada no ${p.hotelNome}: check-in em ${dataBR(p.checkIn)}, check-out em ${dataBR(p.checkOut)}.`,
    link: cupomId ? linkReservaNoPortal(cupomId) : "/portal/hospedagem",
    soSino: true,
    umaVez: true,
  })
  const filiado = await buscarFiliadoPorCpf(p.cpf)
  if (!filiado?.email) return {}
  const origem = await origemAtual()
  const link = p.token ? await linkDaReserva(p.token) : `${origem}/portal/hospedagem`
  await enviarEmail({
    email: filiado.email,
    nome: filiado.nome_completo,
    assunto: "Reserva de hospedagem confirmada — {ENTIDADE}",
    html:
      tituloEmail("Reserva confirmada") +
      paragrafo(
        `Sua reserva no <strong>${escaparHtml(p.hotelNome)}</strong> está confirmada: check-in em <strong>${dataBR(p.checkIn)}</strong> e check-out em <strong>${dataBR(p.checkOut)}</strong>.`
      ) +
      caixaAviso(
        "Na chegada, apresente na recepção o <strong>QR Code da reserva</strong> e um <strong>documento oficial com foto</strong>. Se não puder ir, cancele pelo portal dentro do prazo: reserva sem comparecimento pode gerar punição."
      ) +
      botaoEmail(link, "Ver a reserva e o QR Code") +
      linkReserva(link),
  })
  return { email: filiado.email }
}

/** A reserva garantida de um cupom, para a equipe reenviar ou copiar o link. */
async function reservaDoCupom(cupomId: string) {
  if (!UUID.test(cupomId)) return null
  const admin = await createAdminClient()
  const { data: c } = await admin
    .from("hospedagem_cupom")
    .select("*")
    .eq("id", cupomId)
    .eq("reserva_garantida", true)
    .maybeSingle()
  if (!c) return null
  const { data: f } = c.filiado_id
    ? await admin.from("filiacoes").select("cpf").eq("id", c.filiado_id as string).maybeSingle()
    : { data: null }
  const hotel = await buscarHotel(c.hotel_id as string)
  return {
    cupomId: c.id as string,
    token: c.token as string,
    situacao: situacaoDaReserva(c),
    cpf: txt(f?.cpf),
    hotelNome: hotel?.nome ?? "hotel",
    checkIn: c.check_in as string,
    checkOut: c.check_out as string,
  }
}

const SITUACOES_COM_LINK: SituacaoReserva[] = ["confirmada", "hospedado", "aguardando_confirmacao"]

/** Reenvia o e-mail de confirmação de uma reserva garantida (equipe). */
export async function reenviarConfirmacaoReserva(cupomId: string): Promise<{ erro?: string; email?: string }> {
  const r = await reservaDoCupom(cupomId)
  if (!r) return { erro: "Reserva não encontrada." }
  if (!SITUACOES_COM_LINK.includes(r.situacao)) {
    return { erro: `A reserva está "${ROTULO_SITUACAO_RESERVA[r.situacao]}" — não há confirmação a reenviar.` }
  }
  const { email } = await enviarEmailReservaConfirmada(r)
  if (!email) return { erro: "O filiado não tem e-mail no cadastro — copie o link e envie por outro meio." }
  return { email }
}

/** Link direto da reserva de um cupom (equipe copia para WhatsApp etc.). */
export async function linkDaReservaDoCupom(cupomId: string): Promise<{ erro?: string; link?: string }> {
  const r = await reservaDoCupom(cupomId)
  if (!r) return { erro: "Reserva não encontrada." }
  if (!SITUACOES_COM_LINK.includes(r.situacao)) {
    return { erro: `A reserva está "${ROTULO_SITUACAO_RESERVA[r.situacao]}" — o link não vale mais.` }
  }
  return { link: await linkDaReserva(r.token) }
}

export type ReservaPublica = {
  hotelNome: string | null
  checkIn: string
  checkOut: string
  quarto: number | null
  situacao: SituacaoReserva
  primeiroNome: string | null
  token: string
}

/** Página pública do link (quem tem o token já tem o QR Code). */
export async function reservaPorToken(token: string): Promise<ReservaPublica | null> {
  if (!UUID.test(token)) return null
  const admin = await createAdminClient()
  const { data: c } = await admin
    .from("hospedagem_cupom")
    .select("*")
    .eq("token", token)
    .eq("reserva_garantida", true)
    .maybeSingle()
  if (!c) return null
  const [hotel, { data: f }] = await Promise.all([
    buscarHotel(c.hotel_id as string),
    c.filiado_id
      ? admin.from("filiacoes").select("nome_completo").eq("id", c.filiado_id as string).maybeSingle()
      : Promise.resolve({ data: null }),
  ])
  const nome = txt(f?.nome_completo)
  return {
    hotelNome: hotel?.nome ?? null,
    checkIn: c.check_in as string,
    checkOut: c.check_out as string,
    quarto: typeof c.quarto === "number" ? c.quarto : null,
    situacao: situacaoDaReserva(c),
    // Só o primeiro nome: o link circula por mensagem.
    primeiroNome: nome ? nome.split(" ")[0] : null,
    token: c.token as string,
  }
}

// ── Cancelamento ─────────────────────────────────────────────────────────────

export async function cancelarReservaGarantida(
  cupomId: string,
  escopo: { registros?: string[]; porEquipe: boolean }
): Promise<{ erro?: string }> {
  if (!UUID.test(cupomId)) return { erro: "Reserva inválida." }
  const admin = await createAdminClient()
  const { data: cupom } = await admin
    .from("hospedagem_cupom")
    .select("id, hotel_id, filiado_id, check_in, cancelado, reserva_garantida, presenca_em")
    .eq("id", cupomId)
    .maybeSingle()
  if (!cupom || cupom.reserva_garantida !== true) return { erro: "Reserva não encontrada." }
  if (escopo.registros && !escopo.registros.includes(cupom.filiado_id as string)) {
    return { erro: "Reserva não encontrada." }
  }
  if (cupom.cancelado === true) return { erro: "Esta reserva já foi cancelada." }
  if (cupom.presenca_em) return { erro: "A entrada no hotel já foi registrada." }

  const hotel = await buscarHotel(cupom.hotel_id as string)
  if (!hotel) return { erro: "Hotel não encontrado." }
  if (!escopo.porEquipe) {
    const prazo = prazoCancelamento(configDoHotel(hotel), cupom.check_in as string)
    if (new Date() > prazo) {
      return {
        erro: `O prazo para cancelar pelo portal terminou em ${dataHoraBR(prazo)}. Fale com o sindicato.`,
      }
    }
  }

  const { error } = await admin
    .from("hospedagem_cupom")
    .update({ cancelado: true, cancelado_em: new Date().toISOString() })
    .eq("id", cupomId)
  if (error) return { erro: `Não foi possível cancelar: ${error.message}` }
  await admin.from("hospedagem_alocacoes").delete().eq("cupom_id", cupomId)

  // Vaga da lista de espera ainda não confirmada: o pedido da fila também se
  // encerra — senão ele seguia "oferecido" e a página da oferta mostrava o
  // botão de confirmar uma reserva que já não existe.
  await admin
    .from("hospedagem_espera")
    .update({
      situacao: "cancelada",
      motivo: escopo.porEquipe ? "A vaga oferecida foi cancelada pelo sindicato." : "Cancelado pela pessoa.",
      updated_at: new Date().toISOString(),
    })
    .eq("cupom_id", cupomId)
    .eq("situacao", "oferecida")

  // Cancelada pela equipe (cupons e mapa do painel): a viagem da pessoa muda,
  // então vai sino + e-mail. Quem cancela pelo portal já vê o resultado na
  // tela; check-in já passado é acerto de cadastro, não muda viagem nenhuma.
  // Antes da fila: uma falha lá não pode engolir o aviso.
  if (escopo.porEquipe && (cupom.check_in as string) >= hojeEmSP()) {
    await avisarDonoDoCupom(txt(cupom.filiado_id), {
      assunto: "Sua reserva de hospedagem foi cancelada",
      texto: `Sua reserva no ${hotel.nome ?? "hotel"} para ${dataBR(cupom.check_in as string)} foi cancelada pelo sindicato. Se você não pediu o cancelamento, abra uma solicitação em Atendimento.`,
      link: linkReservaNoPortal(cupomId),
    })
  }

  await processarFilaDeEspera(hotel, { forcar: true })
  return {}
}

// ── Reservas e esperas da pessoa (portal) ────────────────────────────────────

export type SituacaoReserva =
  | "confirmada"
  | "aguardando_confirmacao"
  | "hospedado"
  | "concluida"
  | "nao_compareceu"
  | "abonada"
  | "cancelada"

export const ROTULO_SITUACAO_RESERVA: Record<SituacaoReserva, string> = {
  confirmada: "Confirmada",
  aguardando_confirmacao: "Aguardando sua confirmação",
  hospedado: "Hospedado",
  concluida: "Concluída",
  nao_compareceu: "Não compareceu",
  abonada: "Falta abonada",
  cancelada: "Cancelada",
}

export type ReservaGarantida = {
  id: string
  token: string
  hotelId: string
  hotelNome: string | null
  checkIn: string
  checkOut: string
  quarto: number | null
  situacao: SituacaoReserva
  presencaEm: string | null
  podeCancelar: boolean
  prazoCancelamento: string | null
  /** Vaga da lista de espera: até quando fica guardada sem confirmação. */
  confirmarAte: string | null
  /**
   * Token do pedido da fila que ofereceu esta vaga (aguardando confirmação):
   * o botão "Confirmar" da linha e da página da reserva usa o mesmo da oferta.
   */
  esperaToken: string | null
}

function situacaoDaReserva(c: Linha, agora = new Date()): SituacaoReserva {
  const hoje = hojeEmSP(agora)
  if (c.cancelado === true) return "cancelada"
  if (c.presenca_em) return hoje >= (c.check_out as string) ? "concluida" : "hospedado"
  if (c.confirmar_ate) {
    return new Date(c.confirmar_ate as string) > agora ? "aguardando_confirmacao" : "cancelada"
  }
  if (agora >= momentoNaoComparecimento(c.check_in as string)) {
    return c.nao_comparecimento_abonado_em ? "abonada" : "nao_compareceu"
  }
  return "confirmada"
}

export async function reservasGarantidasDaPessoa(
  registros: string[],
  hoteis: Hotel[]
): Promise<ReservaGarantida[]> {
  if (registros.length === 0) return []
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("hospedagem_cupom")
    .select("*")
    .in("filiado_id", registros)
    .eq("reserva_garantida", true)
    .order("check_in", { ascending: false })
  if (error) return []
  const porId = new Map(hoteis.map((h) => [h.id, h]))
  const agora = new Date()
  const reservas: ReservaGarantida[] = (data ?? []).map((c) => {
    const hotel = porId.get(c.hotel_id as string)
    const situacao = situacaoDaReserva(c, agora)
    const prazo = hotel ? prazoCancelamento(configDoHotel(hotel), c.check_in as string) : null
    return {
      id: c.id as string,
      token: c.token as string,
      hotelId: c.hotel_id as string,
      hotelNome: hotel?.nome ?? null,
      checkIn: c.check_in as string,
      checkOut: c.check_out as string,
      quarto: typeof c.quarto === "number" ? c.quarto : null,
      situacao,
      presencaEm: txt(c.presenca_em),
      podeCancelar:
        (situacao === "confirmada" || situacao === "aguardando_confirmacao") &&
        !!prazo &&
        agora <= prazo,
      prazoCancelamento: prazo ? prazo.toISOString() : null,
      confirmarAte: txt(c.confirmar_ate),
      esperaToken: null,
    }
  })

  // O token da oferta pelo cupom, numa consulta só — e só quando há vaga
  // aguardando confirmação (quase nunca).
  const aguardando = reservas.filter((r) => r.situacao === "aguardando_confirmacao")
  if (aguardando.length > 0) {
    const { data: ofertas } = await admin
      .from("hospedagem_espera")
      .select("cupom_id, token")
      .in(
        "cupom_id",
        aguardando.map((r) => r.id)
      )
      .eq("situacao", "oferecida")
    const tokens = new Map((ofertas ?? []).map((e) => [e.cupom_id as string, txt(e.token)]))
    for (const r of aguardando) r.esperaToken = tokens.get(r.id) ?? null
  }
  return reservas
}

export async function reservaDaPessoa(
  cupomId: string,
  registros: string[],
  hoteis: Hotel[]
): Promise<ReservaGarantida | null> {
  if (!UUID.test(cupomId)) return null
  const todas = await reservasGarantidasDaPessoa(registros, hoteis)
  return todas.find((r) => r.id === cupomId) ?? null
}

export type EsperaDaPessoa = {
  id: string
  token: string
  hotelId: string
  hotelNome: string | null
  checkIn: string
  checkOut: string
  situacao: "aguardando" | "oferecida" | "confirmada" | "expirada" | "cancelada"
  motivo: string | null
  ofertaExpiraEm: string | null
  /** Reserva guardada pela oferta (situação "oferecida"). */
  cupomId: string | null
  /** Última mudança de situação — dá a idade de um pedido encerrado. */
  atualizadaEm: string | null
}

export async function esperasDaPessoa(
  registros: string[],
  hoteis: Hotel[]
): Promise<EsperaDaPessoa[]> {
  if (registros.length === 0) return []
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("hospedagem_espera")
    .select("id, token, hotel_id, check_in, check_out, situacao, motivo, oferta_expira_em, cupom_id, created_at, updated_at")
    .in("filiado_id", registros)
    .order("created_at", { ascending: false })
    .limit(50)
  if (error) return []
  const nomes = new Map(hoteis.map((h) => [h.id, h.nome]))
  return (data ?? []).map((e) => ({
    id: e.id as string,
    token: e.token as string,
    hotelId: e.hotel_id as string,
    hotelNome: nomes.get(e.hotel_id as string) ?? null,
    checkIn: e.check_in as string,
    checkOut: e.check_out as string,
    situacao: e.situacao as EsperaDaPessoa["situacao"],
    motivo: txt(e.motivo),
    ofertaExpiraEm: txt(e.oferta_expira_em),
    cupomId: txt(e.cupom_id),
    atualizadaEm: txt(e.updated_at) ?? txt(e.created_at),
  }))
}

// ── Lista de espera ──────────────────────────────────────────────────────────

export async function entrarNaEspera(p: {
  hotel: Hotel
  filiadoId: string
  registros: string[]
  cpf: string | null
  sexo: string | null
  checkIn: string
  checkOut: string
}): Promise<{ erro?: string }> {
  if (!ehGarantida(p.hotel)) return { erro: "Este hotel não tem lista de espera." }
  if (!sexoValido(p.sexo)) return { erro: MENSAGEM_SEXO }
  if (!DATA.test(p.checkIn) || !DATA.test(p.checkOut) || p.checkOut <= p.checkIn) {
    return { erro: "Datas inválidas." }
  }
  if (p.checkIn < hojeEmSP()) return { erro: "O check-in precisa ser de hoje em diante." }
  const cfg = configDoHotel(p.hotel)
  if (noitesDaEstadia(p.checkIn, p.checkOut).length > cfg.maxNoites) {
    return { erro: `Neste hotel a estadia é de até ${cfg.maxNoites} noites.` }
  }

  const admin = await createAdminClient()
  const { data: repetida, error: erroRep } = await admin
    .from("hospedagem_espera")
    .select("id")
    .in("filiado_id", p.registros.length > 0 ? p.registros : [p.filiadoId])
    .eq("hotel_id", p.hotel.id)
    .eq("check_in", p.checkIn)
    .eq("check_out", p.checkOut)
    .in("situacao", ["aguardando", "oferecida"])
    .limit(1)
  if (erroRep && faltaTabela(erroRep)) return { erro: AVISO_SQL }
  if ((repetida ?? []).length > 0) {
    return { erro: "Você já está na lista de espera para essas datas neste hotel." }
  }

  const { error } = await admin.from("hospedagem_espera").insert({
    emp_proprietaria_id: await tenantAtual(),
    hotel_id: p.hotel.id,
    filiado_id: p.filiadoId,
    cpf: p.cpf,
    sexo: p.sexo,
    check_in: p.checkIn,
    check_out: p.checkOut,
    situacao: "aguardando",
  })
  if (error) return { erro: faltaTabela(error) ? AVISO_SQL : error.message }
  return {}
}

export async function cancelarEspera(
  id: string,
  registros: string[]
): Promise<{ erro?: string }> {
  if (!UUID.test(id) || registros.length === 0) return { erro: "Registro inválido." }
  const admin = await createAdminClient()
  const { data: espera } = await admin
    .from("hospedagem_espera")
    .select("id, hotel_id, situacao, cupom_id")
    .eq("id", id)
    .in("filiado_id", registros)
    .maybeSingle()
  if (!espera || !["aguardando", "oferecida"].includes(espera.situacao as string)) {
    return { erro: "Este pedido já não está na lista de espera." }
  }
  await admin
    .from("hospedagem_espera")
    .update({ situacao: "cancelada", motivo: "Cancelado pela pessoa.", updated_at: new Date().toISOString() })
    .eq("id", id)
  if (espera.situacao === "oferecida" && espera.cupom_id) {
    await admin
      .from("hospedagem_cupom")
      .update({ cancelado: true, cancelado_em: new Date().toISOString() })
      .eq("id", espera.cupom_id as string)
    await admin.from("hospedagem_alocacoes").delete().eq("cupom_id", espera.cupom_id as string)
    const hotel = await buscarHotel(espera.hotel_id as string)
    if (hotel) await processarFilaDeEspera(hotel, { forcar: true })
  }
  return {}
}

/** Página pública da oferta (botão "Confirmar"), sem login. */
function linkDaOferta(token: string): string {
  return `/hospedagem/oferta/${token}`
}

/** Intervalo mínimo entre duas passadas da fila do mesmo hotel (sem `forcar`). */
const INTERVALO_FILA_MS = 5 * 60_000

/**
 * Trava da passada: só uma execução por vez passa daqui, por hotel. A troca
 * do carimbo é UM update condicionado no banco (`fila_processada_em` vazio ou
 * mais velho que o intervalo) — duas visitas no mesmo instante não passam as
 * duas, como acontecia lendo o carimbo de um objeto carregado antes (A134).
 * `forcar` (depois de um cancelamento) passa sempre: a vez de cada pessoa da
 * fila é reivindicada à parte, em `processarFilaDeEspera`.
 */
async function travarFila(
  hotelId: string,
  agora: Date,
  forcar: boolean,
  amb?: AmbienteFila
): Promise<boolean> {
  const admin = await clienteDe(amb)
  let marca = admin
    .from("hospedagem_hotel")
    .update({ fila_processada_em: agora.toISOString() })
    .eq("id", hotelId)
    .eq("emp_proprietaria_id", await tenantDe(amb))
  if (!forcar) {
    const limite = new Date(agora.getTime() - INTERVALO_FILA_MS).toISOString()
    marca = marca.or(`fila_processada_em.is.null,fila_processada_em.lt."${limite}"`)
  }
  const { data, error } = await marca.select("id")
  if (error) return false
  return (data ?? []).length > 0
}

/**
 * Processa a lista de espera de um hotel:
 *  1. ofertas vencidas → a reserva guardada cai e a espera vira "expirada";
 *     oferta cuja reserva já foi cancelada (pela equipe ou pela pessoa) vira
 *     "cancelada" — a página da oferta não oferece mais o botão;
 *  2. por ordem de chegada, quem ainda atende às condições e cabe no hotel
 *     recebe a vaga GUARDADA (reserva com `confirmar_ate`) e um e-mail com o
 *     botão de confirmação.
 * Sem `forcar`, roda no máximo a cada 5 minutos por hotel. `amb`: o tick, sem
 * requisição (client, entidade e identidade do e-mail explícitos).
 * `semOfertar`: só o passo 1 — a vaga guardada vencida volta ao hotel, mas
 * ninguém da fila recebe oferta (o tick já leu a Área do associado; ver
 * `rodarFilasDeEspera`). Para os demais chamadores a função confere sozinha:
 * com a Hospedagem ou o portal fora do modo normal, também só o passo 1.
 *
 * Concorrência: a passada é travada por hotel (`travarFila`), menos com
 * `forcar`, e a vez de cada pessoa é reivindicada com um update condicionado
 * ao `updated_at` lido. Isso barra a segunda passada que leu a fila ANTES da
 * reivindicação; a que lê DEPOIS, com a primeira ainda no meio, pode tratar o
 * mesmo pedido — aí só uma reserva vira "oferecida" (a outra é descartada),
 * só ela manda o e-mail, e a "reserva que coincide" com a vaga guardada pela
 * outra passada não encerra o pedido (`ofertaPendente`). Risco que sobra, sem
 * SQL: com duas passadas simultâneas a ordem de chegada pode inverter entre
 * dois pedidos vizinhos, e uma passada que morre entre reservar e marcar
 * "oferecida" deixa uma vaga guardada sem oferta até o prazo dela vencer (a
 * passada seguinte a libera).
 */
export async function processarFilaDeEspera(
  hotel: Hotel,
  opcoes: { forcar?: boolean; semOfertar?: boolean } = {},
  amb?: AmbienteFila
): Promise<void> {
  if (!ehGarantida(hotel)) return
  const agora = new Date()
  if (!(await travarFila(hotel.id, agora, opcoes.forcar === true, amb))) return
  const admin = await clienteDe(amb)
  const tenantId = await tenantDe(amb)

  // 1. Ofertas vencidas.
  const { data: vencidas } = await admin
    .from("hospedagem_cupom")
    .select("id")
    .eq("hotel_id", hotel.id)
    .eq("reserva_garantida", true)
    .eq("cancelado", false)
    .not("confirmar_ate", "is", null)
    .lt("confirmar_ate", agora.toISOString())
  for (const c of vencidas ?? []) {
    await admin
      .from("hospedagem_cupom")
      .update({ cancelado: true, cancelado_em: agora.toISOString() })
      .eq("id", c.id as string)
    await admin.from("hospedagem_alocacoes").delete().eq("cupom_id", c.id as string)
    await admin
      .from("hospedagem_espera")
      .update({ situacao: "expirada", motivo: "A vaga oferecida não foi confirmada no prazo.", updated_at: agora.toISOString() })
      .eq("cupom_id", c.id as string)
      .eq("situacao", "oferecida")
  }

  // 1b. Oferta cuja reserva guardada já caiu por outro caminho (cancelamento
  // de antes da correção, ou feito fora destas funções). Só a reserva
  // CANCELADA (ou apagada) conta aqui: a que venceu no relógio depois do
  // passo 1 é dele na próxima passada — "expirada", com a reserva cancelada.
  const { data: oferecidas } = await admin
    .from("hospedagem_espera")
    .select("id, cupom_id")
    .eq("hotel_id", hotel.id)
    .eq("emp_proprietaria_id", tenantId)
    .eq("situacao", "oferecida")
  const comCupom = (oferecidas ?? []).filter((e) => txt(e.cupom_id))
  if (comCupom.length > 0) {
    const dePe = new Set<string>()
    const ids = comCupom.map((e) => e.cupom_id as string)
    for (let i = 0; i < ids.length; i += 200) {
      const { data: cupons, error: erroCupons } = await admin
        .from("hospedagem_cupom")
        .select("id, cancelado")
        .in("id", ids.slice(i, i + 200))
      // Leitura falhou: nada se encerra por engano.
      if (erroCupons) for (const id of ids) dePe.add(id)
      for (const c of cupons ?? []) if (c.cancelado !== true) dePe.add(c.id as string)
    }
    for (const e of comCupom) {
      if (dePe.has(e.cupom_id as string)) continue
      await admin
        .from("hospedagem_espera")
        .update({ situacao: "cancelada", motivo: "A vaga oferecida foi cancelada.", updated_at: agora.toISOString() })
        .eq("id", e.id as string)
        .eq("situacao", "oferecida")
    }
  }
  if (opcoes.semOfertar) return
  // A trava da Área do associado vale para todo chamador (tick, cancelamentos,
  // páginas do hotel e do mapa): sem a Hospedagem e o portal no modo normal,
  // a confirmação recusa, então ninguém recebe oferta. Leitura que falha: oferta.
  const partes = await lerConfigPortal({ client: admin, tenantId }).catch(() => null)
  if (partes && (partes.partes.hospedagem.estado !== "habilitada" || partes.partes.portal.estado !== "habilitada")) return

  // 2. Fila, por ordem de chegada.
  const { data: fila } = await admin
    .from("hospedagem_espera")
    .select("id, filiado_id, cpf, sexo, check_in, check_out, updated_at")
    .eq("hotel_id", hotel.id)
    .eq("emp_proprietaria_id", tenantId)
    .eq("situacao", "aguardando")
    .order("created_at", { ascending: true })
    .limit(50)
  const cfg = configDoHotel(hotel)
  const hoje = hojeEmSP(agora)

  for (const e of fila ?? []) {
    // A vez desta pessoa: só a passada que troca o `updated_at` que leu segue.
    let vez = admin
      .from("hospedagem_espera")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", e.id as string)
      .eq("situacao", "aguardando")
    vez = txt(e.updated_at) ? vez.eq("updated_at", e.updated_at as string) : vez.is("updated_at", null)
    const { data: minha, error: erroVez } = await vez.select("id")
    if (erroVez || !minha?.length) continue

    const checkIn = e.check_in as string
    const checkOut = e.check_out as string
    const marcar = (situacao: string, motivo: string) =>
      admin
        .from("hospedagem_espera")
        .update({ situacao, motivo, updated_at: new Date().toISOString() })
        .eq("id", e.id as string)
        .eq("situacao", "aguardando")

    if (checkIn < hoje) {
      await marcar("expirada", "A data do check-in passou sem vaga.")
      continue
    }
    const cpf = txt(e.cpf)
    const registros = cpf ? await registrosDoCpf(cpf, amb) : [e.filiado_id as string]
    const pode = await conferirPodeReservar({ cpf, registros, checkIn }, amb)
    if (pode.erro) {
      await marcar("cancelada", pode.erro)
      continue
    }

    const chegada = instanteSP(checkIn, cfg.horarioCheckin).getTime()
    const limite = Math.min(agora.getTime() + cfg.esperaPrazoHoras * 3_600_000, chegada - 3_600_000)
    if (limite <= agora.getTime()) {
      await marcar("expirada", "O check-in ficou próximo demais para oferecer a vaga.")
      continue
    }
    const confirmarAte = new Date(limite).toISOString()

    const r = await reservarEstadia({
      hotel,
      filiadoId: e.filiado_id as string,
      registros,
      sexo: txt(e.sexo),
      checkIn,
      checkOut,
      confirmarAte,
      amb,
    })
    if (!r.ok) {
      // Coincidência só com vaga ainda guardada (de outra passada que trata
      // este mesmo pedido agora, ou de outra oferta da pessoa): o pedido fica
      // na fila — a outra passada o marca, ou a próxima o confere de novo.
      if (!r.semVaga && !r.ofertaPendente) await marcar("cancelada", r.erro)
      continue
    }

    // Só vira "oferecida" se o pedido ainda está na fila: a pessoa pode ter
    // saído dela enquanto a vaga era guardada — aí a reserva recém-criada é
    // descartada, como `reservarEstadia` descarta a sua num conflito.
    const { data: oferecida, error: erroOferta } = await admin
      .from("hospedagem_espera")
      .update({
        situacao: "oferecida",
        cupom_id: r.cupomId,
        oferecida_em: new Date().toISOString(),
        oferta_expira_em: confirmarAte,
        updated_at: new Date().toISOString(),
      })
      .eq("id", e.id as string)
      .eq("situacao", "aguardando")
      .select("token")
      .maybeSingle()
    if (!erroOferta && !oferecida) {
      await admin.from("hospedagem_alocacoes").delete().eq("cupom_id", r.cupomId)
      await admin.from("hospedagem_cupom").delete().eq("id", r.cupomId)
      continue
    }
    const token = txt(oferecida?.token)
    if (cpf && token) {
      // O sino leva à página da oferta, a mesma do botão do e-mail: é lá que
      // está o "Confirmar" (a reserva ainda aguarda confirmação). No portal,
      // a oferta também aparece em destaque no topo da Hospedagem.
      await avisarFiliado(
        {
          cpf,
          evento: "hospedagem",
          texto: `Surgiu vaga no ${hotel.nome ?? "hotel"} para ${dataBR(checkIn)} a ${dataBR(checkOut)}: confirme até ${dataHoraBR(new Date(confirmarAte))}.`,
          link: linkDaOferta(token),
          soSino: true,
          umaVez: true,
        },
        amb
      )
      const contato = await contatoDoFiliado(cpf, amb)
      if (contato?.email) {
        const origem = amb?.contexto?.origem ?? (await origemAtual())
        const link = `${origem}${linkDaOferta(token)}`
        await enviarEmail({
          email: contato.email,
          nome: contato.nome,
          assunto: "Surgiu vaga na hospedagem — confirme a sua reserva",
          html:
            tituloEmail("Surgiu vaga na hospedagem") +
            paragrafo(
              `Abriu vaga no <strong>${escaparHtml(hotel.nome ?? "hotel")}</strong> para as datas que você pediu: check-in em <strong>${dataBR(checkIn)}</strong> e check-out em <strong>${dataBR(checkOut)}</strong>.`
            ) +
            caixaAviso(
              `A vaga fica guardada até <strong>${dataHoraBR(new Date(confirmarAte))}</strong>. Sem confirmação, ela passa para a próxima pessoa da lista.`
            ) +
            botaoEmail(link, "Confirmar minha reserva") +
            linkReserva(link),
          contexto: amb?.contexto,
        })
      }
    }
  }
}

export type ResultadoFilasDeEspera = {
  /** Entidades com hotel de demanda garantida ativo. */
  entidades: number
  /** Passadas de fila feitas (hotel por hotel). */
  hoteis: number
  /** Lembretes de oferta perto de vencer. */
  lembretes: number
  erros: string[]
}

/**
 * Etapa do tick da Comunicação (a cada 15 minutos, achado A134): para cada
 * entidade com hotel de demanda garantida ativo, passa a fila de cada hotel —
 * a oferta vencida cai e a vaga que ela (ou a trava do último quarto) liberou
 * vai ao próximo da fila — e manda o lembrete da oferta perto de vencer, que
 * no tick diário da hospedagem alcançava poucas ofertas.
 *
 * Roda sem requisição: o client de serviço vem de quem chama (a rota do tick)
 * e cada passada leva a entidade e a identidade do e-mail explícitas. Um
 * hotel ou uma entidade que falha não impede os outros; passado o `limite`
 * (ms), não começa hotel novo — o resto fica para o próximo tick.
 *
 * Área do associado (Filiados), por entidade: com a Hospedagem suspensa ou
 * desabilitada — ou o portal fora do modo normal —, a confirmação da vaga
 * está bloqueada; a fila não oferta vaga nem lembra oferta, só devolve ao
 * hotel a vaga guardada que venceu. Na dúvida (leitura falhou), como antes.
 */
export async function rodarFilasDeEspera(p: {
  client: SupabaseClient
  limite: number
  tenant?: string | null
}): Promise<ResultadoFilasDeEspera> {
  const resultado: ResultadoFilasDeEspera = { entidades: 0, hoteis: 0, lembretes: 0, erros: [] }
  const motivo = (e: unknown) => (e instanceof Error ? e.message : String(e))
  const { data, error } = await p.client
    .from("hospedagem_hotel")
    .select("*")
    .eq("modalidade", "garantida")
  if (error) {
    if (!faltaTabela(error)) resultado.erros.push(error.message)
    return resultado
  }

  const porEntidade = new Map<string, Hotel[]>()
  for (const h of (data ?? []) as (Hotel & { emp_proprietaria_id?: string | null })[]) {
    const emp = txt(h.emp_proprietaria_id)
    if (!emp || h.ativo === false || (p.tenant && emp !== p.tenant)) continue
    porEntidade.set(emp, [...(porEntidade.get(emp) ?? []), h])
  }

  for (const [tenantId, hoteis] of porEntidade) {
    if (Date.now() > p.limite) {
      resultado.erros.push(`${tenantId}: sem tempo neste tick`)
      continue
    }
    resultado.entidades++
    let amb: AmbienteFila
    try {
      amb = { client: p.client, tenantId, contexto: await contextoDoTenant(tenantId, p.client) }
    } catch (e) {
      resultado.erros.push(`${tenantId}: ${motivo(e)}`)
      continue
    }
    const partes = await lerConfigPortal({ client: p.client, tenantId }).catch(() => null)
    const ofertaAberta =
      !partes || (partes.partes.hospedagem.estado === "habilitada" && partes.partes.portal.estado === "habilitada")
    for (const h of hoteis) {
      if (Date.now() > p.limite) break
      try {
        await processarFilaDeEspera(h, { semOfertar: !ofertaAberta }, amb)
        resultado.hoteis++
      } catch (e) {
        resultado.erros.push(`${tenantId} · ${h.nome ?? h.id}: ${motivo(e)}`)
      }
    }
    if (!ofertaAberta) continue
    try {
      const l = await lembretesOfertasDeVaga(amb)
      resultado.lembretes += l.avisados
      if (l.erro) resultado.erros.push(`${tenantId} · lembretes: ${l.erro}`)
    } catch (e) {
      resultado.erros.push(`${tenantId} · lembretes: ${motivo(e)}`)
    }
  }
  return resultado
}

export type OfertaDaEspera = {
  hotelNome: string | null
  checkIn: string
  checkOut: string
  situacao: string
  expiraEm: string | null
  valida: boolean
}

export async function ofertaPorToken(token: string): Promise<OfertaDaEspera | null> {
  if (!UUID.test(token)) return null
  const admin = await createAdminClient()
  const { data: e, error } = await admin
    .from("hospedagem_espera")
    .select("hotel_id, check_in, check_out, situacao, oferta_expira_em, cupom_id")
    .eq("token", token)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (error || !e) return null
  const hotel = await buscarHotel(e.hotel_id as string)
  const expira = txt(e.oferta_expira_em)
  return {
    hotelNome: hotel?.nome ?? null,
    checkIn: e.check_in as string,
    checkOut: e.check_out as string,
    situacao: e.situacao as string,
    expiraEm: expira,
    valida: e.situacao === "oferecida" && !!expira && new Date(expira) > new Date(),
  }
}

/**
 * Confirma a vaga oferecida. Pelo link do e-mail o token é a credencial; no
 * portal, `escopo.registros` exige ainda que o pedido seja da pessoa logada.
 * Devolve a reserva (id e token do QR) e o e-mail para onde a confirmação
 * saiu — sem e-mail no cadastro, a tela não diz que enviou. `jaConfirmada`:
 * o segundo toque (ou outro aparelho) — nada foi enviado AGORA, e a tela não
 * pode concluir daí que o cadastro está sem e-mail.
 */
export async function confirmarOferta(
  token: string,
  escopo: { registros?: string[] } = {}
): Promise<{
  erro?: string
  cupomId?: string
  reservaToken?: string
  email?: string
  jaConfirmada?: boolean
}> {
  if (!UUID.test(token)) return { erro: "Link inválido." }
  const admin = await createAdminClient()
  const { data: e } = await admin
    .from("hospedagem_espera")
    .select("id, hotel_id, filiado_id, cpf, situacao, cupom_id, check_in, check_out")
    .eq("token", token)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (!e) return { erro: "Link inválido." }
  if (escopo.registros && !escopo.registros.includes(e.filiado_id as string)) {
    return { erro: "Esta oferta não é sua." }
  }
  if (e.situacao === "confirmada") {
    return { cupomId: txt(e.cupom_id) ?? undefined, jaConfirmada: true }
  }
  if (e.situacao !== "oferecida" || !e.cupom_id) {
    return { erro: "Esta oferta não está mais disponível." }
  }
  const { data: cupom } = await admin
    .from("hospedagem_cupom")
    .select("id, token, cancelado, confirmar_ate")
    .eq("id", e.cupom_id as string)
    .maybeSingle()
  const vencida =
    !cupom ||
    cupom.cancelado === true ||
    !cupom.confirmar_ate ||
    new Date(cupom.confirmar_ate as string) <= new Date()
  if (vencida) {
    const hotel = await buscarHotel(e.hotel_id as string)
    if (hotel) await processarFilaDeEspera(hotel, { forcar: true })
    return {
      erro: "O prazo para confirmar esta vaga terminou e ela passou para a próxima pessoa da lista.",
    }
  }

  await admin.from("hospedagem_cupom").update({ confirmar_ate: null }).eq("id", cupom.id as string)
  await admin
    .from("hospedagem_espera")
    .update({ situacao: "confirmada", updated_at: new Date().toISOString() })
    .eq("id", e.id as string)

  const hotel = await buscarHotel(e.hotel_id as string)
  const { email } = await enviarEmailReservaConfirmada({
    cpf: txt(e.cpf),
    hotelNome: hotel?.nome ?? "hotel",
    checkIn: e.check_in as string,
    checkOut: e.check_out as string,
    token: txt(cupom.token),
    cupomId: cupom.id as string,
  })
  return { cupomId: cupom.id as string, reservaToken: txt(cupom.token) ?? undefined, email }
}

// ── Mapa de hóspedes por quarto ──────────────────────────────────────────────

export type HospedeNoMapa = {
  cupomId: string
  nome: string | null
  cpfMascarado: string
  sexo: Sexo
  checkIn: string
  checkOut: string
  presencaEm: string | null
  aguardandoConfirmacao: boolean
}

export type QuartoNoMapa = {
  quarto: number
  sexo: Sexo | null
  vagas: number
  hospedes: HospedeNoMapa[]
  quartoHotel: string | null
}

export type MapaDaNoite = {
  instalado: boolean
  totalQuartos: number
  quartos: QuartoNoMapa[]
  /** Hóspedes em quarto além do dedicado nesta noite (configuração mudou). */
  fora: (HospedeNoMapa & { quarto: number })[]
}

export async function mapaDaNoite(hotel: Hotel, noite: string): Promise<MapaDaNoite> {
  const cfg = configDoHotel(hotel)
  const total = quartosNaNoite(cfg, noite)
  const vazio: MapaDaNoite = {
    instalado: true,
    totalQuartos: total,
    quartos: Array.from({ length: total }, (_, i) => ({
      quarto: i + 1,
      sexo: null,
      vagas: cfg.vagasPorQuarto,
      hospedes: [],
      quartoHotel: null,
    })),
    fora: [],
  }
  if (!DATA.test(noite)) return vazio
  const admin = await createAdminClient()
  const [{ data: alocacoes, error }, { data: anotacoes }] = await Promise.all([
    admin
      .from("hospedagem_alocacoes")
      .select("cupom_id, quarto, sexo")
      .eq("hotel_id", hotel.id)
      .eq("noite", noite),
    admin
      .from("hospedagem_quartos_noite")
      .select("quarto, quarto_hotel")
      .eq("hotel_id", hotel.id)
      .eq("noite", noite),
  ])
  if (error) return { ...vazio, instalado: !faltaTabela(error) }

  const cupomIds = [...new Set((alocacoes ?? []).map((a) => a.cupom_id as string))]
  const cupons = new Map<string, Linha>()
  for (let i = 0; i < cupomIds.length; i += 200) {
    const { data } = await admin
      .from("hospedagem_cupom")
      .select("id, filiado_id, check_in, check_out, cancelado, confirmar_ate, presenca_em")
      .in("id", cupomIds.slice(i, i + 200))
    for (const c of data ?? []) cupons.set(c.id as string, c)
  }
  const pessoas = await nomesDeFiliados([
    ...new Set([...cupons.values()].map((c) => c.filiado_id as string).filter(Boolean)),
  ])
  const agora = new Date()

  for (const a of anotacoes ?? []) {
    const q = vazio.quartos[Number(a.quarto) - 1]
    if (q) q.quartoHotel = txt(a.quarto_hotel)
  }
  for (const a of alocacoes ?? []) {
    const c = cupons.get(a.cupom_id as string)
    if (!c || c.cancelado === true || !sexoValido(a.sexo as string)) continue
    const aguardando = Boolean(c.confirmar_ate)
    if (aguardando && new Date(c.confirmar_ate as string) <= agora) continue
    const pessoa = pessoas.get(c.filiado_id as string)
    const hospede: HospedeNoMapa = {
      cupomId: c.id as string,
      nome: pessoa?.nome ?? null,
      cpfMascarado: mascararCpf(pessoa?.cpf ?? null),
      sexo: a.sexo as Sexo,
      checkIn: c.check_in as string,
      checkOut: c.check_out as string,
      presencaEm: txt(c.presenca_em),
      aguardandoConfirmacao: aguardando,
    }
    const quarto = Number(a.quarto)
    const alvo = vazio.quartos[quarto - 1]
    if (!alvo) {
      vazio.fora.push({ ...hospede, quarto })
      continue
    }
    alvo.hospedes.push(hospede)
    alvo.sexo = hospede.sexo
  }
  for (const q of vazio.quartos) {
    q.hospedes.sort((x, y) => (x.nome ?? "").localeCompare(y.nome ?? "", "pt-BR"))
  }
  return vazio
}

export async function anotarQuartoHotel(p: {
  hotelId: string
  noite: string
  quarto: number
  quartoHotel: string
  autorId: string
}): Promise<{ erro?: string }> {
  if (!DATA.test(p.noite) || !Number.isInteger(p.quarto) || p.quarto < 1) {
    return { erro: "Dados inválidos." }
  }
  const admin = await createAdminClient()
  const { error } = await admin.from("hospedagem_quartos_noite").upsert(
    {
      emp_proprietaria_id: await tenantAtual(),
      hotel_id: p.hotelId,
      noite: p.noite,
      quarto: p.quarto,
      quarto_hotel: p.quartoHotel.trim().slice(0, 30) || null,
      anotado_por: p.autorId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "hotel_id,noite,quarto" }
  )
  if (error) return { erro: faltaTabela(error) ? AVISO_SQL : error.message }
  return {}
}

/** Remanejamento pela equipe: move a estadia inteira para outro quarto. */
export async function remanejarReserva(
  cupomId: string,
  quartoDestino: number
): Promise<{ erro?: string }> {
  if (!UUID.test(cupomId) || !Number.isInteger(quartoDestino) || quartoDestino < 1) {
    return { erro: "Dados inválidos." }
  }
  const admin = await createAdminClient()
  const { data: cupom } = await admin
    .from("hospedagem_cupom")
    .select("id, hotel_id, check_in, check_out, sexo, cancelado, reserva_garantida, quarto")
    .eq("id", cupomId)
    .maybeSingle()
  if (!cupom || cupom.reserva_garantida !== true || cupom.cancelado === true) {
    return { erro: "Reserva não encontrada." }
  }
  if (cupom.quarto === quartoDestino) return {}
  if (!sexoValido(cupom.sexo as string)) return { erro: "A reserva está sem sexo informado." }
  const hotel = await buscarHotel(cupom.hotel_id as string)
  if (!hotel) return { erro: "Hotel não encontrado." }
  const cfg = configDoHotel(hotel)
  const noites = noitesDaEstadia(cupom.check_in as string, cupom.check_out as string)

  for (let tentativa = 0; tentativa < 4; tentativa++) {
    const { data: v } = await admin
      .from("hospedagem_hotel")
      .select("alocacao_versao")
      .eq("id", hotel.id)
      .maybeSingle()
    const ocupacao = await ocupacaoDoHotel(hotel.id, noites, cupomId)
    const escolha = alocarEstadia(
      cfg,
      ocupacao,
      { sexo: cupom.sexo as Sexo, noites },
      new Date(),
      { quartoFixo: quartoDestino, ignorarTrava: true }
    )
    if (!escolha.ok) {
      return {
        erro: `O quarto ${quartoDestino} não comporta esta estadia: está lotado, tem pessoa do outro sexo ou não existe em alguma das noites.`,
      }
    }
    const { data: resultado, error } = await (await createAdminClient()).rpc(
      "hospedagem_gravar_alocacao",
      {
        p_emp: await tenantAtual(),
        p_hotel: hotel.id,
        p_versao: Number(v?.alocacao_versao ?? 0),
        p_cupom: cupomId,
        p_quarto: quartoDestino,
        p_sexo: cupom.sexo,
        p_noites: noites,
      }
    )
    if (error) return { erro: faltaTabela(error) ? AVISO_SQL : error.message }
    if (resultado === "ok") return {}
  }
  return { erro: "O hotel recebeu outras reservas ao mesmo tempo. Tente de novo." }
}

// ── Recepção do hotel ────────────────────────────────────────────────────────

export type SituacaoNaPorta =
  | "pode_entrar"
  | "ja_entrou"
  | "fora_da_data"
  | "cancelada"
  | "aguardando_confirmacao"

export type ReservaNaPorta = {
  cupomId: string
  nome: string | null
  cpfMascarado: string
  checkIn: string
  checkOut: string
  quarto: number | null
  presencaEm: string | null
  situacao: SituacaoNaPorta
}

function situacaoNaPorta(c: Linha, hoje: string, agora: Date): SituacaoNaPorta {
  if (c.cancelado === true) return "cancelada"
  if (c.presenca_em) return "ja_entrou"
  if (c.confirmar_ate) {
    return new Date(c.confirmar_ate as string) > agora ? "aguardando_confirmacao" : "cancelada"
  }
  if (hoje < (c.check_in as string) || hoje >= (c.check_out as string)) return "fora_da_data"
  return "pode_entrar"
}

/** Busca na recepção: TOKEN do QR, CPF (dígitos) ou nome. */
export async function buscarReservasNaPorta(
  hotelId: string,
  termo: string
): Promise<ReservaNaPorta[]> {
  const t = termo.trim()
  if (!t) return []
  const admin = await createAdminClient()
  const agora = new Date()
  const hoje = hojeEmSP(agora)

  let cupons: Linha[] = []
  if (UUID.test(t)) {
    const { data } = await admin
      .from("hospedagem_cupom")
      .select("*")
      .eq("token", t)
      .eq("hotel_id", hotelId)
      .eq("reserva_garantida", true)
    cupons = data ?? []
  } else {
    // Reservas que cobrem os arredores de hoje: chegadas e estadias em curso.
    const { data } = await admin
      .from("hospedagem_cupom")
      .select("*")
      .eq("hotel_id", hotelId)
      .eq("reserva_garantida", true)
      .lte("check_in", somarDias(hoje, 1))
      .gte("check_out", hoje)
      .limit(500)
    cupons = data ?? []
  }

  const pessoas = await nomesDeFiliados([
    ...new Set(cupons.map((c) => c.filiado_id as string).filter(Boolean)),
  ])
  const digitos = t.replace(/\D/g, "")
  const palavras = t
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
  const normalizar = (s: string) =>
    s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase()

  return cupons
    .filter((c) => {
      if (UUID.test(t)) return true
      const p = pessoas.get(c.filiado_id as string)
      if (digitos.length >= 3 && /^[\d.\-\s]+$/.test(t)) {
        return (p?.cpf ?? "").startsWith(digitos)
      }
      const nome = normalizar(p?.nome ?? "")
      return palavras.every((w) => nome.includes(w))
    })
    .map((c) => {
      const p = pessoas.get(c.filiado_id as string)
      return {
        cupomId: c.id as string,
        nome: p?.nome ?? null,
        cpfMascarado: mascararCpf(p?.cpf ?? null),
        checkIn: c.check_in as string,
        checkOut: c.check_out as string,
        quarto: typeof c.quarto === "number" ? c.quarto : null,
        presencaEm: txt(c.presenca_em),
        situacao: situacaoNaPorta(c, hoje, agora),
      }
    })
    .sort((a, b) => (a.nome ?? "").localeCompare(b.nome ?? "", "pt-BR"))
    .slice(0, 20)
}

export async function registrarPresencaNaPorta(p: {
  cupomId: string
  hotelId: string
  autorId: string
  metodo: "qr" | "busca"
}): Promise<{ erro?: string; nome?: string | null; jaEstava?: boolean }> {
  if (!UUID.test(p.cupomId)) return { erro: "Reserva inválida." }
  const admin = await createAdminClient()
  const { data: c } = await admin
    .from("hospedagem_cupom")
    .select("*")
    .eq("id", p.cupomId)
    .eq("hotel_id", p.hotelId)
    .eq("reserva_garantida", true)
    .maybeSingle()
  if (!c) return { erro: "Reserva não encontrada neste hotel." }
  const pessoa = (await nomesDeFiliados([c.filiado_id as string])).get(c.filiado_id as string)
  const agora = new Date()
  const situacao = situacaoNaPorta(c, hojeEmSP(agora), agora)
  if (situacao === "ja_entrou") return { nome: pessoa?.nome ?? null, jaEstava: true }
  if (situacao === "cancelada") return { erro: "Esta reserva está cancelada." }
  if (situacao === "aguardando_confirmacao") {
    return { erro: "A pessoa ainda não confirmou a vaga oferecida pela lista de espera." }
  }
  if (situacao === "fora_da_data") {
    return {
      erro: `A reserva é de ${dataBR(c.check_in as string)} a ${dataBR(c.check_out as string)} — fora da data de hoje.`,
    }
  }
  const { error } = await admin
    .from("hospedagem_cupom")
    .update({
      presenca_em: agora.toISOString(),
      presenca_por: p.autorId,
      presenca_metodo: p.metodo,
      compareceu: true,
    })
    .eq("id", p.cupomId)
  if (error) return { erro: `Não foi possível registrar: ${error.message}` }
  return { nome: pessoa?.nome ?? null }
}

// ── Não comparecimento (painel) ──────────────────────────────────────────────

export type FaltaLinha = {
  cupomId: string
  nome: string | null
  cpf: string | null
  hotelNome: string | null
  checkIn: string
  checkOut: string
  abonadoEm: string | null
  abonoMotivo: string | null
}

export async function listarNaoComparecimentos(hoteis: Hotel[]): Promise<{
  instalado: boolean
  faltas: FaltaLinha[]
}> {
  const admin = await createAdminClient()
  const garantidos = hoteis.filter(ehGarantida).map((h) => h.id)
  if (garantidos.length === 0) return { instalado: true, faltas: [] }
  const hoje = hojeEmSP()
  const { data, error } = await admin
    .from("hospedagem_cupom")
    .select("id, filiado_id, hotel_id, check_in, check_out, nao_comparecimento_abonado_em, nao_comparecimento_abono_motivo")
    .in("hotel_id", garantidos)
    .eq("reserva_garantida", true)
    .eq("cancelado", false)
    .is("presenca_em", null)
    .is("confirmar_ate", null)
    .lt("check_in", hoje)
    .order("check_in", { ascending: false })
    .limit(300)
  if (error) return { instalado: !faltaTabela(error), faltas: [] }
  const pessoas = await nomesDeFiliados([
    ...new Set((data ?? []).map((c) => c.filiado_id as string).filter(Boolean)),
  ])
  const nomes = new Map(hoteis.map((h) => [h.id, h.nome]))
  return {
    instalado: true,
    faltas: (data ?? []).map((c) => ({
      cupomId: c.id as string,
      nome: pessoas.get(c.filiado_id as string)?.nome ?? null,
      cpf: pessoas.get(c.filiado_id as string)?.cpf ?? null,
      hotelNome: nomes.get(c.hotel_id as string) ?? null,
      checkIn: c.check_in as string,
      checkOut: c.check_out as string,
      abonadoEm: txt(c.nao_comparecimento_abonado_em),
      abonoMotivo: txt(c.nao_comparecimento_abono_motivo),
    })),
  }
}

export async function abonarNaoComparecimento(
  cupomId: string,
  motivo: string,
  usuarioId: string
): Promise<{ erro?: string }> {
  if (!UUID.test(cupomId)) return { erro: "Reserva inválida." }
  const admin = await createAdminClient()
  const { error } = await admin
    .from("hospedagem_cupom")
    .update({
      nao_comparecimento_abonado_em: new Date().toISOString(),
      nao_comparecimento_abono_motivo: motivo,
      nao_comparecimento_abonado_por: usuarioId,
    })
    .eq("id", cupomId)
    .eq("reserva_garantida", true)
  if (error) return { erro: faltaTabela(error) ? AVISO_SQL : error.message }
  return {}
}

export type LiberacaoLinha = {
  id: string
  cpf: string
  motivo: string | null
  criadoEm: string
}

export async function listarLiberacoes(): Promise<LiberacaoLinha[]> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("hospedagem_penalidade_liberacoes")
    .select("id, cpf, motivo, created_at")
    .eq("emp_proprietaria_id", await tenantAtual())
    .order("created_at", { ascending: false })
    .limit(100)
  if (error) return []
  return (data ?? []).map((l) => ({
    id: l.id as string,
    cpf: l.cpf as string,
    motivo: txt(l.motivo),
    criadoEm: l.created_at as string,
  }))
}

export async function liberarPenalidade(
  cpf: string,
  motivo: string,
  usuarioId: string
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin.from("hospedagem_penalidade_liberacoes").insert({
    emp_proprietaria_id: await tenantAtual(),
    cpf,
    motivo,
    liberado_por: usuarioId,
  })
  if (error) return { erro: faltaTabela(error) ? AVISO_SQL : error.message }
  return {}
}

// ── Lembretes (tick diário, fora de requisição) ─────────────────────────────

/**
 * Faltas avisadas pelo tick: só as de check-in nos últimos dias. Um tick que
 * falhou ainda alcança a falta na volta seguinte, e a primeira rodada não
 * acorda faltas antigas que a pessoa já vê na tela.
 */
const JANELA_AVISO_FALTA_DIAS = 7

/**
 * Lembrete da oferta da lista de espera: quando faltam LEMBRETE_OFERTA_HORAS
 * ou metade do prazo — o que vier antes —, nunca colado no aviso da oferta
 * (LEMBRETE_OFERTA_DEPOIS_MIN) nem quando já não dá tempo de confirmar
 * (LEMBRETE_OFERTA_FOLGA_MIN).
 */
const LEMBRETE_OFERTA_HORAS = 3
const LEMBRETE_OFERTA_DEPOIS_MIN = 60
const LEMBRETE_OFERTA_FOLGA_MIN = 15

/** Os lembretes rodam sem requisição: client e entidade são obrigatórios. */
export type AmbienteLembreteHospedagem = {
  client: SupabaseClient
  tenantId: string
  contexto?: ContextoEmail
}

const RODAPE_PREFERENCIAS = textoSuave(
  "Você pode escolher quais avisos recebe por e-mail em Portal → Avisos → Preferências."
)

/** Nome dos hotéis da entidade (inativos inclusos: a estadia pode ser anterior). */
async function hoteisDaEntidade(amb: AmbienteLembreteHospedagem): Promise<Map<string, string>> {
  const { data } = await amb.client
    .from("hospedagem_hotel")
    .select("id, nome")
    .eq("emp_proprietaria_id", amb.tenantId)
  return new Map((data ?? []).map((h) => [h.id as string, txt(h.nome) ?? "hotel"]))
}

/** Pedido de abono pelo Atendimento, com o resumo já preenchido. */
function linkPedidoDeAbono(hotel: string, checkIn: string): string {
  const titulo = `Abono do não comparecimento de ${dataBR(checkIn)} — ${hotel}`.slice(0, 140)
  return `/portal/atendimento?assunto=outro&titulo=${encodeURIComponent(titulo)}`
}

/**
 * Como o associado pede o abono, pela Área do associado (Filiados):
 * - `aberto`: pelo Atendimento, na hora (o de sempre);
 * - `pausado`: Atendimento suspenso, ou o portal em consulta/fora do ar — o
 *   pedido pelo portal está parado: o link continua (a página explica a
 *   pausa e, quando ela acaba, o formulário já vem preenchido), mas o texto
 *   não promete o pedido agora e manda falar com o sindicato;
 * - `fechado`: Atendimento desabilitado — o link do Atendimento faria o
 *   portão de `avisarFiliado` descartar o aviso inteiro (e a pessoa nem
 *   saberia da falta): o aviso leva à reserva e orienta a falar com o
 *   sindicato (O sindicato nunca fica desabilitado junto com o Atendimento).
 */
type PedidoDeAbono = "aberto" | "pausado" | "fechado"

/** Texto do sino de cada caminho — também a trava de repetição entre eles. */
function textoDaFalta(caminho: PedidoDeAbono, hotel: string, dia: string): string {
  const fato = `Registramos não comparecimento na sua reserva no ${hotel} de ${dia}.`
  if (caminho === "aberto") return `${fato} Se houve engano, peça o abono em Atendimento.`
  if (caminho === "pausado")
    return `${fato} Se houve engano, peça o abono ao sindicato — os pedidos pelo Atendimento estão pausados agora.`
  return `${fato} Se houve engano, fale com o sindicato para pedir o abono.`
}

/**
 * A falta deste cupom já foi avisada, por QUALQUER dos caminhos: o estado do
 * Atendimento pode mudar entre um tick e outro, e o `umaVez` de
 * `avisarFiliado` só reconhece o mesmo texto com o mesmo link.
 */
async function faltaJaAvisada(
  amb: AmbienteLembreteHospedagem,
  cpf: string,
  textos: string[],
  links: string[]
): Promise<boolean> {
  const chave = cpfConfiavel(cpf)
  if (!chave) return false
  const { data } = await amb.client
    .from("portal_avisos")
    .select("texto")
    .eq("emp_proprietaria_id", amb.tenantId)
    .eq("cpf", chave)
    .eq("evento", "hospedagem")
    .in("link", links)
  return (data ?? []).some((a) => textos.includes(a.texto as string))
}

/**
 * NÃO COMPARECIMENTO (achado A21): reserva garantida com check-in já passado,
 * sem entrada registrada pelo hotel, não cancelada, que não era oferta da
 * lista de espera e sem abono — exatamente o que o painel lista como falta.
 * Sino + e-mail (pela preferência), com o caminho do abono; uma vez por
 * cupom (`umaVez`: texto e link levam hotel e data; `faltaJaAvisada` cobre a
 * troca de caminho — ver `PedidoDeAbono`). Idempotente: pode rodar todo dia,
 * ou mais vezes.
 */
export async function lembretesNaoComparecimento(
  amb: AmbienteLembreteHospedagem
): Promise<{ avisados: number; erro?: string }> {
  const { client, tenantId } = amb
  const hoteis = await hoteisDaEntidade(amb)
  if (hoteis.size === 0) return { avisados: 0 }
  const hoje = hojeEmSP()
  const { data, error } = await client
    .from("hospedagem_cupom")
    .select("id, filiado_id, hotel_id, check_in")
    .in("hotel_id", [...hoteis.keys()])
    .eq("reserva_garantida", true)
    .eq("cancelado", false)
    .is("presenca_em", null)
    .is("confirmar_ate", null)
    .is("nao_comparecimento_abonado_em", null)
    .lt("check_in", hoje)
    .gte("check_in", somarDias(hoje, -JANELA_AVISO_FALTA_DIAS))
    .order("check_in", { ascending: true })
    .limit(1000)
  if (error) return { avisados: 0, erro: faltaTabela(error) ? undefined : error.message }
  const faltas = data ?? []
  if (faltas.length === 0) return { avisados: 0 }

  const [cpfs, regra, contexto, partes] = await Promise.all([
    cpfDosCadastros(faltas.map((c) => txt(c.filiado_id)), amb),
    lerRegraNaoComparecimento(amb),
    amb.contexto ?? contextoDoTenant(tenantId, client),
    // Mesmo client e tenant do laço (fora de requisição). Na dúvida, o de sempre.
    lerConfigPortal({ client, tenantId }).catch(() => null),
  ])
  const regraTexto = descreverRegraNaoComparecimento(regra)
  const origem = contexto.origem
  const atendimento = partes?.partes.atendimento.estado ?? "habilitada"
  const caminho: PedidoDeAbono =
    atendimento === "desabilitada"
      ? "fechado"
      : atendimento === "suspensa" || (partes && partes.partes.portal.estado !== "habilitada")
        ? "pausado"
        : "aberto"
  const sindicatoNoPortal = partes?.partes.sindicato.estado !== "desabilitada"
  const motivoDoAbono =
    "Se houve engano — você foi ao hotel, ou não pôde ir por um motivo que o sindicato deva considerar —,"

  let avisados = 0
  for (const c of faltas) {
    const cpf = cpfs.get(c.filiado_id as string)
    if (!cpf) continue
    const hotel = hoteis.get(c.hotel_id as string) ?? "hotel"
    const dia = dataBR(c.check_in as string)
    const linkAbono = linkPedidoDeAbono(hotel, c.check_in as string)
    const linkReserva = linkReservaNoPortal(c.id as string)
    const urlReserva = `${origem}${linkReserva}`
    const textos = (["aberto", "pausado", "fechado"] as const).map((k) => textoDaFalta(k, hotel, dia))
    if (await faltaJaAvisada(amb, cpf, textos, [linkAbono, linkReserva])) continue
    const comoPedir =
      caminho === "aberto"
        ? paragrafo(`${motivoDoAbono} peça o abono contando o que aconteceu. Se tiver um comprovante, anexe.`) +
          botaoEmail(`${origem}${linkAbono}`, "Pedir o abono")
        : caminho === "pausado"
          ? paragrafo(
              `${motivoDoAbono} peça o abono ao sindicato contando o que aconteceu. Os pedidos pelo Atendimento do portal estão pausados no momento: fale com o sindicato pelos canais oficiais ou, quando o Atendimento voltar, abra o pedido por lá. Se tiver um comprovante, guarde-o.`
            ) + botaoEmail(`${origem}${linkAbono}`, "Ver o Atendimento")
          : paragrafo(
              `${motivoDoAbono} fale com o sindicato para pedir o abono, contando o que aconteceu. Se tiver um comprovante, guarde-o para mostrar.`
            ) +
            (sindicatoNoPortal
              ? botaoEmail(`${origem}/portal/sindicato`, "Falar com o sindicato")
              : botaoEmail(urlReserva, "Ver a reserva"))
    const r = await avisarFiliado(
      {
        cpf,
        evento: "hospedagem",
        assunto: "Registramos não comparecimento na sua reserva de hospedagem",
        texto: textoDaFalta(caminho, hotel, dia),
        link: caminho === "fechado" ? linkReserva : linkAbono,
        umaVez: true,
        // Hospedagem desabilitada no portal não apaga a falta: a reserva
        // confirmada valia no hotel e a regra conta. A pessoa precisa saber.
        mesmoComParteDesabilitada: true,
        html:
          tituloEmail("Registramos não comparecimento") +
          paragrafo(
            `Na sua reserva no <strong>${escaparHtml(hotel)}</strong> com check-in em <strong>${dia}</strong>, o hotel não registrou a sua entrada e a reserva não foi cancelada.`
          ) +
          (regraTexto ? caixaAviso(`Regra do sindicato: ${escaparHtml(regraTexto)}`) : "") +
          comoPedir +
          textoSuave(
            `Se você chegou depois e a recepção ainda registrar a sua entrada, a falta deixa de contar. Ver a reserva no portal: <a href="${urlReserva}">${urlReserva}</a>`
          ) +
          RODAPE_PREFERENCIAS,
      },
      { client, tenantId, contexto }
    )
    if (r) avisados++
  }
  return { avisados }
}

/**
 * OFERTA DA LISTA DE ESPERA PERTO DE VENCER (achado A102): a vaga guardada
 * ainda sem confirmação recebe UM lembrete (sino + e-mail pela preferência)
 * com o botão da página da oferta. Só lê: quem derruba a oferta vencida é
 * `processarFilaDeEspera`.
 *
 * Frequência: rodando 1x por dia, só alcança as ofertas cuja hora de lembrar
 * cai antes do tick e que ainda não venceram; ligada a um tick frequente
 * (a cada 15 min), alcança todas. É idempotente nos dois casos.
 */
export async function lembretesOfertasDeVaga(
  amb: AmbienteLembreteHospedagem
): Promise<{ avisados: number; erro?: string }> {
  const { client, tenantId } = amb
  const agora = Date.now()
  const { data, error } = await client
    .from("hospedagem_espera")
    .select("id, token, hotel_id, filiado_id, cpf, cupom_id, check_in, check_out, oferecida_em, oferta_expira_em")
    .eq("emp_proprietaria_id", tenantId)
    .eq("situacao", "oferecida")
    .gt("oferta_expira_em", new Date(agora + LEMBRETE_OFERTA_FOLGA_MIN * 60_000).toISOString())
    .order("oferta_expira_em", { ascending: true })
    .limit(500)
  if (error) return { avisados: 0, erro: faltaTabela(error) ? undefined : error.message }

  const devidas = (data ?? []).filter((e) => {
    if (!txt(e.token) || !txt(e.cupom_id) || !txt(e.oferta_expira_em)) return false
    const expira = new Date(e.oferta_expira_em as string).getTime()
    const oferecida = txt(e.oferecida_em) ? new Date(e.oferecida_em as string).getTime() : null
    if (oferecida !== null && agora - oferecida < LEMBRETE_OFERTA_DEPOIS_MIN * 60_000) return false
    const metadeDoPrazo = oferecida !== null ? (expira - oferecida) / 2 : 0
    return expira - agora <= Math.max(LEMBRETE_OFERTA_HORAS * 3_600_000, metadeDoPrazo)
  })
  if (devidas.length === 0) return { avisados: 0 }

  // A vaga guardada ainda está de pé? (a equipe pode ter cancelado a reserva.)
  const vivas = new Set<string>()
  const cupomIds = devidas.map((e) => e.cupom_id as string)
  for (let i = 0; i < cupomIds.length; i += 200) {
    const { data: cupons } = await client
      .from("hospedagem_cupom")
      .select("id, cancelado, confirmar_ate")
      .in("id", cupomIds.slice(i, i + 200))
    for (const c of cupons ?? []) {
      const ate = txt(c.confirmar_ate)
      if (c.cancelado !== true && ate && new Date(ate).getTime() > agora) vivas.add(c.id as string)
    }
  }
  const pendentes = devidas.filter((e) => vivas.has(e.cupom_id as string))
  if (pendentes.length === 0) return { avisados: 0 }

  const [hoteis, cpfsDoCadastro, contexto] = await Promise.all([
    hoteisDaEntidade(amb),
    cpfDosCadastros(
      pendentes.filter((e) => !txt(e.cpf)).map((e) => txt(e.filiado_id)),
      amb
    ),
    amb.contexto ?? contextoDoTenant(tenantId, client),
  ])

  let avisados = 0
  for (const e of pendentes) {
    const cpf = txt(e.cpf) ?? cpfsDoCadastro.get(e.filiado_id as string)
    if (!cpf) continue
    const hotel = hoteis.get(e.hotel_id as string) ?? "hotel"
    const ate = dataHoraBR(new Date(e.oferta_expira_em as string))
    const periodo = `${dataBR(e.check_in as string)} a ${dataBR(e.check_out as string)}`
    const link = linkDaOferta(e.token as string)
    const url = `${contexto.origem}${link}`
    const r = await avisarFiliado(
      {
        cpf,
        evento: "hospedagem",
        assunto: "Sua vaga na hospedagem vence em breve — confirme",
        texto: `Sua vaga no ${hotel} para ${periodo} fica guardada só até ${ate}. Confirme para não perder.`,
        link,
        umaVez: true,
        html:
          tituloEmail("Sua vaga ainda espera a confirmação") +
          paragrafo(
            `A vaga no <strong>${escaparHtml(hotel)}</strong> para <strong>${periodo}</strong> continua guardada para você, mas ainda não foi confirmada.`
          ) +
          caixaAviso(
            `Confirme até <strong>${ate}</strong>. Sem confirmação, ela passa para a próxima pessoa da lista.`
          ) +
          botaoEmail(url, "Confirmar minha reserva") +
          linkReserva(url) +
          RODAPE_PREFERENCIAS,
      },
      { client, tenantId, contexto }
    )
    if (r) avisados++
  }
  return { avisados }
}
