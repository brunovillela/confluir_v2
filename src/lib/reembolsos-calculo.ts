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

// ── Data da despesa e prazo (14/11/2026) ───────────────────────────────────

function somarDiasISO(iso: string, dias: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

function dataBR(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
}

/**
 * A data de despesa mais antiga ainda aceita hoje: a despesa vale até
 * `prazoDias` dias depois dela (no último dia ainda pode). Null = sem limite.
 */
export function primeiraDataDespesaAceita(hojeISO: string, prazoDias: number | null): string | null {
  return prazoDias ? somarDiasISO(hojeISO, -prazoDias) : null
}

/**
 * Confere a data da despesa do pedido de reembolso: obrigatória, não futura e
 * dentro do prazo da entidade (Pessoal → Reembolsos → Tipos). Devolve o erro
 * para mostrar, ou null se está tudo certo.
 */
export function conferirDataDespesa(
  data: string | null | undefined,
  hojeISO: string,
  prazoDias: number | null
): string | null {
  if (!data || !/^\d{4}-\d{2}-\d{2}$/.test(data) || Number.isNaN(Date.parse(`${data}T00:00:00Z`))) {
    return "Informe a data da despesa."
  }
  if (data > hojeISO) return "A data da despesa não pode ser futura."
  const limite = primeiraDataDespesaAceita(hojeISO, prazoDias)
  if (limite && data < limite) {
    return `A despesa de ${dataBR(data)} passou do prazo: o reembolso é aceito até ${prazoDias} dias depois da data da despesa (hoje, despesas a partir de ${dataBR(limite)}).`
  }
  return null
}
