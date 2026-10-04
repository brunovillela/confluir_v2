import { hojeSP } from "@/lib/db/comum"

const DIA = /^\d{4}-\d{2}-\d{2}$/

/** Período da exportação: o mês anterior por padrão; no máximo 24 meses. */
export function periodoContabil(de: string | null | undefined, ate: string | null | undefined): { de: string; ate: string } {
  const hoje = hojeSP()
  const [a, m] = hoje.split("-").map(Number)
  const inicioMesAnterior = new Date(Date.UTC(a, m - 2, 1)).toISOString().slice(0, 10)
  const fimMesAnterior = new Date(Date.UTC(a, m - 1, 0)).toISOString().slice(0, 10)
  let d = de && DIA.test(de) ? de : inicioMesAnterior
  let f = ate && DIA.test(ate) ? ate : fimMesAnterior
  if (f < d) [d, f] = [f, d]
  const limite = new Date(`${d}T00:00:00Z`)
  limite.setUTCMonth(limite.getUTCMonth() + 24)
  if (new Date(`${f}T00:00:00Z`) > limite) f = limite.toISOString().slice(0, 10)
  return { de: d, ate: f }
}
