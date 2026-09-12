import "server-only"

import { buscarFiliadoPorCpf } from "@/lib/contas"
import { registrosDoCpf } from "@/lib/db/filiado-portal"
import { buscarHotel, contratoDoHotel, type Hotel } from "@/lib/db/hospedagem"
import { conferirCondicoesHospedagem } from "@/lib/db/hospedagem-condicoes"
import { enviarEmail } from "@/lib/email"
import {
  botaoEmail,
  caixaAviso,
  escaparHtml,
  linkReserva,
  paragrafo,
  tituloEmail,
} from "@/lib/email-layout"
import {
  REGRA_NAO_COMPARECIMENTO_PADRAO,
  alocarEstadia,
  avaliarNaoComparecimento,
  dataBR,
  dataHoraBR,
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
  type Sexo,
} from "@/lib/hospedagem-garantida-constantes"
import { createAdminClient, createServiceClient } from "@/lib/supabase/admin"
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
 * Tempo: não há agendador frequente. Tudo que depende de horário (oferta da
 * lista de espera vencida, trava liberada, falta) é conferido na hora em que é
 * usado, e a lista de espera é processada quando alguém cancela, entra na
 * fila ou abre as telas de hospedagem.
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
async function cuponsQueOcupam(ids: string[]): Promise<Set<string>> {
  const ativos = new Set<string>()
  if (ids.length === 0) return ativos
  const admin = await createAdminClient()
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
  ignorarCupom?: string
): Promise<Ocupacao> {
  const ocupacao: Ocupacao = new Map()
  if (noites.length === 0) return ocupacao
  const admin = await createAdminClient()
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
  const ativos = await cuponsQueOcupam([
    ...new Set(linhas.map((l) => l.cupom_id as string)),
  ])
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

export async function lerRegraNaoComparecimento(): Promise<RegraNaoComparecimento> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("hospedagem_condicoes")
    .select(
      "punir_nao_comparecimento, nao_comparecimento_quantidade, nao_comparecimento_janela_meses, nao_comparecimento_penalidade, nao_comparecimento_periodo, nao_comparecimento_suspensao_dias"
    )
    .eq("emp_proprietaria_id", await tenantAtual())
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

/** Faltas contam por PESSOA (todos os registros do CPF). */
export async function conferirNaoComparecimento(p: {
  cpf: string | null
  registros: string[]
  checkIn: string
}): Promise<{ erro?: string }> {
  const regra = await lerRegraNaoComparecimento()
  if (!regra.ativa || p.registros.length === 0) return {}
  const admin = await createAdminClient()
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
          .eq("emp_proprietaria_id", await tenantAtual())
          .eq("cpf", p.cpf)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ])
  if (error) return {}
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
  const r = avaliarNaoComparecimento(regra, historico, liberadoEm, p.checkIn, new Date())
  return r.ok ? {} : { erro: r.motivo }
}

/** Condições da entidade + regra de não comparecimento. */
export async function conferirPodeReservar(p: {
  cpf: string | null
  registros: string[]
  checkIn: string
}): Promise<{ erro?: string }> {
  const condicoes = await conferirCondicoesHospedagem(p)
  if (condicoes.erro) return condicoes
  return conferirNaoComparecimento(p)
}

// ── Reserva ──────────────────────────────────────────────────────────────────

export type ResultadoReserva =
  | { ok: true; cupomId: string; token: string; quarto: number }
  | { ok: false; erro: string; semVaga?: boolean }

const MENSAGEM_SEXO =
  "Para reservar em hotel de demanda garantida, o sexo precisa estar informado no cadastro (Masculino ou Feminino). Atualize em Meu cadastro ou fale com o sindicato."

/**
 * Cria a reserva e escolhe o quarto. Não confere condições nem faltas — quem
 * chama faz isso antes (portal, painel e lista de espera têm mensagens
 * próprias). `confirmarAte` guarda a vaga de uma oferta da lista de espera.
 */
export async function reservarEstadia(p: {
  hotel: Hotel
  filiadoId: string
  registros: string[]
  sexo: string | null
  checkIn: string
  checkOut: string
  confirmarAte?: string | null
}): Promise<ResultadoReserva> {
  const { hotel } = p
  if (!ehGarantida(hotel)) return { ok: false, erro: "Este hotel não é de demanda garantida." }
  if (!sexoValido(p.sexo)) return { ok: false, erro: MENSAGEM_SEXO }
  if (!DATA.test(p.checkIn) || !DATA.test(p.checkOut)) {
    return { ok: false, erro: "Informe as datas de check-in e check-out." }
  }
  if (p.checkOut <= p.checkIn) {
    return { ok: false, erro: "O check-out precisa ser depois do check-in." }
  }
  if (p.checkIn < hojeEmSP()) {
    return { ok: false, erro: "O check-in precisa ser de hoje em diante." }
  }

  const cfg = configDoHotel(hotel)
  const noites = noitesDaEstadia(p.checkIn, p.checkOut)
  if (noites.length > cfg.maxNoites) {
    return {
      ok: false,
      erro: `Neste hotel a estadia é de até ${cfg.maxNoites} noite${cfg.maxNoites === 1 ? "" : "s"}.`,
    }
  }
  if (cfg.vagasPorQuarto < 1 || noites.some((n) => quartosNaNoite(cfg, n) < 1)) {
    return {
      ok: false,
      erro: "Este hotel não tem quartos dedicados para todas as noites escolhidas.",
      semVaga: true,
    }
  }

  const contrato = await contratoDoHotel(hotel.id)
  if (!contrato || !contrato.vigente) {
    return { ok: false, erro: "Este hotel está fora do período de convênio no momento." }
  }
  const ultimaNoite = noites[noites.length - 1]
  if (contrato.vigenciaTermino && ultimaNoite > contrato.vigenciaTermino) {
    return {
      ok: false,
      erro: `A última noite precisa ser até o fim da vigência do convênio (${dataBR(contrato.vigenciaTermino)}).`,
    }
  }

  const admin = await createAdminClient()
  if (p.registros.length > 0) {
    const { data: sobreposta, error: erroSob } = await admin
      .from("hospedagem_cupom")
      .select("id")
      .in("filiado_id", p.registros)
      .eq("reserva_garantida", true)
      .eq("cancelado", false)
      .lt("check_in", p.checkOut)
      .gt("check_out", p.checkIn)
      .limit(1)
    if (erroSob && faltaTabela(erroSob)) return { ok: false, erro: AVISO_SQL }
    if ((sobreposta ?? []).length > 0) {
      return { ok: false, erro: "Já existe uma reserva sua que coincide com essas datas." }
    }
  }

  const emp = await tenantAtual()
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
    const ocupacao = await ocupacaoDoHotel(hotel.id, noites)
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

    const { data: resultado, error: erroRpc } = await createServiceClient().rpc(
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

export async function enviarEmailReservaConfirmada(p: {
  cpf: string | null
  hotelNome: string
  checkIn: string
  checkOut: string
}): Promise<void> {
  if (!p.cpf) return
  const filiado = await buscarFiliadoPorCpf(p.cpf)
  if (!filiado?.email) return
  const origem = await origemAtual()
  const link = `${origem}/portal/hospedagem`
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
  return (data ?? []).map((c) => {
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
    }
  })
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
  hotelNome: string | null
  checkIn: string
  checkOut: string
  situacao: "aguardando" | "oferecida" | "confirmada" | "expirada" | "cancelada"
  motivo: string | null
  ofertaExpiraEm: string | null
}

export async function esperasDaPessoa(
  registros: string[],
  hoteis: Hotel[]
): Promise<EsperaDaPessoa[]> {
  if (registros.length === 0) return []
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("hospedagem_espera")
    .select("id, token, hotel_id, check_in, check_out, situacao, motivo, oferta_expira_em, created_at")
    .in("filiado_id", registros)
    .order("created_at", { ascending: false })
    .limit(50)
  if (error) return []
  const nomes = new Map(hoteis.map((h) => [h.id, h.nome]))
  return (data ?? []).map((e) => ({
    id: e.id as string,
    token: e.token as string,
    hotelNome: nomes.get(e.hotel_id as string) ?? null,
    checkIn: e.check_in as string,
    checkOut: e.check_out as string,
    situacao: e.situacao as EsperaDaPessoa["situacao"],
    motivo: txt(e.motivo),
    ofertaExpiraEm: txt(e.oferta_expira_em),
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

/**
 * Processa a lista de espera de um hotel:
 *  1. ofertas vencidas → a reserva guardada cai e a espera vira "expirada";
 *  2. por ordem de chegada, quem ainda atende às condições e cabe no hotel
 *     recebe a vaga GUARDADA (reserva com `confirmar_ate`) e um e-mail com o
 *     botão de confirmação.
 * Sem `forcar`, roda no máximo a cada 5 minutos por hotel.
 */
export async function processarFilaDeEspera(
  hotel: Hotel,
  opcoes: { forcar?: boolean } = {}
): Promise<void> {
  if (!ehGarantida(hotel)) return
  const agora = new Date()
  if (
    !opcoes.forcar &&
    hotel.fila_processada_em &&
    agora.getTime() - new Date(hotel.fila_processada_em).getTime() < 5 * 60_000
  ) {
    return
  }
  const admin = await createAdminClient()
  const { error: erroMarca } = await admin
    .from("hospedagem_hotel")
    .update({ fila_processada_em: agora.toISOString() })
    .eq("id", hotel.id)
  if (erroMarca && faltaTabela(erroMarca)) return

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

  // 2. Fila, por ordem de chegada.
  const { data: fila } = await admin
    .from("hospedagem_espera")
    .select("id, filiado_id, cpf, sexo, check_in, check_out")
    .eq("hotel_id", hotel.id)
    .eq("situacao", "aguardando")
    .order("created_at", { ascending: true })
    .limit(50)
  const cfg = configDoHotel(hotel)
  const hoje = hojeEmSP(agora)

  for (const e of fila ?? []) {
    const checkIn = e.check_in as string
    const checkOut = e.check_out as string
    const marcar = (situacao: string, motivo: string) =>
      admin
        .from("hospedagem_espera")
        .update({ situacao, motivo, updated_at: new Date().toISOString() })
        .eq("id", e.id as string)

    if (checkIn < hoje) {
      await marcar("expirada", "A data do check-in passou sem vaga.")
      continue
    }
    const cpf = txt(e.cpf)
    const registros = cpf ? await registrosDoCpf(cpf) : [e.filiado_id as string]
    const pode = await conferirPodeReservar({ cpf, registros, checkIn })
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
    })
    if (!r.ok) {
      if (!r.semVaga) await marcar("cancelada", r.erro)
      continue
    }

    await admin
      .from("hospedagem_espera")
      .update({
        situacao: "oferecida",
        cupom_id: r.cupomId,
        oferecida_em: new Date().toISOString(),
        oferta_expira_em: confirmarAte,
        updated_at: new Date().toISOString(),
      })
      .eq("id", e.id as string)

    const { data: esperaAtual } = await admin
      .from("hospedagem_espera")
      .select("token")
      .eq("id", e.id as string)
      .maybeSingle()
    if (cpf && esperaAtual?.token) {
      const filiado = await buscarFiliadoPorCpf(cpf)
      if (filiado?.email) {
        const origem = await origemAtual()
        const link = `${origem}/hospedagem/oferta/${esperaAtual.token as string}`
        await enviarEmail({
          email: filiado.email,
          nome: filiado.nome_completo,
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
        })
      }
    }
  }
}

/** Processa a fila de todos os hotéis de demanda garantida (telas de hospedagem). */
export async function processarFilasDosHoteis(hoteis: Hotel[]): Promise<void> {
  for (const h of hoteis.filter(ehGarantida)) {
    try {
      await processarFilaDeEspera(h)
    } catch {
      // Processar a fila nunca pode derrubar a tela que o chamou.
    }
  }
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

export async function confirmarOferta(token: string): Promise<{ erro?: string }> {
  if (!UUID.test(token)) return { erro: "Link inválido." }
  const admin = await createAdminClient()
  const { data: e } = await admin
    .from("hospedagem_espera")
    .select("id, hotel_id, cpf, situacao, cupom_id, check_in, check_out")
    .eq("token", token)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (!e) return { erro: "Link inválido." }
  if (e.situacao === "confirmada") return {}
  if (e.situacao !== "oferecida" || !e.cupom_id) {
    return { erro: "Esta oferta não está mais disponível." }
  }
  const { data: cupom } = await admin
    .from("hospedagem_cupom")
    .select("id, cancelado, confirmar_ate")
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
  await enviarEmailReservaConfirmada({
    cpf: txt(e.cpf),
    hotelNome: hotel?.nome ?? "hotel",
    checkIn: e.check_in as string,
    checkOut: e.check_out as string,
  })
  return {}
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
    const { data: resultado, error } = await createServiceClient().rpc(
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
