import "server-only"

import { cpfConfiavel } from "@/lib/cpf"
import { lerEmLotes } from "@/lib/db/comum"
import { type Evento } from "@/lib/db/eventos"
import { avisarFiliado } from "@/lib/db/portal-avisos"
import { enviarEmail } from "@/lib/email"
import { formatarData, formatarDataHora } from "@/lib/formato"
import { normalizarPreferenciasPortal } from "@/lib/portal-avisos-eventos"
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
  /** Filiados que desligaram o e-mail de "Eventos": avisados só no portal (A120). */
  soNoPortal?: number
}

function frase(r: ResultadoAvisos): string {
  const partes = [`${r.enviados} aviso(s) enviado(s)`]
  if (r.semEmail > 0) partes.push(`${r.semEmail} sem e-mail cadastrado`)
  if (r.soNoPortal) partes.push(`${r.soNoPortal} só no portal (desligaram o e-mail de eventos)`)
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
  cpf: string | null
}

async function inscritosDoEvento(
  eventoId: string,
  situacoes: string[]
): Promise<Destinatario[]> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  // PostgREST corta em 1.000 linhas: sem os lotes, o aviso de cancelamento
  // não chegava a quem passasse do milésimo inscrito.
  let data: Record<string, unknown>[] = []
  try {
    data = await lerEmLotes((de, ate) =>
      admin
        .from("eventos_inscricoes")
        .select("id, nome, email, token, cpf")
        .eq("emp_proprietaria_id", emp)
        .eq("evento_id", eventoId)
        .in("situacao", situacoes)
        .is("anonimizada_em", null)
        .order("id")
        .range(de, ate)
    )
  } catch {
    data = []
  }
  return data.map((i) => ({
    id: i.id as string,
    nome: (i.nome as string | null) ?? null,
    email: (i.email as string | null) ?? null,
    token: (i.token as string | null) ?? null,
    cpf: (i.cpf as string | null) ?? null,
  }))
}

/**
 * Sino do portal para quem tem CPF (o e-mail desta ação sai por `disparar`).
 * O link leva à inscrição, não à lista (mesmo endereço de
 * `linkDaInscricaoNoPortal`); `umaVez` serve ao que pode ser reenviado (RSVP).
 */
async function sinoDoPortal(
  pessoas: Destinatario[],
  texto: string,
  evento: Evento,
  umaVez = false
): Promise<void> {
  const comCpf = pessoas.filter((p) => p.cpf)
  // Dez por vez: um a um, o RSVP de um evento grande prendia a tela por minutos.
  for (let i = 0; i < comCpf.length; i += 10) {
    await Promise.all(
      comCpf.slice(i, i + 10).map((p) =>
        avisarFiliado({
          cpf: p.cpf as string,
          evento: "eventos",
          texto: `${texto} — ${evento.titulo ?? "evento"}`,
          link: `/portal/eventos#inscricao-${p.id}`,
          soSino: true,
          umaVez,
          nome: p.nome,
          email: p.email,
        })
      )
    )
  }
}

/**
 * CPFs que desligaram o e-mail de "Eventos" nas preferências do portal (A120):
 * para eles o aviso fica só no sino, que `sinoDoPortal` já gravou. Quem não
 * tem preferência gravada (não filiado, ou filiado que nunca mexeu) segue
 * recebendo; falha na leitura não corta o e-mail de ninguém.
 */
async function emailDeEventosDesligado(pessoas: Destinatario[]): Promise<Set<string>> {
  const desligados = new Set<string>()
  const cpfs = [...new Set(pessoas.map((p) => cpfConfiavel(p.cpf)).filter((c): c is string => Boolean(c)))]
  if (cpfs.length === 0) return desligados
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  for (let i = 0; i < cpfs.length; i += 200) {
    const { data, error } = await admin
      .from("portal_avisos_preferencias")
      .select("cpf, email_prefs")
      .eq("emp_proprietaria_id", emp)
      .in("cpf", cpfs.slice(i, i + 200))
    if (error) break
    for (const linha of data ?? []) {
      if (!normalizarPreferenciasPortal(linha.email_prefs).eventos) desligados.add(String(linha.cpf))
    }
  }
  return desligados
}

/** Dispara em lotes e conta o que aconteceu com cada um. */
async function disparar(
  pessoas: Destinatario[],
  monta: (p: Destinatario) => { assunto: string; html: string }
): Promise<ResultadoAvisos> {
  const resultado: ResultadoAvisos = { enviados: 0, semEmail: 0, falharam: 0 }
  const desligados = await emailDeEventosDesligado(pessoas)
  const comEmail = pessoas.filter((p) => {
    if (!p.email) {
      resultado.semEmail++
      return false
    }
    const cpf = cpfConfiavel(p.cpf)
    if (cpf && desligados.has(cpf)) {
      resultado.soNoPortal = (resultado.soNoPortal ?? 0) + 1
      return false
    }
    return true
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
    .select("id, nome, email, token, cpf")
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
    cpf: (data.cpf as string | null) ?? null,
  }

  await sinoDoPortal(
    [pessoa],
    decisao === "confirmada"
      ? "Sua inscrição foi confirmada"
      : decisao === "lista_espera"
        ? "Sua inscrição entrou na lista de espera"
        : "Sua inscrição não foi aprovada",
    evento
  )

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

  await sinoDoPortal(pessoas, situacao === "cancelado" ? "Evento cancelado" : "Evento adiado", evento)

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
  // Montada de novo a cada lote: o builder é mutável.
  const montar = () => {
    let q = admin
      .from("eventos_inscricoes")
      .select("id, nome, email, token, cpf, rsvp_enviado_em, rsvp_respondido_em")
      .eq("emp_proprietaria_id", emp)
      .eq("evento_id", evento.id)
      .eq("situacao", "confirmada")
      .is("anonimizada_em", null)
      .is("rsvp_respondido_em", null)
    if (!reenviar) q = q.is("rsvp_enviado_em", null)
    return q
  }

  // PostgREST corta em 1.000 linhas: a pergunta tem de ir a TODOS os
  // confirmados, não só aos primeiros mil.
  let data: Record<string, unknown>[] = []
  try {
    data = await lerEmLotes((de, ate) => montar().order("id").range(de, ate))
  } catch {
    data = []
  }
  const pessoas: Destinatario[] = data.map((i) => ({
    id: i.id as string,
    nome: (i.nome as string | null) ?? null,
    email: (i.email as string | null) ?? null,
    token: (i.token as string | null) ?? null,
    cpf: (i.cpf as string | null) ?? null,
  }))
  if (pessoas.length === 0) return { enviados: 0, semEmail: 0, falharam: 0 }

  // A pergunta também vai ao sino (A122) — o filiado responde no próprio
  // portal. `umaVez`: o reenvio não empilha a mesma pergunta.
  await sinoDoPortal(pessoas, "Você vem? Diga se vai comparecer", evento, true)

  const origem = await origemAtual()
  const resultado = await disparar(pessoas, (p) => ({
    assunto: `Você vem? — ${evento.titulo ?? "evento"}`,
    // Um botão só, que leva à página da inscrição, onde estão o "vou" e o
    // "não vou". Dois botões AQUI dariam a impressão de responder pelo
    // e-mail — e não responderiam: leitor de e-mail abre link sozinho para
    // pré-visualizar, e a resposta viria de um robô, não da pessoa.
    html: `${saudacao(p.nome)}<p>Estamos organizando o espaço e a alimentação e precisamos saber quem vem.</p>${blocoEvento(evento)}<p><a href="${origem}/inscricao/${p.token}" style="background:#FF5722;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;display:inline-block">Responder se vou</a></p><p style="font-size:13px;color:#666">Dizer que não vem libera sua vaga para quem está na fila — é melhor do que faltar sem avisar.</p>${assinatura()}`,
  }))

  // Carimba só quem realmente recebeu, para o reenvio saber onde parou —
  // inclusive quem recebeu só no portal por ter desligado o e-mail.
  if (resultado.enviados > 0 || (resultado.soNoPortal ?? 0) > 0) {
    const agora = new Date().toISOString()
    // Em lotes de 200 ids: milhares num `.in` estouram a URL.
    const enviados = pessoas.filter((p) => p.email).map((p) => p.id)
    for (let i = 0; i < enviados.length; i += 200) {
      await admin
        .from("eventos_inscricoes")
        .update({ rsvp_enviado_em: agora })
        .in("id", enviados.slice(i, i + 200))
    }
    // Carimbo no EVENTO: é o que impede o varredor de disparar de novo.
    await admin
      .from("eventos")
      .update({ rsvp_enviado_lote_em: agora })
      .eq("emp_proprietaria_id", emp)
      .eq("id", evento.id)
  }

  return resultado
}
