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
export async function enviarTelegram(dados: {
  chatId: string | number
  texto: string
  formato?: "HTML" | "MarkdownV2" | null
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
      }),
    })
    return resposta.ok
  } catch (e) {
    console.error("Falha ao enviar Telegram:", e)
    return false
  }
}
