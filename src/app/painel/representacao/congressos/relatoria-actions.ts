"use server"

import { revalidatePath } from "next/cache"

import { requirePermissao } from "@/lib/auth"
import { valor } from "@/lib/congressos/config"
import { separarPropostas, type FormaVotacao, type ResultadoPlenaria } from "@/lib/congressos/relatoria"
import { obterCongresso, type Congresso } from "@/lib/db/congressos"
import {
  acessoDeRelatoria,
  ajustarPropostas,
  aplicarResultadoDosGrupos,
  definirFuncao,
  desfazerFusao,
  desfazerVotacao,
  entregarRelatorio,
  fundirPropostas,
  novaPropostaNoGrupo,
  novasPropostas,
  novaVersao,
  pedirDestaque,
  reabrirRelatorio,
  registrarApontamento,
  registrarVotacao,
  removerFuncao,
  retirarApontamento,
  retirarDestaque,
  salvarApreciacao,
  type ContextoRelatoria,
  type FuncaoGrupo,
  type OrigemProposta,
  type SituacaoProposta,
  type TipoApontamento,
} from "@/lib/db/congressos-relatoria"
import { tenantAtual } from "@/lib/tenant"

/**
 * Congressos — ações da relatoria (Fase 3).
 *
 * As do grupo valem por dois caminhos: o painel (`congressos_relatoria` ou a
 * gestão) ou o link pessoal de quem tem função no grupo — `Acesso` diz qual.
 * Consolidação e plenária são só do painel.
 */

export type Acesso = { congressoId: string; token?: undefined } | { token: string; congressoId?: undefined }
type Resp = { erro?: string; ok?: string }

async function congresso(id: string): Promise<Congresso> {
  const c = await obterCongresso(id)
  if (!c) throw new Error("Congresso não encontrado.")
  return c
}

async function doPainel(congressoId: string): Promise<ContextoRelatoria> {
  const s = await requirePermissao("congressos_relatoria", ["congressos_gestao"])
  const c = await congresso(congressoId)
  return {
    c,
    tenantId: await tenantAtual(),
    autor: { nome: s.usuario.nome_guerra || s.usuario.nome_completo || s.usuario.email || "Painel", usuarioId: s.usuario.id },
  }
}

/** Contexto de quem opera o grupo, pelo painel ou pelo link pessoal (só nos grupos em que tem função). */
async function doGrupo(acesso: Acesso, grupoId: string): Promise<ContextoRelatoria | { erro: string }> {
  if (acesso.congressoId) return doPainel(acesso.congressoId)
  const tenantId = await tenantAtual()
  const a = await acessoDeRelatoria(acesso.token!, tenantId, (id) => obterCongresso(id))
  if (!a || !a.grupos.some((g) => g.id === grupoId)) return { erro: "Este link não dá acesso à relatoria deste grupo." }
  return { c: a.congresso, tenantId, autor: { nome: a.nome } }
}

function revalidar(acesso: Acesso, congressoId: string) {
  if (acesso.token) revalidatePath(`/congresso/eu/${acesso.token}/grupo`, "layout")
  revalidatePath(`/painel/representacao/congressos/${congressoId}`, "layout")
}

function resp(r: { erro?: string }, ok: string): Resp {
  return r.erro ? { erro: r.erro } : { ok }
}

// ── Grupo (painel ou link pessoal) ──────────────────────────────────────────

export async function novaPropostaGrupoAction(acesso: Acesso, grupoId: string, d: { texto: string; abrangencia: string | null }): Promise<Resp> {
  const ctx = await doGrupo(acesso, grupoId)
  if ("erro" in ctx) return ctx
  const r = await novaPropostaNoGrupo(ctx, grupoId, d)
  revalidar(acesso, ctx.c.id)
  return resp(r, `Proposta ${r.numero} registrada.`)
}

export async function versaoGrupoAction(acesso: Acesso, grupoId: string, propostaId: string, texto: string): Promise<Resp> {
  const ctx = await doGrupo(acesso, grupoId)
  if ("erro" in ctx) return ctx
  const r = await novaVersao(ctx, propostaId, texto, "grupo", grupoId)
  revalidar(acesso, ctx.c.id)
  return resp(r, "Texto atualizado; a versão anterior fica guardada.")
}

export async function apontamentoAction(
  acesso: Acesso,
  grupoId: string,
  d: { propostaId: string | null; tipo: TipoApontamento; texto: string }
): Promise<Resp> {
  const ctx = await doGrupo(acesso, grupoId)
  if ("erro" in ctx) return ctx
  const r = await registrarApontamento(ctx, grupoId, d)
  revalidar(acesso, ctx.c.id)
  return resp(r, "Registrado.")
}

export async function retirarApontamentoAction(acesso: Acesso, grupoId: string, id: string): Promise<Resp> {
  const ctx = await doGrupo(acesso, grupoId)
  if ("erro" in ctx) return ctx
  const r = await retirarApontamento(ctx, grupoId, id)
  revalidar(acesso, ctx.c.id)
  return resp(r, "Retirado.")
}

export async function apreciacaoAction(
  acesso: Acesso,
  grupoId: string,
  propostaId: string,
  c: { aFavor: number; contra: number; abstencao: number }
): Promise<Resp> {
  const ctx = await doGrupo(acesso, grupoId)
  if ("erro" in ctx) return ctx
  const r = await salvarApreciacao(ctx, grupoId, propostaId, c)
  revalidar(acesso, ctx.c.id)
  return r.erro ? { erro: r.erro } : { ok: r.explicacao }
}

export async function entregarRelatorioAction(acesso: Acesso, grupoId: string): Promise<Resp> {
  const ctx = await doGrupo(acesso, grupoId)
  if ("erro" in ctx) return ctx
  const r = await entregarRelatorio(ctx, grupoId)
  revalidar(acesso, ctx.c.id)
  return resp(r, "Relatório entregue. O grupo não altera mais propostas nem apontamentos.")
}

// ── Painel: grupo ───────────────────────────────────────────────────────────

export async function reabrirRelatorioAction(congressoId: string, grupoId: string): Promise<Resp> {
  const ctx = await doPainel(congressoId)
  const r = await reabrirRelatorio(ctx, grupoId)
  revalidar({ congressoId }, congressoId)
  return resp(r, "Relatório reaberto.")
}

export async function definirFuncaoAction(
  congressoId: string,
  grupoId: string,
  d: { participanteId: string; funcao: FuncaoGrupo; escolha: "eleita" | "indicada" }
): Promise<Resp> {
  const ctx = await doPainel(congressoId)
  if (!d.participanteId) return { erro: "Escolha a pessoa." }
  const r = await definirFuncao(ctx, grupoId, d.participanteId, d.funcao, d.escolha)
  revalidar({ congressoId }, congressoId)
  return resp(r, "Função registrada. A pessoa opera a relatoria pelo link pessoal.")
}

export async function removerFuncaoAction(congressoId: string, id: string): Promise<Resp> {
  const ctx = await doPainel(congressoId)
  const r = await removerFuncao(ctx, id)
  revalidar({ congressoId }, congressoId)
  return resp(r, "Função removida.")
}

// ── Painel: propostas e consolidação ────────────────────────────────────────

export async function colarPropostasAction(
  congressoId: string,
  d: { texto: string; eixoId: string | null; origem: OrigemProposta; origemDescricao: string | null; abrangencia: string | null }
): Promise<Resp> {
  const ctx = await doPainel(congressoId)
  const textos = separarPropostas(d.texto)
  if (!textos.length) return { erro: "Cole o texto com uma proposta por parágrafo (linha em branco entre elas)." }
  if (textos.length > 300) return { erro: "Mais de 300 propostas de uma vez: divida em partes." }
  const r = await novasPropostas(ctx, { ...d, textos })
  revalidar({ congressoId }, congressoId)
  return r.erro ? { erro: r.erro } : { ok: `${r.criadas} proposta(s) incluída(s).` }
}

export async function propostaPlenariaAction(congressoId: string, d: { texto: string; eixoId: string | null; descricao: string | null }): Promise<Resp> {
  const ctx = await doPainel(congressoId)
  if (valor<string>(ctx.c.config, "propostas.novas_plenaria") === "proibidas") return { erro: "O regimento só admite em plenária a matéria vinda dos grupos." }
  const r = await novasPropostas(ctx, { textos: [d.texto], eixoId: d.eixoId, origem: "plenaria", origemDescricao: d.descricao, abrangencia: null, situacao: "plenaria" })
  if (r.erro) return { erro: r.erro }
  revalidar({ congressoId }, congressoId)
  return { ok: "Proposta incluída na pauta." }
}

export async function versaoConsolidacaoAction(congressoId: string, propostaId: string, texto: string): Promise<Resp> {
  const ctx = await doPainel(congressoId)
  const r = await novaVersao(ctx, propostaId, texto, "consolidacao")
  revalidar({ congressoId }, congressoId)
  return resp(r, "Texto consolidado; a versão anterior fica guardada.")
}

export async function fundirAction(congressoId: string, ids: string[], d: { texto: string; eixoId: string | null; abrangencia: string | null }): Promise<Resp> {
  const ctx = await doPainel(congressoId)
  const r = await fundirPropostas(ctx, ids, d)
  revalidar({ congressoId }, congressoId)
  return resp(r, `Proposta ${r.numero} criada pela fusão; as de origem ficam ligadas a ela.`)
}

export async function desfazerFusaoAction(congressoId: string, propostaId: string): Promise<Resp> {
  const ctx = await doPainel(congressoId)
  const r = await desfazerFusao(ctx, propostaId)
  revalidar({ congressoId }, congressoId)
  return resp(r, "Fusão desfeita: as propostas de origem voltaram.")
}

export async function ajustarAction(
  congressoId: string,
  ids: string[],
  d: { eixoId?: string | null; abrangencia?: string | null; classificacao?: "consenso" | "debate" | null; situacao?: SituacaoProposta }
): Promise<Resp> {
  const ctx = await doPainel(congressoId)
  const r = await ajustarPropostas(ctx, ids, d)
  revalidar({ congressoId }, congressoId)
  return resp(r, `${r.alteradas ?? 0} proposta(s) alterada(s).`)
}

export async function aplicarGruposAction(congressoId: string): Promise<Resp> {
  const ctx = await doPainel(congressoId)
  const r = await aplicarResultadoDosGrupos(ctx)
  revalidar({ congressoId }, congressoId)
  if (r.erro) return { erro: r.erro }
  return { ok: `${r.plenaria} à plenária, ${r.aprovadas} aprovada(s) nos grupos, ${r.rejeitadas} rejeitada(s).` }
}

// ── Painel: plenária ────────────────────────────────────────────────────────

export async function destaqueAction(congressoId: string, propostaId: string, nome: string | null): Promise<Resp> {
  const ctx = await doPainel(congressoId)
  const r = await pedirDestaque(ctx, propostaId, nome)
  revalidar({ congressoId }, congressoId)
  return resp(r, "Destaque registrado: a proposta sai do bloco.")
}

export async function retirarDestaqueAction(congressoId: string, propostaId: string): Promise<Resp> {
  const ctx = await doPainel(congressoId)
  const r = await retirarDestaque(ctx, propostaId)
  revalidar({ congressoId }, congressoId)
  return resp(r, "Destaque retirado.")
}

export async function votacaoAction(
  congressoId: string,
  d: {
    propostaIds: string[]
    forma: FormaVotacao
    aFavor?: number | null
    contra?: number | null
    abstencao?: number | null
    declarado?: ResultadoPlenaria | null
    sessaoId?: string | null
    observacao?: string | null
  }
): Promise<Resp & { resultado?: ResultadoPlenaria }> {
  const ctx = await doPainel(congressoId)
  const r = await registrarVotacao(ctx, d)
  revalidar({ congressoId }, congressoId)
  return r.erro ? { erro: r.erro } : { ok: r.explicacao, resultado: r.resultado }
}

export async function desfazerVotacaoAction(congressoId: string, votacaoId: string): Promise<Resp> {
  const ctx = await doPainel(congressoId)
  const r = await desfazerVotacao(ctx, votacaoId)
  revalidar({ congressoId }, congressoId)
  return resp(r, "Lançamento desfeito: as propostas voltaram à pauta.")
}
