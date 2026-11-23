"use server"

import { requirePermissao } from "@/lib/auth"
import type { ItemPriorizacao, TipoFala } from "@/lib/congressos/ao-vivo"
import { obterCongresso, type Congresso } from "@/lib/db/congressos"
import {
  abrirInscricoes,
  abrirVotacao,
  acrescentarTempo,
  avaliarVoto,
  cancelarFala,
  cancelarVotacao,
  chamarFala,
  definirSessaoEAssunto,
  encerrarFala,
  fecharVotacao,
  inscreverFala,
  jaVotou,
  novaRodada,
  participanteDoLink,
  pausarFala,
  votar,
} from "@/lib/db/congressos-ao-vivo"
import { buscarNaMesa } from "@/lib/db/congressos-dia"
import type { ContextoRelatoria } from "@/lib/db/congressos-relatoria"
import { tenantAtual } from "@/lib/tenant"

/**
 * Congressos — ações da plenária ao vivo (Fase 7). Mesa (relatoria ou
 * gestão): fila de fala e votação eletrônica. Estação de voto: também quem
 * opera o credenciamento. Link pessoal: votar e se inscrever para falar.
 * Sem revalidatePath: telão, mesa e celulares consultam o estado a cada
 * poucos segundos.
 */

type Resp = { erro?: string; ok?: string }

async function mesa(congressoId: string): Promise<ContextoRelatoria> {
  const s = await requirePermissao("congressos_relatoria", ["congressos_gestao"])
  const c = await obterCongresso(congressoId)
  if (!c) throw new Error("Congresso não encontrado.")
  return { c, tenantId: await tenantAtual(), autor: { nome: s.usuario.nome_guerra || s.usuario.nome_completo || s.usuario.email || "Mesa", usuarioId: s.usuario.id } }
}

async function doLink(token: string): Promise<{ c: Congresso; tenantId: string; participanteId: string; nome: string } | { erro: string }> {
  const tenantId = await tenantAtual()
  const p = await participanteDoLink(token, tenantId)
  if (!p) return { erro: "Link inválido." }
  const c = await obterCongresso(p.congressoId)
  if (!c) return { erro: "Congresso não encontrado." }
  return { c, tenantId, participanteId: p.id, nome: p.nome }
}

const resp = (r: { erro?: string }, ok: string): Resp => (r.erro ? { erro: r.erro } : { ok })

// ── Mesa: sessão, assunto e fila ────────────────────────────────────────────

export async function definirSessaoAction(congressoId: string, sessaoId: string | null, assunto: string | null): Promise<Resp> {
  return resp(await definirSessaoEAssunto(await mesa(congressoId), { sessaoId, assunto }), "Atualizado.")
}

export async function inscricoesAction(congressoId: string, abertas: boolean): Promise<Resp> {
  return resp(await abrirInscricoes(await mesa(congressoId), abertas), abertas ? "Inscrições abertas." : "Inscrições encerradas.")
}

export async function novaRodadaAction(congressoId: string, assunto: string | null): Promise<Resp> {
  return resp(await novaRodada(await mesa(congressoId), assunto), "Nova rodada: fila zerada e inscrições abertas.")
}

export async function inscreverNaMesaAction(congressoId: string, d: { participanteId: string | null; nome: string; tipo: TipoFala }): Promise<Resp> {
  const r = await inscreverFala(await mesa(congressoId), { ...d, assunto: null })
  return r.erro ? { erro: r.erro } : { ok: `Inscrito(a) em ${r.posicao}º na fila.` }
}

export async function buscarPessoaMesaAction(congressoId: string, termo: string): Promise<{ id: string; nome: string; base: string | null; papel: string | null }[]> {
  const ctx = await mesa(congressoId)
  const r = await buscarNaMesa(ctx.c, termo)
  return r.pessoas.slice(0, 8).map((p) => ({ id: p.id, nome: p.nome, base: p.base, papel: p.papel }))
}

export async function chamarFalaAction(congressoId: string, id?: string): Promise<Resp> {
  const r = await chamarFala(await mesa(congressoId), id)
  return r.erro ? { erro: r.erro } : { ok: `Com a palavra: ${r.nome}.` }
}

export async function pausarFalaAction(congressoId: string, id: string): Promise<Resp> {
  return resp(await pausarFala(await mesa(congressoId), id), "Ok.")
}

export async function maisTempoAction(congressoId: string, id: string, segundos: number): Promise<Resp> {
  return resp(await acrescentarTempo(await mesa(congressoId), id, segundos), `Mais ${segundos} s.`)
}

export async function encerrarFalaAction(congressoId: string): Promise<Resp> {
  return resp(await encerrarFala(await mesa(congressoId)), "Fala encerrada.")
}

export async function cancelarFalaAction(congressoId: string, id: string): Promise<Resp> {
  return resp(await cancelarFala(await mesa(congressoId), id), "Inscrição retirada.")
}

// ── Mesa: votação eletrônica ────────────────────────────────────────────────

export async function abrirVotacaoAction(
  congressoId: string,
  d: { tipo: "simples" | "priorizacao"; sigilo: "aberta" | "secreta"; titulo?: string | null; propostaIds?: string[]; mocaoIds?: string[]; itens?: ItemPriorizacao[]; maximoEscolhas?: number | null }
): Promise<Resp> {
  return resp(await abrirVotacao(await mesa(congressoId), d), "Votação aberta: os delegados já podem votar.")
}

export async function fecharVotacaoAction(congressoId: string, id: string): Promise<Resp> {
  const r = await fecharVotacao(await mesa(congressoId), id)
  return r.erro ? { erro: r.erro } : { ok: `Votação encerrada. ${r.resumo ?? ""}` }
}

export async function cancelarVotacaoAction(congressoId: string, id: string): Promise<Resp> {
  return resp(await cancelarVotacao(await mesa(congressoId), id), "Votação cancelada: os votos não contam.")
}

// ── Estação de voto (na mesa, com o crachá) ─────────────────────────────────

async function estacao(congressoId: string) {
  await requirePermissao("congressos_credenciamento", ["congressos_relatoria", "congressos_gestao"])
  const c = await obterCongresso(congressoId)
  if (!c) throw new Error("Congresso não encontrado.")
  return { c, tenantId: await tenantAtual() }
}

export async function identificarNaEstacaoAction(
  congressoId: string,
  termo: string
): Promise<{ pessoas: { id: string; nome: string; base: string | null }[]; avaliacao?: { participanteId: string; nome: string; pode: boolean; motivo?: string; jaVotou: boolean } }> {
  const { c, tenantId } = await estacao(congressoId)
  const r = await buscarNaMesa(c, termo)
  const pessoas = r.pessoas.slice(0, 8).map((p) => ({ id: p.id, nome: p.nome, base: p.base }))
  if (pessoas.length !== 1) return { pessoas }
  const a = await avaliarVoto(c, tenantId, pessoas[0].id, "estacao")
  const votou = a.votacao ? await jaVotou(tenantId, a.votacao.id, pessoas[0].id) : false
  return { pessoas, avaliacao: { participanteId: pessoas[0].id, nome: pessoas[0].nome, pode: a.pode && !votou, motivo: votou ? "Já votou nesta votação." : a.motivo, jaVotou: votou } }
}

export async function avaliarNaEstacaoAction(congressoId: string, participanteId: string) {
  const { c, tenantId } = await estacao(congressoId)
  const a = await avaliarVoto(c, tenantId, participanteId, "estacao")
  const votou = a.votacao ? await jaVotou(tenantId, a.votacao.id, participanteId) : false
  return { participanteId, nome: a.nome ?? "", pode: a.pode && !votou, motivo: votou ? "Já votou nesta votação." : a.motivo, jaVotou: votou }
}

export async function votarNaEstacaoAction(congressoId: string, participanteId: string, votacaoId: string, opcoes: string[]): Promise<Resp> {
  const { c, tenantId } = await estacao(congressoId)
  return votar(c, tenantId, participanteId, { votacaoId, opcoes, canal: "estacao" })
}

// ── Link pessoal ────────────────────────────────────────────────────────────

export async function avaliarPeloLinkAction(token: string, codigoSala?: string | null) {
  const l = await doLink(token)
  if ("erro" in l) return { pode: false, motivo: l.erro, jaVotou: false, votacaoId: null as string | null }
  const a = await avaliarVoto(l.c, l.tenantId, l.participanteId, "link", codigoSala ?? null)
  const votou = a.votacao ? await jaVotou(l.tenantId, a.votacao.id, l.participanteId) : false
  return { pode: a.pode && !votou, motivo: a.motivo, precisaCodigo: a.precisaCodigo, jaVotou: votou, votacaoId: a.votacao?.id ?? null }
}

export async function votarPeloLinkAction(token: string, votacaoId: string, opcoes: string[], codigoSala?: string | null): Promise<Resp & { precisaCodigo?: boolean }> {
  const l = await doLink(token)
  if ("erro" in l) return l
  return votar(l.c, l.tenantId, l.participanteId, { votacaoId, opcoes, canal: "link", codigoSala })
}

export async function inscreverPeloLinkAction(token: string, tipo: TipoFala): Promise<Resp> {
  const l = await doLink(token)
  if ("erro" in l) return l
  const r = await inscreverFala({ c: l.c, tenantId: l.tenantId, autor: { nome: l.nome } }, { participanteId: l.participanteId, nome: l.nome, tipo, assunto: null }, true)
  return r.erro ? { erro: r.erro } : { ok: `Inscrição feita: você é o(a) ${r.posicao}º na fila.` }
}

export async function sairDaFilaPeloLinkAction(token: string, falaId: string): Promise<Resp> {
  const l = await doLink(token)
  if ("erro" in l) return l
  return resp(await cancelarFala({ c: l.c, tenantId: l.tenantId, autor: { nome: l.nome } }, falaId, l.participanteId), "Você saiu da fila.")
}
