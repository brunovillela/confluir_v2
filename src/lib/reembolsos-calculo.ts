/**
 * Valor reembolsável de um reembolso do ACT (08/10/2026): a PORCENTAGEM do
 * tipo aplicada sobre a despesa, limitada ao TETO do tipo —
 *
 *   reembolsável = min(despesa × porcentagem, teto)
 *
 * É a regra do sistema anterior (conferida nos 12 de material escolar: 70%
 * e teto de R$ 1.957). O teto vale sobre o que se REEMBOLSA, não sobre a
 * despesa. O avaliador aprova esse valor ou menos (glosa), nunca mais.
 * Sem dependência de servidor: as telas usam para mostrar o cálculo.
 */
export function valorReembolsavel(
  despesa: number | null,
  tipo: { proporcao: number; valor_limite: number | null } | null | undefined
): number | null {
  if (despesa === null || !Number.isFinite(despesa)) return null
  const proporcao = tipo?.proporcao ?? 1
  const bruto = despesa * proporcao
  const limitado = tipo?.valor_limite != null ? Math.min(bruto, tipo.valor_limite) : bruto
  return Math.round(limitado * 100) / 100
}

/** 0,7 → "70%"; 0,125 → "12,5%". */
export function porcentagemTexto(proporcao: number): string {
  return `${(Math.round(proporcao * 10000) / 100).toLocaleString("pt-BR")}%`
}
