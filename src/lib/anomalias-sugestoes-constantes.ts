/**
 * Sugestões de anomalia (19/11/2026): origens, limiares e as partes puras da
 * detecção. Client-safe — a tela e o manual usam os mesmos números.
 */

export const ORIGENS_SUGESTAO = [
  "km_anormal",
  "ordem_devolvida",
  "ponto_incompleto",
  "compras_canceladas",
  "infracoes_condutor",
] as const
export type OrigemSugestao = (typeof ORIGENS_SUGESTAO)[number]

export const ROTULOS_ORIGEM_SUGESTAO: Record<OrigemSugestao, string> = {
  km_anormal: "Km fora do normal",
  ordem_devolvida: "Ordem devolvida várias vezes",
  ponto_incompleto: "Ponto incompleto recorrente",
  compras_canceladas: "Compras canceladas",
  infracoes_condutor: "Infrações recorrentes",
}

/** A partir de quantas ocorrências cada origem vira sugestão, e em que janela. */
export const LIMIARES_SUGESTAO = {
  /** Devoluções da mesma ordem. */
  ordemDevolvida: 3,
  /** Dias com marcação incompleta no mesmo registro de ponto (mês). */
  pontoIncompleto: 3,
  /** Compras canceladas do mesmo fornecedor em DIAS_COMPRAS_CANCELADAS. */
  comprasCanceladas: 3,
  /** Infrações do mesmo condutor em DIAS_INFRACOES. */
  infracoes: 3,
} as const
export const DIAS_COMPRAS_CANCELADAS = 90
export const DIAS_INFRACOES = 365
/** Só olha o que aconteceu nestes dias (evita sugerir o passado inteiro no primeiro dia). */
export const DIAS_RECENTES = 30

export function ehOrigemSugestao(v: unknown): v is OrigemSugestao {
  return typeof v === "string" && (ORIGENS_SUGESTAO as readonly string[]).includes(v)
}

/** "2026-T4": o trimestre de uma data — no máximo uma sugestão por trimestre nas recorrências. */
export function trimestreDe(dataISO: string): string {
  const [a, m] = dataISO.split("-").map(Number)
  return `${a}-T${Math.floor((m - 1) / 3) + 1}`
}

/**
 * Agrupa ocorrências por quem se repete (fornecedor, condutor, ordem) e
 * devolve os grupos com pelo menos `minimo`, com a data mais recente.
 */
export function recorrentes<T extends { quem: string; data: string }>(
  itens: T[],
  minimo: number
): { quem: string; quantidade: number; ultima: string; itens: T[] }[] {
  const grupos = new Map<string, T[]>()
  for (const i of itens) grupos.set(i.quem, [...(grupos.get(i.quem) ?? []), i])
  return [...grupos]
    .filter(([, l]) => l.length >= minimo)
    .map(([quem, l]) => ({
      quem,
      quantidade: l.length,
      ultima: l.map((i) => i.data).sort().at(-1) as string,
      itens: l,
    }))
}
