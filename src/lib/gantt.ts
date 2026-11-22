/**
 * Gráfico de Gantt das tarefas (22/11/2026): as partes puras — ciclo nas
 * dependências e a geometria das barras. Client-safe.
 */

export type Dependencia = { tarefa: string; dependeDe: string }

/**
 * Trocar as dependências de `tarefa` por `novas` cria ciclo? (A depende de B
 * que, direta ou indiretamente, depende de A.)
 */
export function criaCiclo(existentes: Dependencia[], tarefa: string, novas: string[]): boolean {
  if (novas.includes(tarefa)) return true
  const grafo = new Map<string, string[]>()
  for (const d of existentes) {
    if (d.tarefa === tarefa) continue // as antigas de `tarefa` saem
    grafo.set(d.tarefa, [...(grafo.get(d.tarefa) ?? []), d.dependeDe])
  }
  // De cada nova dependência, seguir "depende de" até achar `tarefa`.
  const vistos = new Set<string>()
  const pilha = [...novas]
  while (pilha.length) {
    const atual = pilha.pop() as string
    if (atual === tarefa) return true
    if (vistos.has(atual)) continue
    vistos.add(atual)
    pilha.push(...(grafo.get(atual) ?? []))
  }
  return false
}

function dias(de: string, ate: string): number {
  return Math.round((Date.parse(`${ate}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 86400000)
}
function somar(data: string, n: number): string {
  const d = new Date(`${data}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export type ItemGantt = {
  id: string
  inicio: string | null
  prazo: string | null
  concluido: boolean
  dependeDe: string[]
}

export type BarraGantt = {
  id: string
  /** Dia em que a barra começa, a contar do início da escala (0 = primeiro dia). */
  inicio: number
  /** Quantos dias a barra ocupa (no mínimo 1). */
  duracao: number
  /** Alguma tarefa de que esta depende ainda não foi concluída. */
  bloqueada: boolean
  /** As tarefas de que esta depende e que terminam DEPOIS do início desta. */
  conflitos: string[]
}

/**
 * A escala (do primeiro início ao último prazo, com hoje dentro) e uma barra
 * por tarefa que tem data. Sem início, a barra é o dia do prazo; sem prazo,
 * o dia do início; sem nenhum dos dois, a tarefa fica fora (`semData`).
 */
export function layoutGantt(
  itens: ItemGantt[],
  hoje: string
): { de: string; ate: string; totalDias: number; hoje: number; barras: BarraGantt[]; semData: string[] } {
  const comData = itens
    .map((i) => {
      const ini = i.inicio ?? i.prazo
      const fim = i.prazo ?? i.inicio
      if (!ini || !fim) return null
      return { i, ini: ini <= fim ? ini : fim, fim: fim >= ini ? fim : ini }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
  const semData = itens.filter((i) => !i.inicio && !i.prazo).map((i) => i.id)
  if (comData.length === 0) return { de: hoje, ate: hoje, totalDias: 1, hoje: 0, barras: [], semData }

  const datas = [...comData.flatMap((c) => [c.ini, c.fim]), hoje].sort()
  const de = somar(datas[0], -1)
  const ate = somar(datas.at(-1) as string, 1)
  const fimDe = new Map(comData.map((c) => [c.i.id, c.fim]))
  const concluida = new Map(itens.map((i) => [i.id, i.concluido]))

  return {
    de,
    ate,
    totalDias: dias(de, ate) + 1,
    hoje: dias(de, hoje),
    semData,
    barras: comData.map(({ i, ini, fim }) => ({
      id: i.id,
      inicio: dias(de, ini),
      duracao: dias(ini, fim) + 1,
      bloqueada: !i.concluido && i.dependeDe.some((d) => concluida.get(d) === false),
      conflitos: i.dependeDe.filter((d) => {
        const fimAnterior = fimDe.get(d)
        return fimAnterior != null && fimAnterior > ini && !i.concluido
      }),
    })),
  }
}

/** Ordena as tarefas de modo que cada uma venha depois das de que depende (e, no empate, pelo início). */
export function ordenarPorDependencia<T extends { id: string; inicio: string | null; prazo: string | null; dependeDe: string[] }>(
  itens: T[]
): T[] {
  const porId = new Map(itens.map((i) => [i.id, i]))
  const chave = (i: T) => i.inicio ?? i.prazo ?? "9999"
  const pendentes = [...itens].sort((a, b) => chave(a).localeCompare(chave(b)))
  const saida: T[] = []
  const postos = new Set<string>()
  const visitar = (i: T, caminho: Set<string>) => {
    if (postos.has(i.id) || caminho.has(i.id)) return
    caminho.add(i.id)
    for (const d of i.dependeDe) {
      const anterior = porId.get(d)
      if (anterior) visitar(anterior, caminho)
    }
    postos.add(i.id)
    saida.push(i)
  }
  for (const i of pendentes) visitar(i, new Set())
  return saida
}
