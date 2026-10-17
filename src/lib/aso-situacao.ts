/** Situação do ASO mais recente (realizado) de uma pessoa, pelo vencimento — padrão das áreas do Pessoal. */
export type SituacaoAso = "sem" | "vencido" | "vencendo" | "em_dia"

export const ROTULO_SITUACAO_ASO: Record<SituacaoAso, string> = {
  sem: "Sem ASO",
  vencido: "Vencido",
  vencendo: "Vence em 90 dias",
  em_dia: "Em dia",
}

export const VARIANTE_SITUACAO_ASO = { sem: "outline", vencido: "destructive", vencendo: "warning", em_dia: "success" } as const

const somarDias = (iso: string, dias: number) => {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

export function situacaoAso(a: { vencimento: string | null } | undefined | null, hoje: string): SituacaoAso {
  if (!a) return "sem"
  if (a.vencimento && a.vencimento < hoje) return "vencido"
  if (a.vencimento && a.vencimento <= somarDias(hoje, 90)) return "vencendo"
  return "em_dia"
}
