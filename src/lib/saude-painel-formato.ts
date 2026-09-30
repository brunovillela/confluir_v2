/**
 * Codificação compacta das colunas do Painel analítico da Saúde (client-safe):
 * um caractere por linha; ALFABETO[0] = não informado (-1), ALFABETO[i + 1] =
 * valor i. Cabe até 63 valores por coluna (as dimensões cortam em top-N +
 * Outros antes).
 */
const ALFABETO = "_0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-"

export function codificarColuna(valores: number[]): string {
  let s = ""
  for (const v of valores) {
    const c = ALFABETO[v + 1]
    if (c === undefined) throw new Error(`Valor fora da faixa na codificação: ${v}`)
    s += c
  }
  return s
}

export function decodificarColuna(s: string): Int8Array {
  const mapa = new Map([...ALFABETO].map((c, i) => [c, i - 1]))
  const saida = new Int8Array(s.length)
  for (let i = 0; i < s.length; i++) saida[i] = mapa.get(s[i]) ?? -1
  return saida
}
