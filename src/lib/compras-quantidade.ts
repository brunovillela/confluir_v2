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

/** Finalidade (26/11/2026): antes da quantidade — "… — Finalidade: … — Quantidade: …". */
const FINALIDADE = /\s+—\s+Finalidade:\s+(.+)$/

/** Mínimo de caracteres da finalidade (quando exigida). */
export const FINALIDADE_MINIMA = 5

/**
 * A descrição com a finalidade e a quantidade no fim:
 * "Bolo de chocolate — Finalidade: lanche da assembleia — Quantidade: 2 unidades".
 * FINALIDADE (26/11/2026): a falta dela era o alerta mais comum da auditoria
 * (58 em 30 dias); compra de projeto dispensa — o projeto diz para quê.
 */
export function comQuantidade(produto: string, quantidade: number, unidade: string, finalidade?: string | null): string {
  const base = separarQuantidade(produto).produto
  const f = (finalidade ?? "").replace(/\s+/g, " ").trim().replace(/[.;]+$/, "")
  return `${base}${f ? ` — Finalidade: ${f}` : ""} — Quantidade: ${formatarQuantidade(quantidade)} ${unidade.trim()}`
}

/** O inverso, para editar ou repetir uma compra: tira os sufixos da quantidade e da finalidade. */
export function separarQuantidade(produto: string): {
  produto: string
  quantidade: string | null
  unidade: string | null
  finalidade: string | null
} {
  const m = produto.match(SUFIXO)
  const resto = m ? produto.slice(0, m.index).trim() : produto.trim()
  const f = resto.match(FINALIDADE)
  return {
    produto: f ? resto.slice(0, f.index).trim() : resto,
    quantidade: m ? m[1] : null,
    unidade: m ? m[2].trim() : null,
    finalidade: f ? f[1].trim() : null,
  }
}
