import { processoIA } from "./ia-processos"

/**
 * SUGESTÃO DE TROCA DE MODELO (Gestão › Inteligência Artificial, 22/11/2026).
 * Refaz a conta dos últimos 30 dias de cada processo simples (catálogo:
 * `simples`) com os preços de um modelo mais barato que a entidade cadastrou
 * e mostra quanto teria economizado. É só sugestão: quem decide é a Gestão,
 * com um clique por processo. Sem preço cadastrado não há conta — o modelo
 * menor precisa ter preço para entrar na comparação.
 *
 * Conta pura (sem banco), para o teste de unidade.
 */

export type UsoParaSugestao = {
  processo: string
  chamadas: number
  /** Tokens de entrada (inclui os em cache). */
  entrada: number
  cache: number
  saida: number
  /** Custo estimado no período; null = sem preço do modelo usado. */
  custo: number | null
}

export type PrecosCandidato = { entrada: number; cache: number | null; saida: number }

export type Candidato = { modelo: string; precos: PrecosCandidato }

export type SugestaoModelo = {
  processo: string
  titulo: string
  chamadas: number
  modeloAtual: string
  sugerido: string
  custoAtual: number
  custoSugerido: number
  economia: number
}

/** Mesma fórmula do registro (lib/ia.ts): US$ por milhão de tokens. */
export function custoComPrecos(u: Pick<UsoParaSugestao, "entrada" | "cache" | "saida">, p: PrecosCandidato): number {
  const cache = Math.min(u.cache, u.entrada)
  return ((u.entrada - cache) * p.entrada + cache * (p.cache ?? p.entrada) + u.saida * p.saida) / 1_000_000
}

export const ECONOMIA_MINIMA_USD = 0.1
export const FRACAO_MINIMA = 0.2

/**
 * Para cada processo simples com custo conhecido, o candidato (≠ do modelo em
 * uso) que mais reduziria o custo nos mesmos tokens. Entra se a economia
 * passa de US$ 0,10 e de 20% do custo. Maior economia primeiro.
 */
export function sugerirTrocasDeModelo(
  usos: UsoParaSugestao[],
  modeloAtual: (processo: string) => string,
  candidatos: Candidato[],
  limite = 8
): SugestaoModelo[] {
  const r: SugestaoModelo[] = []
  for (const u of usos) {
    const proc = processoIA(u.processo)
    if (!proc.simples || u.custo === null || u.custo <= 0 || u.chamadas === 0) continue
    const atual = modeloAtual(u.processo)
    let melhor: { modelo: string; custo: number } | null = null
    for (const c of candidatos) {
      if (c.modelo === atual) continue
      const custo = custoComPrecos(u, c.precos)
      if (!melhor || custo < melhor.custo) melhor = { modelo: c.modelo, custo }
    }
    if (!melhor) continue
    const economia = u.custo - melhor.custo
    if (economia < ECONOMIA_MINIMA_USD || economia < u.custo * FRACAO_MINIMA) continue
    r.push({
      processo: u.processo,
      titulo: proc.titulo,
      chamadas: u.chamadas,
      modeloAtual: atual,
      sugerido: melhor.modelo,
      custoAtual: u.custo,
      custoSugerido: melhor.custo,
      economia,
    })
  }
  return r.sort((a, b) => b.economia - a.economia).slice(0, limite)
}

/**
 * Processos simples que gastaram ao menos US$ 0,10 no período — para dizer
 * à Gestão que vale cadastrar o preço de um modelo menor e comparar.
 */
export function simplesComGasto(usos: UsoParaSugestao[]): number {
  return usos.filter((u) => processoIA(u.processo).simples && (u.custo ?? 0) >= ECONOMIA_MINIMA_USD).length
}
