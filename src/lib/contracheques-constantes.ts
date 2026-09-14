/**
 * Contracheques → ordem de pagamento: o que a tela também precisa (tipo da
 * ordem, formas de pagamento, tipos de conta e de chave Pix). A apuração mora
 * em lib/db/contracheques-ordens.ts. SQL: supabase/pessoal-contracheques-ordens.sql.
 */

export { FORMAS_PAGAMENTO_COMPRAS as FORMAS_PAGAMENTO_FOLHA } from "@/lib/compras-constantes"

/** Tipo das ordens geradas pelos contracheques (filtro do Financeiro). */
export const TIPO_ORDEM_FOLHA = "Folha de pagamento"

export const FORMA_PAGAMENTO_FOLHA_PADRAO = "Depósito bancário (TED)"

/** Valores gravados em `dados_bancarios.tipo_conta` (convenção do legado). */
export const TIPOS_CONTA = [
  { valor: "corrente", rotulo: "Conta corrente" },
  { valor: "poupanca", rotulo: "Poupança" },
  { valor: "salario", rotulo: "Conta salário" },
] as const

/** Valores gravados em `dados_bancarios.pix_tipo` (convenção do legado). */
export const TIPOS_CHAVE_PIX = ["CNPJ / CPF", "Telefone", "E-mail", "Chave aleatória"] as const

export function rotuloTipoConta(valor: string | null): string | null {
  if (!valor) return null
  return (
    TIPOS_CONTA.find((t) => t.valor === valor.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""))
      ?.rotulo ?? valor
  )
}
