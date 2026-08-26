import "server-only"

import { emailContatoEntidade, nomeEntidade } from "@/lib/db/organizacao"

/**
 * Envio de email transacional via Brevo (mesmo provedor do SMTP de auth).
 * Requer no .env.local:
 *   BREVO_API_KEY=xkeysib-…      (Brevo → SMTP & API → API Keys)
 *   EMAIL_REMETENTE=nao-responda@sindipetronf.org.br
 *
 * Sem as variáveis o envio é PULADO silenciosamente (retorna false) — as
 * notificações internas do sistema não dependem do email.
 *
 * Multitenant: o nome da entidade NÃO é hardcoded. Os templates usam o token
 * `{ENTIDADE}` (assunto e html) e o remetente é "Confluir — <Entidade>";
 * ambos são resolvidos aqui via `nomeEntidade()` (data-driven pelo tenant). O
 * envelope (endereço remetente) fica no domínio limpo da plataforma; a
 * identidade do tenant vai no nome e no reply-to (e-mail de contato da org),
 * então respostas voltam para o sindicato certo.
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

  const [entidade, emailContato] = await Promise.all([
    nomeEntidade(),
    emailContatoEntidade(),
  ])

  try {
    const resposta = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": chave,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        sender: { email: remetente, name: `Confluir — ${entidade}` },
        to: [{ email: destino.email, name: destino.nome ?? undefined }],
        // Reply-to no e-mail de contato do tenant (quando houver); envelope
        // segue no domínio limpo. Sem contato, o Brevo usa o próprio sender.
        ...(emailContato
          ? { replyTo: { email: emailContato, name: entidade } }
          : {}),
        subject: destino.assunto.replaceAll("{ENTIDADE}", entidade),
        htmlContent: destino.html.replaceAll("{ENTIDADE}", entidade),
      }),
    })
    return resposta.ok
  } catch {
    // Falha de rede no provedor não pode derrubar a ação que originou o email.
    return false
  }
}
