/**
 * Regras PURAS do bot do Telegram para resolver pendências na conversa
 * (31/10/2026) e do menu de comandos — sem banco nem rede, para os testes de
 * unidade (tests/unidade/telegram-pendencias.spec.ts). O que decide de fato
 * fica em lib/telegram-pendencias.ts, que chama as MESMAS funções de domínio
 * do painel.
 *
 * Botão de pendência: `pd:<tipo>:<ação>:<uuid>` (até 44 bytes; o Telegram
 * aceita 64). Ação "a" é a positiva (autorizar, aprovar, confirmar…); "d" é a
 * negativa e pede o motivo numa resposta à mensagem do bot.
 */

/** Tipos de pendência com botão. Duas letras: cabe no callback_data. */
export const TIPOS_PENDENCIA = {
  fe: { nome: "férias", sim: "✅ Autorizar", nao: null },
  di: { nome: "diária", sim: "✅ Aprovar", nao: "↩️ Reprovar" },
  dr: { nome: "remessa de diárias", sim: "✅ Aprovar remessa", nao: "↩️ Devolver" },
  re: { nome: "reembolso do ACT", sim: "✅ Aprovar", nao: "↩️ Reprovar" },
  fa: { nome: "falta justificada", sim: "✅ Autorizar", nao: "↩️ Recusar" },
  vi: { nome: "pedido de viagem", sim: "🧳 Abrir atendimento", nao: "✖️ Recusar" },
  db: { nome: "alteração de dados bancários", sim: "✅ Confirmar", nao: "✖️ Recusar" },
  cx: { nome: "despesa no seu caixa", sim: "✅ Reconhecer", nao: "✖️ Não reconhecer" },
} as const

export type TipoPendencia = keyof typeof TIPOS_PENDENCIA
export type AcaoPendencia = "a" | "d"

/** Motivo mínimo para a ação negativa (o painel pede de 1 a 5 letras conforme a tela). */
export const MOTIVO_MINIMO = 5

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
const RE_DADO = new RegExp(`^pd:(${Object.keys(TIPOS_PENDENCIA).join("|")}):([ad]):(${UUID})$`, "i")
const RE_REF = new RegExp(`pd:(${Object.keys(TIPOS_PENDENCIA).join("|")}):d:(${UUID})`, "i")

export function dadoPendencia(tipo: TipoPendencia, acao: AcaoPendencia, id: string): string {
  return `pd:${tipo}:${acao}:${id.toLowerCase()}`
}

export function lerDadoPendencia(dado: string): { tipo: TipoPendencia; acao: AcaoPendencia; id: string } | null {
  const m = RE_DADO.exec(dado.trim())
  if (!m) return null
  return { tipo: m[1].toLowerCase() as TipoPendencia, acao: m[2].toLowerCase() as AcaoPendencia, id: m[3].toLowerCase() }
}

type Botao = { texto: string; dado?: string; url?: string }

/** A linha de botões de ação de uma pendência. */
export function botoesPendencia(tipo: TipoPendencia, id: string): Botao[][] {
  const def = TIPOS_PENDENCIA[tipo]
  const linha: Botao[] = [{ texto: def.sim, dado: dadoPendencia(tipo, "a", id) }]
  if (def.nao) linha.push({ texto: def.nao, dado: dadoPendencia(tipo, "d", id) })
  return [linha]
}

/**
 * O Telegram recusa a mensagem inteira se um botão de link não for um
 * endereço público (localhost, http, IP da rede). Só HTTPS com domínio.
 */
export function urlDeBotaoValida(url: string | null | undefined): url is string {
  if (!url) return false
  try {
    const u = new URL(url)
    if (u.protocol !== "https:") return false
    const host = u.hostname.toLowerCase()
    if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".test")) return false
    if (/^[\d.]+$/.test(host) || host.includes(":")) return false
    return host.includes(".")
  } catch {
    return false
  }
}

export const TEXTO_ABRIR_NO_PAINEL = "🔗 Abrir no painel"

/**
 * Mensagem do aviso com o botão "Abrir no painel": com endereço válido, o
 * link vira botão (e sai do texto); sem, o link fica no texto, como antes.
 */
export function mensagemComPainel(
  texto: string,
  url: string | null,
  botoes: Botao[][] = []
): { texto: string; botoes: Botao[][] } {
  if (urlDeBotaoValida(url)) return { texto, botoes: [...botoes, [{ texto: TEXTO_ABRIR_NO_PAINEL, url }]] }
  return { texto: url ? `${texto}\n${url}` : texto, botoes }
}

/** Texto do pedido de motivo. A referência no fim liga a resposta ao item. */
export function pedidoDeMotivo(tipo: TipoPendencia, id: string): string {
  const def = TIPOS_PENDENCIA[tipo]
  const acao = (def.nao ?? "").replace(/^\S+\s/, "").toLowerCase()
  return [
    `Escreva o <b>motivo</b> para ${acao} — ${def.nome} — respondendo a esta mensagem (ou /cancelar). Ele vai para quem pediu.`,
    "",
    `<i>Ref. ${dadoPendencia(tipo, "d", id)}</i>`,
  ].join("\n")
}

/** Da mensagem do bot a que a pessoa respondeu, o item do motivo. */
export function lerRefDoMotivo(textoRespondido: string | null | undefined): { tipo: TipoPendencia; id: string } | null {
  const m = RE_REF.exec(textoRespondido ?? "")
  return m ? { tipo: m[1].toLowerCase() as TipoPendencia, id: m[2].toLowerCase() } : null
}

/** Escapa o texto puro para o parse_mode HTML do Telegram. */
export function escaparHtmlTelegram(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

// ── Menu de comandos (botão "/" do Telegram) e /ajuda ──────────────────────

export type ComandoBot = { comando: string; descricao: string; argumento?: string }

/**
 * Fonte ÚNICA dos comandos: a /ajuda lista estes, e o setMyCommands
 * (/api/telegram/comandos, cron diário do vercel.json) registra os mesmos
 * no menu do Telegram.
 */
export const COMANDOS_BOT: readonly ComandoBot[] = [
  { comando: "pendencias", descricao: "o que espera por você, com botões para resolver" },
  { comando: "aprovar", descricao: "ordens de pagamento na sua alçada, com botões para aprovar ou devolver" },
  { comando: "contracheque", descricao: "seu contracheque mais recente" },
  { comando: "ferias", descricao: "seu saldo de férias" },
  { comando: "diarias", descricao: "suas últimas solicitações de diária" },
  { comando: "viagem", descricao: "pedir passagem (aérea ou rodoviária) e hospedagem" },
  { comando: "viagens", descricao: "seus últimos pedidos de viagem" },
  { comando: "informes", descricao: "seus informes de rendimentos" },
  { comando: "asos", descricao: "seus atestados de saúde ocupacional" },
  { comando: "carros", descricao: "frota agora: disponíveis por sede e com quem estão os carros" },
  { comando: "filiado", argumento: "nome ou CPF", descricao: "consulta de filiação" },
  { comando: "eu", descricao: "confirma sua conta vinculada" },
  { comando: "ajuda", descricao: "lista os comandos" },
]

/** As linhas de comando da /ajuda (HTML do Telegram). */
export function linhasDaAjuda(): string[] {
  return COMANDOS_BOT.map(
    (c) => `/${c.comando}${c.argumento ? ` &lt;${c.argumento}&gt;` : ""} — ${c.descricao}`
  )
}

/** Corpo do setMyCommands: descrição de 3 a 256 caracteres, comando em minúsculas. */
export function comandosParaOTelegram(): { command: string; description: string }[] {
  return COMANDOS_BOT.map((c) => {
    const d = `${c.argumento ? `${c.descricao} (/${c.comando} ${c.argumento})` : c.descricao}`
    return { command: c.comando, description: (d.charAt(0).toUpperCase() + d.slice(1)).slice(0, 256) }
  })
}

// ── Reembolso aprovado pelo bot ─────────────────────────────────────────────

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
]

/**
 * Contracheque em que o reembolso aprovado é pago — o mesmo padrão da tela de
 * avaliação: o do mês até o dia 15 (corte do movimento da folha); depois, o
 * do mês seguinte.
 */
export function contrachequeSugerido(hojeISO: string): { mes: string; ano: string } {
  const [a, m, d] = hojeISO.slice(0, 10).split("-").map(Number)
  const seguinte = d > 15
  const mes = seguinte ? (m % 12) + 1 : m
  const ano = seguinte && m === 12 ? a + 1 : a
  return { mes: MESES[mes - 1], ano: String(ano) }
}
