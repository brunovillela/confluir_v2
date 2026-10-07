import "server-only"

/**
 * Camada única de acesso ao bot do Telegram (como `lib/email.ts`/`lib/ia.ts`).
 * Sem `TELEGRAM_BOT_TOKEN` tudo degrada: `enviarTelegram` retorna false e nunca
 * lança — então o resto do app funciona igual antes do bot ser configurado.
 */

const API = "https://api.telegram.org"

/** Bot configurado? (token presente). */
export function telegramConfigurado(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN)
}

/** @usuario do bot, para montar o deep link `t.me/<bot>?start=<codigo>`. */
export function nomeDoBot(): string | null {
  const u = process.env.TELEGRAM_BOT_USERNAME?.trim().replace(/^@/, "")
  return u || null
}

/** Deep link de vínculo (ou null se o @usuario do bot não estiver na env). */
export function linkVinculo(codigo: string): string | null {
  const bot = nomeDoBot()
  return bot ? `https://t.me/${bot}?start=${codigo}` : null
}

/**
 * Envia uma mensagem pelo bot. Best-effort: retorna false se não configurado ou
 * em falha (nunca lança). `formato` HTML por padrão; passe null p/ texto puro.
 */
/** Botão inline: callback (`dado`, até 64 bytes) ou link (`url`). */
export type BotaoTelegram = { texto: string; dado?: string; url?: string }

function tecladoInline(botoes?: BotaoTelegram[][]) {
  if (!botoes || botoes.length === 0) return undefined
  return {
    inline_keyboard: botoes.map((linha) =>
      linha.map((b) => (b.url ? { text: b.texto, url: b.url } : { text: b.texto, callback_data: (b.dado ?? "").slice(0, 64) }))
    ),
  }
}

export async function enviarTelegram(dados: {
  chatId: string | number
  texto: string
  formato?: "HTML" | "MarkdownV2" | null
  /** Botões inline (onda 4, D3): aprovar/devolver sem sair da conversa. */
  botoes?: BotaoTelegram[][]
  /**
   * Teclado de resposta (substitui os botões inline): "pedir contato" ou
   * "remover teclado" — link único de votação (07/10/2026).
   */
  teclado?: "pedir_contato" | "remover"
}): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) return false
  try {
    const resposta = await fetch(`${API}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: dados.chatId,
        text: dados.texto,
        parse_mode:
          dados.formato === null ? undefined : (dados.formato ?? "HTML"),
        disable_web_page_preview: true,
        reply_markup:
          dados.teclado === "pedir_contato"
            ? {
                keyboard: [[{ text: "📱 Compartilhar meu número", request_contact: true }]],
                one_time_keyboard: true,
                resize_keyboard: true,
              }
            : dados.teclado === "remover"
              ? { remove_keyboard: true }
              : tecladoInline(dados.botoes),
      }),
    })
    return resposta.ok
  } catch (e) {
    console.error("Falha ao enviar Telegram:", e)
    return false
  }
}

/** Fecha o "relógio" do botão tocado; `texto` aparece como aviso curto. */
export async function responderCallbackTelegram(callbackId: string, texto?: string, alerta = false): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) return
  try {
    await fetch(`${API}/bot${token}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callback_query_id: callbackId, text: texto?.slice(0, 200), show_alert: alerta }),
    })
  } catch (e) {
    console.error("Falha ao responder callback do Telegram:", e)
  }
}

/** Troca o texto da mensagem que tinha os botões (e os remove), para a conversa não ficar com botão morto. */
export async function editarMensagemTelegram(chatId: string | number, messageId: number, texto: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) return
  try {
    await fetch(`${API}/bot${token}/editMessageText`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, message_id: messageId, text: texto, parse_mode: "HTML", disable_web_page_preview: true }),
    })
  } catch (e) {
    console.error("Falha ao editar mensagem do Telegram:", e)
  }
}
