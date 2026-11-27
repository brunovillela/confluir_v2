import "server-only"

import { textoValidade } from "@/lib/auth-email-constantes"
import { abrirRegistroEnvio, concluirRegistroEnvio, type ProvedorEmail } from "@/lib/db/email-envios"
import { emailContatoEntidade, nomeEntidade } from "@/lib/db/organizacao"
import { caixaAviso, COR, escaparHtml, layoutEmail } from "@/lib/email-layout"
import { marcaComEnvio } from "@/lib/email-processos"
import { origemAtual } from "@/lib/tenant-url"

/**
 * Envio de email transacional pelo provedor configurado.
 *   EMAIL_PROVEDOR=resend  → API do Resend (RESEND_API_KEY)
 *   (padrão)               → API do Brevo (BREVO_API_KEY)
 * Requer no .env.local:
 *   BREVO_API_KEY=xkeysib-…      (Brevo → SMTP & API → API Keys)
 *   RESEND_API_KEY=re_…          (Resend → API Keys), quando EMAIL_PROVEDOR=resend
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
/**
 * Identidade da entidade no e-mail. Normalmente vem da requisição (o tenant do
 * subdomínio); os envios automáticos (agendador, sem requisição) passam a
 * identidade do tenant que estão processando.
 */
export type ContextoEmail = {
  /** Entidade que envia (agendador): é a ela que o registro do envio pertence. */
  tenantId?: string
  entidade: string
  emailContato: string | null
  /** Origem do tenant (https://<slug>.confluir.online), para o logo. */
  origem: string
}

/**
 * O e-mail com um código de confirmação não saiu. Registra o fato SEM o
 * código: em produção o log da Vercel é lido por quem tem acesso ao projeto e
 * fica retido, e um código ali é um acesso em texto claro (achado S13 da
 * avaliação de 03/10). O código só é impresso no sandbox de desenvolvimento,
 * que era o único motivo de ele ir para o log.
 */
export function registrarCodigoNaoEnviado(fluxo: string, email: string, codigo: string): void {
  const mascarado = email.replace(/^(.).*(@.*)$/, "$1***$2")
  if (process.env.NODE_ENV !== "production" && process.env.EMAIL_SANDBOX === "1") {
    console.info(`[${fluxo}] (sandbox) código de ${mascarado}: ${codigo}`)
    return
  }
  console.warn(`[${fluxo}] e-mail do código não saiu para ${mascarado}`)
}

export async function enviarEmail(destino: {
  /**
   * Processo que envia (catálogo em lib/email-processos.ts): é por ele que a
   * Gestão › E-mail agrupa os envios.
   */
  processo: string
  /** Complemento técnico, sem dado pessoal (ex.: o evento do aviso). */
  detalhe?: string
  email: string
  nome?: string | null
  assunto: string
  html: string
  /** Sem ele, a identidade sai da requisição atual. */
  contexto?: ContextoEmail
  /** Cabeçalhos extras (ex.: List-Unsubscribe da mala direta). */
  cabecalhos?: Record<string, string>
  /** Arquivos anexos (ex.: o PDF da ordem de compra), em base64. */
  anexos?: { nome: string; base64: string }[]
}): Promise<boolean> {
  const usaResend = process.env.EMAIL_PROVEDOR === "resend"
  const chave = usaResend ? process.env.RESEND_API_KEY : process.env.BREVO_API_KEY
  const remetente = process.env.EMAIL_REMETENTE
  const provedor: ProvedorEmail = !chave || !remetente ? "nenhum" : usaResend ? "resend" : "brevo"
  const sandbox = process.env.EMAIL_SANDBOX === "1"

  // Registro do envio (Gestão › E-mail): a linha nasce antes do provedor, e o
  // id vai no X-Mailin-custom para o webhook do Brevo achar a linha.
  const registro = await abrirRegistroEnvio({
    tenantId: destino.contexto?.tenantId,
    processo: destino.processo,
    detalhe: destino.detalhe,
    destinatario: destino.email,
    provedor,
    situacao: provedor === "nenhum" ? "sem_configuracao" : "enviando",
    anexos: destino.anexos?.length ?? 0,
  })
  // Barrado pela Gestão (módulo desligado, teto, cota ou endereço bloqueado): não sai.
  if (registro.barrado) return false
  if (!chave || !remetente) return false

  const [entidade, emailContato, origem] = destino.contexto
    ? [destino.contexto.entidade, destino.contexto.emailContato, destino.contexto.origem]
    : await Promise.all([nomeEntidade(), emailContatoEntidade(), origemAtual()])
  const cabecalhos = { ...(destino.cabecalhos ?? {}) }
  if (registro.id) cabecalhos["X-Mailin-custom"] = marcaComEnvio(cabecalhos["X-Mailin-custom"], registro.id)

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

  // Resend (EMAIL_PROVEDOR=resend): mesmo conteúdo, outro provedor. Existe
  // para migrar o canal do app sem mexer em código — só na variável.
  if (process.env.EMAIL_PROVEDOR === "resend") {
    // Testes: o Resend não tem modo sandbox — não enviamos nada.
    if (sandbox) {
      await concluirRegistroEnvio(registro, "teste")
      return true
    }
    try {
      const resposta = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${chave}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: `Confluir — ${entidade} <${remetente}>`,
          to: [destino.email],
          subject: assunto,
          html: htmlContent,
          ...(emailContato ? { reply_to: emailContato } : {}),
          ...(Object.keys(cabecalhos).length ? { headers: cabecalhos } : {}),
          ...(destino.anexos?.length
            ? { attachments: destino.anexos.map((a) => ({ filename: a.nome, content: a.base64 })) }
            : {}),
        }),
      })
      await concluirRegistroEnvio(registro, resposta.ok ? "enviado" : "falhou", resposta.ok ? null : `Resend recusou (HTTP ${resposta.status})`)
      return resposta.ok
    } catch {
      await concluirRegistroEnvio(registro, "falhou", "Falha de rede ao falar com o Resend")
      return false
    }
  }

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
        ...(destino.anexos?.length
          ? { attachment: destino.anexos.map((a) => ({ name: a.nome, content: a.base64 })) }
          : {}),
        // Testes: o Brevo aceita e descarta, sem entregar (EMAIL_SANDBOX=1).
        ...(sandbox || Object.keys(cabecalhos).length
          ? {
              headers: {
                ...cabecalhos,
                ...(sandbox ? { "X-Sib-Sandbox": "drop" } : {}),
              },
            }
          : {}),
      }),
    })
    await concluirRegistroEnvio(
      registro,
      resposta.ok ? (sandbox ? "teste" : "enviado") : "falhou",
      resposta.ok ? null : `Brevo recusou (HTTP ${resposta.status})`
    )
    return resposta.ok
  } catch {
    // Falha de rede no provedor não pode derrubar a ação que originou o email.
    await concluirRegistroEnvio(registro, "falhou", "Falha de rede ao falar com o Brevo")
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
