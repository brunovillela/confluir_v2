import "server-only"

import { textoValidade } from "@/lib/auth-email-constantes"
import { avisarChaveEmailRecusada } from "@/lib/db/email-avisos"
import { contaEnvioDaEntidade, esquecerContaEmail, marcarChaveEmailRecusada } from "@/lib/db/email-conta"
import { abrirRegistroEnvio, concluirRegistroEnvio, type ProvedorEmail } from "@/lib/db/email-envios"
import { emailContatoEntidade, nomeEntidade } from "@/lib/db/organizacao"
import { caixaAviso, COR, escaparHtml, layoutEmail } from "@/lib/email-layout"
import { marcaComEnvio } from "@/lib/email-processos"
import { chaveRecusada, entregar, type Credencial, type Mensagem } from "@/lib/email-provedores"
import { tenantAtual } from "@/lib/tenant"
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
  const sandbox = process.env.EMAIL_SANDBOX === "1"
  // Conta da plataforma (variáveis de ambiente) e, se houver, a da entidade (Gestão › E-mail).
  const chavePlataforma = process.env.EMAIL_PROVEDOR === "resend" ? process.env.RESEND_API_KEY : process.env.BREVO_API_KEY
  const plataforma: Credencial | null = chavePlataforma ? { provedor: process.env.EMAIL_PROVEDOR === "resend" ? "resend" : "brevo", chave: chavePlataforma } : null
  const remetentePlataforma = process.env.EMAIL_REMETENTE ?? null
  let emp: string | null = destino.contexto?.tenantId ?? null
  if (!emp) {
    try {
      emp = await tenantAtual()
    } catch {
      emp = null
    }
  }
  const contaEntidade = emp ? await contaEnvioDaEntidade(emp) : null
  // A conta da entidade só vale com chave legível e remetente próprio (o domínio da plataforma não está verificado nela).
  const daEntidade = Boolean(contaEntidade?.credencial && contaEntidade.remetenteEmail)
  const credencial = daEntidade ? contaEntidade!.credencial! : plataforma
  const remetente = daEntidade ? contaEntidade!.remetenteEmail! : remetentePlataforma
  const provedor: ProvedorEmail = !credencial || !remetente ? "nenhum" : credencial.provedor

  // Registro do envio (Gestão › E-mail): a linha nasce antes do provedor, e o
  // id vai no X-Mailin-custom para o webhook do Brevo achar a linha.
  const registro = await abrirRegistroEnvio({
    tenantId: destino.contexto?.tenantId,
    processo: destino.processo,
    detalhe: destino.detalhe,
    destinatario: destino.email,
    provedor,
    conta: daEntidade ? "entidade" : "plataforma",
    situacao: provedor === "nenhum" ? "sem_configuracao" : "enviando",
    anexos: destino.anexos?.length ?? 0,
  })
  // Barrado pela Gestão (módulo desligado, teto, cota ou endereço bloqueado): não sai.
  if (registro.barrado) return false
  if (!credencial || !remetente) return false

  const [entidade, emailContato, origem] = destino.contexto
    ? [destino.contexto.entidade, destino.contexto.emailContato, destino.contexto.origem]
    : await Promise.all([nomeEntidade(), emailContatoEntidade(), origemAtual()])
  const cabecalhos = { ...(destino.cabecalhos ?? {}) }
  if (registro.id) cabecalhos["X-Mailin-custom"] = marcaComEnvio(cabecalhos["X-Mailin-custom"], registro.id)

  const assunto = destino.assunto.replaceAll("{ENTIDADE}", entidade)
  const responder = (daEntidade && contaEntidade!.responderPara) || emailContato
  const rodape =
    `Enviado pelo Confluir em nome de ${escaparHtml(entidade)}.` +
    (responder ? " Para falar com a entidade, responda a este e-mail." : "")
  const htmlContent = layoutEmail({
    corpo: destino.html.replaceAll("{ENTIDADE}", entidade),
    logoUrl: `${origem}/logo-confluir-completa-dark.png`,
    preheader: escaparHtml(assunto),
    titulo: escaparHtml(assunto),
    rodape,
  })

  const mensagem = (doRemetente: string, nome: string): Mensagem => ({
    remetente: { email: doRemetente, nome },
    // Respostas vão para o contato da entidade (ou o endereço escolhido na Gestão); o envelope fica no domínio do remetente.
    responderPara: responder ? { email: responder, nome: entidade } : null,
    para: { email: destino.email, nome: destino.nome },
    assunto,
    html: htmlContent,
    cabecalhos,
    anexos: destino.anexos ?? [],
    sandbox,
  })

  // Testes: o Resend não tem modo sandbox — não enviamos nada.
  if (sandbox && credencial.provedor === "resend") {
    await concluirRegistroEnvio(registro, "teste")
    return true
  }

  const nomeExibicao = (daEntidade && contaEntidade!.remetenteNome) || `Confluir — ${entidade}`
  let r = await entregar(credencial, mensagem(remetente, nomeExibicao))
  // A conta da entidade recusou a chave (revogada, sem créditos): o e-mail não
  // pode se perder — sai pela plataforma, e a Gestão vê o erro na tela.
  if (daEntidade && chaveRecusada(r) && plataforma && remetentePlataforma && emp) {
    await marcarChaveEmailRecusada(emp, r.erro ?? "Chave recusada")
    esquecerContaEmail(emp)
    avisarChaveEmailRecusada(emp, r.erro ?? "Chave recusada.")
    r = await entregar(plataforma, mensagem(remetentePlataforma, `Confluir — ${entidade}`))
    await concluirRegistroEnvio(
      registro,
      r.ok ? (sandbox ? "teste" : "enviado") : "falhou",
      r.ok ? "A conta da entidade recusou a chave; saiu pela conta da plataforma." : r.erro,
      "plataforma"
    )
    return r.ok
  }
  await concluirRegistroEnvio(registro, r.ok ? (sandbox ? "teste" : "enviado") : "falhou", r.erro)
  return r.ok
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
