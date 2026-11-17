/**
 * VENCIMENTO COM O ANO ERRADO (17/11/2026). Desde a virada, 30 ordens
 * nasceram com vencimento de mais de seis meses atrás (2016, 2020, 2023,
 * 2024, 2025 no lugar de 2026) — duas foram pagas assim, contando como
 * atrasadas. A regra "vencimento_ano" da auditoria e o Corrigir ordem usam a
 * mesma conta. Puro (sem banco) para os testes de unidade.
 */

/** Vencimento mais antigo que isto (dias) é tratado como ano digitado errado. */
export const DIAS_VENCIMENTO_ANTIGO = 180

/** Anos à frente aceitos no vencimento (parcelas de contrato longo). */
const ANOS_A_FRENTE = 5

function somarDias(iso: string, dias: number): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

/** O vencimento é de mais de `dias` atrás? */
export function vencimentoAntigo(vencimento: string, hoje: string, dias = DIAS_VENCIMENTO_ANTIGO): boolean {
  return vencimento.slice(0, 10) < somarDias(hoje, -dias)
}

/**
 * Motivo para recusar o vencimento por ano provavelmente errado, ou null:
 * mais de `dias` atrás ou mais de cinco anos à frente.
 */
export function vencimentoComAnoSuspeito(vencimento: string, hoje: string, dias = DIAS_VENCIMENTO_ANTIGO): string | null {
  const venc = vencimento.slice(0, 10)
  const br = venc.split("-").reverse().join("/")
  if (!/^\d{4}-\d{2}-\d{2}$/.test(venc)) return "Vencimento inválido."
  if (vencimentoAntigo(venc, hoje, dias)) return `Vencimento ${br} é de mais de ${dias} dias atrás — confira o ano.`
  if (Number(venc.slice(0, 4)) > Number(hoje.slice(0, 4)) + ANOS_A_FRENTE) return `Vencimento ${br} fora do esperado — confira o ano.`
  return null
}
