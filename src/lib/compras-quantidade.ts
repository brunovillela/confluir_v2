/**
 * QUANTIDADE DA COMPRA (17/11/2026). 7 das 10 ordens de compra devolvidas
 * pelo avaliador eram por "falta a quantidade". A quantidade e a unidade
 * viraram campos do cadastro e entram sozinhas na descrição, que é o que vai
 * para a ordem de pagamento e para a auditoria. Módulo puro: o formulário, a
 * action e o "Repetir compra" usam o mesmo formato.
 */

/** Sugestões do campo Unidade (texto livre: vale qualquer outra). */
export const UNIDADES_COMPRA = [
  "unidades",
  "caixas",
  "pacotes",
  "resmas",
  "kg",
  "litros",
  "metros",
  "kits",
  "serviço",
  "diárias",
  "horas",
  "mês",
  "lote (itens na descrição)",
] as const

const SUFIXO = /\s+—\s+Quantidade:\s+([\d.,]+)\s+(.+?)\.?$/

/** "2,5" → "2,5"; "3" → "3" (vírgula como decimal, sem zeros sobrando). */
export function formatarQuantidade(q: number): string {
  return q.toLocaleString("pt-BR", { maximumFractionDigits: 3 })
}

/** Lê "2", "2,5" ou "1.000" (pt-BR). null se não for um número positivo. */
export function lerQuantidade(bruto: string | null | undefined): number | null {
  const v = (bruto ?? "").trim()
  if (!/^\d{1,3}(\.\d{3})*(,\d+)?$|^\d+(,\d+)?$/.test(v)) return null
  const n = Number(v.replace(/\./g, "").replace(",", "."))
  return Number.isFinite(n) && n > 0 ? n : null
}

/** A descrição com a quantidade no fim: "Bolo de chocolate — Quantidade: 2 unidades". */
export function comQuantidade(produto: string, quantidade: number, unidade: string): string {
  const base = separarQuantidade(produto).produto
  return `${base} — Quantidade: ${formatarQuantidade(quantidade)} ${unidade.trim()}`
}

/** O inverso, para editar ou repetir uma compra: tira o sufixo da quantidade. */
export function separarQuantidade(produto: string): { produto: string; quantidade: string | null; unidade: string | null } {
  const m = produto.match(SUFIXO)
  if (!m) return { produto: produto.trim(), quantidade: null, unidade: null }
  return { produto: produto.slice(0, m.index).trim(), quantidade: m[1], unidade: m[2].trim() }
}
