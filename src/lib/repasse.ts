/**
 * Controle de envio das relações de desconto (08/11/2026): regras puras de
 * prazo e situação. A fonte pagadora manda, a cada competência, a relação do
 * que descontou e deposita o valor; aqui se decide se cada empresa × mês está
 * em dia. Usado pelo quadro (lib/db/repasse.ts) e pelos testes de unidade.
 */

export const TIPOS_CONTRIBUICAO = ["Associativa", "Assistencial", "Sindical"] as const
export type TipoContribuicao = (typeof TIPOS_CONTRIBUICAO)[number]

export function ehTipoContribuicao(v: unknown): v is TipoContribuicao {
  return typeof v === "string" && (TIPOS_CONTRIBUICAO as readonly string[]).includes(v)
}

/** Uma linha de regra como está no banco (null = não definido / herda). */
export type RegraRepasse = {
  controla: boolean | null
  meses: number[] | null
  diaEnvio: number | null
  diaDeposito: number | null
  observacao?: string | null
}

export type RegraEfetiva = {
  controla: boolean
  meses: number[] | null
  diaEnvio: number
  diaDeposito: number
  /** A empresa tem exceção própria para este tipo. */
  excecao: boolean
  observacao: string | null
}

/**
 * O que vale quando a entidade ainda não configurou nada: a Associativa é
 * mensal e entra no controle; a Assistencial (depende do acordo de cada
 * empresa) e a Sindical (desconto em março, CLT art. 582) começam desligadas.
 */
export const REGRA_PADRAO: Record<TipoContribuicao, Omit<RegraEfetiva, "excecao" | "observacao">> = {
  Associativa: { controla: true, meses: null, diaEnvio: 10, diaDeposito: 10 },
  Assistencial: { controla: false, meses: null, diaEnvio: 10, diaDeposito: 10 },
  Sindical: { controla: false, meses: [3], diaEnvio: 30, diaDeposito: 30 },
}

/** Geral (ou padrão) com a exceção da empresa por cima. */
export function regraEfetiva(
  tipo: TipoContribuicao,
  geral: RegraRepasse | null | undefined,
  daEmpresa?: RegraRepasse | null
): RegraEfetiva {
  const p = REGRA_PADRAO[tipo]
  const base = {
    controla: geral?.controla ?? p.controla,
    meses: geral ? geral.meses : p.meses,
    diaEnvio: geral?.diaEnvio ?? p.diaEnvio,
    diaDeposito: geral?.diaDeposito ?? p.diaDeposito,
  }
  if (!daEmpresa) return { ...base, excecao: false, observacao: null }
  return {
    // A exceção só desliga (a empresa não desconta este tipo) ou religa um
    // tipo que a entidade não controla de modo geral (ex.: Assistencial).
    controla: daEmpresa.controla ?? base.controla,
    meses: daEmpresa.meses ?? base.meses,
    diaEnvio: daEmpresa.diaEnvio ?? base.diaEnvio,
    diaDeposito: daEmpresa.diaDeposito ?? base.diaDeposito,
    excecao: true,
    observacao: daEmpresa.observacao ?? null,
  }
}

// ── Competências (AAAAMM) ───────────────────────────────────────────────────

export function competenciaDe(ano: number, mes: number): number {
  return ano * 100 + mes
}

export function somarMeses(competencia: number, delta: number): number {
  const total = Math.floor(competencia / 100) * 12 + (competencia % 100) - 1 + delta
  return competenciaDe(Math.floor(total / 12), (total % 12) + 1)
}

/** "10/2026". */
export function rotuloCompetencia(competencia: number): string {
  return `${String(competencia % 100).padStart(2, "0")}/${Math.floor(competencia / 100)}`
}

const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]
/** "out/26". */
export function rotuloCurto(competencia: number): string {
  return `${MESES_CURTOS[(competencia % 100) - 1]}/${String(Math.floor(competencia / 100)).slice(2)}`
}

export function competenciaValida(v: number): boolean {
  return Number.isInteger(v) && v >= 200001 && v <= 210012 && v % 100 >= 1 && v % 100 <= 12
}

/** "2026-11-08" → 202611. */
export function competenciaDoDia(dia: string): number {
  return Number(dia.slice(0, 4)) * 100 + Number(dia.slice(5, 7))
}

/** As `n` competências que terminam em `ate`, da mais antiga para a mais nova. */
export function janelaCompetencias(ate: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) => somarMeses(ate, i - n + 1))
}

/**
 * Prazo (AAAA-MM-DD) para o dia `dia` do mês seguinte à competência; um dia
 * além do fim do mês vira o último dia (31 em fevereiro = 28/29).
 */
export function prazoDaCompetencia(competencia: number, dia: number): string {
  const seguinte = somarMeses(competencia, 1)
  const ano = Math.floor(seguinte / 100)
  const mes = seguinte % 100
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate()
  return `${ano}-${String(mes).padStart(2, "0")}-${String(Math.min(dia, ultimo)).padStart(2, "0")}`
}

/** O tipo é descontado nesta competência para esta regra? */
export function competenciaAplica(regra: Pick<RegraEfetiva, "controla" | "meses">, competencia: number): boolean {
  return regra.controla && (!regra.meses || regra.meses.includes(competencia % 100))
}

// ── Situação de uma célula (empresa × competência) ──────────────────────────

export const SITUACOES_ENVIO = [
  "atrasada",
  "falta_deposito",
  "divergente",
  "deposito_sem_relacao",
  "aguardando",
  "recebida_fora",
  "recebida",
  "paga",
  "sem_desconto",
  "sem_relacao",
  "nao_se_aplica",
] as const
export type SituacaoEnvio = (typeof SITUACOES_ENVIO)[number]

export type Tom = "perigo" | "alerta" | "sucesso" | "neutro" | "info"

export const ROTULO_SITUACAO: Record<SituacaoEnvio, { rotulo: string; curto: string; tom: Tom; explicacao: string }> = {
  atrasada: { rotulo: "Relação atrasada", curto: "Atrasada", tom: "perigo", explicacao: "O prazo de envio passou e a relação não chegou." },
  falta_deposito: { rotulo: "Falta o depósito", curto: "Sem depósito", tom: "perigo", explicacao: "A relação chegou, mas o prazo do depósito passou sem comprovante." },
  divergente: { rotulo: "Valor diferente", curto: "Diferente", tom: "alerta", explicacao: "O depósito não bate com o total da relação." },
  deposito_sem_relacao: { rotulo: "Depósito sem relação", curto: "Sem relação", tom: "alerta", explicacao: "Há comprovante de depósito, mas a relação não foi lançada." },
  aguardando: { rotulo: "Aguardando", curto: "No prazo", tom: "neutro", explicacao: "Ainda dentro do prazo de envio." },
  recebida_fora: { rotulo: "Recebida, falta lançar", curto: "Falta lançar", tom: "info", explicacao: "A relação chegou e foi registrada aqui, mas ainda não foi importada em Receitas." },
  recebida: { rotulo: "Relação recebida", curto: "Recebida", tom: "info", explicacao: "A relação foi lançada; o depósito ainda está no prazo." },
  paga: { rotulo: "Recebida e paga", curto: "Em dia", tom: "sucesso", explicacao: "Relação lançada e depósito registrado com o mesmo valor." },
  sem_desconto: { rotulo: "Sem desconto no mês", curto: "Sem desconto", tom: "sucesso", explicacao: "A empresa informou que não houve desconto nesta competência." },
  sem_relacao: { rotulo: "Sem relação", curto: "Sem relação", tom: "neutro", explicacao: "Antes do início do controle: a relação não foi lançada, mas não conta como atraso." },
  nao_se_aplica: { rotulo: "Não se aplica", curto: "—", tom: "neutro", explicacao: "Este tipo não é descontado nesta competência para esta empresa." },
}

/** Situações que pedem uma ação da equipe (cobrar a empresa ou conferir). */
export const SITUACOES_COBRAR: readonly SituacaoEnvio[] = ["atrasada", "falta_deposito"]
export const SITUACOES_CONFERIR: readonly SituacaoEnvio[] = ["divergente", "deposito_sem_relacao", "recebida_fora"]

export type DadosCelula = {
  aplica: boolean
  /** A competência é anterior ao início do controle (não conta atraso). */
  antesDoControle: boolean
  lancamentos: number
  valor: number
  /** Soma dos comprovantes de depósito; null = nenhum. */
  deposito: number | null
  recebidaFora: boolean
  semDesconto: boolean
  hoje: string
  prazoEnvio: string
  prazoDeposito: string
}

/** Tolerância de centavos entre relação e depósito. */
const TOLERANCIA = 0.009

export function situacaoEnvio(d: DadosCelula): SituacaoEnvio {
  if (d.lancamentos > 0) {
    if (d.deposito !== null) return Math.abs(d.deposito - d.valor) > TOLERANCIA ? "divergente" : "paga"
    return d.hoje > d.prazoDeposito && !d.antesDoControle ? "falta_deposito" : "recebida"
  }
  if (d.deposito !== null) return "deposito_sem_relacao"
  if (!d.aplica) return "nao_se_aplica"
  if (d.semDesconto) return "sem_desconto"
  if (d.recebidaFora) return "recebida_fora"
  if (d.hoje > d.prazoEnvio) return d.antesDoControle ? "sem_relacao" : "atrasada"
  return "aguardando"
}

/** Dias de atraso (0 se no prazo). */
export function diasDeAtraso(hoje: string, prazo: string): number {
  const ms = Date.parse(`${hoje}T00:00:00Z`) - Date.parse(`${prazo}T00:00:00Z`)
  return ms > 0 ? Math.floor(ms / 86_400_000) : 0
}

// ── Meios ───────────────────────────────────────────────────────────────────

export const MEIOS_REPASSE = [
  { valor: "email", rotulo: "E-mail" },
  { valor: "sistema_rh", rotulo: "Sistema do RH" },
  { valor: "oficio", rotulo: "Ofício" },
  { valor: "em_maos", rotulo: "Em mãos" },
  { valor: "whatsapp", rotulo: "WhatsApp" },
  { valor: "telefone", rotulo: "Telefone" },
  { valor: "outro", rotulo: "Outro" },
] as const
export type MeioRepasse = (typeof MEIOS_REPASSE)[number]["valor"]

/** Meios aceitos na comunicação de inclusões/exclusões (sem WhatsApp/telefone: precisa de prova). */
export const MEIOS_COMUNICACAO = MEIOS_REPASSE.filter((m) => !["whatsapp", "telefone"].includes(m.valor))

export function rotuloMeio(v: string | null | undefined): string {
  return MEIOS_REPASSE.find((m) => m.valor === v)?.rotulo ?? "—"
}

export const ROTULO_EVENTO: Record<string, string> = {
  relacao_recebida: "Relação recebida",
  sem_desconto: "Sem desconto no mês",
  cobranca: "Cobrança",
  contato: "Contato",
}

/** "3, 9" a partir de [3, 9]; aceita "mar, set" e números separados por vírgula/espaço. */
export function lerMeses(texto: string): number[] | null | { erro: string } {
  const partes = texto.toLowerCase().split(/[\s,;/]+/).filter(Boolean)
  if (partes.length === 0) return null
  const meses = new Set<number>()
  for (const p of partes) {
    const n = /^\d+$/.test(p) ? Number(p) : MESES_CURTOS.indexOf(p.slice(0, 3)) + 1
    if (!(n >= 1 && n <= 12)) return { erro: `Mês inválido: "${p}". Use números de 1 a 12 ou jan, fev…` }
    meses.add(n)
  }
  return [...meses].sort((a, b) => a - b)
}

export function rotuloMeses(meses: number[] | null): string {
  if (!meses || meses.length === 12) return "todos os meses"
  return meses.map((m) => MESES_CURTOS[m - 1]).join(", ")
}
