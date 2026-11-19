"use server"

import { revalidatePath } from "next/cache"
import { headers } from "next/headers"

import { requirePermissao } from "@/lib/auth"
import { obterCongresso, type Congresso } from "@/lib/db/congressos"
import { buscarNaMesa, type PessoaMesa } from "@/lib/db/congressos-dia"
import {
  alterarMocao,
  assinar,
  criarMocao,
  decidirHabilitacao,
  mocaoPorCodigo,
  participantePeloLink,
  protocolar,
  regrasDasMocoes,
  retirarAssinatura,
  retirarMocao,
  type ContextoMocao,
  type SituacaoMocao,
} from "@/lib/db/congressos-mocoes"
import { tenantAtual } from "@/lib/tenant"

/**
 * Congressos — ações das moções (Fase 4): pelo painel (comissão, mesa da
 * plenária e a estação da mesa de credenciamento) e pelo link pessoal de
 * quem apresenta ou assina.
 */

type Resp = { erro?: string; ok?: string }
export type DadosMocaoForm = { tipo: string | null; titulo: string; destinatario: string | null; texto: string; unidadeId: string | null }

async function congresso(id: string): Promise<Congresso> {
  const c = await obterCongresso(id)
  if (!c) throw new Error("Congresso não encontrado.")
  return c
}

async function doPainel(congressoId: string, alternativas = ["congressos_gestao"]): Promise<ContextoMocao> {
  const s = await requirePermissao("congressos_relatoria", alternativas)
  return {
    c: await congresso(congressoId),
    tenantId: await tenantAtual(),
    autor: { nome: s.usuario.nome_guerra || s.usuario.nome_completo || s.usuario.email || "Painel", usuarioId: s.usuario.id },
  }
}

async function doLink(token: string) {
  const tenantId = await tenantAtual()
  const p = await participantePeloLink(token, tenantId)
  if (!p) return null
  const c = await obterCongresso(p.congressoId)
  if (!c) return null
  return { p, ctx: { c, tenantId, autor: { nome: p.nome } } as ContextoMocao }
}

async function origemDaRequisicao() {
  const h = await headers()
  return {
    ip: (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || null,
    navegador: h.get("user-agent"),
  }
}

function revalidarPainel(congressoId: string) {
  revalidatePath(`/painel/representacao/congressos/${congressoId}`, "layout")
}
function revalidarLink(token: string) {
  revalidatePath(`/congresso/eu/${token}`, "layout")
}

// ── Painel ──────────────────────────────────────────────────────────────────

export async function criarMocaoPainelAction(congressoId: string, d: DadosMocaoForm): Promise<Resp & { id?: string }> {
  const ctx = await doPainel(congressoId)
  const r = await criarMocao(ctx, { ...d, proponenteId: null })
  revalidarPainel(congressoId)
  return r.erro ? { erro: r.erro } : { ok: `Moção ${r.numero} criada.`, id: r.id }
}

export async function alterarMocaoPainelAction(congressoId: string, id: string, d: DadosMocaoForm): Promise<Resp> {
  const ctx = await doPainel(congressoId)
  const r = await alterarMocao(ctx, id, d)
  revalidarPainel(congressoId)
  return r.erro ? { erro: r.erro } : { ok: r.novaVersao ? "Texto alterado: versão nova, as assinaturas anteriores deixaram de contar." : "Moção alterada." }
}

/**
 * Estação da mesa ou papel: a mesa identifica a pessoa (QR do crachá, CPF ou
 * nome) e lança a assinatura. Com mais de uma pessoa encontrada, devolve a
 * lista para escolher.
 */
export async function lancarAssinaturaAction(
  congressoId: string,
  mocaoId: string,
  d: { texto?: string; participanteId?: string; meio: "estacao" | "papel" }
): Promise<Resp & { candidatos?: PessoaMesa[] }> {
  const ctx = await doPainel(congressoId, ["congressos_gestao", "congressos_credenciamento"])
  let participanteId = d.participanteId
  if (!participanteId) {
    const termo = d.texto?.trim() ?? ""
    if (termo.length < 3) return { erro: "Leia o QR do crachá ou digite o nome ou o CPF." }
    const { pessoas, aviso } = await buscarNaMesa(ctx.c, termo)
    if (!pessoas.length) return { erro: aviso ?? "Ninguém encontrado." }
    if (pessoas.length > 1) return { candidatos: pessoas }
    participanteId = pessoas[0].id
  }
  const r = await assinar(ctx, { mocaoId, participanteId, meio: d.meio, textoHash: null, ...(await origemDaRequisicao()) })
  revalidarPainel(congressoId)
  return r.erro ? { erro: r.erro } : { ok: `Assinatura de ${r.nome} registrada${d.meio === "papel" ? " (papel)" : ""}.` }
}

export async function retirarAssinaturaPainelAction(congressoId: string, mocaoId: string, participanteId: string): Promise<Resp> {
  const ctx = await doPainel(congressoId, ["congressos_gestao", "congressos_credenciamento"])
  const r = await retirarAssinatura(ctx, mocaoId, participanteId, true)
  revalidarPainel(congressoId)
  return r.erro ? { erro: r.erro } : { ok: "Assinatura retirada." }
}

export async function protocolarPainelAction(congressoId: string, id: string): Promise<Resp & { situacao?: SituacaoMocao }> {
  const ctx = await doPainel(congressoId)
  const r = await protocolar(ctx, id)
  revalidarPainel(congressoId)
  if (r.erro) return { erro: r.erro }
  return { ok: r.situacao === "habilitada" ? "Protocolada e habilitada: vai à pauta da plenária." : "Protocolada: aguarda a decisão da comissão.", situacao: r.situacao }
}

export async function decidirAction(congressoId: string, id: string, habilitar: boolean, motivo: string | null): Promise<Resp> {
  const ctx = await doPainel(congressoId)
  const r = await decidirHabilitacao(ctx, id, habilitar, motivo)
  revalidarPainel(congressoId)
  return r.erro ? { erro: r.erro } : { ok: habilitar ? "Moção habilitada para a plenária." : "Moção não habilitada; o motivo fica registrado." }
}

export async function retirarMocaoPainelAction(congressoId: string, id: string, motivo: string | null): Promise<Resp> {
  const ctx = await doPainel(congressoId)
  const r = await retirarMocao(ctx, id, motivo)
  revalidarPainel(congressoId)
  return r.erro ? { erro: r.erro } : { ok: "Moção retirada." }
}

// ── Link pessoal ────────────────────────────────────────────────────────────

export async function criarMocaoLinkAction(token: string, d: DadosMocaoForm): Promise<Resp & { codigo?: string }> {
  const a = await doLink(token)
  if (!a) return { erro: "Link pessoal inválido." }
  const regras = regrasDasMocoes(a.ctx.c)
  if (regras.quemApresenta !== "participantes") return { erro: "Neste congresso, as moções são registradas pela comissão organizadora." }
  if (!a.p.propoe) return { erro: "O seu papel no congresso não apresenta moções." }
  const r = await criarMocao(a.ctx, { ...d, unidadeId: d.unidadeId ?? a.p.unidadeId, proponenteId: a.p.id })
  revalidarLink(token)
  return r.erro ? { erro: r.erro } : { ok: `Moção ${r.numero} criada. Mostre o QR para colher as assinaturas.`, codigo: r.codigo }
}

export async function alterarMocaoLinkAction(token: string, id: string, d: DadosMocaoForm): Promise<Resp> {
  const a = await doLink(token)
  if (!a) return { erro: "Link pessoal inválido." }
  const r = await alterarMocao(a.ctx, id, d, { proponenteId: a.p.id })
  revalidarLink(token)
  return r.erro ? { erro: r.erro } : { ok: r.novaVersao ? "Texto alterado: versão nova, as assinaturas anteriores deixaram de contar." : "Moção alterada." }
}

export async function assinarLinkAction(token: string, codigo: string, d: { textoHash: string; codigoSala: string | null }): Promise<Resp & { precisaCodigo?: boolean }> {
  const a = await doLink(token)
  if (!a) return { erro: "Link pessoal inválido." }
  const m = await mocaoPorCodigo(a.ctx.tenantId, codigo)
  if (!m || m.congressoId !== a.ctx.c.id) return { erro: "Moção não encontrada neste congresso." }
  const r = await assinar(a.ctx, { mocaoId: m.id, participanteId: a.p.id, meio: "link", textoHash: d.textoHash, codigoSala: d.codigoSala, ...(await origemDaRequisicao()) })
  revalidarLink(token)
  revalidatePath(`/congresso/mocao/${codigo}`)
  return r.erro ? { erro: r.erro, precisaCodigo: r.precisaCodigo } : { ok: "Assinatura registrada. Obrigado!" }
}

export async function retirarAssinaturaLinkAction(token: string, codigo: string): Promise<Resp> {
  const a = await doLink(token)
  if (!a) return { erro: "Link pessoal inválido." }
  const m = await mocaoPorCodigo(a.ctx.tenantId, codigo)
  if (!m || m.congressoId !== a.ctx.c.id) return { erro: "Moção não encontrada." }
  const r = await retirarAssinatura(a.ctx, m.id, a.p.id, false)
  revalidarLink(token)
  return r.erro ? { erro: r.erro } : { ok: "Assinatura retirada." }
}

export async function protocolarLinkAction(token: string, id: string): Promise<Resp> {
  const a = await doLink(token)
  if (!a) return { erro: "Link pessoal inválido." }
  const r = await protocolar(a.ctx, id, { proponenteId: a.p.id })
  revalidarLink(token)
  if (r.erro) return { erro: r.erro }
  return { ok: r.situacao === "habilitada" ? "Protocolada: a moção vai à pauta da plenária." : "Protocolada: aguarda a decisão da comissão." }
}

export async function retirarMocaoLinkAction(token: string, id: string): Promise<Resp> {
  const a = await doLink(token)
  if (!a) return { erro: "Link pessoal inválido." }
  const r = await retirarMocao(a.ctx, id, "Retirada por quem apresentou", { proponenteId: a.p.id })
  revalidarLink(token)
  return r.erro ? { erro: r.erro } : { ok: "Moção retirada." }
}
