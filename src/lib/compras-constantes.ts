/**
 * Constantes de Aquisição compartilhadas entre servidor (lib/db/compras.ts) e
 * componentes client (badges, formulários) — por isso sem "server-only".
 */

export const SITUACOES_PROCESSO = [
  "solicitada",
  "em_cotacao",
  "cotada",
  "comprada",
  "recebida",
  "cancelada",
] as const

export type SituacaoProcesso = (typeof SITUACOES_PROCESSO)[number]

export const ROTULOS_SITUACAO_PROCESSO: Record<SituacaoProcesso, string> = {
  solicitada: "Solicitada",
  em_cotacao: "Em cotação",
  cotada: "Cotada",
  comprada: "Comprada",
  recebida: "Recebida",
  cancelada: "Cancelada",
}

/** Data de hoje no relógio LOCAL (AAAA-MM-DD) — default de inputs date; toISOString daria o dia UTC, que vira à frente de SP a partir das 21h. */
export function hojeLocalISO(): string {
  const d = new Date()
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-")
}

/** Formas aceitas nas compras (propostas e ordens de pagamento). */
export const FORMAS_PAGAMENTO_COMPRAS = [
  "Pix",
  "Pix (QR Code)",
  "Boleto",
  "Depósito bancário (TED)",
  "Cartão",
  "Dinheiro",
] as const

export type FormaPagamentoCompras = (typeof FORMAS_PAGAMENTO_COMPRAS)[number]

/**
 * Pagamento em dinheiro é feito no ato da compra: o vencimento é a data da
 * compra e a ordem nunca conta como vencida, mesmo lançada dias depois
 * (09/10 — as raras exceções são desconsideradas).
 */
export const FORMA_PAGA_NO_ATO = "Dinheiro" satisfies FormaPagamentoCompras

/**
 * Formas das ordens geradas por CONTRATO (e ajuda institucional): pagamento
 * futuro, sem cartão. Cada uma exige o "para onde" — boleto, chave/conta do
 * fornecedor, código Pix ou o caixa de onde sairá o dinheiro.
 */
export const FORMAS_ORDEM_CONTRATO = [
  "Boleto",
  "Pix",
  "Pix (QR Code)",
  "Depósito bancário (TED)",
  "Dinheiro",
] as const satisfies readonly FormaPagamentoCompras[]

export const ROTULO_FORMA_CONTRATO: Record<(typeof FORMAS_ORDEM_CONTRATO)[number], string> = {
  Boleto: "Boleto",
  Pix: "Pix (chave do fornecedor)",
  "Pix (QR Code)": "Pix — código copia e cola / QR Code",
  "Depósito bancário (TED)": "TED (conta do fornecedor)",
  Dinheiro: "Dinheiro (caixa)",
}

/**
 * Formas aceitas na correção de um ESTORNO: o dinheiro volta a sair pelo
 * banco (cartão e caixa não têm estorno bancário).
 */
export const FORMAS_ESTORNO = [
  "Pix",
  "Pix (QR Code)",
  "Boleto",
  "Depósito bancário (TED)",
] as const satisfies readonly FormaPagamentoCompras[]

/**
 * O que cada forma exige na aquisição direta — toda compra é auditada, então
 * a ordem diz COM O QUÊ foi paga (cartão, caixa, chave/conta do fornecedor,
 * código Pix, arquivo do boleto).
 */
export type DetalheForma =
  | "cartao"
  | "caixa"
  | "pix_fornecedor"
  | "conta_fornecedor"
  | "pix_codigo"
  | "boleto"

export const DETALHE_DA_FORMA: Record<FormaPagamentoCompras, DetalheForma> = {
  Pix: "pix_fornecedor",
  "Pix (QR Code)": "pix_codigo",
  Boleto: "boleto",
  "Depósito bancário (TED)": "conta_fornecedor",
  Cartão: "cartao",
  Dinheiro: "caixa",
}

export const TIPOS_CARTAO = [
  { valor: "credito", rotulo: "Crédito" },
  { valor: "debito", rotulo: "Débito" },
  { valor: "pre_pago", rotulo: "Pré-pago" },
] as const

export function rotuloTipoCartao(valor: string | null): string {
  return TIPOS_CARTAO.find((t) => t.valor === valor)?.rotulo ?? valor ?? ""
}

/** Pix copia e cola (BR Code): payload EMV que sempre começa com "000201". */
export function pixCodigoValido(codigo: string): boolean {
  const c = codigo.replace(/\s/g, "")
  return c.startsWith("000201") && c.length >= 40
}
