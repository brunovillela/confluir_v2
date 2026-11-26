import { MODULOS_IA, PROCESSOS_IA, processoIA } from "./ia-processos"

/**
 * INVENTÁRIO DA IA (Gestão › Inteligência Artificial › Inventário, 26/11/2026).
 * Cada operação do catálogo, por módulo: quantas vezes rodou, o custo médio
 * por operação (só das chamadas com preço cadastrado) e o tempo que poupou —
 * minutos de uma pessoa por operação bem-sucedida, estimados no catálogo e
 * ajustáveis pela Gestão.
 *
 * Conta pura (sem banco), para o teste de unidade.
 */

/** Linha de ia_uso_inventario (um processo no período). */
export type UsoInventario = {
  processo: string
  chamadas: number
  sucessos: number
  falhas: number
  bloqueadas: number
  comCusto: number
  custo: number | null
  tokensEntrada: number
  tokensSaida: number
  duracaoMediaMs: number | null
  modelos: string[]
  ultima: string | null
}

export type OperacaoInventario = {
  chave: string
  titulo: string
  semIA: string
  chamadas: number
  sucessos: number
  falhas: number
  bloqueadas: number
  /** Custo médio por operação (US$), das chamadas com preço; null sem nenhuma. */
  custoMedio: number | null
  /** Soma do custo estimado (US$) das chamadas com preço. */
  custo: number | null
  /** Chamadas sem preço cadastrado (o custo delas não entra na média). */
  semPreco: number
  tokensMedios: number | null
  duracaoMediaS: number | null
  modelos: string[]
  /** Minutos de uma pessoa por operação (ajuste da Gestão ou estimativa do catálogo). */
  minutos: number
  minutosAjustados: boolean
  /** Minutos poupados no período (sucessos × minutos). */
  economiaMin: number
  /** Custo de IA por hora de trabalho poupada (US$); null sem custo ou sem economia. */
  custoPorHora: number | null
  ultima: string | null
}

export type ModuloInventario = {
  slug: string
  titulo: string
  operacoes: OperacaoInventario[]
  sucessos: number
  custo: number | null
  economiaMin: number
}

export type Inventario = {
  modulos: ModuloInventario[]
  total: { operacoes: number; emUso: number; chamadas: number; sucessos: number; custo: number | null; semPreco: number; economiaMin: number }
}

function soma(a: number | null, b: number | null): number | null {
  return a === null && b === null ? null : (a ?? 0) + (b ?? 0)
}

export function montarInventario(usos: UsoInventario[], ajustes: Record<string, number>): Inventario {
  const porChave = new Map(usos.map((u) => [u.processo, u]))
  // O catálogo inteiro (inclusive o que ainda não rodou) e o que veio do banco fora dele.
  const chaves = [...PROCESSOS_IA.map((p) => p.chave), ...usos.map((u) => u.processo).filter((c) => !PROCESSOS_IA.some((p) => p.chave === c))]

  const operacoes = chaves.map((chave): OperacaoInventario & { modulo: string } => {
    const p = processoIA(chave)
    const u = porChave.get(chave)
    const ajustado = Object.prototype.hasOwnProperty.call(ajustes, chave) && Number.isFinite(ajustes[chave]) && ajustes[chave] >= 0
    const minutos = ajustado ? ajustes[chave] : p.minutos
    const sucessos = u?.sucessos ?? 0
    const comCusto = u?.comCusto ?? 0
    const custo = u && comCusto > 0 ? (u.custo ?? 0) : null
    const economiaMin = sucessos * minutos
    const custoMedio = custo !== null ? custo / comCusto : null
    return {
      modulo: p.modulo,
      chave,
      titulo: p.titulo,
      semIA: p.semIA,
      chamadas: u?.chamadas ?? 0,
      sucessos,
      falhas: u?.falhas ?? 0,
      bloqueadas: u?.bloqueadas ?? 0,
      custoMedio,
      custo,
      semPreco: Math.max(0, (u?.chamadas ?? 0) - (u?.bloqueadas ?? 0) - comCusto),
      tokensMedios: u && u.chamadas - u.bloqueadas > 0 ? Math.round((u.tokensEntrada + u.tokensSaida) / (u.chamadas - u.bloqueadas)) : null,
      duracaoMediaS: u?.duracaoMediaMs != null ? Math.round(u.duracaoMediaMs / 100) / 10 : null,
      modelos: u?.modelos ?? [],
      minutos,
      minutosAjustados: ajustado,
      economiaMin,
      custoPorHora: custo !== null && economiaMin > 0 ? custo / (economiaMin / 60) : null,
      ultima: u?.ultima ?? null,
    }
  })

  const modulos: ModuloInventario[] = MODULOS_IA.map((m) => {
    const ops = operacoes
      .filter((o) => o.modulo === m.slug)
      .map((o): OperacaoInventario => {
        const { modulo, ...resto } = o
        void modulo
        return resto
      })
      .sort((a, b) => b.economiaMin - a.economiaMin || b.chamadas - a.chamadas || a.titulo.localeCompare(b.titulo, "pt-BR"))
    return {
      slug: m.slug,
      titulo: m.titulo,
      operacoes: ops,
      sucessos: ops.reduce((t, o) => t + o.sucessos, 0),
      custo: ops.reduce<number | null>((t, o) => soma(t, o.custo), null),
      economiaMin: ops.reduce((t, o) => t + o.economiaMin, 0),
    }
  }).filter((m) => m.operacoes.length > 0)

  return {
    modulos,
    total: {
      operacoes: operacoes.length,
      emUso: operacoes.filter((o) => o.chamadas > 0).length,
      chamadas: operacoes.reduce((t, o) => t + o.chamadas, 0),
      sucessos: operacoes.reduce((t, o) => t + o.sucessos, 0),
      custo: operacoes.reduce<number | null>((t, o) => soma(t, o.custo), null),
      semPreco: operacoes.reduce((t, o) => t + o.semPreco, 0),
      economiaMin: operacoes.reduce((t, o) => t + o.economiaMin, 0),
    },
  }
}

/** "3 h 20 min", "45 min", "12 dias úteis" (8 h) a partir de minutos. */
export function formatarTempo(min: number): string {
  if (min <= 0) return "0 min"
  if (min < 60) return `${Math.round(min)} min`
  const h = Math.floor(min / 60)
  const r = Math.round(min - h * 60)
  if (h < 40) return r ? `${h} h ${r} min` : `${h} h`
  const dias = min / 480
  return `${h.toLocaleString("pt-BR")} h (≈ ${dias.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} dias de 8 h)`
}
