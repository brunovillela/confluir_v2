"use server"

import { revalidatePath } from "next/cache"

import { requirePermissao } from "@/lib/auth"
import type { AjusteLido, ItemCaderno } from "@/lib/congressos/ia"
import { obterCongresso } from "@/lib/db/congressos"
import {
  aceitarFusao,
  aceitarRedacao,
  aceitarTriagem,
  aceitarTriagemMocao,
  aplicarRegimento,
  gravarCaderno,
  guardarSintese,
  lerCadernoComIA,
  lerRegimentoComIA,
  levarDissenso,
  recusarSugestao,
  sugerirCorrelacao,
  sugerirFusoes,
  sugerirRedacao,
  sugerirSintese,
  sugerirTriagem,
  triarMocao,
  type Documento,
  type Sugestao,
} from "@/lib/db/congressos-ia"
import { acessoDeRelatoria, type ContextoRelatoria } from "@/lib/db/congressos-relatoria"
import { textoDoArquivo } from "@/lib/ia-arquivo"
import { tenantAtual } from "@/lib/tenant"

/**
 * Congressos — ações da IA na relatoria (Fase 5). Redação e síntese valem
 * pelo painel ou pelo link pessoal de quem tem função no grupo; consolidação,
 * moções e leitura de documentos são do painel. A IA só sugere: aceitar é
 * sempre um segundo passo, de uma pessoa.
 */

type Acesso = { congressoId: string; token?: undefined } | { token: string; congressoId?: undefined }
type Resp = { erro?: string; ok?: string }

function nomeDe(s: Awaited<ReturnType<typeof requirePermissao>>) {
  return s.usuario.nome_guerra || s.usuario.nome_completo || s.usuario.email || "Painel"
}

async function doPainel(congressoId: string, gestao = false): Promise<ContextoRelatoria & { usuarioId: string }> {
  const s = gestao ? await requirePermissao("congressos_gestao") : await requirePermissao("congressos_relatoria", ["congressos_gestao"])
  const c = await obterCongresso(congressoId)
  if (!c) throw new Error("Congresso não encontrado.")
  return { c, tenantId: await tenantAtual(), autor: { nome: nomeDe(s), usuarioId: s.usuario.id }, usuarioId: s.usuario.id }
}

async function doGrupo(acesso: Acesso, grupoId: string): Promise<{ ctx: ContextoRelatoria; viaLink: boolean } | { erro: string }> {
  if (acesso.congressoId) return { ctx: await doPainel(acesso.congressoId), viaLink: false }
  const tenantId = await tenantAtual()
  const a = await acessoDeRelatoria(acesso.token!, tenantId, (id) => obterCongresso(id))
  if (!a || !a.grupos.some((g) => g.id === grupoId)) return { erro: "Este link não dá acesso à relatoria deste grupo." }
  return { ctx: { c: a.congresso, tenantId, autor: { nome: a.nome } }, viaLink: true }
}

function revalidar(congressoId: string, token?: string) {
  if (token) revalidatePath(`/congresso/eu/${token}/grupo`, "layout")
  revalidatePath(`/painel/representacao/congressos/${congressoId}`, "layout")
}

// ── Grupo: redação e síntese ────────────────────────────────────────────────

export async function sugerirRedacaoAction(acesso: Acesso, grupoId: string | null, propostaId: string): Promise<{ erro?: string; sugestao?: Sugestao }> {
  if (!grupoId) {
    if (!acesso.congressoId) return { erro: "Acesso inválido." }
    const ctx = await doPainel(acesso.congressoId)
    return sugerirRedacao(ctx, propostaId)
  }
  const g = await doGrupo(acesso, grupoId)
  if ("erro" in g) return g
  return sugerirRedacao(g.ctx, propostaId, g.viaLink, g.viaLink ? grupoId : undefined)
}

export async function aceitarRedacaoAction(acesso: Acesso, grupoId: string | null, sugestaoId: string, texto: string): Promise<Resp> {
  const g = grupoId ? await doGrupo(acesso, grupoId) : acesso.congressoId ? { ctx: await doPainel(acesso.congressoId), viaLink: false } : { erro: "Acesso inválido." }
  if ("erro" in g) return g
  const r = await aceitarRedacao(g.ctx, sugestaoId, texto, g.viaLink ? grupoId! : undefined)
  revalidar(g.ctx.c.id, acesso.token)
  return r.erro ? r : { ok: "Redação aceita: o texto virou uma versão nova." }
}

export async function recusarSugestaoAction(acesso: Acesso, grupoId: string | null, sugestaoId: string): Promise<Resp> {
  const g = grupoId ? await doGrupo(acesso, grupoId) : acesso.congressoId ? { ctx: await doPainel(acesso.congressoId), viaLink: false } : { erro: "Acesso inválido." }
  if ("erro" in g) return g
  const r = await recusarSugestao(g.ctx, sugestaoId, g.viaLink ? grupoId! : undefined)
  revalidar(g.ctx.c.id, acesso.token)
  return r.erro ? r : { ok: "Sugestão recusada." }
}

export async function sugerirSinteseAction(acesso: Acesso, grupoId: string): Promise<{ erro?: string; sugestao?: Sugestao }> {
  const g = await doGrupo(acesso, grupoId)
  if ("erro" in g) return g
  return sugerirSintese(g.ctx, grupoId, g.viaLink)
}

export async function guardarSinteseAction(acesso: Acesso, grupoId: string, texto: string, sugestaoId: string | null): Promise<Resp> {
  const g = await doGrupo(acesso, grupoId)
  if ("erro" in g) return g
  const r = await guardarSintese(g.ctx, grupoId, texto, sugestaoId)
  revalidar(g.ctx.c.id, acesso.token)
  return r.erro ? r : { ok: texto.trim() ? "Síntese guardada." : "Síntese apagada." }
}

// ── Consolidação ────────────────────────────────────────────────────────────

export async function rodarAssistenteAction(congressoId: string, funcao: "mesclagem" | "triagem" | "correlacao", eixoId: string | null): Promise<Resp> {
  const ctx = await doPainel(congressoId)
  const r =
    funcao === "mesclagem" ? await sugerirFusoes(ctx, eixoId) : funcao === "triagem" ? await sugerirTriagem(ctx, eixoId) : await sugerirCorrelacao(ctx, eixoId)
  revalidar(congressoId)
  if (r.erro && !r.criadas) return { erro: r.erro }
  const ok = r.criadas ? `${r.criadas} sugestão(ões) para revisar.` : "A IA não encontrou nada a sugerir."
  return { ok: r.erro ? `${ok} ${r.erro}` : ok }
}

export async function aceitarFusaoAction(
  congressoId: string,
  sugestaoId: string,
  dados: { propostaIds: string[]; texto: string; eixoId: string | null; abrangencia: string | null }
): Promise<Resp> {
  const ctx = await doPainel(congressoId)
  const r = await aceitarFusao(ctx, sugestaoId, dados)
  revalidar(congressoId)
  return r.erro ? r : { ok: `Fundidas na proposta ${r.numero}.` }
}

export async function aceitarTriagemAction(congressoId: string, sugestaoId: string): Promise<Resp> {
  const ctx = await doPainel(congressoId)
  const r = await aceitarTriagem(ctx, sugestaoId)
  revalidar(congressoId)
  return r.erro ? r : { ok: "Sugestão aplicada." }
}

export async function levarDissensoAction(congressoId: string, sugestaoId: string): Promise<Resp> {
  const ctx = await doPainel(congressoId)
  const r = await levarDissenso(ctx, sugestaoId)
  revalidar(congressoId)
  return r.erro ? r : { ok: "Dissenso registrado nas duas propostas, para a plenária decidir." }
}

// ── Moções ──────────────────────────────────────────────────────────────────

export async function triarMocaoAction(congressoId: string, mocaoId: string): Promise<Resp> {
  const ctx = await doPainel(congressoId)
  const r = await triarMocao(ctx, mocaoId)
  revalidar(congressoId)
  return r.erro ? { erro: r.erro } : { ok: "Triagem pronta." }
}

export async function aceitarTriagemMocaoAction(congressoId: string, sugestaoId: string, dados: { tipo: boolean; destinatario: boolean }): Promise<Resp> {
  const ctx = await doPainel(congressoId)
  const r = await aceitarTriagemMocao(ctx, sugestaoId, dados)
  revalidar(congressoId)
  return r.erro ? r : { ok: r.novaVersao ? "Aplicado. A moção virou versão nova e as assinaturas anteriores deixaram de contar." : "Aplicado." }
}

// ── Leitura de documentos ───────────────────────────────────────────────────

async function documentoDe(fd: FormData): Promise<Documento | { erro: string }> {
  const arquivo = fd.get("arquivo")
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    const texto = String(fd.get("texto") ?? "").trim()
    return texto.length >= 20 ? { texto } : { erro: "Escolha o arquivo ou cole o texto." }
  }
  if (arquivo.size > 4 * 1024 * 1024) return { erro: "Arquivo grande demais: o máximo é 4 MB." }
  const { texto, ehPdf, pdf, erro } = await textoDoArquivo(arquivo)
  if (erro) return { erro }
  if (texto.length >= 200) return { texto }
  if (ehPdf && pdf) return { pdfBase64: Buffer.from(pdf).toString("base64") }
  return texto.length >= 20 ? { texto } : { erro: "O arquivo está vazio ou não tem texto legível." }
}

export type EstadoCaderno = { erro?: string; ok?: string; sugestaoId?: string; itens?: ItemCaderno[] }

export async function lerCadernoAction(_p: EstadoCaderno, fd: FormData): Promise<EstadoCaderno> {
  const ctx = await doPainel(String(fd.get("congresso_id") ?? ""))
  const doc = await documentoDe(fd)
  if ("erro" in doc) return doc
  return lerCadernoComIA(ctx, doc)
}

export async function gravarCadernoAction(
  congressoId: string,
  sugestaoId: string,
  itens: { texto: string; eixoId: string | null }[],
  dados: { origem: "caderno" | "etapa_anterior" | "documento"; origemDescricao: string | null },
  lidos: number
): Promise<Resp> {
  const ctx = await doPainel(congressoId)
  const r = await gravarCaderno(ctx, sugestaoId, itens.slice(0, 2000), dados, lidos)
  revalidar(congressoId)
  return r.erro ? { erro: r.erro } : { ok: `${r.criadas} proposta(s) registrada(s).` }
}

export type EstadoRegimento = { erro?: string; ok?: string; sugestaoId?: string; ajustes?: AjusteLido[] }

export async function lerRegimentoAction(_p: EstadoRegimento, fd: FormData): Promise<EstadoRegimento> {
  const ctx = await doPainel(String(fd.get("congresso_id") ?? ""), true)
  const doc = await documentoDe(fd)
  if ("erro" in doc) return doc
  return lerRegimentoComIA(ctx, doc)
}

export async function aplicarRegimentoAction(congressoId: string, sugestaoId: string, chaves: string[], deliberacao: string | null): Promise<Resp> {
  const ctx = await doPainel(congressoId, true)
  const r = await aplicarRegimento(ctx, sugestaoId, chaves, ctx.usuarioId, deliberacao?.trim() || null)
  revalidar(congressoId)
  return r
}
