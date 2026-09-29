import "server-only"

import {
  parear,
  situacaoDoPar,
  type ClausulaComparavel,
  type ParSugerido,
  type Situacao,
} from "@/lib/acordos-comparar"
import { temaClausula, type TemaClausula } from "@/lib/acordos-constantes"
import { esquemaAusente } from "@/lib/db/comum"
import { gerarJsonIA } from "@/lib/ia"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Comparador de acordos (Fase 2). O pareamento e a situação vêm de regra
 * (src/lib/acordos-comparar.ts); a IA (1) sugere pares para o que sobrou e
 * (2) resume cada mudança e a avalia para o trabalhador — como SUGESTÃO que a
 * entidade corrige. Ver supabase/acordos-comparacoes.sql.
 */

export const AVISO_SQL_COMPARACOES =
  "O comparador usa tabelas novas — rode supabase/acordos-comparacoes.sql no Supabase."

export type Avaliacao = "favoravel" | "desfavoravel" | "neutra"
const AVALIACOES: Avaliacao[] = ["favoravel", "desfavoravel", "neutra"]

type ClausulaBanco = ClausulaComparavel & { resumo: string | null; ordem: number }

async function clausulasDoAcordo(acordoId: string): Promise<ClausulaBanco[]> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("acordo_clausulas")
    .select("id, numero, titulo, texto, tema, resumo, ordem")
    .eq("acordo_id", acordoId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .order("ordem", { ascending: true })
  return (data ?? []).map((c) => ({
    id: String(c.id),
    numero: c.numero ?? null,
    titulo: c.titulo ?? null,
    texto: c.texto ?? null,
    tema: c.tema ?? null,
    resumo: c.resumo ?? null,
    ordem: Number(c.ordem ?? 0),
  }))
}

// ── IA ───────────────────────────────────────────────────────────────────────

const SYSTEM_PARES = `Você compara dois acordos coletivos de trabalho brasileiros (A = anterior/base, B = novo/proposta). Recebe as cláusulas de A e de B que NÃO foram pareadas automaticamente. Diga quais cláusulas de A e de B tratam do MESMO assunto (renomeadas, reescritas ou desmembradas). Só pareie quando tiver segurança; cada cláusula entra em no máximo um par. Não pareie assuntos apenas parecidos.`

async function sugerirParesIA(
  sobrasA: ClausulaBanco[],
  sobrasB: ClausulaBanco[]
): Promise<{ pares: { a: string; b: string }[]; aviso: string | null }> {
  if (sobrasA.length === 0 || sobrasB.length === 0) return { pares: [], aviso: null }
  const item = (c: ClausulaBanco) => ({
    id: c.id,
    numero: c.numero,
    titulo: c.titulo,
    resumo: c.resumo ?? (c.texto ?? "").slice(0, 300),
  })
  const { dados, erro } = await gerarJsonIA({
    system: SYSTEM_PARES,
    prompt: `Responda {"pares":[{"a":"<id de A>","b":"<id de B>"}]}.\n\nA:\n${JSON.stringify(sobrasA.map(item))}\n\nB:\n${JSON.stringify(sobrasB.map(item))}`,
  })
  if (erro || !dados) return { pares: [], aviso: `A IA não sugeriu pares para as sobras (${erro ?? "sem resposta"}).` }
  const idsA = new Set(sobrasA.map((c) => c.id))
  const idsB = new Set(sobrasB.map((c) => c.id))
  const usados = new Set<string>()
  const pares: { a: string; b: string }[] = []
  for (const p of Array.isArray(dados.pares) ? (dados.pares as Record<string, unknown>[]) : []) {
    const a = String(p.a ?? "")
    const b = String(p.b ?? "")
    if (!idsA.has(a) || !idsB.has(b) || usados.has(a) || usados.has(b)) continue
    usados.add(a)
    usados.add(b)
    pares.push({ a, b })
  }
  return { pares, aviso: null }
}

const SYSTEM_ANALISE = `Você é assessor(a) de um sindicato de trabalhadores e analisa mudanças entre duas versões de um acordo coletivo (A = anterior/base, B = novo/proposta).
Para cada item:
- "resumo": o que MUDOU, em uma ou duas frases objetivas, com os números antes → depois (percentuais, valores em R$, prazos, quem tem direito). Para cláusula NOVA (só em B), diga o que ela garante; para SUPRIMIDA (só em A), o que se perde.
- "avaliacao": para o TRABALHADOR, "favoravel", "desfavoravel" ou "neutra" (neutra = só redação, reorganização ou efeito incerto).
- "motivo": uma frase explicando a avaliação.
Não invente números nem efeitos que o texto não diz. Seja fiel ao texto.`

type ItemAnalise = { i: number; situacao: Situacao; a: string | null; b: string | null }

async function analisarIA(
  itens: ItemAnalise[]
): Promise<{ resultado: Map<number, { resumo: string; avaliacao: Avaliacao; motivo: string | null }>; falhas: number; lotes: number; erro: string | null }> {
  const resultado = new Map<number, { resumo: string; avaliacao: Avaliacao; motivo: string | null }>()
  const LOTE = 8
  const lotes: ItemAnalise[][] = []
  for (let de = 0; de < itens.length; de += LOTE) lotes.push(itens.slice(de, de + LOTE))
  let falhas = 0
  let ultimoErro: string | null = null
  await Promise.all(
    lotes.map(async (lote) => {
      const corpo = lote.map((it) => ({
        i: it.i,
        situacao: it.situacao,
        A: it.a ? it.a.slice(0, 3500) : null,
        B: it.b ? it.b.slice(0, 3500) : null,
      }))
      const { dados, erro } = await gerarJsonIA({
        system: SYSTEM_ANALISE,
        prompt: `Responda {"itens":[{"i":<número>,"resumo":"…","avaliacao":"favoravel|desfavoravel|neutra","motivo":"…"}]}.\n\n${JSON.stringify(corpo)}`,
      })
      if (erro || !dados) {
        falhas++
        ultimoErro = erro ?? "resposta vazia"
        return
      }
      for (const r of Array.isArray(dados.itens) ? (dados.itens as Record<string, unknown>[]) : []) {
        const i = Number(r.i)
        if (!lote.some((x) => x.i === i)) continue
        const avaliacao = AVALIACOES.includes(r.avaliacao as Avaliacao) ? (r.avaliacao as Avaliacao) : "neutra"
        const resumo = typeof r.resumo === "string" ? r.resumo.trim().slice(0, 600) : ""
        if (!resumo) continue
        resultado.set(i, {
          resumo,
          avaliacao,
          motivo: typeof r.motivo === "string" && r.motivo.trim() ? r.motivo.trim().slice(0, 300) : null,
        })
      }
    })
  )
  return { resultado, falhas, lotes: lotes.length, erro: ultimoErro }
}

// ── Criação ──────────────────────────────────────────────────────────────────

export async function criarComparacao(
  acordoA: string,
  acordoB: string,
  usuarioId: string
): Promise<{ id?: string; erro?: string }> {
  if (acordoA === acordoB) return { erro: "Escolha dois acordos diferentes." }
  const admin = await createAdminClient()
  const empId = await tenantAtual()
  const { data: acordos } = await admin
    .from("acordo_coletivo")
    .select("id, titulo")
    .in("id", [acordoA, acordoB])
    .eq("emp_proprietaria_id", empId)
  const ta = acordos?.find((x) => x.id === acordoA)
  const tb = acordos?.find((x) => x.id === acordoB)
  if (!ta || !tb) return { erro: "Acordo não encontrado." }

  const [A, B] = await Promise.all([clausulasDoAcordo(acordoA), clausulasDoAcordo(acordoB)])
  if (A.length === 0 || B.length === 0) {
    return { erro: "Os dois acordos precisam ter cláusulas — extraia do PDF primeiro." }
  }

  // 1. Regra.
  const sugeridos: ParSugerido[] = parear(A, B)
  const avisos: string[] = []

  // 2. IA para as sobras.
  const sobrasA = A.filter((c) => sugeridos.some((p) => p.a === c.id && !p.b))
  const sobrasB = B.filter((c) => sugeridos.some((p) => p.b === c.id && !p.a))
  const ia = await sugerirParesIA(sobrasA, sobrasB)
  if (ia.aviso) avisos.push(ia.aviso)
  let pares = sugeridos.filter(
    (p) => !ia.pares.some((x) => (p.a === x.a && !p.b) || (p.b === x.b && !p.a))
  )
  pares = [...pares, ...ia.pares.map((x) => ({ a: x.a, b: x.b, origem: "ia" as const, similaridade: null }))]

  // Ordem: pela cláusula de A; as novas no fim, na ordem de B.
  const ordemA = new Map(A.map((c) => [c.id, c.ordem]))
  const ordemB = new Map(B.map((c) => [c.id, c.ordem]))
  pares.sort((x, y) => {
    const ox = x.a ? ordemA.get(x.a)! : 10000 + ordemB.get(x.b!)!
    const oy = y.a ? ordemA.get(y.a)! : 10000 + ordemB.get(y.b!)!
    return ox - oy
  })

  const porIdA = new Map(A.map((c) => [c.id, c]))
  const porIdB = new Map(B.map((c) => [c.id, c]))
  const linhas = pares.map((p, i) => {
    const a = p.a ? porIdA.get(p.a)! : null
    const b = p.b ? porIdB.get(p.b)! : null
    return {
      p,
      a,
      b,
      situacao: situacaoDoPar(a, b),
      tema: (b?.tema ?? a?.tema) as TemaClausula | null,
      ordem: i,
    }
  })

  // 3. IA analisa o que mudou (iguais não precisam).
  const paraAnalisar = linhas
    .map((l, i) => ({ i, situacao: l.situacao, a: l.a?.texto ?? null, b: l.b?.texto ?? null }))
    .filter((x) => x.situacao !== "igual")
  const analise = await analisarIA(paraAnalisar)
  if (analise.falhas) {
    avisos.push(`A IA não analisou ${analise.falhas} de ${analise.lotes} lote(s) de mudanças${analise.erro ? ` (${analise.erro.replace(/\.$/, "")})` : ""} — use "Analisar com IA" nesses pares.`)
  }

  const { data: comp, error } = await admin
    .from("acordo_comparacoes")
    .insert({
      emp_proprietaria_id: empId,
      acordo_a_id: acordoA,
      acordo_b_id: acordoB,
      titulo: `${ta.titulo ?? "Acordo A"} × ${tb.titulo ?? "Acordo B"}`,
      analise_avisos: avisos.length ? avisos.join("\n") : null,
      criado_por_id: usuarioId,
    })
    .select("id")
    .single()
  if (error || !comp) {
    return { erro: error && esquemaAusente(error) ? AVISO_SQL_COMPARACOES : `Não foi possível salvar: ${error?.message ?? "?"}` }
  }

  const registros = linhas.map((l, i) => {
    const r = analise.resultado.get(i)
    return {
      emp_proprietaria_id: empId,
      comparacao_id: comp.id,
      clausula_a_id: l.a?.id ?? null,
      clausula_b_id: l.b?.id ?? null,
      situacao: l.situacao,
      origem_par: l.p.origem,
      similaridade: l.p.similaridade,
      tema: temaClausula(l.tema),
      resumo_mudanca: r?.resumo ?? null,
      avaliacao: l.situacao === "igual" ? null : (r?.avaliacao ?? null),
      avaliacao_motivo: r?.motivo ?? null,
      ordem: l.ordem,
    }
  })
  for (let de = 0; de < registros.length; de += 200) {
    const { error: e } = await admin.from("acordo_comparacao_pares").insert(registros.slice(de, de + 200))
    if (e) return { erro: `Não foi possível salvar os pares: ${e.message}` }
  }
  return { id: comp.id as string }
}

// ── Leitura ──────────────────────────────────────────────────────────────────

export type ComparacaoLista = {
  id: string
  titulo: string
  acordoA: string | null
  acordoB: string | null
  createdAt: string
}

export async function listarComparacoes(): Promise<{ disponivel: boolean; lista: ComparacaoLista[] }> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("acordo_comparacoes")
    .select("id, titulo, acordo_a_id, acordo_b_id, created_at")
    .eq("emp_proprietaria_id", await tenantAtual())
    .order("created_at", { ascending: false })
    .limit(200)
  if (error) {
    if (esquemaAusente(error)) return { disponivel: false, lista: [] }
    throw new Error(error.message)
  }
  return {
    disponivel: true,
    lista: (data ?? []).map((c) => ({
      id: c.id as string,
      titulo: String(c.titulo ?? "Comparação"),
      acordoA: c.acordo_a_id as string | null,
      acordoB: c.acordo_b_id as string | null,
      createdAt: String(c.created_at),
    })),
  }
}

export type LadoPar = { id: string; numero: string | null; titulo: string | null; texto: string | null }

export type ParComparacao = {
  id: string
  situacao: Situacao
  origem: string | null
  similaridade: number | null
  tema: TemaClausula | null
  resumo: string | null
  avaliacao: Avaliacao | null
  avaliacaoMotivo: string | null
  avaliacaoManual: boolean
  a: LadoPar | null
  b: LadoPar | null
}

export type ComparacaoDetalhe = {
  id: string
  titulo: string
  acordoA: { id: string; titulo: string | null }
  acordoB: { id: string; titulo: string | null }
  avisos: string[]
  createdAt: string
  pares: ParComparacao[]
}

export async function obterComparacao(id: string): Promise<ComparacaoDetalhe | null> {
  const admin = await createAdminClient()
  const empId = await tenantAtual()
  const { data: c, error } = await admin
    .from("acordo_comparacoes")
    .select("*")
    .eq("id", id)
    .eq("emp_proprietaria_id", empId)
    .maybeSingle()
  if (error || !c) return null
  const [{ data: pares }, { data: acordos }] = await Promise.all([
    admin
      .from("acordo_comparacao_pares")
      .select("*")
      .eq("comparacao_id", id)
      .eq("emp_proprietaria_id", empId)
      .order("ordem", { ascending: true }),
    admin.from("acordo_coletivo").select("id, titulo").in("id", [c.acordo_a_id, c.acordo_b_id]),
  ])
  const ids = [
    ...new Set((pares ?? []).flatMap((p) => [p.clausula_a_id, p.clausula_b_id]).filter(Boolean) as string[]),
  ]
  const clausulas = new Map<string, LadoPar>()
  for (let de = 0; de < ids.length; de += 200) {
    const { data } = await admin
      .from("acordo_clausulas")
      .select("id, numero, titulo, texto")
      .in("id", ids.slice(de, de + 200))
      .eq("emp_proprietaria_id", empId)
    for (const x of data ?? []) {
      clausulas.set(String(x.id), { id: String(x.id), numero: x.numero ?? null, titulo: x.titulo ?? null, texto: x.texto ?? null })
    }
  }
  const titulo = (acordoId: string) => acordos?.find((x) => x.id === acordoId)?.titulo ?? null
  return {
    id: String(c.id),
    titulo: String(c.titulo ?? "Comparação"),
    acordoA: { id: String(c.acordo_a_id), titulo: titulo(String(c.acordo_a_id)) },
    acordoB: { id: String(c.acordo_b_id), titulo: titulo(String(c.acordo_b_id)) },
    avisos: String(c.analise_avisos ?? "").split("\n").filter(Boolean),
    createdAt: String(c.created_at),
    pares: (pares ?? []).map((p) => ({
      id: String(p.id),
      situacao: p.situacao as Situacao,
      origem: p.origem_par ?? null,
      similaridade: p.similaridade === null ? null : Number(p.similaridade),
      tema: temaClausula(p.tema),
      resumo: p.resumo_mudanca ?? null,
      avaliacao: AVALIACOES.includes(p.avaliacao) ? (p.avaliacao as Avaliacao) : null,
      avaliacaoMotivo: p.avaliacao_motivo ?? null,
      avaliacaoManual: p.avaliacao_manual === true,
      a: p.clausula_a_id ? (clausulas.get(String(p.clausula_a_id)) ?? null) : null,
      b: p.clausula_b_id ? (clausulas.get(String(p.clausula_b_id)) ?? null) : null,
    })),
  }
}

// ── Ajustes ──────────────────────────────────────────────────────────────────

async function parDaComparacao(parId: string) {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("acordo_comparacao_pares")
    .select("*")
    .eq("id", parId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  return data
}

/** Separa um par errado: vira uma suprimida (A) e uma nova (B), sem análise. */
export async function desfazerPar(parId: string): Promise<{ erro?: string }> {
  const p = await parDaComparacao(parId)
  if (!p || !p.clausula_a_id || !p.clausula_b_id) return { erro: "Par não encontrado." }
  const admin = await createAdminClient()
  const empId = await tenantAtual()
  await admin
    .from("acordo_comparacao_pares")
    .update({
      clausula_b_id: null,
      situacao: "suprimida",
      origem_par: null,
      similaridade: null,
      resumo_mudanca: null,
      avaliacao: null,
      avaliacao_motivo: null,
      avaliacao_manual: false,
    })
    .eq("id", parId)
    .eq("emp_proprietaria_id", empId)
  const { error } = await admin.from("acordo_comparacao_pares").insert({
    emp_proprietaria_id: empId,
    comparacao_id: p.comparacao_id,
    clausula_a_id: null,
    clausula_b_id: p.clausula_b_id,
    situacao: "nova",
    tema: p.tema,
    ordem: 10000 + Number(p.ordem ?? 0),
  })
  if (error) return { erro: error.message }
  return {}
}

/** Junta uma suprimida (só A) com uma nova (só B) num par, e analisa com a IA. */
export async function parearManual(parSuprimidaId: string, parNovaId: string): Promise<{ erro?: string }> {
  const [s, n] = await Promise.all([parDaComparacao(parSuprimidaId), parDaComparacao(parNovaId)])
  if (!s || !n || !s.clausula_a_id || s.clausula_b_id || !n.clausula_b_id || n.clausula_a_id) {
    return { erro: "Escolha uma cláusula só de A e uma só de B." }
  }
  if (s.comparacao_id !== n.comparacao_id) return { erro: "As cláusulas são de comparações diferentes." }
  const admin = await createAdminClient()
  const empId = await tenantAtual()
  const { data: cls } = await admin
    .from("acordo_clausulas")
    .select("id, texto")
    .in("id", [s.clausula_a_id, n.clausula_b_id])
  const ta = cls?.find((c) => c.id === s.clausula_a_id)?.texto ?? null
  const tb = cls?.find((c) => c.id === n.clausula_b_id)?.texto ?? null
  const situacao = situacaoDoPar({ texto: ta }, { texto: tb })
  const { error } = await admin
    .from("acordo_comparacao_pares")
    .update({
      clausula_b_id: n.clausula_b_id,
      situacao,
      origem_par: "manual",
      similaridade: null,
      resumo_mudanca: null,
      avaliacao: null,
      avaliacao_motivo: null,
      avaliacao_manual: false,
    })
    .eq("id", parSuprimidaId)
    .eq("emp_proprietaria_id", empId)
  if (error) return { erro: error.message }
  await admin.from("acordo_comparacao_pares").delete().eq("id", parNovaId).eq("emp_proprietaria_id", empId)
  if (situacao !== "igual") await analisarPar(parSuprimidaId)
  return {}
}

/** (Re)analisa um par com a IA. */
export async function analisarPar(parId: string): Promise<{ erro?: string }> {
  const p = await parDaComparacao(parId)
  if (!p) return { erro: "Par não encontrado." }
  if (p.situacao === "igual") return {}
  const admin = await createAdminClient()
  const ids = [p.clausula_a_id, p.clausula_b_id].filter(Boolean) as string[]
  const { data: cls } = await admin.from("acordo_clausulas").select("id, texto").in("id", ids)
  const texto = (id: string | null) => (id ? (cls?.find((c) => c.id === id)?.texto ?? null) : null)
  const { resultado, erro: erroIA } = await analisarIA([
    { i: 0, situacao: p.situacao as Situacao, a: texto(p.clausula_a_id), b: texto(p.clausula_b_id) },
  ])
  const r = resultado.get(0)
  if (!r) {
    return {
      erro: erroIA
        ? `A IA não conseguiu analisar este par: ${erroIA}`
        : "A IA não conseguiu analisar este par agora. Tente de novo.",
    }
  }
  const { error } = await admin
    .from("acordo_comparacao_pares")
    .update({
      resumo_mudanca: r.resumo,
      ...(p.avaliacao_manual ? {} : { avaliacao: r.avaliacao, avaliacao_motivo: r.motivo }),
    })
    .eq("id", parId)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: error.message }
  return {}
}

export async function definirAvaliacao(parId: string, avaliacao: Avaliacao): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error, count } = await admin
    .from("acordo_comparacao_pares")
    .update({ avaliacao, avaliacao_manual: true }, { count: "exact" })
    .eq("id", parId)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: error.message }
  if (count === 0) return { erro: "Par não encontrado." }
  return {}
}

export async function excluirComparacao(id: string): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin
    .from("acordo_comparacoes")
    .delete()
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: error.message }
  return {}
}
