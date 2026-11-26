/**
 * COTAÇÃO NA AQUISIÇÃO DIRETA ACIMA DO LIMITE (25/11/2026). Em produção, 30
 * compras diretas acima do limite (R$ 329 mil) não tinham orçamento nenhum: o
 * alerta "Aquisição direta acima do limite" aparecia, era confirmado e a compra
 * seguia. Acima do limite, o formulário pede os orçamentos de outros
 * fornecedores (gravados como propostas do processo) ou o motivo da dispensa.
 * Puro: usado no formulário e na ação.
 */

export const MOTIVOS_DISPENSA_COTACAO = [
  "Fornecedor exclusivo",
  "Emergência",
  "Preço tabelado ou de mercado único",
  "Continuidade de serviço ou padronização",
  "Outro motivo",
] as const

export type MotivoDispensaCotacao = (typeof MOTIVOS_DISPENSA_COTACAO)[number]

/** Orçamentos de outros fornecedores que cabem no formulário. */
export const MAX_ORCAMENTOS_DIRETA = 3

/** Mínimo de caracteres da explicação da dispensa. */
export const EXPLICACAO_DISPENSA_MINIMA = 10

/** O texto gravado no processo (e lido pela auditoria) quando a cotação é dispensada. */
export function textoDispensa(motivo: string, explicacao: string): string {
  return `Dispensa de cotação — ${motivo}: ${explicacao.replace(/\s+/g, " ").trim()}`.slice(0, 1000)
}

/** É o texto de uma dispensa (e não a justificativa de proposta única)? */
export function ehDispensa(texto: string | null | undefined): boolean {
  return !!texto && texto.startsWith("Dispensa de cotação — ")
}
