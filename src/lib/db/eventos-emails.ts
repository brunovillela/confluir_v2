import "server-only"

import { type Evento } from "@/lib/db/eventos"
import { enviarEmail } from "@/lib/email"
import { formatarData, formatarDataHora } from "@/lib/formato"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"
import { origemAtual } from "@/lib/tenant-url"

/**
 * E-mails de etapa do evento.
 *
 * Ficam todos aqui para o texto não se espalhar por actions: quem for revisar
 * o que a entidade escreve para o inscrito lê um arquivo só.
 *
 * Duas regras que valem para todos:
 *
 * 1. O envio NUNCA derruba a ação que o originou. Aprovar uma inscrição vale
 *    mesmo que o Brevo esteja fora do ar.
 * 2. Em compensação, o resultado é CONTADO e devolvido. O gestor precisa saber
 *    que 3 pessoas não foram avisadas — o silêncio de um e-mail que não saiu é
 *    pior que o erro na tela.
 */

/** Quantos por vez. Sequencial demora demais num evento grande; tudo de uma
 * vez estoura o limite do provedor. */
const LOTE = 20

export type ResultadoAvisos = {
  enviados: number
  semEmail: number
  falharam: number
}

function frase(r: ResultadoAvisos): string {
  const partes = [`${r.enviados} aviso(s) enviado(s)`]
  if (r.semEmail > 0) partes.push(`${r.semEmail} sem e-mail cadastrado`)
  if (r.falharam > 0) partes.push(`${r.falharam} falharam no envio`)
  return partes.join(", ") + "."
}

export function descreverAvisos(r: ResultadoAvisos): string {
  return frase(r)
}

function assinatura(): string {
  return `<p style="color:#666;font-size:13px">{ENTIDADE}</p>`
}

function quando(evento: Evento): string {
  if (!evento.inicio) return ""
  const fim = evento.termino ? ` até ${formatarDataHora(evento.termino)}` : ""
  return `${formatarDataHora(evento.inicio)}${fim}`
}

function blocoEvento(evento: Evento): string {
  const linhas = [
    `<strong>${evento.titulo ?? "Evento"}</strong>`,
    quando(evento),
    evento.local ?? "",
    evento.endereco ?? "",
  ].filter(Boolean)
  return `<p style="border-left:3px solid #FF5722;padding-left:12px">${linhas.join("<br>")}</p>`
}

type Destinatario = {
  id: string
  nome: string | null
  email: string | null
  token: string | null
}

async function inscritosDoEvento(
  eventoId: string,
  situacoes: string[]
): Promise<Destinatario[]> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data } = await admin
    .from("eventos_inscricoes")
    .select("id, nome, email, token")
    .eq("emp_proprietaria_id", emp)
    .eq("evento_id", eventoId)
    .in("situacao", situacoes)
    .is("anonimizada_em", null)
  return (data ?? []).map((i) => ({
    id: i.id as string,
    nome: (i.nome as string | null) ?? null,
    email: (i.email as string | null) ?? null,
    token: (i.token as string | null) ?? null,
  }))
}

/** Dispara em lotes e conta o que aconteceu com cada um. */
async function disparar(
  pessoas: Destinatario[],
  monta: (p: Destinatario) => { assunto: string; html: string }
): Promise<ResultadoAvisos> {
  const resultado: ResultadoAvisos = { enviados: 0, semEmail: 0, falharam: 0 }
  const comEmail = pessoas.filter((p) => {
    if (!p.email) resultado.semEmail++
    return Boolean(p.email)
  })

  for (let i = 0; i < comEmail.length; i += LOTE) {
    const lote = comEmail.slice(i, i + LOTE)
    const saidas = await Promise.all(
      lote.map((p) => {
        const { assunto, html } = monta(p)
        return enviarEmail({
          email: p.email as string,
          nome: p.nome,
          assunto,
          html,
        })
      })
    )
    for (const ok of saidas) {
      if (ok) resultado.enviados++
      else resultado.falharam++
    }
  }
  return resultado
}

function saudacao(nome: string | null): string {
  return `<p>Olá${nome ? `, ${nome.split(" ")[0]}` : ""}!</p>`
}

function linkDaInscricao(origem: string, token: string | null): string {
  if (!token) return ""
  const url = `${origem}/inscricao/${token}`
  return `<p>Acompanhe pela página da sua inscrição:<br><a href="${url}">${url}</a></p>`
}

// ── Avaliação de uma inscrição ───────────────────────────────────────────────

/**
 * Avisa a pessoa do resultado da avaliação. Recusa e lista de espera levam o
 * motivo: negar sem dizer por quê é o que gera o telefonema no dia seguinte.
 */
export async function avisarAvaliacao(
  evento: Evento,
  inscricaoId: string,
  decisao: "confirmada" | "recusada" | "lista_espera",
  motivo: string | null
): Promise<ResultadoAvisos> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data } = await admin
    .from("eventos_inscricoes")
    .select("id, nome, email, token")
    .eq("emp_proprietaria_id", emp)
    .eq("id", inscricaoId)
    .maybeSingle()
  if (!data) return { enviados: 0, semEmail: 0, falharam: 0 }

  const origem = await origemAtual()
  const pessoa: Destinatario = {
    id: data.id as string,
    nome: (data.nome as string | null) ?? null,
    email: (data.email as string | null) ?? null,
    token: (data.token as string | null) ?? null,
  }

  return disparar([pessoa], (p) => {
    const bloco = blocoEvento(evento)
    const link = linkDaInscricao(origem, p.token)
    const porque = motivo
      ? `<p><strong>Motivo:</strong> ${motivo}</p>`
      : ""

    if (decisao === "confirmada") {
      return {
        assunto: `Inscrição confirmada — ${evento.titulo ?? "evento"}`,
        html: `${saudacao(p.nome)}<p>Sua inscrição está <strong>confirmada</strong>.</p>${bloco}${link}<p>Leve um documento com foto — na entrada conferimos quem chega.</p>${assinatura()}`,
      }
    }
    if (decisao === "lista_espera") {
      return {
        assunto: `Você está na lista de espera — ${evento.titulo ?? "evento"}`,
        html: `${saudacao(p.nome)}<p>As vagas se esgotaram e sua inscrição entrou na <strong>lista de espera</strong>. Se alguém desistir, avisamos você.</p>${bloco}${porque}${link}${assinatura()}`,
      }
    }
    return {
      assunto: `Sobre a sua inscrição — ${evento.titulo ?? "evento"}`,
      html: `${saudacao(p.nome)}<p>Sua inscrição <strong>não foi aprovada</strong>.</p>${porque}${bloco}<p>Se achar que houve engano, responda esta mensagem ou procure a secretaria.</p>${assinatura()}`,
    }
  })
}

// ── Mudança no evento ────────────────────────────────────────────────────────

/**
 * Cancelamento e adiamento. Vai para quem está confirmado, pendente OU na
 * lista de espera: quem esperava vaga também organizou o dia em torno disso.
 */
export async function avisarMudancaDoEvento(
  evento: Evento,
  situacao: "cancelado" | "adiado",
  motivo: string | null
): Promise<ResultadoAvisos> {
  const pessoas = await inscritosDoEvento(evento.id, [
    "confirmada",
    "pendente",
    "lista_espera",
  ])
  if (pessoas.length === 0) return { enviados: 0, semEmail: 0, falharam: 0 }

  const origem = await origemAtual()
  const porque = motivo ? `<p><strong>Motivo:</strong> ${motivo}</p>` : ""

  return disparar(pessoas, (p) => {
    if (situacao === "cancelado") {
      return {
        assunto: `Evento cancelado — ${evento.titulo ?? "evento"}`,
        html: `${saudacao(p.nome)}<p>O evento em que você se inscreveu foi <strong>cancelado</strong>.</p>${blocoEvento(evento)}${porque}<p>Sua inscrição não é mais necessária — não há nada a fazer.</p>${assinatura()}`,
      }
    }

    const nova = evento.adiado_para
      ? `<p>A nova data é <strong>${formatarData(evento.adiado_para)}</strong>. Sua inscrição continua valendo.</p>`
      : `<p>Ainda <strong>não há nova data</strong>. Avisaremos assim que houver, e sua inscrição continua valendo.</p>`

    return {
      assunto: `Evento adiado — ${evento.titulo ?? "evento"}`,
      html: `${saudacao(p.nome)}<p>O evento em que você se inscreveu foi <strong>adiado</strong>.</p>${blocoEvento(evento)}${porque}${nova}${linkDaInscricao(origem, p.token)}${assinatura()}`,
    }
  })
}

// ── RSVP ─────────────────────────────────────────────────────────────────────

/**
 * Pergunta quem vem, dias antes. Só para CONFIRMADOS: perguntar a quem ainda
 * não tem vaga garantida seria promessa que não podemos cumprir.
 *
 * Reenviar é seguro — quem já respondeu fica de fora, para a pessoa não
 * receber duas vezes a mesma pergunta.
 */
export async function enviarRsvp(
  evento: Evento,
  reenviar: boolean
): Promise<ResultadoAvisos> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  let q = admin
    .from("eventos_inscricoes")
    .select("id, nome, email, token, rsvp_enviado_em, rsvp_respondido_em")
    .eq("emp_proprietaria_id", emp)
    .eq("evento_id", evento.id)
    .eq("situacao", "confirmada")
    .is("anonimizada_em", null)
    .is("rsvp_respondido_em", null)
  if (!reenviar) q = q.is("rsvp_enviado_em", null)

  const { data } = await q
  const pessoas: Destinatario[] = (data ?? []).map((i) => ({
    id: i.id as string,
    nome: (i.nome as string | null) ?? null,
    email: (i.email as string | null) ?? null,
    token: (i.token as string | null) ?? null,
  }))
  if (pessoas.length === 0) return { enviados: 0, semEmail: 0, falharam: 0 }

  const origem = await origemAtual()
  const resultado = await disparar(pessoas, (p) => ({
    assunto: `Você vem? — ${evento.titulo ?? "evento"}`,
    // Um botão só, que leva à página da inscrição, onde estão o "vou" e o
    // "não vou". Dois botões AQUI dariam a impressão de responder pelo
    // e-mail — e não responderiam: leitor de e-mail abre link sozinho para
    // pré-visualizar, e a resposta viria de um robô, não da pessoa.
    html: `${saudacao(p.nome)}<p>Estamos organizando o espaço e a alimentação e precisamos saber quem vem.</p>${blocoEvento(evento)}<p><a href="${origem}/inscricao/${p.token}" style="background:#FF5722;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;display:inline-block">Responder se vou</a></p><p style="font-size:13px;color:#666">Dizer que não vem libera sua vaga para quem está na fila — é melhor do que faltar sem avisar.</p>${assinatura()}`,
  }))

  // Carimba só quem realmente recebeu, para o reenvio saber onde parou.
  if (resultado.enviados > 0) {
    const agora = new Date().toISOString()
    await admin
      .from("eventos_inscricoes")
      .update({ rsvp_enviado_em: agora })
      .in(
        "id",
        pessoas.filter((p) => p.email).map((p) => p.id)
      )
    // Carimbo no EVENTO: é o que impede o varredor de disparar de novo.
    await admin
      .from("eventos")
      .update({ rsvp_enviado_lote_em: agora })
      .eq("emp_proprietaria_id", emp)
      .eq("id", evento.id)
  }

  return resultado
}
