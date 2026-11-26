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
  "finalizados",
  "todos",
] as const

export type SituacaoContrato = (typeof SITUACOES_CONTRATO)[number]

export const ROTULOS_SITUACAO_CONTRATO: Record<SituacaoContrato, string> = {
  vigentes: "Vigentes",
  vencendo: "Vencendo (≤30 dias)",
  vencidos: "Vencidos",
  sem_termo: "Sem termo definido",
  finalizados: "Finalizados",
  todos: "Todos",
}

/** Estado de vigência de uma linha, para badge e filtro. */
export type Vigencia = "vigente" | "vencendo" | "vencido" | "sem_termo" | "finalizado"

/** Dias de antecedência que classificam um contrato como "vencendo". */
export const DIAS_VENCENDO = 30

/**
 * Vigência derivada só das datas + hoje (AAAA-MM-DD, fuso de SP passado pelo
 * servidor). Contrato sem término é "sem_termo" (vigência indeterminada).
 */
export function vigenciaDe(
  vigenciaTermino: string | null,
  hoje: string,
  /** Finalizado (26/11/2026): encerrado de propósito — não é vencido nem vigente. */
  finalizadoEm?: string | null
): Vigencia {
  if (finalizadoEm) return "finalizado"
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

/** Situações que não ocupam o vencimento: dá para gerar outra ordem no lugar. */
export const SITUACOES_QUE_LIBERAM_VENCIMENTO = ["Cancelada"] as const

/**
 * Vencimento da última parcela em vigor do contrato (ordem não cancelada e
 * que não seja de RPA). Base da sugestão do próximo vencimento.
 */
export function ultimoVencimentoEmVigor(
  ordens: { vencimento: string | null; situacao: string | null; tipo: string | null }[]
): string | null {
  let ultimo: string | null = null
  for (const o of ordens) {
    const v = o.vencimento?.slice(0, 10)
    if (!v || o.tipo === "RPA") continue
    if ((SITUACOES_QUE_LIBERAM_VENCIMENTO as readonly string[]).includes(o.situacao ?? "")) continue
    if (!ultimo || v > ultimo) ultimo = v
  }
  return ultimo
}

/**
 * Primeiro vencimento sugerido ao gerar ordens: a parcela seguinte à última em
 * vigor; sem parcelas, o início da vigência. Nunca antes de hoje — sugerir uma
 * data passada (o início da vigência de meses atrás) induzia a lançar a parcela
 * no mês errado. Quem precisa lançar no passado digita a data (o form avisa).
 */
export function primeiroVencimentoSugerido(p: {
  vigenciaInicio: string | null
  hoje: string
  ultimoVencimento: string | null
  periodicidade: Periodicidade
}): string {
  const hoje = p.hoje.slice(0, 10)
  const base = p.ultimoVencimento
    ? vencimentoParcela(p.ultimoVencimento, p.periodicidade === "anual" ? "anual" : "mensal", 1)
    : (p.vigenciaInicio ?? hoje).slice(0, 10)
  return base < hoje ? hoje : base
}

/**
 * A ordem do contrato pode receber a nota pela tela do contrato? Sem nota
 * ainda, não cancelada, do próprio contrato (RPA tem recibo; compra recebe a
 * nota na compra) e fora da espera do documento (que tem quadro próprio).
 */
export function podeAnexarNotaPeloContrato(o: {
  situacao: string | null
  tipo: string | null
  processo_compra_id: string | null
  temNota: boolean
}): boolean {
  return (
    !o.temNota &&
    o.situacao !== "Cancelada" &&
    o.situacao !== "Aguardando documento fiscal" &&
    o.tipo !== "RPA" &&
    !o.processo_compra_id
  )
}

// ── Parcelas × pagamentos avulsos (26/11/2026) ───────────────────────────────
//
// O contrato paga de dois jeitos: as PARCELAS previstas (ordinárias, numeradas
// 1, 2, 3…) e os pagamentos AVULSOS (extraordinário ou sob demanda). Quem
// opera não via a diferença — a "parcela X/N" só ia na descrição, contada por
// geração. A ordem guarda a natureza (ordens_pagamento.contrato_pagamento) e o
// número da parcela é contado aqui, pelos vencimentos das não canceladas.

/** parcela | avulso; "anterior" = ordem do sistema anterior, sem a informação. */
export type NaturezaPagamentoContrato = "parcela" | "avulso" | "anterior"

export const ROTULO_NATUREZA_PAGAMENTO: Record<NaturezaPagamentoContrato, string> = {
  parcela: "Parcela",
  avulso: "Pagamento avulso",
  anterior: "Do sistema anterior",
}

/** A natureza de uma ordem do contrato. Sem a coluna: RPA é avulso; legado é "anterior". */
export function naturezaDaOrdem(o: {
  contrato_pagamento: string | null
  legado: boolean
  tipo: string | null
}): NaturezaPagamentoContrato {
  if (o.contrato_pagamento === "parcela") return "parcela"
  if (o.contrato_pagamento === "avulso") return "avulso"
  if (o.tipo === "RPA") return "avulso"
  return o.legado ? "anterior" : "avulso"
}

const cancelada = (situacao: string | null) =>
  (SITUACOES_QUE_LIBERAM_VENCIMENTO as readonly string[]).includes(situacao ?? "")

/**
 * Número de cada parcela no contrato ("parcela 3 de 12"): as parcelas não
 * canceladas, pela ordem do vencimento. A cancelada fica sem número.
 */
export function numerarParcelas(
  ordens: { id: string; natureza: NaturezaPagamentoContrato; situacao: string | null; vencimento: string | null }[]
): { numeros: Map<string, number>; total: number } {
  const parcelas = ordens
    .filter((o) => o.natureza === "parcela" && !cancelada(o.situacao))
    .sort((a, b) => (a.vencimento ?? "9999").localeCompare(b.vencimento ?? "9999"))
  return { numeros: new Map(parcelas.map((o, i) => [o.id, i + 1])), total: parcelas.length }
}

/**
 * Pagamentos avulsos que parecem as mensalidades do contrato: dois ou mais,
 * não cancelados, do mesmo valor em meses diferentes. Era o sinal de quem
 * gerava a parcela do mês como "pagamento extraordinário".
 */
export function avulsosParecemParcelas(
  ordens: { natureza: NaturezaPagamentoContrato; situacao: string | null; vencimento: string | null; valor: number | null; tipo: string | null }[]
): number {
  const porValor = new Map<string, Set<string>>()
  for (const o of ordens) {
    if (o.natureza !== "avulso" || cancelada(o.situacao) || o.tipo === "RPA" || !o.valor || !o.vencimento) continue
    const k = o.valor.toFixed(2)
    const meses = porValor.get(k) ?? new Set<string>()
    meses.add(o.vencimento.slice(0, 7))
    porValor.set(k, meses)
  }
  let maior = 0
  for (const meses of porValor.values()) if (meses.size >= 2) maior = Math.max(maior, meses.size)
  return maior
}

/** Rótulo da parcela: "Parcela 3 de 12". */
export function rotuloParcela(numero: number | undefined, total: number): string {
  return numero ? `Parcela ${numero} de ${total}` : "Parcela cancelada"
}

// ── Finalizar contrato (26/11/2026) ──────────────────────────────────────────

/** Por que o contrato foi finalizado. */
export const MOTIVOS_FINALIZACAO_CONTRATO = [
  "Cumprido — objeto entregue / prazo encerrado",
  "Rescindido antes do prazo",
  "Substituído por outro contrato",
  "Outro motivo",
] as const

/** Finalização em lote: "vencido há mais de N dias" (sem pagamento em aberto). */
export const DIAS_FINALIZACAO_LOTE = [30, 90, 180, 365] as const
