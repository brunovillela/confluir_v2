/**
 * Leitura de contracheque (lib/db/contracheque-ia) e a conferência dela —
 * módulo puro: vale no servidor e na tela.
 */

export type LeituraContracheque = {
  nome: string | null
  cpf: string | null
  /** AAAA-MM */
  competencia: string | null
  totalProventos: number | null
  totalDescontos: number | null
  valorLiquido: number | null
}

/** Alertas da conferência: o líquido bate com proventos − descontos? */
export function alertasDaLeitura(l: LeituraContracheque): string[] {
  const alertas: string[] = []
  if (l.valorLiquido === null) alertas.push("Valor líquido não lido.")
  else if (l.valorLiquido <= 0) alertas.push("Valor líquido zerado ou negativo.")
  if (l.totalProventos !== null && l.totalDescontos !== null && l.valorLiquido !== null) {
    const conta = Math.round((l.totalProventos - l.totalDescontos) * 100) / 100
    if (Math.abs(conta - l.valorLiquido) >= 0.02) {
      alertas.push(
        `Proventos − descontos dá ${conta.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}, e o líquido lido é ${l.valorLiquido.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}.`
      )
    }
  }
  return alertas
}
