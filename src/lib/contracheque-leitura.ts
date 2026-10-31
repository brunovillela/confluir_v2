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

const MESES = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"]

/**
 * Competência (AAAA-MM) tirada do nome da remessa — "Folha — Março/2026",
 * "03/2026", "2026-03". A remessa de contracheques não guarda o mês à parte;
 * sem mês e ano reconhecíveis (ex.: "13º salário 2025"), null.
 */
export function competenciaDoNome(nome: string | null | undefined): string | null {
  if (!nome) return null
  const t = nome.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  const iso = t.match(/\b(20\d{2})-(0[1-9]|1[0-2])\b/)
  if (iso) return `${iso[1]}-${iso[2]}`
  const num = t.match(/\b(0?[1-9]|1[0-2])\s*[/.-]\s*(20\d{2})\b/)
  if (num) return `${num[2]}-${num[1].padStart(2, "0")}`
  const ano = t.match(/\b(20\d{2})\b/)
  const mes = MESES.findIndex((m) => t.includes(m))
  if (ano && mes >= 0) return `${ano[1]}-${String(mes + 1).padStart(2, "0")}`
  return null
}

/** Variação do líquido em relação ao contracheque anterior que vira alerta. */
export const VARIACAO_ALERTA = 0.3

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
const mesAno = (c: string) => c.split("-").reverse().join("/")

/**
 * Alertas da conferência: o líquido bate com proventos − descontos? A
 * competência é a da remessa? O líquido mudou muito desde o contracheque
 * anterior do funcionário (mesma natureza de remessa)?
 */
export function alertasDaLeitura(
  l: LeituraContracheque,
  ctx: { competenciaRemessa?: string | null; liquidoAnterior?: number | null } = {}
): string[] {
  const alertas: string[] = []
  if (l.valorLiquido === null) alertas.push("Valor líquido não lido.")
  else if (l.valorLiquido <= 0) alertas.push("Valor líquido zerado ou negativo.")
  if (l.totalProventos !== null && l.totalDescontos !== null && l.valorLiquido !== null) {
    const conta = Math.round((l.totalProventos - l.totalDescontos) * 100) / 100
    if (Math.abs(conta - l.valorLiquido) >= 0.02) {
      alertas.push(`Proventos − descontos dá ${brl(conta)}, e o líquido lido é ${brl(l.valorLiquido)}.`)
    }
  }
  if (ctx.competenciaRemessa && l.competencia && l.competencia !== ctx.competenciaRemessa) {
    alertas.push(`Competência lida ${mesAno(l.competencia)}, mas a remessa é de ${mesAno(ctx.competenciaRemessa)}.`)
  }
  const ant = ctx.liquidoAnterior
  if (ant && ant > 0 && l.valorLiquido !== null && l.valorLiquido > 0) {
    const variacao = (l.valorLiquido - ant) / ant
    if (Math.abs(variacao) >= VARIACAO_ALERTA) {
      alertas.push(
        `Líquido ${Math.round(Math.abs(variacao) * 100)}% ${variacao > 0 ? "maior" : "menor"} que no contracheque anterior (${brl(ant)}).`
      )
    }
  }
  return alertas
}
