/**
 * Largura de texto em Helvetica (a fonte dos PDFs do @react-pdf), para caber
 * numa coluna de tabela sem invadir a vizinha (17/10/2026: a matrícula da
 * relação de votantes passava por cima do canal).
 *
 * Larguras em milésimos do tamanho da fonte, dos caracteres 32 a 255 (WinAnsi),
 * extraídas do próprio PDFKit do @react-pdf — embutidas para não depender de
 * API interna da biblioteca. Fora da tabela, vale a largura média (556).
 */
const HELVETICA = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556,
  556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833,
  722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556,
  556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334,
  260, 334, 584, 0, 556, 0, 222, 556, 333, 1000, 556, 556, 333, 1000, 667, 333, 1000, 0, 611, 0, 0, 222, 222, 333,
  333, 350, 556, 1000, 333, 1000, 500, 333, 944, 0, 500, 500, 278, 333, 556, 556, 556, 556, 260, 556, 333, 737, 370,
  556, 584, 0, 737, 333, 400, 584, 333, 333, 333, 556, 537, 278, 333, 333, 365, 556, 834, 834, 834, 611, 667, 667,
  667, 667, 667, 667, 1000, 722, 667, 667, 667, 667, 278, 278, 278, 278, 722, 722, 778, 778, 778, 778, 778, 584, 778,
  722, 722, 722, 722, 667, 667, 611, 556, 556, 556, 556, 556, 556, 889, 500, 556, 556, 556, 556, 278, 278, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 584, 611, 556, 556, 556, 556, 500, 556, 500,
]
const ESPECIAIS: Record<string, number> = { "…": 1000, "—": 1000, "–": 556 }

function milesimos(ch: string): number {
  if (ch in ESPECIAIS) return ESPECIAIS[ch]
  const c = ch.charCodeAt(0)
  return c >= 32 && c <= 255 ? HELVETICA[c - 32] || 556 : 556
}

/** Largura (pt) do texto em Helvetica no tamanho dado. */
export function larguraHelvetica(texto: string, tamanho: number): number {
  let total = 0
  for (const ch of texto) total += milesimos(ch)
  return (total * tamanho) / 1000
}

/**
 * O texto inteiro se couber em `largura` (pt); senão, cortado com "…" no
 * maior pedaço que cabe. Para valores sem espaço (matrícula, código), que o
 * PDF não tem onde quebrar e que invadiriam a coluna ao lado.
 */
export function caber(texto: string | null | undefined, largura: number, tamanho: number): string {
  const t = (texto ?? "").trim()
  if (!t) return "—"
  if (larguraHelvetica(t, tamanho) <= largura) return t
  const reticencias = larguraHelvetica("…", tamanho)
  let acumulado = 0
  let fim = 0
  for (const ch of t) {
    const w = (milesimos(ch) * tamanho) / 1000
    if (acumulado + w + reticencias > largura) break
    acumulado += w
    fim += ch.length
  }
  return `${t.slice(0, fim).trimEnd()}…`
}
