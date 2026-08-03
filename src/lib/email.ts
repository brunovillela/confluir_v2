import "server-only"

/**
 * Envio de email transacional via Brevo (mesmo provedor do SMTP de auth).
 * Requer no .env.local:
 *   BREVO_API_KEY=xkeysib-…      (Brevo → SMTP & API → API Keys)
 *   EMAIL_REMETENTE=nao-responda@sindipetronf.org.br
 *
 * Sem as variáveis o envio é PULADO silenciosamente (retorna false) — as
 * notificações internas do sistema não dependem do email.
 */
export async function enviarEmail(destino: {
  email: string
  nome?: string | null
  assunto: string
  html: string
}): Promise<boolean> {
  const chave = process.env.BREVO_API_KEY
  const remetente = process.env.EMAIL_REMETENTE
  if (!chave || !remetente) return false

  try {
    const resposta = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": chave,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        sender: { email: remetente, name: "Confluir — Sindipetro-NF" },
        to: [{ email: destino.email, name: destino.nome ?? undefined }],
        subject: destino.assunto,
        htmlContent: destino.html,
      }),
    })
    return resposta.ok
  } catch {
    // Falha de rede no provedor não pode derrubar a ação que originou o email.
    return false
  }
}
