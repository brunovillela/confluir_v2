/**
 * Constantes da área Pessoal › Atribuições / SST. Fonte única de rótulos,
 * taxonomia de riscos e da matriz de risco 5×5. Seguro para o client
 * (sem `server-only`) — usado por forms e por páginas server.
 *
 * A regra "rotineira × não rotineira" é sugerida pela frequência declarada
 * comparada ao limiar do tenant (empresa.sst_rotina_frequencia, padrão
 * 'mensal'): frequências AO MENOS tão frequentes quanto o limiar sugerem
 * rotineira. O gestor pode sobrepor.
 */

export type Opcao = { valor: string; rotulo: string }

// ── Recorrência (item 2) ─────────────────────────────────────────────────────
export const RECORRENCIAS: Opcao[] = [
  { valor: "rotineira", rotulo: "Rotineira" },
  { valor: "nao_rotineira", rotulo: "Não rotineira" },
]

/** Frequências, do mais frequente ao menos — `rank` maior = mais frequente. */
export const FREQUENCIAS: { valor: string; rotulo: string; rank: number }[] = [
  { valor: "diaria", rotulo: "Diária", rank: 8 },
  { valor: "semanal", rotulo: "Semanal", rank: 7 },
  { valor: "quinzenal", rotulo: "Quinzenal", rank: 6 },
  { valor: "mensal", rotulo: "Mensal", rank: 5 },
  { valor: "bimestral", rotulo: "Bimestral", rank: 4 },
  { valor: "trimestral", rotulo: "Trimestral", rank: 3 },
  { valor: "semestral", rotulo: "Semestral", rank: 2 },
  { valor: "anual", rotulo: "Anual", rank: 1 },
  { valor: "sob_demanda", rotulo: "Sob demanda / eventual", rank: 0 },
]

const RANK_FREQ = new Map(FREQUENCIAS.map((f) => [f.valor, f.rank]))

/** Limiar padrão do tenant, se não configurado. */
export const LIMIAR_ROTINA_PADRAO = "mensal"

/**
 * Sugere a recorrência a partir da frequência e do limiar do tenant.
 * "sob_demanda" nunca é rotineira. Retorna null se a frequência é desconhecida.
 */
export function sugerirRecorrencia(
  frequencia: string | null,
  limiar: string = LIMIAR_ROTINA_PADRAO
): "rotineira" | "nao_rotineira" | null {
  if (!frequencia) return null
  const rf = RANK_FREQ.get(frequencia)
  const rl = RANK_FREQ.get(limiar) ?? RANK_FREQ.get(LIMIAR_ROTINA_PADRAO)!
  if (rf === undefined) return null
  if (rf === 0) return "nao_rotineira"
  return rf >= rl ? "rotineira" : "nao_rotineira"
}

/** Estimativa de vezes por mês, para relatórios de esforço. */
export const VEZES_POR_MES: Record<string, number> = {
  diaria: 22,
  semanal: 4.33,
  quinzenal: 2.17,
  mensal: 1,
  bimestral: 0.5,
  trimestral: 0.33,
  semestral: 0.17,
  anual: 0.083,
  sob_demanda: 0.5,
}

// ── Presença física (item 4) ─────────────────────────────────────────────────
export const PRESENCAS: Opcao[] = [
  { valor: "presencial", rotulo: "Presencial" },
  { valor: "hibrida", rotulo: "Híbrida" },
  { valor: "remota", rotulo: "Remota" },
]

/** Peso de presença física para o % do relatório (presencial=1, híbrida=0,5). */
export const PESO_PRESENCA: Record<string, number> = {
  presencial: 1,
  hibrida: 0.5,
  remota: 0,
}

// ── Ferramentas / equipamentos (item 6) ──────────────────────────────────────
export const TIPOS_FERRAMENTA: Opcao[] = [
  { valor: "equipamento", rotulo: "Equipamento" },
  { valor: "sistema", rotulo: "Sistema de informação" },
  { valor: "ferramenta_manual", rotulo: "Ferramenta manual" },
  { valor: "infraestrutura", rotulo: "Infraestrutura (rede, energia)" },
  { valor: "outro", rotulo: "Outro" },
]

// ── Riscos ocupacionais (item 8) ─────────────────────────────────────────────
export const CATEGORIAS_RISCO: (Opcao & { cor: string })[] = [
  { valor: "acidente", rotulo: "Acidente / mecânico", cor: "#1e40af" },
  { valor: "fisico", rotulo: "Físico", cor: "#15803d" },
  { valor: "quimico", rotulo: "Químico", cor: "#b91c1c" },
  { valor: "biologico", rotulo: "Biológico", cor: "#7e22ce" },
  { valor: "ergonomico", rotulo: "Ergonômico", cor: "#a16207" },
  { valor: "psicossocial", rotulo: "Psicossocial", cor: "#be185d" },
]

export const ROTULO_CATEGORIA: Record<string, string> = Object.fromEntries(
  CATEGORIAS_RISCO.map((c) => [c.valor, c.rotulo])
)
export const COR_CATEGORIA: Record<string, string> = Object.fromEntries(
  CATEGORIAS_RISCO.map((c) => [c.valor, c.cor])
)

// ── Escalas 1..5 ─────────────────────────────────────────────────────────────
export const SEVERIDADES: Opcao[] = [
  { valor: "1", rotulo: "1 — Insignificante" },
  { valor: "2", rotulo: "2 — Leve" },
  { valor: "3", rotulo: "3 — Moderada" },
  { valor: "4", rotulo: "4 — Grave" },
  { valor: "5", rotulo: "5 — Catastrófica" },
]
export const PROBABILIDADES: Opcao[] = [
  { valor: "1", rotulo: "1 — Rara" },
  { valor: "2", rotulo: "2 — Improvável" },
  { valor: "3", rotulo: "3 — Possível" },
  { valor: "4", rotulo: "4 — Provável" },
  { valor: "5", rotulo: "5 — Quase certa" },
]

export type NivelRisco = {
  valor: number
  rotulo: string
  cor: string
  faixa: string
}

/**
 * Matriz de risco 5×5 (probabilidade × severidade → 1..25). Faixas clássicas:
 * Trivial, Tolerável, Moderado, Substancial, Intolerável.
 */
export function nivelRisco(
  probabilidade: number | null,
  severidade: number | null
): NivelRisco | null {
  if (!probabilidade || !severidade) return null
  const v = probabilidade * severidade
  if (v <= 3) return { valor: v, rotulo: "Trivial", faixa: "trivial", cor: "#15803d" }
  if (v <= 6) return { valor: v, rotulo: "Tolerável", faixa: "toleravel", cor: "#65a30d" }
  if (v <= 12) return { valor: v, rotulo: "Moderado", faixa: "moderado", cor: "#ca8a04" }
  if (v <= 16) return { valor: v, rotulo: "Substancial", faixa: "substancial", cor: "#ea580c" }
  return { valor: v, rotulo: "Intolerável", faixa: "intoleravel", cor: "#b91c1c" }
}

// ── Medidas (item 9) ─────────────────────────────────────────────────────────
export const TIPOS_MEDIDA: Opcao[] = [
  { valor: "treinamento", rotulo: "Treinamento" },
  { valor: "epi", rotulo: "EPI (equipamento de proteção individual)" },
]

// ── Rótulos utilitários ──────────────────────────────────────────────────────
export const ROTULO_RECORRENCIA: Record<string, string> = Object.fromEntries(
  RECORRENCIAS.map((r) => [r.valor, r.rotulo])
)
export const ROTULO_FREQUENCIA: Record<string, string> = Object.fromEntries(
  FREQUENCIAS.map((f) => [f.valor, f.rotulo])
)
export const ROTULO_PRESENCA: Record<string, string> = Object.fromEntries(
  PRESENCAS.map((p) => [p.valor, p.rotulo])
)
export const ROTULO_TIPO_FERRAMENTA: Record<string, string> = Object.fromEntries(
  TIPOS_FERRAMENTA.map((t) => [t.valor, t.rotulo])
)
export const ROTULO_TIPO_MEDIDA: Record<string, string> = Object.fromEntries(
  TIPOS_MEDIDA.map((t) => [t.valor, t.rotulo])
)

/** Formata minutos/mês como "Xh Ymin" ou "—". */
export function formatarTempoMes(min: number | null): string {
  if (min === null || min <= 0) return "—"
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h === 0) return `${m}min`
  if (m === 0) return `${h}h`
  return `${h}h ${m}min`
}
