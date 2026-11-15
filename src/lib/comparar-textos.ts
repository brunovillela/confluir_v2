/**
 * Comparação de dois textos por palavra (15/11/2026), para mostrar o que
 * entrou e o que saiu entre duas versões da carta de oposição. LCS simples
 * sobre as palavras (com os espaços e quebras de linha como fichas próprias),
 * depois de tirar o começo e o fim iguais — os textos são curtos (até ~8 mil
 * caracteres), então a tabela cabe com folga.
 */

export type TrechoComparado = { tipo: "igual" | "incluido" | "removido"; texto: string }

const fichas = (t: string) => t.replace(/\r\n?/g, "\n").split(/(\s+)/).filter((f) => f.length > 0)

export function compararTextos(antes: string, depois: string): TrechoComparado[] {
  const a = fichas(antes)
  const b = fichas(depois)
  let ini = 0
  while (ini < a.length && ini < b.length && a[ini] === b[ini]) ini++
  let fimA = a.length
  let fimB = b.length
  while (fimA > ini && fimB > ini && a[fimA - 1] === b[fimB - 1]) {
    fimA--
    fimB--
  }
  const meioA = a.slice(ini, fimA)
  const meioB = b.slice(ini, fimB)
  const n = meioA.length
  const m = meioB.length
  // lcs[i][j] = tamanho da maior subsequência comum de meioA[i:] e meioB[j:].
  const lcs: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = meioA[i] === meioB[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
    }
  }
  const saida: TrechoComparado[] = []
  const por = (tipo: TrechoComparado["tipo"], texto: string) => {
    const ultimo = saida[saida.length - 1]
    if (ultimo && ultimo.tipo === tipo) ultimo.texto += texto
    else saida.push({ tipo, texto })
  }
  if (ini > 0) por("igual", a.slice(0, ini).join(""))
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (meioA[i] === meioB[j]) {
      por("igual", meioA[i])
      i++
      j++
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      por("removido", meioA[i++])
    } else {
      por("incluido", meioB[j++])
    }
  }
  while (i < n) por("removido", meioA[i++])
  while (j < m) por("incluido", meioB[j++])
  if (fimA < a.length) por("igual", a.slice(fimA).join(""))
  return agruparMudancas(saida)
}

/**
 * Junta as mudanças separadas só por espaço num bloco: tudo o que saiu, depois
 * tudo o que entrou ("Parágrafo de teste" → "Outro parágrafo"), em vez de
 * palavras intercaladas. O espaço entre elas vai para os dois lados, então os
 * dois textos continuam se reconstruindo.
 */
function agruparMudancas(trechos: TrechoComparado[]): TrechoComparado[] {
  const saida: TrechoComparado[] = []
  const mudanca = (t: TrechoComparado | undefined) => Boolean(t && t.tipo !== "igual")
  const soEspaco = (t: TrechoComparado | undefined) => Boolean(t && t.tipo === "igual" && /^\s+$/.test(t.texto) && !t.texto.includes("\n\n"))
  let i = 0
  while (i < trechos.length) {
    if (!mudanca(trechos[i])) {
      saida.push(trechos[i++])
      continue
    }
    let removido = ""
    let incluido = ""
    while (i < trechos.length && (mudanca(trechos[i]) || (soEspaco(trechos[i]) && mudanca(trechos[i + 1])))) {
      const t = trechos[i++]
      if (t.tipo !== "incluido") removido += t.texto
      if (t.tipo !== "removido") incluido += t.texto
    }
    if (removido) saida.push({ tipo: "removido", texto: removido })
    if (incluido) saida.push({ tipo: "incluido", texto: incluido })
  }
  return saida
}

/** Quantas palavras entraram e saíram (espaços não contam). */
export function resumoDaComparacao(trechos: TrechoComparado[]): { incluidas: number; removidas: number } {
  const contar = (t: string) => t.split(/\s+/).filter(Boolean).length
  let incluidas = 0
  let removidas = 0
  for (const t of trechos) {
    if (t.tipo === "incluido") incluidas += contar(t.texto)
    if (t.tipo === "removido") removidas += contar(t.texto)
  }
  return { incluidas, removidas }
}
