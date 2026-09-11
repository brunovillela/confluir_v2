import "server-only"

import { textoValidade } from "@/lib/auth-email-constantes"
import { emailContatoEntidade, nomeEntidade } from "@/lib/db/organizacao"
import { caixaAviso, COR, escaparHtml, layoutEmail } from "@/lib/email-layout"
import { origemAtual } from "@/lib/tenant-url"

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
 *
 * Identidade visual: `html` é só o MIOLO (parágrafos, botões de
 * src/lib/email-layout.ts). Todo e-mail sai embrulhado na moldura do Confluir
 * — faixa navy com o logo, cartão branco, rodapé com a entidade. Não mande um
 * documento HTML completo aqui.
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

  const [entidade, emailContato, origem] = await Promise.all([
    nomeEntidade(),
    emailContatoEntidade(),
    origemAtual(),
  ])

  const assunto = destino.assunto.replaceAll("{ENTIDADE}", entidade)
  const rodape =
    `Enviado pelo Confluir em nome de ${escaparHtml(entidade)}.` +
    (emailContato ? " Para falar com a entidade, responda a este e-mail." : "")
  const htmlContent = layoutEmail({
    corpo: destino.html.replaceAll("{ENTIDADE}", entidade),
    logoUrl: `${origem}/logo-confluir-completa-dark.png`,
    preheader: escaparHtml(assunto),
    titulo: escaparHtml(assunto),
    rodape,
  })

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
        subject: assunto,
        htmlContent,
      }),
    })
    return resposta.ok
  } catch {
    // Falha de rede no provedor não pode derrubar a ação que originou o email.
    return false
  }
}

/**
 * Aviso de prazo dos e-mails de convite e de redefinição enviados pelo app.
 * `origemTenant` é o subdomínio do tenant, onde fica o "Esqueci minha senha"
 * — que também serve para quem nunca ativou o convite.
 */
export function avisoValidadeLinkHtml(origemTenant: string): string {
  return caixaAviso(
    `Este link vale por <strong>${textoValidade()}</strong> e funciona uma única vez. Se ele vencer, peça um novo em <a href="${origemTenant}/login/recuperar-senha" style="color:${COR.laranjaAcao};">Esqueci minha senha</a>, informando este mesmo e-mail.`
  )
}
