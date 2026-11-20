import "server-only"

import { AJUSTE_POR_CHAVE, descreverValor, valor } from "@/lib/congressos/config"
import {
  alertasDeSentido,
  blocos,
  catalogoParaIA,
  lerCaderno,
  lerCorrelacao,
  lerMesclagem,
  lerRefino,
  lerRegimento,
  lerTriagem,
  lerTriagemMocao,
  listaParaIA,
  semDadosPessoais,
  sugestaoObsoleta,
  usoPorFuncao,
  type AjusteLido,
  type FuncaoIA,
  type ItemCaderno,
  type SituacaoSugestao,
  type UsoIA,
} from "@/lib/congressos/ia"
import { tiposDeMocao } from "@/lib/congressos/mocoes"
import { lerEmLotes } from "@/lib/db/comum"
import { listarPrograma, salvarConfig, type Congresso } from "@/lib/db/congressos"
import { alterarMocao, dadosDaMocao } from "@/lib/db/congressos-mocoes"
import {
  ajustarPropostas,
  fundirPropostas,
  novasPropostas,
  novaVersao,
  type ContextoRelatoria,
  type Proposta,
} from "@/lib/db/congressos-relatoria"
import { gerarJsonIA, gerarJsonIADePdf, type EsquemaJsonIA, type ResultadoJsonIA } from "@/lib/ia"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Congressos — IA na relatoria (Fase 5).
 *
 * A IA só sugere; cada sugestão é gravada em congresso_sugestoes_ia e só muda
 * algo quando uma pessoa aceita (às vezes ajustando o texto). As propostas vão
 * à IA identificadas pelo número, sem autoria, e com CPF, e-mail e telefone
 * mascarados. Regras puras em src/lib/congressos/ia.ts; toda chamada passa
 * por src/lib/ia.ts (store: false, uso registrado).
 */

type Contexto = ContextoRelatoria

export type Sugestao = {
  id: string
  lote: string
  funcao: FuncaoIA
  grupoId: string | null
  mocaoId: string | null
  propostaIds: string[]
  conteudo: Record<string, unknown>
  situacao: SituacaoSugestao
  pedidaPor: string | null
  decididaPor: string | null
  decididaEm: string | null
  createdAt: string
}

const ABERTAS = ["em_debate", "entregue", "plenaria"]
const agoraIso = () => new Date().toISOString()

/** A IA está ligada para este caminho? (painel = comissão; link = relatoria do grupo) */
export function iaPermitida(c: Congresso, viaLink: boolean): string | null {
  const v = (valor<string>(c.config, "propostas.ia") as string | null) ?? "comissao_e_relatoria"
  if (v === "desligada") return "As sugestões da IA estão desligadas na configuração deste congresso."
  if (viaLink && v !== "comissao_e_relatoria") return "Neste congresso, só a comissão usa as sugestões da IA."
  return null
}

function ctxIA(ctx: Contexto, processo: string) {
  return { processo, usuarioId: ctx.autor.usuarioId ?? null, entidadeId: ctx.tenantId }
}

const SISTEMA_BASE =
  "Você apoia a relatoria de um congresso sindical brasileiro. Os textos são propostas debatidas por delegados. " +
  "Respeite o conteúdo político: não acrescente reivindicações, não suavize nem endureça posições, não mude números, prazos ou destinatários. " +
  "As propostas vêm identificadas como P<número>; use esses números nas respostas. Escreva em português do Brasil."

const SISTEMA_DOCUMENTO = "Você apoia a relatoria de um congresso sindical brasileiro. Respeite o conteúdo: não resuma nem reescreva as propostas. Escreva em português do Brasil."

// ── Leitura ─────────────────────────────────────────────────────────────────

async function lerPropostasAbertas(ctx: Contexto, filtro?: { eixoId?: string | null; ids?: string[] }): Promise<Proposta[]> {
  const admin = await createAdminClient()
  const linhas = await lerEmLotes<Record<string, unknown>>((de, ate) => {
    let q = admin
      .from("congresso_propostas")
      .select("id, numero, eixo_id, grupo_id, origem, origem_descricao, abrangencia, texto, versao, situacao, classificacao, fundida_em, ordem, destaque_por, destaque_em, criada_por, created_at")
      .eq("emp_proprietaria_id", ctx.tenantId)
      .eq("congresso_id", ctx.c.id)
    if (filtro?.ids) q = q.in("id", filtro.ids)
    else q = q.in("situacao", ABERTAS)
    if (filtro?.eixoId) q = q.eq("eixo_id", filtro.eixoId)
    return q.order("numero").range(de, ate)
  })
  return linhas.map((r) => ({
    id: r.id as string,
    numero: r.numero as number,
    eixoId: (r.eixo_id as string | null) ?? null,
    grupoId: (r.grupo_id as string | null) ?? null,
    origem: r.origem as Proposta["origem"],
    origemDescricao: (r.origem_descricao as string | null) ?? null,
    abrangencia: (r.abrangencia as string | null) ?? null,
    texto: r.texto as string,
    versao: r.versao as number,
    situacao: r.situacao as Proposta["situacao"],
    classificacao: (r.classificacao as Proposta["classificacao"]) ?? null,
    fundidaEm: (r.fundida_em as string | null) ?? null,
    ordem: (r.ordem as number) ?? 0,
    destaquePor: null,
    destaqueEm: null,
    criadaPor: null,
    createdAt: r.created_at as string,
  }))
}

function paraSugestao(r: Record<string, unknown>): Sugestao {
  return {
    id: r.id as string,
    lote: r.lote as string,
    funcao: r.funcao as FuncaoIA,
    grupoId: (r.grupo_id as string | null) ?? null,
    mocaoId: (r.mocao_id as string | null) ?? null,
    propostaIds: (r.proposta_ids as string[] | null) ?? [],
    conteudo: (r.conteudo as Record<string, unknown>) ?? {},
    situacao: r.situacao as SituacaoSugestao,
    pedidaPor: (r.pedida_por as string | null) ?? null,
    decididaPor: (r.decidida_por as string | null) ?? null,
    decididaEm: (r.decidida_em as string | null) ?? null,
    createdAt: r.created_at as string,
  }
}

const CAMPOS = "id, lote, funcao, grupo_id, mocao_id, proposta_ids, conteudo, situacao, pedida_por, decidida_por, decidida_em, created_at"

/**
 * Sugestões do congresso. As pendentes cujas propostas mudaram de texto ou
 * saíram da consolidação depois da leitura aparecem como "obsoleta".
 */
export async function listarSugestoes(
  c: Congresso,
  filtro: { funcoes?: FuncaoIA[]; grupoId?: string; mocaoId?: string; propostaId?: string; pendentes?: boolean; tenantId?: string } = {}
): Promise<Sugestao[]> {
  const emp = filtro.tenantId ?? (await tenantAtual())
  const admin = await createAdminClient()
  let q = admin.from("congresso_sugestoes_ia").select(CAMPOS).eq("emp_proprietaria_id", emp).eq("congresso_id", c.id)
  if (filtro.funcoes) q = q.in("funcao", filtro.funcoes)
  if (filtro.grupoId) q = q.eq("grupo_id", filtro.grupoId)
  if (filtro.mocaoId) q = q.eq("mocao_id", filtro.mocaoId)
  if (filtro.propostaId) q = q.contains("proposta_ids", [filtro.propostaId])
  if (filtro.pendentes) q = q.eq("situacao", "pendente")
  const { data } = await q.order("created_at", { ascending: false }).limit(1000)
  const lista = (data ?? []).map(paraSugestao)
  const ids = [...new Set(lista.filter((s) => s.situacao === "pendente").flatMap((s) => s.propostaIds))]
  if (!ids.length) return lista
  const atuais = new Map<string, { versao: number; situacao: string }>()
  for (let i = 0; i < ids.length; i += 200) {
    const { data: ps } = await admin.from("congresso_propostas").select("id, versao, situacao").eq("emp_proprietaria_id", emp).in("id", ids.slice(i, i + 200))
    for (const p of ps ?? []) atuais.set(p.id as string, { versao: p.versao as number, situacao: p.situacao as string })
  }
  return lista
    .map((s) => (s.situacao === "pendente" && sugestaoObsoleta(s.conteudo.versoes as Record<string, number> | undefined, atuais) ? { ...s, situacao: "obsoleta" as const } : s))
    .filter((s) => !filtro.pendentes || s.situacao === "pendente")
}

/** Quanto da IA foi aproveitado, por função. */
export async function usoDaIA(c: Congresso): Promise<UsoIA[]> {
  const emp = await tenantAtual()
  const admin = await createAdminClient()
  const { data } = await admin.from("congresso_sugestoes_ia").select("funcao, situacao").eq("emp_proprietaria_id", emp).eq("congresso_id", c.id).limit(5000)
  return usoPorFuncao((data ?? []).map((r) => ({ funcao: r.funcao as FuncaoIA, situacao: r.situacao as SituacaoSugestao })))
}

// ── Gravação ────────────────────────────────────────────────────────────────

type NovaSugestao = { funcao: FuncaoIA; grupoId?: string | null; mocaoId?: string | null; propostas?: Proposta[]; conteudo: Record<string, unknown> }

async function gravar(ctx: Contexto, itens: NovaSugestao[], lote: string): Promise<Sugestao[]> {
  if (!itens.length) return []
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("congresso_sugestoes_ia")
    .insert(
      itens.map((s) => ({
        emp_proprietaria_id: ctx.tenantId,
        congresso_id: ctx.c.id,
        lote,
        funcao: s.funcao,
        grupo_id: s.grupoId ?? null,
        mocao_id: s.mocaoId ?? null,
        proposta_ids: (s.propostas ?? []).map((p) => p.id),
        conteudo: { ...s.conteudo, versoes: Object.fromEntries((s.propostas ?? []).map((p) => [p.id, p.versao])) },
        pedida_por: ctx.autor.nome,
      }))
    )
    .select(CAMPOS)
  if (error) throw new Error(error.message)
  return (data ?? []).map(paraSugestao)
}

/** Antes de rodar de novo, as pendentes da mesma função e alcance ficam obsoletas. */
async function aposentar(ctx: Contexto, funcoes: FuncaoIA[], alcance: { grupoId?: string; propostaId?: string; mocaoId?: string; propostaIds?: string[] } = {}) {
  const admin = await createAdminClient()
  let q = admin
    .from("congresso_sugestoes_ia")
    .update({ situacao: "obsoleta", decidida_em: agoraIso() })
    .eq("emp_proprietaria_id", ctx.tenantId)
    .eq("congresso_id", ctx.c.id)
    .eq("situacao", "pendente")
    .in("funcao", funcoes)
  if (alcance.grupoId) q = q.eq("grupo_id", alcance.grupoId)
  if (alcance.mocaoId) q = q.eq("mocao_id", alcance.mocaoId)
  if (alcance.propostaId) q = q.contains("proposta_ids", [alcance.propostaId])
  if (alcance.propostaIds?.length) q = q.overlaps("proposta_ids", alcance.propostaIds)
  await q
}

async function lerSugestao(ctx: Contexto, id: string): Promise<Sugestao | null> {
  const admin = await createAdminClient()
  const { data } = await admin.from("congresso_sugestoes_ia").select(CAMPOS).eq("emp_proprietaria_id", ctx.tenantId).eq("congresso_id", ctx.c.id).eq("id", id).maybeSingle()
  return data ? paraSugestao(data) : null
}

async function decidir(ctx: Contexto, id: string, situacao: "aceita" | "ajustada" | "recusada", extra: Record<string, unknown> = {}) {
  const admin = await createAdminClient()
  const atual = await lerSugestao(ctx, id)
  await admin
    .from("congresso_sugestoes_ia")
    .update({ situacao, decidida_por: ctx.autor.nome, decidida_em: agoraIso(), conteudo: { ...(atual?.conteudo ?? {}), ...extra } })
    .eq("emp_proprietaria_id", ctx.tenantId)
    .eq("id", id)
}

async function pendente(ctx: Contexto, id: string, funcoes: FuncaoIA[]): Promise<Sugestao | { erro: string }> {
  const s = await lerSugestao(ctx, id)
  if (!s || !funcoes.includes(s.funcao)) return { erro: "Sugestão não encontrada." }
  if (s.situacao !== "pendente") return { erro: "Esta sugestão já foi decidida." }
  return s
}

export async function recusarSugestao(ctx: Contexto, id: string, grupoId?: string): Promise<{ erro?: string }> {
  const s = await lerSugestao(ctx, id)
  if (!s) return { erro: "Sugestão não encontrada." }
  if (grupoId && s.grupoId !== grupoId) return { erro: "Esta sugestão é de outro grupo." }
  if (s.situacao !== "pendente") return { erro: "Esta sugestão já foi decidida." }
  await decidir(ctx, id, "recusada")
  return {}
}

// ── Esquemas (Structured Outputs) ───────────────────────────────────────────

const obj = (props: Record<string, unknown>) => ({ type: "object", additionalProperties: false, required: Object.keys(props), properties: props })
const S = { type: "string" }
const lista = (item: Record<string, unknown>) => ({ type: "array", items: item })

const ESQ_REFINO: EsquemaJsonIA = { nome: "refino", schema: obj({ texto: S, muda_sentido: { type: "boolean" }, alerta: S }) }
const ESQ_MESCLAGEM: EsquemaJsonIA = { nome: "mesclagem", schema: obj({ grupos: lista(obj({ propostas: lista(S), texto: S, motivo: S })) }) }
const ESQ_TRIAGEM: EsquemaJsonIA = {
  nome: "triagem",
  schema: obj({ propostas: lista(obj({ proposta: S, eixo: S, motivo_eixo: S, abrangencia: S, fora_competencia: S })) }),
}
const ESQ_CORRELACAO: EsquemaJsonIA = {
  nome: "correlacao",
  schema: obj({ pares: lista(obj({ a: S, b: S, relacao: { type: "string", enum: ["igual", "complementar", "contraditoria"] }, motivo: S })) }),
}
const ESQ_SINTESE: EsquemaJsonIA = { nome: "sintese", schema: obj({ resumo: S, minuta: S }) }
const ESQ_MOCAO: EsquemaJsonIA = { nome: "triagem_mocao", schema: obj({ tipo: S, destinatario: S, alerta_conteudo: S, observacao: S }) }
const ESQ_CADERNO: EsquemaJsonIA = { nome: "caderno", schema: obj({ propostas: lista(obj({ texto: S, eixo: S, origem: S })) }) }
const ESQ_REGIMENTO: EsquemaJsonIA = {
  nome: "regimento",
  schema: obj({ ajustes: lista(obj({ chave: S, valor: S, artigo: S, trecho: S })) }),
}

// ── Redação (refino) ────────────────────────────────────────────────────────

export async function sugerirRedacao(ctx: Contexto, propostaId: string, viaLink = false, soDoGrupo?: string): Promise<{ erro?: string; sugestao?: Sugestao }> {
  const bloqueio = iaPermitida(ctx.c, viaLink)
  if (bloqueio) return { erro: bloqueio }
  const [p] = await lerPropostasAbertas(ctx, { ids: [propostaId] })
  if (!p) return { erro: "Proposta não encontrada." }
  if (soDoGrupo && p.grupoId !== soDoGrupo) return { erro: "O grupo só altera o texto das propostas que ele criou." }
  if (["aprovada", "rejeitada", "fundida"].includes(p.situacao)) return { erro: "Proposta já votada ou fundida: o texto não muda mais." }
  const r = await gerarJsonIA({
    ...ctxIA(ctx, "representacao.congresso_relatoria"),
    system:
      `${SISTEMA_BASE} Tarefa: reescrever UMA proposta com redação mais clara, direta e correta (gramática, concordância, repetições), ` +
      "mantendo exatamente o mesmo pedido e o mesmo alcance. Se não houver o que melhorar, devolva o mesmo texto. " +
      "muda_sentido = true se a sua redação puder ser lida com sentido diferente do original; alerta explica em uma frase o que conferir (vazio se nada).",
    prompt: `Texto da proposta (responda só com o texto, sem número nem rótulo):\n${semDadosPessoais(p.texto)}`,
    esquema: ESQ_REFINO,
  })
  if (r.erro) return { erro: r.erro }
  const refino = lerRefino(r.dados, p.texto)
  if (!refino) return { erro: "A IA não encontrou o que melhorar na redação." }
  await aposentar(ctx, ["refino"], { propostaId: p.id })
  const [s] = await gravar(
    ctx,
    [{ funcao: "refino", grupoId: p.grupoId, propostas: [p], conteudo: { numero: p.numero, original: p.texto, ...refino, alertasLocais: alertasDeSentido(p.texto, refino.texto) } }],
    crypto.randomUUID()
  )
  return { sugestao: s }
}

/** Aceita a redação (como veio ou ajustada): vira versão nova com motivo "redação da IA". */
export async function aceitarRedacao(ctx: Contexto, id: string, texto: string, grupoId?: string): Promise<{ erro?: string }> {
  const s = await pendente(ctx, id, ["refino"])
  if ("erro" in s) return s
  const propostaId = s.propostaIds[0]
  if (!propostaId) return { erro: "Sugestão sem proposta." }
  const r = await novaVersao(ctx, propostaId, texto, "redacao_ia", grupoId)
  if (r.erro) return r
  await decidir(ctx, id, texto.trim() === String(s.conteudo.texto ?? "").trim() ? "aceita" : "ajustada", { textoFinal: texto.trim() })
  return {}
}

// ── Consolidação: fusão, triagem, correlação ────────────────────────────────

const MAX_BLOCO = 60

async function contextoDoPrograma(ctx: Contexto) {
  const programa = await listarPrograma(ctx.c.id)
  return {
    eixos: programa.eixos,
    grupos: programa.grupos,
    nomeEixo: new Map(programa.eixos.map((e) => [e.id, e.nome])),
    nomeGrupo: new Map(programa.grupos.map((g) => [g.id, g.nome])),
  }
}

function porEixo(ps: Proposta[]): [string, Proposta[]][] {
  const m = new Map<string, Proposta[]>()
  for (const p of ps) m.set(p.eixoId ?? "", [...(m.get(p.eixoId ?? "") ?? []), p])
  return [...m.entries()]
}

async function emBlocos<T>(bs: Proposta[][], fn: (b: Proposta[]) => Promise<ResultadoJsonIA & { itens?: T[] }>): Promise<{ itens: T[]; erros: string[] }> {
  const itens: T[] = []
  const erros: string[] = []
  // Dois blocos por vez: rápido sem estourar o limite de requisições.
  for (let i = 0; i < bs.length; i += 2) {
    const rs = await Promise.all(bs.slice(i, i + 2).map(fn))
    for (const r of rs) {
      if (r.erro) erros.push(r.erro)
      else itens.push(...(r.itens ?? []))
    }
  }
  return { itens, erros }
}

/** Propostas parecidas para fundir, por eixo (só as que ainda estão na consolidação). */
export async function sugerirFusoes(ctx: Contexto, eixoId?: string | null): Promise<{ erro?: string; criadas: number }> {
  const bloqueio = iaPermitida(ctx.c, false)
  if (bloqueio) return { erro: bloqueio, criadas: 0 }
  const ps = await lerPropostasAbertas(ctx, { eixoId })
  if (ps.length < 2) return { erro: "São precisas ao menos duas propostas em consolidação.", criadas: 0 }
  const pg = await contextoDoPrograma(ctx)
  const porNumero = new Map(ps.map((p) => [p.numero, p]))
  const r = await emBlocos(blocos(porEixo(ps), MAX_BLOCO), async (b) => {
    const res = await gerarJsonIA({
      ...ctxIA(ctx, "representacao.congresso_relatoria"),
      system:
        `${SISTEMA_BASE} Tarefa: encontrar propostas que pedem a mesma coisa (ou quase) e podem virar um texto único. ` +
        "Para cada grupo de 2 ou mais propostas, escreva o texto único, que preserve tudo o que cada uma pede (nada se perde), e o motivo em uma frase. " +
        "Não agrupe propostas que só tratam do mesmo tema com pedidos diferentes. Cada proposta entra em no máximo um grupo. Se nada se repete, devolva grupos vazio.",
      prompt: listaParaIA(b.map((p) => ({ numero: p.numero, texto: p.texto, eixo: p.eixoId ? pg.nomeEixo.get(p.eixoId) : null })), { comEixo: true }),
      esquema: ESQ_MESCLAGEM,
    })
    return { ...res, itens: res.dados ? lerMesclagem(res.dados, new Set(b.map((p) => p.numero))) : [] }
  })
  if (!r.itens.length && r.erros.length) return { erro: r.erros[0], criadas: 0 }
  await aposentar(ctx, ["mesclagem"], eixoId ? { propostaIds: ps.map((p) => p.id) } : {})
  const gravadas = await gravar(
    ctx,
    r.itens.map((m) => {
      const origens = m.numeros.map((n) => porNumero.get(n)!)
      return { funcao: "mesclagem" as const, propostas: origens, conteudo: { numeros: m.numeros, texto: m.texto, motivo: m.motivo } }
    }),
    crypto.randomUUID()
  )
  return { criadas: gravadas.length, erro: r.erros.length ? `Parte dos blocos falhou: ${r.erros[0]}` : undefined }
}

/** Aceita a fusão com as origens que a relatoria manteve e o texto (talvez ajustado). */
export async function aceitarFusao(
  ctx: Contexto,
  id: string,
  dados: { propostaIds: string[]; texto: string; eixoId: string | null; abrangencia: string | null }
): Promise<{ erro?: string; numero?: number }> {
  const s = await pendente(ctx, id, ["mesclagem", "correlacao"])
  if ("erro" in s) return s
  const ids = dados.propostaIds.filter((x) => s.propostaIds.includes(x))
  const r = await fundirPropostas(ctx, ids, { texto: dados.texto, eixoId: dados.eixoId, abrangencia: dados.abrangencia })
  if (r.erro) return r
  const igual = ids.length === s.propostaIds.length && dados.texto.trim() === String(s.conteudo.texto ?? "").trim()
  await decidir(ctx, id, igual ? "aceita" : "ajustada", { fundidaNumero: r.numero, origensMantidas: ids.length })
  return r
}

/** Eixo, abrangência e competência de cada proposta em consolidação. */
export async function sugerirTriagem(ctx: Contexto, eixoId?: string | null): Promise<{ erro?: string; criadas: number }> {
  const bloqueio = iaPermitida(ctx.c, false)
  if (bloqueio) return { erro: bloqueio, criadas: 0 }
  const ps = await lerPropostasAbertas(ctx, { eixoId })
  if (!ps.length) return { erro: "Nenhuma proposta em consolidação.", criadas: 0 }
  const pg = await contextoDoPrograma(ctx)
  const abrs = (String(valor(ctx.c.config, "propostas.abrangencias") ?? "") || "").split(",").map((s) => s.trim()).filter(Boolean)
  const competencia = String(valor(ctx.c.config, "propostas.competencia") ?? "").trim()
  const eixosTxt = pg.eixos.map((e) => `- ${e.nome}${e.descricao ? `: ${e.descricao}` : ""}`).join("\n")
  const porNumero = new Map(ps.map((p) => [p.numero, p]))
  const r = await emBlocos(blocos(porEixo(ps), MAX_BLOCO), async (b) => {
    const atuais = new Map(b.map((p) => [p.numero, { eixo: p.eixoId ? (pg.nomeEixo.get(p.eixoId) ?? null) : null, abrangencia: p.abrangencia }]))
    const res = await gerarJsonIA({
      ...ctxIA(ctx, "representacao.congresso_relatoria"),
      system:
        `${SISTEMA_BASE} Tarefa: para cada proposta, dizer (1) o eixo mais adequado, entre os eixos listados, com o motivo; ` +
        `(2) ${abrs.length ? `a abrangência, entre: ${abrs.join(", ")}` : "abrangência: deixe vazio"}; ` +
        "(3) se a proposta está fora da competência deste congresso, explique em uma frase (vazio se estiver dentro). " +
        "Só aponte fora de competência com segurança: a decisão é da comissão. Use o nome do eixo e da abrangência exatamente como listados. " +
        "Inclua todas as propostas na resposta.",
      prompt:
        `Eixos:\n${eixosTxt || "(sem eixos)"}\n\n` +
        `Competência deste congresso: ${competencia || "congresso de um sindicato de trabalhadores: pauta da categoria, acordo coletivo, organização e lutas do sindicato, políticas públicas ligadas à categoria"}\n\n` +
        `Propostas:\n${listaParaIA(b.map((p) => ({ numero: p.numero, texto: p.texto, eixo: atuais.get(p.numero)?.eixo, abrangencia: p.abrangencia })), { comEixo: true })}`,
      esquema: ESQ_TRIAGEM,
    })
    return { ...res, itens: res.dados ? lerTriagem(res.dados, atuais, pg.eixos.map((e) => e.nome), abrs) : [] }
  })
  if (!r.itens.length && r.erros.length) return { erro: r.erros[0], criadas: 0 }
  await aposentar(ctx, ["eixo", "abrangencia", "competencia"], eixoId ? { propostaIds: ps.map((p) => p.id) } : {})
  const idEixo = new Map(pg.eixos.map((e) => [e.nome, e.id]))
  const novas: NovaSugestao[] = []
  for (const t of r.itens) {
    const p = porNumero.get(t.numero)!
    if (t.eixo) novas.push({ funcao: "eixo", propostas: [p], conteudo: { numero: p.numero, eixo: t.eixo, eixoId: idEixo.get(t.eixo), motivo: t.motivoEixo } })
    if (t.abrangencia) novas.push({ funcao: "abrangencia", propostas: [p], conteudo: { numero: p.numero, abrangencia: t.abrangencia } })
    if (t.foraCompetencia) novas.push({ funcao: "competencia", propostas: [p], conteudo: { numero: p.numero, motivo: t.foraCompetencia } })
  }
  const gravadas = await gravar(ctx, novas, crypto.randomUUID())
  return { criadas: gravadas.length, erro: r.erros.length ? `Parte dos blocos falhou: ${r.erros[0]}` : undefined }
}

/** Eixo e abrangência: aplica; fora de competência: manda só aos anais (decisão da comissão). */
export async function aceitarTriagem(ctx: Contexto, id: string): Promise<{ erro?: string }> {
  const s = await pendente(ctx, id, ["eixo", "abrangencia", "competencia"])
  if ("erro" in s) return s
  const dados =
    s.funcao === "eixo"
      ? { eixoId: (s.conteudo.eixoId as string | undefined) ?? null }
      : s.funcao === "abrangencia"
        ? { abrangencia: String(s.conteudo.abrangencia ?? "") || null }
        : { situacao: "anais" as const }
  if (s.funcao === "eixo" && !dados.eixoId) return { erro: "O eixo sugerido não existe mais." }
  const r = await ajustarPropostas(ctx, s.propostaIds, dados)
  if (r.erro) return r
  await decidir(ctx, id, "aceita")
  return {}
}

/** Temas iguais, complementares ou contraditórios entre grupos diferentes. */
export async function sugerirCorrelacao(ctx: Contexto, eixoId?: string | null): Promise<{ erro?: string; criadas: number }> {
  const bloqueio = iaPermitida(ctx.c, false)
  if (bloqueio) return { erro: bloqueio, criadas: 0 }
  const ps = await lerPropostasAbertas(ctx, { eixoId })
  const pg = await contextoDoPrograma(ctx)
  const origem = (p: Proposta) => (p.grupoId ? (pg.nomeGrupo.get(p.grupoId) ?? "Grupo") : (p.origemDescricao ?? p.origem))
  if (new Set(ps.map(origem)).size < 2) return { erro: "A correlação compara propostas de grupos ou origens diferentes: ainda há uma só.", criadas: 0 }
  const porNumero = new Map(ps.map((p) => [p.numero, p]))
  const r = await emBlocos(blocos(porEixo(ps), 80), async (b) => {
    const grupoDe = new Map(b.map((p) => [p.numero, origem(p)]))
    const res = await gerarJsonIA({
      ...ctxIA(ctx, "representacao.congresso_relatoria"),
      system:
        `${SISTEMA_BASE} Tarefa: comparar propostas de grupos (ou origens) diferentes, indicadas entre colchetes, e listar os pares relacionados: ` +
        "igual (pedem a mesma coisa), complementar (uma completa a outra) ou contraditoria (não podem ser aprovadas juntas). " +
        "Dê o motivo em uma frase. Priorize as contraditórias, que a plenária precisa decidir. Não compare propostas do mesmo grupo. Se não houver pares, devolva lista vazia.",
      prompt: listaParaIA(b.map((p) => ({ numero: p.numero, texto: p.texto, grupo: origem(p) })), { comGrupo: true }),
      esquema: ESQ_CORRELACAO,
    })
    return { ...res, itens: res.dados ? lerCorrelacao(res.dados, grupoDe) : [] }
  })
  if (!r.itens.length && r.erros.length) return { erro: r.erros[0], criadas: 0 }
  await aposentar(ctx, ["correlacao"], eixoId ? { propostaIds: ps.map((p) => p.id) } : {})
  const gravadas = await gravar(
    ctx,
    r.itens.map((x) => {
      const a = porNumero.get(x.a)!
      const b = porNumero.get(x.b)!
      return {
        funcao: "correlacao" as const,
        propostas: [a, b],
        conteudo: { numeros: [x.a, x.b], relacao: x.relacao, motivo: x.motivo, origens: [origem(a), origem(b)], texto: `${a.texto}\n\n${b.texto}` },
      }
    }),
    crypto.randomUUID()
  )
  return { criadas: gravadas.length, erro: r.erros.length ? `Parte dos blocos falhou: ${r.erros[0]}` : undefined }
}

/** Contradição aceita: vira dissenso registrado nas duas propostas, para a plenária decidir. */
export async function levarDissenso(ctx: Contexto, id: string): Promise<{ erro?: string }> {
  const s = await pendente(ctx, id, ["correlacao"])
  if ("erro" in s) return s
  const [na, nb] = (s.conteudo.numeros as number[]) ?? []
  const motivo = String(s.conteudo.motivo ?? "")
  const admin = await createAdminClient()
  const { error } = await admin.from("congresso_apontamentos").insert(
    s.propostaIds.map((pid, i) => ({
      emp_proprietaria_id: ctx.tenantId,
      congresso_id: ctx.c.id,
      grupo_id: null,
      proposta_id: pid,
      tipo: "dissenso",
      texto: `Contradiz a proposta ${i === 0 ? nb : na}${motivo ? `: ${motivo}` : ""} (apontado na consolidação).`,
      autor: ctx.autor.nome,
    }))
  )
  if (error) return { erro: error.message }
  await decidir(ctx, id, "aceita", { dissenso: true })
  return {}
}

// ── Síntese do grupo ────────────────────────────────────────────────────────

export async function sugerirSintese(ctx: Contexto, grupoId: string, viaLink = false): Promise<{ erro?: string; sugestao?: Sugestao }> {
  const bloqueio = iaPermitida(ctx.c, viaLink)
  if (bloqueio) return { erro: bloqueio }
  const admin = await createAdminClient()
  const [{ data: g }, { data: aps }, { data: apr }] = await Promise.all([
    admin.from("congresso_grupos").select("id, nome, eixo_id").eq("emp_proprietaria_id", ctx.tenantId).eq("congresso_id", ctx.c.id).eq("id", grupoId).maybeSingle(),
    admin.from("congresso_apontamentos").select("proposta_id, tipo, texto").eq("emp_proprietaria_id", ctx.tenantId).eq("grupo_id", grupoId).is("retirado_em", null),
    admin.from("congresso_apreciacoes").select("proposta_id, a_favor, contra, abstencao, resultado").eq("emp_proprietaria_id", ctx.tenantId).eq("grupo_id", grupoId),
  ])
  if (!g) return { erro: "Grupo não encontrado." }
  const ids = [...new Set([...(aps ?? []).map((a) => a.proposta_id as string | null), ...(apr ?? []).map((a) => a.proposta_id as string)].filter((x): x is string => !!x))]
  const doGrupo = await lerPropostasAbertas(ctx, {}).then((ps) => ps.filter((p) => p.grupoId === grupoId))
  const outras = ids.length ? await lerPropostasAbertas(ctx, { ids }) : []
  const todas = [...new Map([...doGrupo, ...outras].map((p) => [p.id, p])).values()].sort((a, b) => a.numero - b.numero)
  if (!todas.length && !(aps ?? []).length) return { erro: "O grupo ainda não tem propostas nem apontamentos para sintetizar." }
  const numero = new Map(todas.map((p) => [p.id, p.numero]))
  const apontTxt = (aps ?? [])
    .map((a) => `- ${a.tipo}${a.proposta_id ? ` sobre P${numero.get(a.proposta_id as string) ?? "?"}` : ""}: ${semDadosPessoais(String(a.texto))}`)
    .join("\n")
  const aprTxt = (apr ?? [])
    .map((a) => `- P${numero.get(a.proposta_id as string) ?? "?"}: ${a.a_favor} a favor, ${a.contra} contra, ${a.abstencao} abstenções (${a.resultado})`)
    .join("\n")
  const r = await gerarJsonIA({
    ...ctxIA(ctx, "representacao.congresso_relatoria"),
    system:
      `${SISTEMA_BASE} Tarefa: preparar a síntese de um grupo de trabalho. resumo: um parágrafo com os principais temas e consensos. ` +
      "minuta: o relatório do grupo, em tópicos, citando as propostas pelo número (P12), os apontamentos e emendas, os dissensos e, se houver, o resultado das votações. " +
      "Não cite nomes de pessoas. É um rascunho que a relatoria vai revisar.",
    prompt: `Grupo: ${g.nome}\n\nPropostas:\n${listaParaIA(todas)}\n\nApontamentos:\n${apontTxt || "(nenhum)"}\n\nVotações no grupo:\n${aprTxt || "(nenhuma)"}`,
    esquema: ESQ_SINTESE,
  })
  if (r.erro) return { erro: r.erro }
  const resumo = String(r.dados?.resumo ?? "").trim()
  const minuta = String(r.dados?.minuta ?? "").trim()
  if (!resumo && !minuta) return { erro: "A IA não devolveu a síntese." }
  await aposentar(ctx, ["sintese"], { grupoId })
  const [s] = await gravar(ctx, [{ funcao: "sintese", grupoId, conteudo: { resumo, minuta } }], crypto.randomUUID())
  return { sugestao: s }
}

/** Guarda a síntese revista (com ou sem a sugestão da IA). */
export async function guardarSintese(ctx: Contexto, grupoId: string, texto: string, sugestaoId?: string | null): Promise<{ erro?: string }> {
  const t = texto.trim()
  const admin = await createAdminClient()
  const { error } = await admin
    .from("congresso_grupos")
    .update({ sintese: t || null, sintese_em: t ? agoraIso() : null, sintese_por: t ? ctx.autor.nome : null })
    .eq("emp_proprietaria_id", ctx.tenantId)
    .eq("congresso_id", ctx.c.id)
    .eq("id", grupoId)
  if (error) return { erro: error.message }
  if (sugestaoId) {
    const s = await lerSugestao(ctx, sugestaoId)
    if (s && s.situacao === "pendente" && s.grupoId === grupoId) {
      const original = `${String(s.conteudo.resumo ?? "")}\n\n${String(s.conteudo.minuta ?? "")}`.trim()
      await decidir(ctx, sugestaoId, original === t ? "aceita" : "ajustada")
    }
  }
  return {}
}

export async function sinteseDoGrupo(tenantId: string, congressoId: string, grupoId: string): Promise<{ texto: string; em: string | null; por: string | null } | null> {
  const admin = await createAdminClient()
  const { data } = await admin.from("congresso_grupos").select("sintese, sintese_em, sintese_por").eq("emp_proprietaria_id", tenantId).eq("congresso_id", congressoId).eq("id", grupoId).maybeSingle()
  if (!data?.sintese) return null
  return { texto: data.sintese as string, em: (data.sintese_em as string | null) ?? null, por: (data.sintese_por as string | null) ?? null }
}

// ── Triagem de moção ────────────────────────────────────────────────────────

export async function triarMocao(ctx: Contexto, mocaoId: string): Promise<{ erro?: string; sugestao?: Sugestao }> {
  const bloqueio = iaPermitida(ctx.c, false)
  if (bloqueio) return { erro: bloqueio }
  const d = await dadosDaMocao(ctx.c, mocaoId)
  if (!d) return { erro: "Moção não encontrada." }
  const tipos = tiposDeMocao(valor<string>(ctx.c.config, "mocoes.tipos") as string)
  const r = await gerarJsonIA({
    ...ctxIA(ctx, "representacao.congresso_mocao"),
    system:
      "Você faz a triagem de moções apresentadas num congresso sindical brasileiro. " +
      `tipo: o mais adequado entre ${tipos.length ? tipos.join(", ") : "(sem tipos: deixe vazio)"}, exatamente como escrito. ` +
      "destinatario: a quem a moção se dirige, se o texto indicar (vazio se não). " +
      "alerta_conteudo: só se houver ofensa pessoal, discriminação, ameaça ou acusação sem fundamento contra pessoa identificada; diga o trecho e o porquê em uma frase (vazio se não houver). " +
      "Crítica política, mesmo dura, não é ofensa. observacao: outra observação útil à comissão, em uma frase (vazio se nada). Você nunca decide a habilitação.",
    prompt: `Título: ${semDadosPessoais(d.mocao.titulo)}\nTipo informado: ${d.mocao.tipo ?? "(nenhum)"}\nDestinatário informado: ${d.mocao.destinatario ?? "(nenhum)"}\n\nTexto:\n${semDadosPessoais(d.mocao.texto)}`,
    esquema: ESQ_MOCAO,
  })
  if (r.erro) return { erro: r.erro }
  const t = lerTriagemMocao(r.dados, tipos)
  await aposentar(ctx, ["triagem_mocao"], { mocaoId })
  const [s] = await gravar(ctx, [{ funcao: "triagem_mocao", mocaoId, conteudo: { ...t, versao: d.mocao.versao } }], crypto.randomUUID())
  return { sugestao: s }
}

/** Aplica o tipo (e, se pedido, o destinatário) sugerido. Nunca habilita nem inabilita. */
export async function aceitarTriagemMocao(ctx: Contexto, id: string, dados: { tipo: boolean; destinatario: boolean }): Promise<{ erro?: string; novaVersao?: boolean }> {
  const s = await pendente(ctx, id, ["triagem_mocao"])
  if ("erro" in s) return s
  const d = s.mocaoId ? await dadosDaMocao(ctx.c, s.mocaoId) : null
  if (!d) return { erro: "Moção não encontrada." }
  const m = d.mocao
  const tipo = dados.tipo && s.conteudo.tipo ? String(s.conteudo.tipo) : m.tipo
  const destinatario = dados.destinatario && s.conteudo.destinatario ? String(s.conteudo.destinatario) : m.destinatario
  if (tipo === m.tipo && destinatario === m.destinatario) {
    await decidir(ctx, id, "recusada")
    return {}
  }
  const r = await alterarMocao(ctx, m.id, { tipo, titulo: m.titulo, destinatario, texto: m.texto, unidadeId: m.unidadeId })
  if (r.erro) return r
  await decidir(ctx, id, dados.tipo && dados.destinatario ? "aceita" : "ajustada")
  return { novaVersao: r.novaVersao }
}

// ── Leitura de documentos ───────────────────────────────────────────────────

export type Documento = { texto?: string; pdfBase64?: string }

async function lerDocumento(ctx: Contexto, doc: Documento, system: string, pedido: string, esquema: EsquemaJsonIA): Promise<ResultadoJsonIA> {
  const base = { ...ctxIA(ctx, "representacao.congresso_documentos"), system, esquema }
  if (doc.texto && doc.texto.trim().length >= 20) return gerarJsonIA({ ...base, prompt: `${pedido}\n\nDocumento:\n\n${semDadosPessoais(doc.texto).slice(0, 150000)}` })
  if (doc.pdfBase64) return gerarJsonIADePdf({ ...base, prompt: pedido, pdfBase64: doc.pdfBase64 })
  return { erro: "O arquivo está vazio ou não tem texto legível." }
}

/** Caderno de teses → propostas para conferir antes de gravar. */
export async function lerCadernoComIA(ctx: Contexto, doc: Documento): Promise<{ erro?: string; sugestaoId?: string; itens?: ItemCaderno[] }> {
  const bloqueio = iaPermitida(ctx.c, false)
  if (bloqueio) return { erro: bloqueio }
  const pg = await contextoDoPrograma(ctx)
  const r = await lerDocumento(
    ctx,
    doc,
    `${SISTEMA_DOCUMENTO} Tarefa: extrair do caderno de teses (ou documento de propostas) cada proposta como item separado, com o texto integral como está escrito. ` +
      `eixo: o eixo do documento, casado com um destes, exatamente como escrito: ${pg.eixos.map((e) => e.nome).join("; ") || "(sem eixos: vazio)"} (vazio se não der para casar). ` +
      "origem: a tese, entidade ou seção de onde veio, se constar. Não inclua introduções, justificativas longas, análises de conjuntura nem assinaturas: só o que é proposta.",
    "Extraia as propostas.",
    ESQ_CADERNO
  )
  if (r.erro) return { erro: r.erro }
  const itens = lerCaderno(r.dados, pg.eixos.map((e) => e.nome))
  if (!itens.length) return { erro: "Não encontrei propostas no documento." }
  const [s] = await gravar(ctx, [{ funcao: "caderno", conteudo: { quantas: itens.length } }], crypto.randomUUID())
  return { sugestaoId: s.id, itens }
}

/** Grava as propostas conferidas do caderno, por eixo. */
export async function gravarCaderno(
  ctx: Contexto,
  sugestaoId: string,
  itens: { texto: string; eixoId: string | null }[],
  dados: { origem: "caderno" | "etapa_anterior" | "documento"; origemDescricao: string | null },
  lidos: number
): Promise<{ erro?: string; criadas: number }> {
  const s = await pendente(ctx, sugestaoId, ["caderno"])
  if ("erro" in s) return { ...s, criadas: 0 }
  const porEixoId = new Map<string, string[]>()
  for (const i of itens) if (i.texto.trim().length >= 5) porEixoId.set(i.eixoId ?? "", [...(porEixoId.get(i.eixoId ?? "") ?? []), i.texto.trim()])
  let criadas = 0
  for (const [eixoId, textos] of porEixoId) {
    const r = await novasPropostas(ctx, { textos, eixoId: eixoId || null, origem: dados.origem, origemDescricao: dados.origemDescricao, abrangencia: null })
    if (r.erro) return { erro: r.erro, criadas }
    criadas += r.criadas
  }
  await decidir(ctx, sugestaoId, criadas === lidos ? "aceita" : "ajustada", { gravadas: criadas })
  return { criadas }
}

/** Regimento → ajustes da configuração, cada um com o artigo de origem, para conferir. */
export async function lerRegimentoComIA(ctx: Contexto, doc: Documento): Promise<{ erro?: string; sugestaoId?: string; ajustes?: AjusteLido[] }> {
  const r = await lerDocumento(
    ctx,
    doc,
    "Você lê regimentos internos de congressos, plenárias e conferências e preenche a configuração do sistema que apoia o evento. " +
      "Para cada ajuste do catálogo que o regimento define com clareza, devolva a chave, o valor no formato do catálogo (para escolha, use o valor entre aspas), " +
      "o artigo (ex.: Art. 12, §2º) e o trecho curto que justifica. Não deduza o que o regimento não diz; não repita chaves. Ignore o que não estiver no catálogo.\n\nCatálogo:\n" +
      catalogoParaIA(),
    "Leia o regimento e devolva os ajustes.",
    ESQ_REGIMENTO
  )
  if (r.erro) return { erro: r.erro }
  // Primeiro o que muda; o que já está assim vem por último, desmarcado na tela.
  const ajustes = lerRegimento(r.dados)
    .map((a) => ({ ...a, descricao: descreverValor(AJUSTE_POR_CHAVE.get(a.chave)!, a.valor), igualAtual: ctx.c.config.valores[a.chave] === a.valor }))
    .sort((a, b) => Number(a.igualAtual) - Number(b.igualAtual))
  if (!ajustes.length) return { erro: "Não encontrei no documento nenhuma regra que corresponda aos ajustes." }
  const [s] = await gravar(ctx, [{ funcao: "regimento", conteudo: { ajustes } }], crypto.randomUUID())
  return { sugestaoId: s.id, ajustes }
}

/** Aplica os ajustes marcados como nova versão da configuração (origem: regimento, com o artigo). */
export async function aplicarRegimento(ctx: Contexto, sugestaoId: string, chaves: string[], autorId: string, deliberacao: string | null): Promise<{ erro?: string; ok?: string }> {
  const s = await pendente(ctx, sugestaoId, ["regimento"])
  if ("erro" in s) return s
  const lidos = ((s.conteudo.ajustes as AjusteLido[] | undefined) ?? []).filter((a) => chaves.includes(a.chave))
  if (!lidos.length) return { erro: "Marque ao menos um ajuste." }
  const brutos = Object.fromEntries(lidos.map((a) => [a.chave, a.valor]))
  const artigos = Object.fromEntries(lidos.map((a) => [a.chave, a.artigo || "Regimento"]))
  const r = await salvarConfig(ctx.c, brutos, artigos, "Lido do regimento pela IA e conferido", deliberacao, autorId)
  if (r.erro) return r
  const total = ((s.conteudo.ajustes as unknown[]) ?? []).length
  await decidir(ctx, sugestaoId, lidos.length === total ? "aceita" : "ajustada", { aplicadas: lidos.map((a) => a.chave) })
  return r
}

/** O que a tela do grupo precisa da IA: redações pendentes por proposta e a síntese. */
export async function iaDoGrupo(
  c: Congresso,
  tenantId: string,
  grupoId: string,
  viaLink: boolean
): Promise<{ ligada: boolean; redacoes: Record<string, Sugestao>; sintese: { texto: string; em: string | null; por: string | null } | null; sintesePendente: Sugestao | null }> {
  const ligada = !iaPermitida(c, viaLink)
  const [sintese, pend] = await Promise.all([
    sinteseDoGrupo(tenantId, c.id, grupoId),
    ligada ? listarSugestoes(c, { grupoId, funcoes: ["refino", "sintese"], pendentes: true, tenantId }) : Promise.resolve([] as Sugestao[]),
  ])
  const redacoes: Record<string, Sugestao> = {}
  for (const s of pend) if (s.funcao === "refino" && s.propostaIds[0] && !redacoes[s.propostaIds[0]]) redacoes[s.propostaIds[0]] = s
  return { ligada, redacoes, sintese, sintesePendente: pend.find((s) => s.funcao === "sintese") ?? null }
}
