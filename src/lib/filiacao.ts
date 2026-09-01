/**
 * Valores reais de `filiacoes.filiacao_condicao` — campo central de status
 * do filiado (equivalente ao option set "Filiação Condição" do Bubble).
 * Registros antigos podem ter null (sem condição registrada).
 */
export const FILIACAO_CONDICOES = [
  "Ativo",
  "Inativo",
  "Aguarda ficha assinada",
  "Em processo de filiação coletiva",
  "Filiação aguarda fonte",
  "Filiação não informada à fonte",
  "Desfiliação aguarda fonte",
  "Desfiliação não informada à fonte",
  "Falecido",
  "Excluído(a) do quadro associativo",
] as const

export type FiliacaoCondicao = (typeof FILIACAO_CONDICOES)[number]

/**
 * Grupos de condições usados nos indicadores do dashboard — o filtro
 * `condicao` da listagem aceita a chave do grupo além dos valores acima.
 */
export const GRUPOS_CONDICAO: Record<
  string,
  { rotulo: string; condicoes: FiliacaoCondicao[] }
> = {
  andamento_filiacao: {
    rotulo: "Filiação em andamento",
    condicoes: ["Filiação aguarda fonte", "Filiação não informada à fonte"],
  },
  andamento_desfiliacao: {
    rotulo: "Desfiliação em andamento",
    condicoes: ["Desfiliação aguarda fonte", "Desfiliação não informada à fonte"],
  },
}

// ── Trilhas de etapas (processo de filiação e de desfiliação) ───────────────
//
// A `filiacao_condicao` é a máquina de estados. Cada trilha é a sequência
// ORDENADA de condições até o objetivo final (Ativo / Inativo). O "avançar
// etapa" caminha nessa ordem; o gráfico de marcos é derivado dela.

/** Ordem das condições no processo de filiação INDIVIDUAL (até Ativo). */
export const ORDEM_FILIACAO: FiliacaoCondicao[] = [
  "Aguarda ficha assinada",
  "Filiação não informada à fonte",
  "Filiação aguarda fonte",
  "Ativo",
]

/**
 * Ordem das condições na filiação COLETIVA (deliberada em assembleia com
 * cláusula no ACT). É uma trilha PRÓPRIA, mais curta que a individual: não há
 * ficha a assinar — a decisão da categoria substitui a adesão individual.
 * "Filiação aguarda fonte" é o estado em que a fonte JÁ foi informada (é ele
 * que carimba `filiacao_informada_fonte_em`), por isso o marco se chama
 * "Filiação informada à fonte". Ver [[confluir-filiacao-coletiva]].
 */
export const ORDEM_FILIACAO_COLETIVA: FiliacaoCondicao[] = [
  "Em processo de filiação coletiva",
  "Filiação aguarda fonte",
  "Ativo",
]

/** A condição que abre a trilha coletiva (usada no motor e no portal). */
export const CONDICAO_COLETIVA: FiliacaoCondicao =
  "Em processo de filiação coletiva"

/** Ordem das condições no processo de desfiliação (até Inativo). */
export const ORDEM_DESFILIACAO: FiliacaoCondicao[] = [
  "Desfiliação não informada à fonte",
  "Desfiliação aguarda fonte",
  "Inativo",
]

/** Condições intermediárias em que o respectivo gráfico deve aparecer. */
export const EM_ANDAMENTO_FILIACAO = ORDEM_FILIACAO.slice(0, -1)
export const EM_ANDAMENTO_DESFILIACAO = ORDEM_DESFILIACAO.slice(0, -1)
export const EM_ANDAMENTO_COLETIVA = ORDEM_FILIACAO_COLETIVA.slice(0, -1)

/**
 * Coluna de data carimbada ao ENTRAR em cada condição (motor de etapas).
 * A entrada em "Filiação não informada à fonte" acontece porque a ficha foi
 * assinada, então grava `ficha_assinada_em`, e assim por diante.
 */
export const DATA_AO_ENTRAR: Partial<Record<FiliacaoCondicao, string>> = {
  "Filiação não informada à fonte": "ficha_assinada_em",
  "Em processo de filiação coletiva": "filiacao_coletiva_em",
  "Filiação aguarda fonte": "filiacao_informada_fonte_em",
  Ativo: "ativo_em",
  "Desfiliação aguarda fonte": "desfiliacao_informada_fonte_em",
  Inativo: "inativo_em",
}

export type ProcessoFiliacao = "filiacao" | "filiacao_coletiva" | "desfiliacao"

/**
 * A qual processo a condição pertence (para escolher o gráfico/avanço).
 * A condição de abertura da coletiva é exclusiva dela; as demais condições
 * ("Filiação aguarda fonte", "Ativo") são COMPARTILHADAS com a individual —
 * por isso quem está nelas cai na trilha individual, salvo se o chamador
 * informar que o registro veio de um lote coletivo (`ehColetiva`).
 */
export function processoDaCondicao(
  condicao: string | null | undefined,
  ehColetiva = false
): ProcessoFiliacao | null {
  if (!condicao) return null
  if (condicao === CONDICAO_COLETIVA) return "filiacao_coletiva"
  if ((ORDEM_DESFILIACAO as string[]).includes(condicao)) return "desfiliacao"
  if ((ORDEM_FILIACAO as string[]).includes(condicao)) {
    return ehColetiva &&
      (ORDEM_FILIACAO_COLETIVA as string[]).includes(condicao)
      ? "filiacao_coletiva"
      : "filiacao"
  }
  return null
}

const ORDEM_DO_PROCESSO: Record<ProcessoFiliacao, FiliacaoCondicao[]> = {
  filiacao: ORDEM_FILIACAO,
  filiacao_coletiva: ORDEM_FILIACAO_COLETIVA,
  desfiliacao: ORDEM_DESFILIACAO,
}

/**
 * Próxima condição na trilha da condição atual — ou null se já é o objetivo
 * final (Ativo/Inativo) ou não pertence a um processo.
 */
export function proximaCondicao(
  condicao: string | null | undefined,
  ehColetiva = false
): FiliacaoCondicao | null {
  const processo = processoDaCondicao(condicao, ehColetiva)
  if (!processo) return null
  const ordem = ORDEM_DO_PROCESSO[processo]
  const i = ordem.findIndex((c) => c === condicao)
  return i >= 0 && i < ordem.length - 1 ? ordem[i + 1] : null
}

export type EstadoMarco = "concluido" | "atual" | "pendente"
export type MarcoTrilha = {
  rotulo: string
  data: string | null
  estado: EstadoMarco
}

/** Rótulo e coluna de data de cada marco visível no gráfico de cada processo. */
const MARCOS_FILIACAO: { rotulo: string; coluna: string | null }[] = [
  { rotulo: "Cadastro", coluna: "created_at" },
  { rotulo: "Ficha assinada", coluna: "ficha_assinada_em" },
  { rotulo: "Fonte informada", coluna: "filiacao_informada_fonte_em" },
  { rotulo: "Ativo", coluna: "ativo_em" },
]
const MARCOS_DESFILIACAO: { rotulo: string; coluna: string | null }[] = [
  { rotulo: "Carta recebida", coluna: null },
  { rotulo: "Fonte informada", coluna: "desfiliacao_informada_fonte_em" },
  { rotulo: "Inativo", coluna: "inativo_em" },
]
/** Trilha da filiação COLETIVA — mais curta, sem ficha assinada. */
const MARCOS_FILIACAO_COLETIVA: { rotulo: string; coluna: string | null }[] = [
  { rotulo: "Em processo de filiação coletiva", coluna: "filiacao_coletiva_em" },
  { rotulo: "Filiação informada à fonte", coluna: "filiacao_informada_fonte_em" },
  { rotulo: "Ativo", coluna: "ativo_em" },
]

/**
 * Monta os marcos do gráfico a partir da condição e das datas do registro.
 * `concluidos` = quantos marcos já foram atingidos (inclui o marco inicial):
 * o índice da condição na ordem + 1. O próximo marco é o "atual" (alvo).
 * Retorna null quando a condição não está em nenhum processo em andamento.
 */
export function marcosDaTrilha(
  condicao: string | null | undefined,
  datas: Record<string, string | null | undefined>,
  ehColetiva = false
): { processo: ProcessoFiliacao; marcos: MarcoTrilha[] } | null {
  const processo = processoDaCondicao(condicao, ehColetiva)
  if (!processo) return null
  const ordem = ORDEM_DO_PROCESSO[processo]
  const marcosBase =
    processo === "filiacao"
      ? MARCOS_FILIACAO
      : processo === "filiacao_coletiva"
        ? MARCOS_FILIACAO_COLETIVA
        : MARCOS_DESFILIACAO
  const idx = ordem.findIndex((c) => c === condicao)
  // Objetivo final não mostra gráfico (o processo terminou).
  if (idx < 0 || idx >= ordem.length - 1) return null

  const concluidos = idx + 1 // marco inicial + etapas já vencidas
  const marcos: MarcoTrilha[] = marcosBase.map((m, i) => ({
    rotulo: m.rotulo,
    data: m.coluna ? (datas[m.coluna] ?? null) : null,
    estado: i < concluidos ? "concluido" : i === concluidos ? "atual" : "pendente",
  }))
  return { processo, marcos }
}
