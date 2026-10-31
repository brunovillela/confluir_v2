/**
 * Roteiro do /viagem no bot do Telegram: o pedido de passagem (aérea ou
 * rodoviária) e hospedagem em perguntas curtas, uma por vez. Puro (sem banco
 * nem Telegram) para dar para testar: recebe o passo atual e a resposta,
 * devolve o próximo passo. Quem grava e manda as mensagens é
 * lib/telegram-viagem.ts; a validação final é a mesma do formulário
 * (validarItensViagem).
 *
 * Fica de fora (continua pelo painel): convidado, mais de ida e volta,
 * bagagem extra, necessidades especiais, horário de chegada e evento.
 */

import {
  ROTULO_MODAL,
  type CriterioHorario,
  type ModalPassagem,
} from "@/lib/viagens-constantes"

export type PassoViagem =
  | "tipo"
  | "origem"
  | "destino"
  | "ida"
  | "volta"
  | "horario_ida"
  | "horario_volta"
  | "hotel"
  | "cidade"
  | "checkin"
  | "checkout"
  | "motivo"
  | "departamento"
  | "confirmar"

export type DadosViagemBot = {
  quadro: "funcionario" | "diretor"
  /** Departamento sugerido (o do diretor); nulo para funcionário. */
  departamentoPadrao: string | null
  /** "Outro departamento" tocado: mostra a lista inteira. */
  listarDepartamentos?: boolean
  modal?: ModalPassagem | null
  origem?: string
  destino?: string
  ida?: string
  volta?: string | null
  horarioIda?: { criterio: CriterioHorario; hora: string } | null
  horarioVolta?: { criterio: CriterioHorario; hora: string } | null
  hotel?: boolean
  cidade?: string
  checkin?: string
  checkout?: string
  motivo?: string
  /** undefined = ainda não respondeu; null = deixar para a equipe. */
  departamentoId?: string | null
}

export type EstadoViagemBot = { passo: PassoViagem; dados: DadosViagemBot }

export type BotaoViagem = { texto: string; dado: string }

export type PerguntaViagem = { texto: string; botoes?: BotaoViagem[][] }

export type ContextoViagem = {
  /** "aaaa-mm-dd" de hoje em São Paulo. */
  hoje: string
  departamentos: { id: string; nome: string }[]
  antecedenciaDias?: number | null
}

/** Resposta da pessoa: texto digitado ou o `dado` de um botão (sem o "vg:"). */
export type EntradaViagem = { texto: string } | { botao: string }

export const PREFIXO_CALLBACK_VIAGEM = "vg:"

const LIMITE_TEXTO = 200

export function escaparHtmlTelegram(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

// ── Datas e horários digitados ─────────────────────────────────────────────

function somarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

function dataValida(a: number, m: number, d: number): string | null {
  const dt = new Date(Date.UTC(a, m - 1, d))
  if (dt.getUTCFullYear() !== a || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null
  return dt.toISOString().slice(0, 10)
}

/**
 * "12/11", "12/11/2026", "12-11-26", "hoje", "amanhã" → "aaaa-mm-dd". Sem o
 * ano, vale o deste ano — ou o do próximo, se a data deste ano já passou.
 */
export function lerDataDigitada(bruto: string, hoje: string): string | null {
  const s = bruto.trim().toLowerCase()
  if (s === "hoje") return hoje
  if (s === "amanha" || s === "amanhã") return somarDias(hoje, 1)
  const m = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2}|\d{4}))?$/.exec(s)
  if (!m) return null
  const dia = Number(m[1])
  const mes = Number(m[2])
  const anoHoje = Number(hoje.slice(0, 4))
  if (m[3]) {
    const ano = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])
    return dataValida(ano, mes, dia)
  }
  const desteAno = dataValida(anoHoje, mes, dia)
  if (!desteAno) return null
  return desteAno < hoje ? dataValida(anoHoje + 1, mes, dia) : desteAno
}

/**
 * "10h", "10:30", "até 10h", "depois das 14h", "a partir de 14:00" →
 * critério + "HH:MM". Sem palavra, vale "até".
 */
export function lerHorarioDigitado(
  bruto: string
): { criterio: CriterioHorario; hora: string } | null {
  const s = bruto.trim().toLowerCase()
  const m = /(\d{1,2})(?:\s*(?::|h)\s*(\d{2})?)?\s*(?:h|hs|horas?)?\s*$/.exec(s)
  if (!m) return null
  const h = Number(m[1])
  const min = m[2] ? Number(m[2]) : 0
  if (h > 23 || min > 59) return null
  const criterio: CriterioHorario = /depois|a partir|ap[oó]s|apartir/.test(s) ? "depois" : "ate"
  return { criterio, hora: `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}` }
}

export function dataCurta(iso: string): string {
  const [a, m, d] = iso.split("-")
  return `${d}/${m}/${a}`
}

function horarioCurto(h: { criterio: CriterioHorario; hora: string } | null | undefined): string {
  if (!h) return "sem preferência de horário"
  return h.criterio === "depois" ? `saída a partir de ${h.hora}` : `saída até ${h.hora}`
}

// ── Perguntas ──────────────────────────────────────────────────────────────

function b(texto: string, dado: string): BotaoViagem {
  return { texto, dado: `${PREFIXO_CALLBACK_VIAGEM}${dado}` }
}

const CANCELAR = [b("Cancelar pedido", "x")]

export function perguntaDoPasso(estado: EstadoViagemBot, ctx: ContextoViagem): PerguntaViagem {
  const d = estado.dados
  switch (estado.passo) {
    case "tipo":
      return {
        texto: "<b>Pedido de viagem</b>\nO que você precisa?",
        botoes: [
          [b("✈️ Passagem aérea", "t:aerea"), b("🚌 Rodoviária", "t:rodoviaria")],
          [b("🏨 Só hospedagem", "t:hotel")],
          CANCELAR,
        ],
      }
    case "origem":
      return { texto: "De qual cidade você sai? <i>Ex.: Rio de Janeiro</i>" }
    case "destino":
      return { texto: "Para qual cidade você vai?" }
    case "ida":
      return { texto: "Qual a data da ida? <i>Ex.: 12/11, amanhã</i>" }
    case "volta":
      return {
        texto: "Qual a data da volta?",
        botoes: [[b("Só ida", "sv")]],
      }
    case "horario_ida":
      return {
        texto: `Preferência de horário na ida (${dataCurta(d.ida ?? ctx.hoje)})? <i>Ex.: até 10h, depois das 14h</i>`,
        botoes: [[b("Sem preferência", "sh")]],
      }
    case "horario_volta":
      return {
        texto: `E na volta (${dataCurta(d.volta ?? ctx.hoje)})?`,
        botoes: [[b("Sem preferência", "sh")]],
      }
    case "hotel":
      return {
        texto: `Precisa de hospedagem em ${escaparHtmlTelegram(d.destino ?? "destino")}?`,
        botoes: [[b("Sim", "h:s"), b("Não", "h:n")]],
      }
    case "cidade":
      return { texto: "Em qual cidade é a hospedagem?" }
    case "checkin":
      return { texto: "Data do check-in? <i>Ex.: 12/11</i>" }
    case "checkout":
      return { texto: "Data do check-out?" }
    case "motivo":
      return { texto: "Qual o motivo da viagem? <i>Ex.: reunião com a empresa X, congresso Y</i>" }
    case "departamento": {
      const padrao = ctx.departamentos.find((x) => x.id === d.departamentoPadrao)
      if (padrao && !d.listarDepartamentos) {
        return {
          texto: "Qual departamento banca a viagem?",
          botoes: [[b(`✅ ${padrao.nome}`.slice(0, 60), `d:${padrao.id}`)], [b("Outro departamento", "do")]],
        }
      }
      const linhas: BotaoViagem[][] = []
      for (let i = 0; i < ctx.departamentos.length; i += 2) {
        linhas.push(ctx.departamentos.slice(i, i + 2).map((x) => b(x.nome.slice(0, 60), `d:${x.id}`)))
      }
      linhas.push([b("Não sei — a equipe define", "d:-")])
      return { texto: "Qual departamento banca a viagem?", botoes: linhas }
    }
    case "confirmar":
      return {
        texto: [resumoViagemBot(d, ctx), "", "Confere?"].join("\n"),
        botoes: [[b("✅ Confirmar pedido", "ok")], CANCELAR],
      }
  }
}

/** O pedido como a pessoa vai conferir antes de confirmar. */
export function resumoViagemBot(d: DadosViagemBot, ctx: ContextoViagem): string {
  const linhas = ["<b>Seu pedido de viagem</b>"]
  if (d.modal && d.origem && d.destino && d.ida) {
    const modal = ROTULO_MODAL[d.modal]
    const de = escaparHtmlTelegram(d.origem)
    const para = escaparHtmlTelegram(d.destino)
    linhas.push(`• ${modal}: ${de} → ${para}, ${dataCurta(d.ida)} (${horarioCurto(d.horarioIda)})`)
    if (d.volta) linhas.push(`• ${modal}: ${para} → ${de}, ${dataCurta(d.volta)} (${horarioCurto(d.horarioVolta)})`)
  }
  if (d.cidade && d.checkin && d.checkout) {
    linhas.push(`• Hospedagem em ${escaparHtmlTelegram(d.cidade)}: ${dataCurta(d.checkin)} a ${dataCurta(d.checkout)}`)
  }
  if (d.motivo) linhas.push(`Motivo: ${escaparHtmlTelegram(d.motivo)}`)
  const depto = ctx.departamentos.find((x) => x.id === d.departamentoId)
  linhas.push(`Departamento: ${depto ? escaparHtmlTelegram(depto.nome) : "a equipe define"}`)
  const inicio = d.ida ?? d.checkin
  if (ctx.antecedenciaDias && inicio && inicio < somarDias(ctx.hoje, ctx.antecedenciaDias)) {
    linhas.push("", `⚠️ Em cima da hora: a entidade pede ${ctx.antecedenciaDias} dias de antecedência. O pedido segue, mas pode não dar tempo.`)
  }
  return linhas.join("\n")
}

// ── Respostas ──────────────────────────────────────────────────────────────

export type ResultadoViagem =
  | { estado: EstadoViagemBot }
  | { erro: string }
  | { cancelar: true }
  | { confirmar: true }

function textoDe(e: EntradaViagem): string | null {
  return "texto" in e ? e.texto.trim() : null
}

function botaoDe(e: EntradaViagem): string | null {
  return "botao" in e ? e.botao : null
}

function lerTextoCurto(e: EntradaViagem, nome: string): { valor: string } | { erro: string } {
  const t = textoDe(e)
  if (!t) return { erro: `Escreva ${nome}.` }
  if (t.startsWith("/")) return { erro: `Escreva ${nome} (ou /cancelar).` }
  return { valor: t.slice(0, LIMITE_TEXTO) }
}

function lerData(e: EntradaViagem, ctx: ContextoViagem, minima: string, rotulo: string): { valor: string } | { erro: string } {
  const t = textoDe(e)
  const data = t ? lerDataDigitada(t, ctx.hoje) : null
  if (!data) return { erro: "Não entendi a data. Escreva como 12/11 ou 12/11/2026." }
  if (data < ctx.hoje) return { erro: "Essa data já passou." }
  if (data < minima) return { erro: `A data precisa ser a partir de ${dataCurta(minima)} (${rotulo}).` }
  return { valor: data }
}

function ir(passo: PassoViagem, dados: DadosViagemBot): { estado: EstadoViagemBot } {
  return { estado: { passo, dados } }
}

export function iniciarViagemBot(
  quadro: "funcionario" | "diretor",
  departamentoPadrao: string | null
): EstadoViagemBot {
  return { passo: "tipo", dados: { quadro, departamentoPadrao } }
}

/** Uma resposta da pessoa no passo atual → o próximo passo (ou o erro). */
export function responderViagemBot(
  estado: EstadoViagemBot,
  entrada: EntradaViagem,
  ctx: ContextoViagem
): ResultadoViagem {
  const d = { ...estado.dados }
  const botao = botaoDe(entrada)
  const texto = textoDe(entrada)
  if (botao === "x" || texto === "/cancelar") return { cancelar: true }

  switch (estado.passo) {
    case "tipo": {
      if (botao === "t:aerea" || botao === "t:rodoviaria") {
        d.modal = botao === "t:aerea" ? "aerea" : "rodoviaria"
        return ir("origem", d)
      }
      if (botao === "t:hotel") {
        d.modal = null
        d.hotel = true
        return ir("cidade", d)
      }
      return { erro: "Toque numa das opções acima." }
    }
    case "origem": {
      const r = lerTextoCurto(entrada, "a cidade de saída")
      if ("erro" in r) return r
      d.origem = r.valor
      return ir("destino", d)
    }
    case "destino": {
      const r = lerTextoCurto(entrada, "a cidade de destino")
      if ("erro" in r) return r
      d.destino = r.valor
      return ir("ida", d)
    }
    case "ida": {
      const r = lerData(entrada, ctx, ctx.hoje, "hoje")
      if ("erro" in r) return r
      d.ida = r.valor
      return ir("volta", d)
    }
    case "volta": {
      if (botao === "sv") {
        d.volta = null
        return ir("horario_ida", d)
      }
      const r = lerData(entrada, ctx, d.ida ?? ctx.hoje, "a ida")
      if ("erro" in r) return r
      d.volta = r.valor
      return ir("horario_ida", d)
    }
    case "horario_ida":
    case "horario_volta": {
      let h: { criterio: CriterioHorario; hora: string } | null = null
      if (botao !== "sh") {
        h = texto ? lerHorarioDigitado(texto) : null
        if (!h) return { erro: "Não entendi o horário. Escreva como “até 10h” ou “depois das 14h”." }
      }
      if (estado.passo === "horario_ida") {
        d.horarioIda = h
        return ir(d.volta ? "horario_volta" : "hotel", d)
      }
      d.horarioVolta = h
      return ir("hotel", d)
    }
    case "hotel": {
      if (botao === "h:n") {
        d.hotel = false
        d.cidade = undefined
        d.checkin = undefined
        d.checkout = undefined
        return ir("motivo", d)
      }
      if (botao !== "h:s") return { erro: "Toque em Sim ou Não." }
      d.hotel = true
      d.cidade = d.destino
      d.checkin = d.ida
      // Com volta, o hotel vai da ida à volta; só ida, pergunta o check-out.
      if (d.volta && d.ida && d.volta > d.ida) {
        d.checkout = d.volta
        return ir("motivo", d)
      }
      return ir("checkout", d)
    }
    case "cidade": {
      const r = lerTextoCurto(entrada, "a cidade da hospedagem")
      if ("erro" in r) return r
      d.cidade = r.valor
      return ir("checkin", d)
    }
    case "checkin": {
      const r = lerData(entrada, ctx, ctx.hoje, "hoje")
      if ("erro" in r) return r
      d.checkin = r.valor
      return ir("checkout", d)
    }
    case "checkout": {
      const minima = somarDias(d.checkin ?? ctx.hoje, 1)
      const r = lerData(entrada, ctx, minima, "o dia seguinte ao check-in")
      if ("erro" in r) return r
      d.checkout = r.valor
      return ir("motivo", d)
    }
    case "motivo": {
      const r = lerTextoCurto(entrada, "o motivo da viagem")
      if ("erro" in r) return r
      d.motivo = r.valor
      return ir("departamento", d)
    }
    case "departamento": {
      if (botao === "do") {
        d.listarDepartamentos = true
        return ir("departamento", d)
      }
      if (botao === "d:-") {
        d.departamentoId = null
        return ir("confirmar", d)
      }
      const id = botao?.startsWith("d:") ? botao.slice(2) : null
      if (!id || !ctx.departamentos.some((x) => x.id === id)) {
        return { erro: "Toque num dos departamentos acima." }
      }
      d.departamentoId = id
      return ir("confirmar", d)
    }
    case "confirmar": {
      if (botao === "ok") return { confirmar: true }
      return { erro: "Toque em Confirmar pedido ou Cancelar pedido." }
    }
  }
}

/**
 * Os itens no formato que o formulário manda (o mesmo JSON que
 * validarItensViagem confere): ida, volta e hospedagem.
 */
export function itensDaViagemBot(d: DadosViagemBot): Record<string, unknown>[] {
  const itens: Record<string, unknown>[] = []
  const trecho = (origem: string, destino: string, data: string, h: DadosViagemBot["horarioIda"]) => ({
    tipo: "passagem",
    modal: d.modal,
    origem,
    destino,
    data,
    saidaCriterio: h?.criterio ?? null,
    saidaHora: h?.hora ?? null,
    bagagemExtra: false,
    observacoes: "Pedido pelo Telegram.",
  })
  if (d.modal && d.origem && d.destino && d.ida) {
    itens.push(trecho(d.origem, d.destino, d.ida, d.horarioIda))
    if (d.volta) itens.push(trecho(d.destino, d.origem, d.volta, d.horarioVolta))
  }
  if (d.hotel && d.cidade && d.checkin && d.checkout) {
    itens.push({ tipo: "hospedagem", cidade: d.cidade, checkin: d.checkin, checkout: d.checkout, observacoes: "Pedido pelo Telegram." })
  }
  return itens
}
