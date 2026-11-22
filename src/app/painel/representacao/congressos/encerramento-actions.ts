"use server"

import { revalidatePath } from "next/cache"

import { requirePermissao } from "@/lib/auth"
import type { DestinoResolucao, SituacaoResolucao } from "@/lib/congressos/encerramento"
import { obterCongresso } from "@/lib/db/congressos"
import {
  apurarEleicao,
  atualizarResolucao,
  desfazerApuracao,
  emitirCertificados,
  encerrarCongresso,
  enviarAEtapaSeguinte,
  gerarOficioDaResolucao,
  gerarResolucoes,
  inscreverChapa,
  novaResolucao,
  reabrirCongresso,
  revogarCertificado,
  situacaoDaChapa,
  vincularNegociacao,
  type Chapa,
} from "@/lib/db/congressos-encerramento"
import type { ContextoRelatoria } from "@/lib/db/congressos-relatoria"
import { tenantAtual } from "@/lib/tenant"

/**
 * Congressos — ações do encerramento (Fase 6). Resoluções e eleição: comissão
 * de relatoria ou gestão. Encerrar, certificados, vínculos com negociação e
 * ofício e envio à etapa seguinte: gestão.
 */

type Resp = { erro?: string; ok?: string }

async function contexto(congressoId: string, gestao = false): Promise<ContextoRelatoria & { usuarioId: string }> {
  const s = gestao ? await requirePermissao("congressos_gestao") : await requirePermissao("congressos_relatoria", ["congressos_gestao"])
  const c = await obterCongresso(congressoId)
  if (!c) throw new Error("Congresso não encontrado.")
  const nome = s.usuario.nome_guerra || s.usuario.nome_completo || s.usuario.email || "Painel"
  return { c, tenantId: await tenantAtual(), autor: { nome, usuarioId: s.usuario.id }, usuarioId: s.usuario.id }
}

const revalidar = (id: string) => revalidatePath(`/painel/representacao/congressos/${id}`, "layout")
const resp = (r: { erro?: string }, ok: string): Resp => (r.erro ? { erro: r.erro } : { ok })

// ── Resoluções ──────────────────────────────────────────────────────────────

export async function gerarResolucoesAction(congressoId: string): Promise<Resp> {
  const ctx = await contexto(congressoId)
  const r = await gerarResolucoes(ctx)
  revalidar(congressoId)
  return r.erro ? { erro: r.erro } : { ok: r.criadas ? `${r.criadas} resolução(ões) gerada(s).` : "Nada novo: tudo o que foi aprovado já virou resolução." }
}

export async function novaResolucaoAction(congressoId: string, d: { titulo: string | null; texto: string; eixoId: string | null; reservada: boolean }): Promise<Resp> {
  const ctx = await contexto(congressoId)
  const r = await novaResolucao(ctx, d)
  revalidar(congressoId)
  return resp(r, "Resolução registrada.")
}

export async function atualizarResolucaoAction(
  congressoId: string,
  id: string,
  d: { reservada?: boolean; destino?: DestinoResolucao; responsavel?: string | null; prazo?: string | null; situacao?: SituacaoResolucao; nota?: string | null }
): Promise<Resp> {
  const ctx = await contexto(congressoId)
  const r = await atualizarResolucao(ctx, id, d)
  revalidar(congressoId)
  return resp(r, "Resolução atualizada.")
}

export async function vincularNegociacaoAction(congressoId: string, id: string, negociacaoId: string): Promise<Resp> {
  const ctx = await contexto(congressoId, true)
  const r = await vincularNegociacao(ctx, id, negociacaoId, ctx.usuarioId)
  revalidar(congressoId)
  return resp(r, "Levada à negociação: aparece na linha do tempo dela.")
}

export async function gerarOficioAction(congressoId: string, id: string): Promise<Resp & { oficioId?: string }> {
  const ctx = await contexto(congressoId, true)
  const r = await gerarOficioDaResolucao(ctx, id, ctx.usuarioId)
  revalidar(congressoId)
  return r.erro ? { erro: r.erro } : { ok: "Rascunho de ofício criado.", oficioId: r.oficioId }
}

// ── Eleição ─────────────────────────────────────────────────────────────────

export async function inscreverChapaAction(
  congressoId: string,
  d: { nome: string; membros: { participanteId: string; condicao: "titular" | "suplente" }[] }
): Promise<Resp & { problemas?: string[] }> {
  const ctx = await contexto(congressoId)
  const r = await inscreverChapa(ctx, d)
  revalidar(congressoId)
  return r.erro ? { erro: r.erro, problemas: r.problemas } : { ok: `Chapa ${r.numero} inscrita.` }
}

export async function situacaoChapaAction(congressoId: string, chapaId: string, situacao: Chapa["situacao"], motivo: string | null): Promise<Resp> {
  const ctx = await contexto(congressoId)
  const r = await situacaoDaChapa(ctx, chapaId, situacao, motivo)
  revalidar(congressoId)
  return resp(r, "Chapa atualizada.")
}

export async function apurarEleicaoAction(congressoId: string, votos: Record<string, number>): Promise<Resp> {
  const ctx = await contexto(congressoId)
  const r = await apurarEleicao(ctx, votos)
  revalidar(congressoId)
  return r.erro ? { erro: r.erro } : { ok: `Eleição apurada.${r.aviso ? ` ${r.aviso}` : ""}` }
}

export async function desfazerApuracaoAction(congressoId: string): Promise<Resp> {
  const ctx = await contexto(congressoId)
  const r = await desfazerApuracao(ctx)
  revalidar(congressoId)
  return resp(r, "Apuração desfeita.")
}

export async function enviarEtapaSeguinteAction(congressoId: string): Promise<Resp> {
  const ctx = await contexto(congressoId, true)
  const r = await enviarAEtapaSeguinte(ctx, ctx.usuarioId)
  revalidar(congressoId)
  if (ctx.c.etapaSeguinteId) revalidar(ctx.c.etapaSeguinteId)
  return r
}

// ── Certificados e encerramento ─────────────────────────────────────────────

export async function emitirCertificadosAction(congressoId: string): Promise<Resp> {
  const ctx = await contexto(congressoId, true)
  const r = await emitirCertificados(ctx)
  revalidar(congressoId)
  return r.erro ? { erro: r.erro } : { ok: r.emitidos ? `${r.emitidos} certificado(s) emitido(s).` : "Todos com direito já têm certificado." }
}

export async function revogarCertificadoAction(congressoId: string, id: string, motivo: string): Promise<Resp> {
  const ctx = await contexto(congressoId, true)
  const r = await revogarCertificado(ctx, id, motivo)
  revalidar(congressoId)
  return resp(r, "Certificado revogado: o código passa a constar como revogado em /verificar.")
}

export async function encerrarCongressoAction(congressoId: string): Promise<Resp> {
  const ctx = await contexto(congressoId, true)
  const r = await encerrarCongresso(ctx)
  revalidar(congressoId)
  return r
}

export async function reabrirCongressoAction(congressoId: string): Promise<Resp> {
  const ctx = await contexto(congressoId, true)
  const r = await reabrirCongresso(ctx)
  revalidar(congressoId)
  return resp(r, "Congresso reaberto.")
}
