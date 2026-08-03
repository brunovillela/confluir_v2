/**
 * Constantes do módulo Jurídico compartilhadas entre client e server.
 *
 * NÃO importa nada de `server-only` — telas client (formulários, filtros)
 * consomem daqui. As funções `lerOrdem`/`lerDirecao` sanitizam os parâmetros
 * de URL da listagem, do mesmo jeito que saude-constantes.ts faz nas CATs.
 */

/**
 * Motivos de rescisão homologados. Os seis primeiros vêm dos dados migrados
 * do Bubble (grafias exatas — não alterar, senão o legado deixa de casar nos
 * filtros). Um registro pode não ter motivo (10 legados vieram nulos).
 */
export const MOTIVOS_RESCISAO = [
  "A pedido do empregado",
  "Despedida sem justa causa",
  "Acordo empregado e empregador",
  "Extinção antecipada de contrato por prazo determinado",
  "Extinção de contrato por prazo determinado",
] as const

export type MotivoRescisao = (typeof MOTIVOS_RESCISAO)[number]

export function motivoValido(valor: string): valor is MotivoRescisao {
  return (MOTIVOS_RESCISAO as readonly string[]).includes(valor)
}

/** Filtro por vínculo do trabalhador com o sindicato. */
export const FILTROS_FILIACAO = [
  { valor: "todos", rotulo: "Filiados e não-filiados" },
  { valor: "filiados", rotulo: "Somente filiados" },
  { valor: "nao_filiados", rotulo: "Somente não-filiados" },
] as const

export type FiltroFiliacao = (typeof FILTROS_FILIACAO)[number]["valor"]

export function filtroFiliacaoValido(valor: string): valor is FiltroFiliacao {
  return FILTROS_FILIACAO.some((f) => f.valor === valor)
}

// ── Ordenação da listagem ───────────────────────────────────────────────────

export const ORDENS = [
  { valor: "data", rotulo: "Data da homologação" },
  { valor: "trabalhador", rotulo: "Trabalhador" },
  { valor: "empregador", rotulo: "Empregador" },
  { valor: "motivo", rotulo: "Motivo" },
] as const

export type Ordem = (typeof ORDENS)[number]["valor"]
export type Direcao = "asc" | "desc"

export function lerOrdem(valor: string | undefined): Ordem {
  return ORDENS.some((o) => o.valor === valor) ? (valor as Ordem) : "data"
}

export function lerDirecao(valor: string | undefined): Direcao {
  return valor === "asc" ? "asc" : "desc"
}

// ── Processos (registro simples) ─────────────────────────────────────────────

/** Área do direito do processo. */
export const TIPOS_PROCESSO = [
  "Trabalhista",
  "Cível",
  "Previdenciário",
  "Criminal",
  "Administrativo",
  "Tributário",
  "Outro",
] as const

export type TipoProcesso = (typeof TIPOS_PROCESSO)[number]

export function tipoProcessoValido(valor: string): valor is TipoProcesso {
  return (TIPOS_PROCESSO as readonly string[]).includes(valor)
}

/** Situação do processo. Os três últimos ENCERRAM (marcam `finalizado`). */
export const STATUS_PROCESSO = [
  "Em andamento",
  "Suspenso",
  "Em grau de recurso",
  "Acordo",
  "Arquivado",
  "Encerrado com êxito",
  "Encerrado sem êxito",
] as const

export type StatusProcesso = (typeof STATUS_PROCESSO)[number]

export function statusProcessoValido(valor: string): valor is StatusProcesso {
  return (STATUS_PROCESSO as readonly string[]).includes(valor)
}

/** Status terminais: escolher um deles marca o processo como finalizado. */
export const STATUS_PROCESSO_FINALIZADOS: readonly StatusProcesso[] = [
  "Arquivado",
  "Encerrado com êxito",
  "Encerrado sem êxito",
]

export function statusFinaliza(status: string | null): boolean {
  return (
    status !== null &&
    (STATUS_PROCESSO_FINALIZADOS as readonly string[]).includes(status)
  )
}

/** Filtro por situação de andamento. */
export const FILTROS_ANDAMENTO = [
  { valor: "todos", rotulo: "Todos os processos" },
  { valor: "abertos", rotulo: "Em andamento" },
  { valor: "finalizados", rotulo: "Finalizados" },
] as const

export type FiltroAndamento = (typeof FILTROS_ANDAMENTO)[number]["valor"]

export function filtroAndamentoValido(valor: string): valor is FiltroAndamento {
  return FILTROS_ANDAMENTO.some((f) => f.valor === valor)
}

/** Filtro por natureza (coluna `coletivo`). */
export const FILTROS_NATUREZA = [
  { valor: "todas", rotulo: "Individuais e coletivos" },
  { valor: "individual", rotulo: "Somente individuais" },
  { valor: "coletivo", rotulo: "Somente coletivos" },
] as const

export type FiltroNatureza = (typeof FILTROS_NATUREZA)[number]["valor"]

export function filtroNaturezaValido(valor: string): valor is FiltroNatureza {
  return FILTROS_NATUREZA.some((f) => f.valor === valor)
}

export const ORDENS_PROCESSO = [
  { valor: "data", rotulo: "Data de abertura" },
  { valor: "numero", rotulo: "Número" },
  { valor: "status", rotulo: "Status" },
  { valor: "tipo", rotulo: "Tipo" },
] as const

export type OrdemProcesso = (typeof ORDENS_PROCESSO)[number]["valor"]

export function lerOrdemProcesso(valor: string | undefined): OrdemProcesso {
  return ORDENS_PROCESSO.some((o) => o.valor === valor)
    ? (valor as OrdemProcesso)
    : "data"
}

// ── Reembolsos de processo ───────────────────────────────────────────────────

/**
 * Situação da esteira do reembolso. `pago` NÃO é armazenado: deriva da ordem
 * de pagamento vinculada (ordem.pago). Ver [[confluir-fase-3a]].
 */
export const SITUACOES_REEMBOLSO = [
  "aguardando",
  "aprovado",
  "reprovado",
] as const

export type SituacaoReembolso = (typeof SITUACOES_REEMBOLSO)[number]

/** Situação exibida, incluindo o 'pago' derivado da ordem. */
export type SituacaoReembolsoExibida = SituacaoReembolso | "pago"

export const ROTULOS_SITUACAO_REEMBOLSO: Record<
  SituacaoReembolsoExibida,
  string
> = {
  aguardando: "Aguardando aprovação",
  aprovado: "Aprovado — aguardando pagamento",
  reprovado: "Reprovado",
  pago: "Pago",
}

export const FILTROS_SITUACAO_REEMBOLSO = [
  { valor: "todas", rotulo: "Todas as situações" },
  { valor: "aguardando", rotulo: "Aguardando aprovação" },
  { valor: "aprovado", rotulo: "Aprovados (a pagar)" },
  { valor: "pago", rotulo: "Pagos" },
  { valor: "reprovado", rotulo: "Reprovados" },
] as const

export type FiltroSituacaoReembolso =
  (typeof FILTROS_SITUACAO_REEMBOLSO)[number]["valor"]

export function filtroSituacaoReembolsoValido(
  valor: string
): valor is FiltroSituacaoReembolso {
  return FILTROS_SITUACAO_REEMBOLSO.some((f) => f.valor === valor)
}
