/**
 * VALOR DA COMPRA FORA DA ESCALA (23/11/2026). No Bubble, compras foram
 * registradas com a vírgula no lugar errado — 72.500.000 no lugar de
 * 72.500,00 — e só a ordem de pagamento foi refeita com o valor certo. Uma
 * única compra dessas fazia um fornecedor, um comprador e um departamento
 * passarem de 85% dos indicadores de Aquisição. A conta compara o valor da
 * compra com o das suas ordens (sem as canceladas e estornadas). Puro (sem
 * banco) para os testes de unidade.
 */

/** Compra este tanto de vezes maior que as ordens é suspeita. */
export const FATOR_COMPRA_MAIOR = 10

/** Diferenças abaixo disto (R$) não interessam: centavos e miudezas. */
const VALOR_MINIMO = 1000

/** Situações de ordem que não contam como o valor pago ou a pagar. */
export const SITUACOES_SEM_VALOR = ["Cancelada", "Estornado"]

/** A razão é uma potência de dez (100, 1.000…), com folga de 1%? */
function potenciaDeDez(razao: number): boolean {
  if (!(razao >= 10)) return false
  const exp = Math.round(Math.log10(razao))
  return Math.abs(razao / 10 ** exp - 1) <= 0.01
}

/**
 * Motivo para desconfiar do valor da compra, ou null. Sem ordens válidas, não
 * há com que comparar. Compra muito maior que as ordens: quase sempre vírgula
 * no lugar errado. Compra menor só quando a razão é 100, 1.000… exatos —
 * menor por outros fatores é normal (parcelas, frete, ordens somadas depois).
 */
export function valorDaCompraSuspeito(valorCompra: number, valorOrdens: number): string | null {
  if (!(valorCompra > 0) || !(valorOrdens > 0)) return null
  if (Math.max(valorCompra, valorOrdens) < VALOR_MINIMO) return null
  const maior = valorCompra / valorOrdens
  if (maior >= FATOR_COMPRA_MAIOR) {
    return potenciaDeDez(maior)
      ? `Valor ${Math.round(maior).toLocaleString("pt-BR")} vezes o das ordens — vírgula no lugar errado?`
      : `Valor ${Math.round(maior).toLocaleString("pt-BR")} vezes o das ordens.`
  }
  const menor = valorOrdens / valorCompra
  if (potenciaDeDez(menor)) return `Valor ${Math.round(menor).toLocaleString("pt-BR")} vezes menor que o das ordens — vírgula no lugar errado?`
  return null
}
