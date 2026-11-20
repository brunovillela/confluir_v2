/** Períodos da Gestão › IA (tela e planilha), no fuso de Brasília. */

export const PERIODOS = [
  { valor: "mes", rotulo: "Este mês" },
  { valor: "mes_anterior", rotulo: "Mês passado" },
  { valor: "7d", rotulo: "7 dias" },
  { valor: "30d", rotulo: "30 dias" },
  { valor: "90d", rotulo: "90 dias" },
] as const

/** Só na planilha (na tela, o gráfico diário ficaria longo demais). */
export const PERIODOS_PLANILHA = [
  { valor: "mes", rotulo: "Este mês" },
  { valor: "mes_anterior", rotulo: "Mês passado" },
  { valor: "90d", rotulo: "Últimos 90 dias" },
  { valor: "ano", rotulo: "Este ano" },
  { valor: "ano_anterior", rotulo: "Ano passado" },
] as const

const DIA = 24 * 3600_000

/** Meia-noite do dia 1 em Brasília (UTC-3) — o mesmo de inicioDoMes em lib/db/ia-config. */
function inicioDoMes(agora: Date): Date {
  const br = new Date(agora.getTime() - 3 * 3600_000)
  return new Date(Date.UTC(br.getUTCFullYear(), br.getUTCMonth(), 1, 3, 0, 0))
}

/** 1º de janeiro, meia-noite em Brasília. */
function inicioDoAno(ano: number): Date {
  return new Date(Date.UTC(ano, 0, 1, 3, 0, 0))
}

export function intervalo(periodo: string, agora = new Date()): { de: Date; ate: Date } {
  const inicio = inicioDoMes(agora)
  const ateAgora = new Date(agora.getTime() + 60_000)
  if (periodo === "mes_anterior") return { de: inicioDoMes(new Date(inicio.getTime() - DIA)), ate: inicio }
  const anoBR = new Date(agora.getTime() - 3 * 3600_000).getUTCFullYear()
  if (periodo === "ano") return { de: inicioDoAno(anoBR), ate: ateAgora }
  if (periodo === "ano_anterior") return { de: inicioDoAno(anoBR - 1), ate: inicioDoAno(anoBR) }
  const dias = ({ "7d": 7, "30d": 30, "90d": 90 } as Record<string, number>)[periodo]
  if (dias) return { de: new Date(agora.getTime() - dias * DIA), ate: ateAgora }
  return { de: inicio, ate: ateAgora }
}

export function rotuloPeriodo(periodo: string): string {
  return [...PERIODOS, ...PERIODOS_PLANILHA].find((p) => p.valor === periodo)?.rotulo ?? "Este mês"
}
