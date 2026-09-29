/**
 * "Mesmo tema entre empresas": alinha as cláusulas equivalentes de VÁRIOS
 * acordos (uma linha por assunto, uma coluna por acordo) e destaca os valores
 * que cada uma cita. Puro (sem banco nem IA) — usa o pareamento do comparador.
 */

import { normalizar, type ClausulaComparavel } from "@/lib/acordos-comparar"

export type LinhaTema<C extends ClausulaComparavel = ClausulaComparavel> = {
  /** Cláusula que representa o assunto (a primeira que apareceu). */
  referencia: C
  /** acordoId → cláusula daquele acordo (no máximo uma por acordo). */
  porAcordo: Map<string, C>
}

/** Palavras com mais de 2 letras, sem acento — base da semelhança. */
function palavras(t: string | null): Set<string> {
  return new Set(normalizar(t).split(" ").filter((p) => p.length > 2))
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0
  let comum = 0
  for (const p of a) if (b.has(p)) comum++
  return comum / (a.size + b.size - comum)
}

/** Nota mínima para duas cláusulas de acordos diferentes tratarem do mesmo assunto. */
const CORTE = 0.3

/**
 * Percorre os acordos na ordem dada. Cada cláusula vai para a linha cujo
 * assunto mais se parece com ela — comparando com TODAS as cláusulas já na
 * linha, e dando mais peso ao título, porque empresas diferentes escrevem o
 * mesmo direito com palavras diferentes. O que não passa do corte abre linha.
 */
export function agruparPorAssunto<C extends ClausulaComparavel>(
  colunas: { acordoId: string; clausulas: C[] }[]
): LinhaTema<C>[] {
  const cache = new Map<string, { titulo: Set<string>; texto: Set<string>; chave: string }>()
  const sinal = (c: C) => {
    let s = cache.get(c.id)
    if (!s) {
      s = { titulo: palavras(c.titulo), texto: palavras(c.texto), chave: normalizar(c.titulo) }
      cache.set(c.id, s)
    }
    return s
  }
  const nota = (a: C, b: C) => {
    const x = sinal(a)
    const y = sinal(b)
    if (x.chave && x.chave === y.chave) return 1
    return 0.6 * jaccard(x.titulo, y.titulo) + 0.4 * jaccard(x.texto, y.texto)
  }

  const linhas: LinhaTema<C>[] = []
  for (const col of colunas) {
    const candidatos: { linha: number; c: C; nota: number }[] = []
    linhas.forEach((l, i) => {
      for (const c of col.clausulas) {
        const n = Math.max(...[...l.porAcordo.values()].map((m) => nota(m, c)))
        if (n >= CORTE) candidatos.push({ linha: i, c, nota: n })
      }
    })
    candidatos.sort((a, b) => b.nota - a.nota)
    const linhaUsada = new Set<number>()
    const usada = new Set<string>()
    for (const k of candidatos) {
      if (linhaUsada.has(k.linha) || usada.has(k.c.id)) continue
      linhas[k.linha].porAcordo.set(col.acordoId, k.c)
      linhaUsada.add(k.linha)
      usada.add(k.c.id)
    }
    for (const c of col.clausulas) {
      if (!usada.has(c.id)) linhas.push({ referencia: c, porAcordo: new Map([[col.acordoId, c]]) })
    }
  }
  return linhas
}

/**
 * Filtro por palavras (sem acento, sem caixa): cada palavra buscada precisa
 * começar alguma palavra do título ou do texto — "hora extra" acha "horas
 * extras".
 */
export function contemTermo(c: { titulo: string | null; texto: string | null }, termo: string): boolean {
  const buscadas = normalizar(termo).split(" ").filter(Boolean)
  if (!buscadas.length) return true
  const palavras = normalizar(`${c.titulo ?? ""} ${c.texto ?? ""}`).split(" ")
  return buscadas.every((b) => palavras.some((p) => p.startsWith(b)))
}

const VALORES = [
  /R\$\s?\d{1,3}(?:\.\d{3})*(?:,\d{2})?/g,
  /\b\d{1,3}(?:,\d{1,2})?\s?%/g,
  /\b\d{1,3}\s(?:\(\w+\)\s)?(?:dias?|horas?|meses|m[êe]s|anos?)(?:\s[úu]teis|\scorridos)?\b/gi,
]

/**
 * Valores citados no texto (R$, %, prazos), na ordem em que aparecem, sem
 * repetir — para bater o olho e ver quem paga mais / dá mais prazo.
 */
export function valoresCitados(texto: string | null, limite = 6): string[] {
  if (!texto) return []
  const achados: { pos: number; valor: string }[] = []
  for (const re of VALORES) {
    for (const m of texto.matchAll(re)) achados.push({ pos: m.index ?? 0, valor: m[0].replace(/\s+/g, " ").trim() })
  }
  const vistos = new Set<string>()
  const saida: string[] = []
  for (const a of achados.sort((x, y) => x.pos - y.pos)) {
    const chave = a.valor.toLowerCase()
    if (vistos.has(chave)) continue
    vistos.add(chave)
    saida.push(a.valor)
    if (saida.length >= limite) break
  }
  return saida
}
