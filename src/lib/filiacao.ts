import type { ChaveCampoVinculo } from "@/lib/saude-cadastros"

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
 * Como a entidade recebe a contribuição do filiado (`filiacoes.forma_recebimento`).
 * Fica na filiação, não no vínculo: Pix e boleto são da pessoa, não de uma fonte.
 * null = não informado.
 */
export const FORMAS_RECEBIMENTO = ["consignado", "pix", "boleto"] as const
export type FormaRecebimento = (typeof FORMAS_RECEBIMENTO)[number]

export const ROTULOS_FORMA_RECEBIMENTO: Record<FormaRecebimento, string> = {
  consignado: "Consignado (desconto em folha)",
  pix: "Pix",
  boleto: "Boleto",
}

/** Para tabelas: sem o complemento entre parênteses. */
export const ROTULO_CURTO_FORMA_RECEBIMENTO: Record<FormaRecebimento, string> = {
  consignado: "Consignado",
  pix: "Pix",
  boleto: "Boleto",
}

export const EXPLICACAO_FORMA_RECEBIMENTO: Record<FormaRecebimento, string> = {
  consignado: "A empresa ou o fundo de pensão desconta no contracheque e repassa à entidade.",
  pix: "O próprio filiado paga todo mês por Pix.",
  boleto: "A entidade emite um boleto por mês para o filiado pagar.",
}

export function formaRecebimento(valor: unknown): FormaRecebimento | null {
  return (FORMAS_RECEBIMENTO as readonly unknown[]).includes(valor)
    ? (valor as FormaRecebimento)
    : null
}

/**
 * Regra do tenant (`empresa.filiacao_exige_fonte`): a filiação depende de uma
 * fonte pagadora? Configurada em Institucional › Organização.
 */
export const OPCOES_EXIGE_FONTE = [
  {
    valor: "sim",
    rotulo: "Sim, sempre ligada a uma fonte pagadora",
    explicacao:
      "Todo recebimento fica vinculado a uma fonte pagadora, qualquer que seja a forma: consignado, Pix ou boleto. Quem paga por Pix continua ligado à empresa ou ao fundo de pensão.",
  },
  {
    valor: "nao",
    rotulo: "Não, pode existir sem fonte pagadora",
    explicacao:
      "O filiado pode contribuir direto à entidade, por Pix ou boleto, sem estar ligado a uma empresa ou fundo de pensão.",
  },
] as const

/**
 * Condição do filiado NA FONTE PAGADORA (por vínculo) — não confundir com a
 * condição sindical acima. Mesmos rótulos que o Bubble usava no cadastro.
 * Padrão por tipo de fonte: empresa → ativa; fundo de pensão → aposentado.
 */
export const CONDICOES_NA_FONTE = [
  "Trabalhador(a) da ativa",
  "Beneficiário(a) aposentado(a)",
  "Beneficiário(a) pensionista",
] as const
export type CondicaoNaFonte = (typeof CONDICOES_NA_FONTE)[number]

export function condicaoNaFontePadrao(fundoPensao: boolean): CondicaoNaFonte {
  return fundoPensao ? "Beneficiário(a) aposentado(a)" : "Trabalhador(a) da ativa"
}

/**
 * O que um vínculo de filiação precisa ter preenchido (regra do Bruno,
 * 10/09/2026). Isentos: data de saída/demissão na fonte, carta de
 * desligamento, data de desfiliação e — para quem não é trabalhador da
 * ativa — o regime de trabalho. Em fonte que é FUNDO DE PENSÃO, cargo e
 * lotação também não se aplicam (regra do Bruno, 12/09/2026): o filiado é
 * aposentado ou pensionista e não tem posto na empresa. Devolve os rótulos
 * do que falta.
 */
export function pendenciasDoVinculo(v: VinculoParaPendencias & {
  /** A fonte pagadora é fundo de pensão: cargo e lotação não se aplicam. */
  fundoPensao?: boolean
}): string[] {
  return camposFaltandoNoVinculo(v)
    .filter((c) => !(v.fundoPensao && (c === "v_cargo" || c === "v_lotacao")))
    .map((c) => ROTULO_FALTA_VINCULO[c])
}

type VinculoParaPendencias = {
  fonte_pagadora_id: string | null
  matricula: string | null
  cargo: string | null
  lotacao: string | null
  data_entrada_admissao: string | null
  data_filiacao: string | null
  condicao_na_fonte: string | null
  regime_trabalho: string | null
  temFicha: boolean
}

/** Rótulo curto (minúsculo) de cada campo do vínculo, como aparece nas listas. */
export const ROTULO_FALTA_VINCULO: Record<ChaveCampoVinculo, string> = {
  v_fonte: "fonte pagadora",
  v_matricula: "matrícula na fonte",
  v_cargo: "cargo",
  v_lotacao: "lotação",
  v_admissao: "admissão na fonte",
  v_data_filiacao: "data de filiação",
  v_condicao: "condição na fonte pagadora",
  v_regime: "regime de trabalho",
  v_ficha: "ficha de filiação",
}

/**
 * Tudo o que falta no vínculo, SEM isenção por categoria de fonte — quem
 * decide o peso de cada falta é a configuração da saúde dos cadastros
 * (lib/saude-cadastros.ts). O regime só é exigido de trabalhador da ativa.
 */
export function camposFaltandoNoVinculo(v: VinculoParaPendencias): ChaveCampoVinculo[] {
  const faltam: ChaveCampoVinculo[] = []
  if (!v.fonte_pagadora_id) faltam.push("v_fonte")
  if (!v.matricula) faltam.push("v_matricula")
  if (!v.cargo) faltam.push("v_cargo")
  if (!v.lotacao) faltam.push("v_lotacao")
  if (!v.data_entrada_admissao) faltam.push("v_admissao")
  if (!v.data_filiacao) faltam.push("v_data_filiacao")
  if (!v.condicao_na_fonte) faltam.push("v_condicao")
  if (v.condicao_na_fonte === "Trabalhador(a) da ativa" && !v.regime_trabalho) {
    faltam.push("v_regime")
  }
  if (!v.temFicha) faltam.push("v_ficha")
  return faltam
}

/** Regime de trabalho (turno) do vínculo. */
export const REGIMES_TRABALHO = [
  "Administrativo",
  "Ininterrupto de revezamento",
  "Ininterrupto de revezamento offshore",
  "Misto",
] as const
export type RegimeTrabalho = (typeof REGIMES_TRABALHO)[number]

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

// ── Contatos de emergência ──────────────────────────────────────────────────

/** Tipos de vínculo do contato de emergência com o filiado. */
export const VINCULOS_EMERGENCIA = [
  "Cônjuge ou companheiro(a)",
  "Filho(a)",
  "Pai ou mãe",
  "Irmão(ã)",
  "Outro parente",
  "Amigo(a)",
  "Vizinho(a)",
  "Colega de trabalho",
  "Outro",
] as const

/** Quantos contatos de emergência uma pessoa pode ter. */
export const MAX_CONTATOS_EMERGENCIA = 5
