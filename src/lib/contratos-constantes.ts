/**
 * Constantes e helpers de Contratos compartilhados entre client e server.
 * Fica FORA de `server-only` — badges e forms client importam daqui, nunca da
 * camada de dados (lição do módulo Saúde: client não importa de server-only).
 */

/** Situação derivada da vigência — nunca do campo `ativo` (legado furado). */
export const SITUACOES_CONTRATO = [
  "vigentes",
  "vencendo",
  "vencidos",
  "sem_termo",
  "todos",
] as const

export type SituacaoContrato = (typeof SITUACOES_CONTRATO)[number]

export const ROTULOS_SITUACAO_CONTRATO: Record<SituacaoContrato, string> = {
  vigentes: "Vigentes",
  vencendo: "Vencendo (≤30 dias)",
  vencidos: "Vencidos",
  sem_termo: "Sem termo definido",
  todos: "Todos",
}

/** Estado de vigência de uma linha, para badge e filtro. */
export type Vigencia = "vigente" | "vencendo" | "vencido" | "sem_termo"

/** Dias de antecedência que classificam um contrato como "vencendo". */
export const DIAS_VENCENDO = 30

/**
 * Vigência derivada só das datas + hoje (AAAA-MM-DD, fuso de SP passado pelo
 * servidor). Contrato sem término é "sem_termo" (vigência indeterminada).
 */
export function vigenciaDe(
  vigenciaTermino: string | null,
  hoje: string
): Vigencia {
  if (!vigenciaTermino) return "sem_termo"
  const termino = vigenciaTermino.slice(0, 10)
  if (termino < hoje) return "vencido"
  const limite = new Date(`${hoje}T00:00:00`)
  limite.setDate(limite.getDate() + DIAS_VENCENDO)
  const limiteISO = limite.toISOString().slice(0, 10)
  return termino <= limiteISO ? "vencendo" : "vigente"
}

/** Rótulos dos três tipos independentes (booleanos combináveis). */
export const TIPOS_CONTRATO = [
  { chave: "aditivo", rotulo: "Aditivo" },
  { chave: "sob_demanda", rotulo: "Sob demanda" },
  { chave: "apoio_institucional", rotulo: "Apoio institucional" },
] as const

export type ChaveTipoContrato = (typeof TIPOS_CONTRATO)[number]["chave"]

/**
 * Tipos que o usuário marca no formulário. `apoio_institucional` fica DE FORA:
 * não é marcável — é definido pela ORIGEM (true quando criado em Ajudas
 * institucionais, false quando criado em Contratos). Ver institucional-ajudas.sql.
 */
export const TIPOS_CONTRATO_MARCAVEIS = TIPOS_CONTRATO.filter(
  (t) => t.chave !== "apoio_institucional"
)

// ── Geração de ordens de pagamento a partir do contrato ─────────────────────

/** Periodicidade das ordens geradas por um contrato. */
export const PERIODICIDADES = [
  { chave: "mensal", rotulo: "Mensal" },
  { chave: "anual", rotulo: "Anual" },
  { chave: "unica", rotulo: "Única" },
] as const

export type Periodicidade = (typeof PERIODICIDADES)[number]["chave"]

/** Teto de parcelas por geração — evita laço acidental gigante. */
export const MAX_PARCELAS = 120

function pad(n: number): string {
  return String(n).padStart(2, "0")
}

/**
 * n-ésimo vencimento (0-based) a partir do primeiro, na periodicidade dada.
 * `unica` só tem a parcela 0. Datas em AAAA-MM-DD; o dia é limitado ao último
 * dia do mês-alvo (31/jan + 1 mês → 28/fev; 29/fev anual → 28 em ano comum).
 */
export function vencimentoParcela(
  primeiro: string,
  periodicidade: Periodicidade,
  n: number
): string {
  const [y, m, d] = primeiro.slice(0, 10).split("-").map(Number)
  if (periodicidade === "unica" || n === 0) {
    if (n === 0) return `${y}-${pad(m)}-${pad(d)}`
  }
  if (periodicidade === "anual") {
    const ty = y + n
    const ultimoDia = new Date(Date.UTC(ty, m, 0)).getUTCDate()
    return `${ty}-${pad(m)}-${pad(Math.min(d, ultimoDia))}`
  }
  // mensal
  const alvo = m - 1 + n
  const ty = y + Math.floor(alvo / 12)
  const tm = ((alvo % 12) + 12) % 12
  const ultimoDia = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate()
  return `${ty}-${pad(tm + 1)}-${pad(Math.min(d, ultimoDia))}`
}

/**
 * Sugestão de quantidade de parcelas cobrindo do início ao fim da vigência
 * (inclusive), na periodicidade dada. Sem término → 1 (o gestor ajusta).
 */
export function parcelasSugeridas(
  inicio: string | null,
  termino: string | null,
  periodicidade: Periodicidade
): number {
  if (periodicidade === "unica") return 1
  if (!inicio || !termino) return 1
  const [ay, am] = inicio.slice(0, 10).split("-").map(Number)
  const [by, bm] = termino.slice(0, 10).split("-").map(Number)
  if (by < ay || (by === ay && bm < am)) return 1
  const n =
    periodicidade === "anual"
      ? by - ay + 1
      : (by - ay) * 12 + (bm - am) + 1
  return Math.min(Math.max(n, 1), MAX_PARCELAS)
}
