/**
 * Comparador de acordos — a parte SEM IA: pareamento das cláusulas, situação
 * de cada par e diferença palavra a palavra. Funções puras (servidor, cliente
 * e script).
 *
 * Pareamento, em ordem de confiança:
 *   1. mesmo título (normalizado)                       → origem "titulo"
 *   2. texto + título parecidos (mesmo tema pesa a favor) → origem "texto"
 *   (a IA sugere pares para o que sobrar — fora daqui)
 */

export type ClausulaComparavel = {
  id: string
  numero: string | null
  titulo: string | null
  texto: string | null
  tema: string | null
}

export type ParSugerido = {
  a: string | null
  b: string | null
  origem: "titulo" | "texto" | "ia" | "manual" | null
  similaridade: number | null
}

const PALAVRAS_VAZIAS = new Set(
  "a o as os de da do das dos e em no na nos nas para por com sem ao aos à às um uma que se ou sua seu suas seus pela pelo pelas pelos este esta estes estas desse dessa deste desta sera serao ser".split(" ")
)

/** Sem acento, minúsculo, sem pontuação, espaços únicos. */
export function normalizar(t: string | null): string {
  return (t ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9%$]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function palavras(t: string | null): Set<string> {
  return new Set(normalizar(t).split(" ").filter((p) => p.length > 1 && !PALAVRAS_VAZIAS.has(p)))
}

/** Jaccard entre os conjuntos de palavras (0 a 1). */
export function similaridade(a: string | null, b: string | null): number {
  const x = palavras(a)
  const y = palavras(b)
  if (x.size === 0 || y.size === 0) return 0
  let comuns = 0
  for (const p of x) if (y.has(p)) comuns++
  return comuns / (x.size + y.size - comuns)
}

/** Título sem "DA/DO", numeração e pontuação: "DO REAJUSTE SALARIAL" = "Reajuste salarial". */
function chaveTitulo(t: string | null): string {
  return normalizar(t)
    .split(" ")
    .filter((p) => p && !PALAVRAS_VAZIAS.has(p) && !/^\d+[a-z]?$/.test(p))
    .join(" ")
}

export function parear(A: ClausulaComparavel[], B: ClausulaComparavel[]): ParSugerido[] {
  const pares: ParSugerido[] = []
  const usadasA = new Set<string>()
  const usadasB = new Set<string>()

  // 1. Título igual — só quando o título é único dos dois lados (evita "Parágrafo único").
  const porTituloB = new Map<string, ClausulaComparavel[]>()
  for (const b of B) {
    const k = chaveTitulo(b.titulo)
    if (k) porTituloB.set(k, [...(porTituloB.get(k) ?? []), b])
  }
  const contagemA = new Map<string, number>()
  for (const a of A) {
    const k = chaveTitulo(a.titulo)
    if (k) contagemA.set(k, (contagemA.get(k) ?? 0) + 1)
  }
  for (const a of A) {
    const k = chaveTitulo(a.titulo)
    const candidatos = k ? porTituloB.get(k) : undefined
    if (!k || !candidatos || candidatos.length !== 1 || contagemA.get(k) !== 1) continue
    const b = candidatos[0]
    pares.push({ a: a.id, b: b.id, origem: "titulo", similaridade: similaridade(a.texto, b.texto) })
    usadasA.add(a.id)
    usadasB.add(b.id)
  }

  // 2. Texto + título parecidos, do par mais forte para o mais fraco.
  const restoA = A.filter((a) => !usadasA.has(a.id))
  const restoB = B.filter((b) => !usadasB.has(b.id))
  const candidatos: { a: ClausulaComparavel; b: ClausulaComparavel; nota: number; texto: number }[] = []
  for (const a of restoA) {
    for (const b of restoB) {
      const texto = similaridade(a.texto, b.texto)
      const titulo = similaridade(a.titulo, b.titulo)
      const nota = 0.65 * texto + 0.35 * titulo + (a.tema && a.tema === b.tema ? 0.08 : 0)
      if (nota >= 0.3) candidatos.push({ a, b, nota, texto })
    }
  }
  candidatos.sort((x, y) => y.nota - x.nota)
  for (const c of candidatos) {
    if (usadasA.has(c.a.id) || usadasB.has(c.b.id)) continue
    pares.push({ a: c.a.id, b: c.b.id, origem: "texto", similaridade: c.texto })
    usadasA.add(c.a.id)
    usadasB.add(c.b.id)
  }

  // Sobras: suprimidas (só A) e novas (só B).
  for (const a of A) if (!usadasA.has(a.id)) pares.push({ a: a.id, b: null, origem: null, similaridade: null })
  for (const b of B) if (!usadasB.has(b.id)) pares.push({ a: null, b: b.id, origem: null, similaridade: null })
  return pares
}

export type Situacao = "igual" | "alterada" | "nova" | "suprimida"

export const ROTULO_SITUACAO: Record<Situacao, string> = {
  igual: "Igual",
  alterada: "Alterada",
  nova: "Nova",
  suprimida: "Suprimida",
}

export const ROTULO_AVALIACAO: Record<"favoravel" | "desfavoravel" | "neutra", string> = {
  favoravel: "Favorável ao trabalhador",
  desfavoravel: "Desfavorável ao trabalhador",
  neutra: "Neutra",
}

/** Classe do selo de avaliação (tokens do design system). */
export const CLASSE_AVALIACAO: Record<"favoravel" | "desfavoravel" | "neutra", string> = {
  favoravel: "border-success/40 text-success-fg",
  desfavoravel: "border-destructive/40 text-destructive",
  neutra: "text-muted-foreground",
}

export function situacaoDoPar(a: { texto: string | null } | null, b: { texto: string | null } | null): Situacao {
  if (a && !b) return "suprimida"
  if (!a && b) return "nova"
  return normalizar(a?.texto ?? "") === normalizar(b?.texto ?? "") ? "igual" : "alterada"
}

// ── Diferença palavra a palavra ──────────────────────────────────────────────

export type Trecho = { tipo: "igual" | "removido" | "inserido"; texto: string }

/** Palavras com o espaço que as segue (para remontar o texto exatamente). */
function fatiar(t: string): string[] {
  return t.match(/\S+\s*/g) ?? []
}

const MAX_CELULAS = 6_000_000

/**
 * Diferença por palavras (LCS). Compara sem acento/caixa/pontuação colada,
 * para "Salário," e "salário" contarem como iguais. Texto grande demais →
 * devolve tudo como removido + inserido.
 */
export function diferenca(antes: string, depois: string): Trecho[] {
  const a = fatiar(antes)
  const b = fatiar(depois)
  const n = a.length
  const m = b.length
  if (n === 0 && m === 0) return []
  if ((n + 1) * (m + 1) > MAX_CELULAS) {
    return [
      { tipo: "removido", texto: antes },
      { tipo: "inserido", texto: depois },
    ]
  }
  const ka = a.map((p) => normalizar(p))
  const kb = b.map((p) => normalizar(p))
  // Tabela LCS de trás para frente (linha a linha num único vetor plano).
  const L = new Uint32Array((n + 1) * (m + 1))
  const w = m + 1
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      L[i * w + j] = ka[i] === kb[j] ? L[(i + 1) * w + j + 1] + 1 : Math.max(L[(i + 1) * w + j], L[i * w + j + 1])
    }
  }
  const trechos: Trecho[] = []
  const empurrar = (tipo: Trecho["tipo"], texto: string) => {
    const ultimo = trechos[trechos.length - 1]
    if (ultimo && ultimo.tipo === tipo) ultimo.texto += texto
    else trechos.push({ tipo, texto })
  }
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (ka[i] === kb[j]) {
      empurrar("igual", b[j])
      i++
      j++
    } else if (L[(i + 1) * w + j] >= L[i * w + j + 1]) {
      empurrar("removido", a[i++])
    } else {
      empurrar("inserido", b[j++])
    }
  }
  while (i < n) empurrar("removido", a[i++])
  while (j < m) empurrar("inserido", b[j++])
  return trechos
}
