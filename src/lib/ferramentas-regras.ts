/**
 * Onda 3 (22/11/2026): as regras "quando… então…" (lista fechada), e os
 * prazos relativos dos modelos. Client-safe.
 */
import { somarDias } from "./deliberacoes-constantes"

export const GATILHOS_REGRA = ["tarefa_criada", "tarefa_concluida", "tarefa_atrasou"] as const
export type GatilhoRegra = (typeof GATILHOS_REGRA)[number]
export const ACOES_REGRA = ["demanda_feito", "prioridade_alta", "atribuir", "etiquetar", "avisar"] as const
export type AcaoRegra = (typeof ACOES_REGRA)[number]

export const ROTULOS_GATILHO: Record<GatilhoRegra, string> = {
  tarefa_criada: "Quando uma tarefa for criada",
  tarefa_concluida: "Quando uma tarefa for concluída",
  tarefa_atrasou: "Quando uma tarefa atrasar",
}
export const ROTULOS_ACAO: Record<AcaoRegra, string> = {
  demanda_feito: "passar a demanda para Feito, se todas as tarefas dela estiverem concluídas",
  prioridade_alta: "mudar a prioridade para Alta",
  atribuir: "atribuir a tarefa sem responsável a",
  etiquetar: "pôr a etiqueta",
  avisar: "avisar",
}

/** As ações que cada gatilho aceita. */
export const ACOES_POR_GATILHO: Record<GatilhoRegra, readonly AcaoRegra[]> = {
  tarefa_criada: ["atribuir", "etiquetar", "avisar"],
  tarefa_concluida: ["demanda_feito", "avisar"],
  tarefa_atrasou: ["prioridade_alta", "etiquetar", "avisar"],
}
/** O que cada ação precisa. */
export const PARAMETRO_DA_ACAO: Record<AcaoRegra, "pessoa" | "etiqueta" | null> = {
  demanda_feito: null,
  prioridade_alta: null,
  atribuir: "pessoa",
  etiquetar: "etiqueta",
  avisar: "pessoa",
}

export function ehGatilho(v: unknown): v is GatilhoRegra {
  return typeof v === "string" && (GATILHOS_REGRA as readonly string[]).includes(v)
}
export function ehAcao(v: unknown): v is AcaoRegra {
  return typeof v === "string" && (ACOES_REGRA as readonly string[]).includes(v)
}

/** Confere a combinação; devolve a mensagem de erro ou null. */
export function validarRegra(r: { gatilho: unknown; acao: unknown; pessoaId: string | null; etiquetaId: string | null }): string | null {
  if (!ehGatilho(r.gatilho)) return "Escolha quando a regra age."
  if (!ehAcao(r.acao)) return "Escolha o que a regra faz."
  if (!ACOES_POR_GATILHO[r.gatilho].includes(r.acao)) return "Essa ação não combina com esse gatilho."
  const precisa = PARAMETRO_DA_ACAO[r.acao]
  if (precisa === "pessoa" && !r.pessoaId) return "Escolha a pessoa."
  if (precisa === "etiqueta" && !r.etiquetaId) return "Escolha a etiqueta."
  return null
}

/** A regra em uma frase: "Quando uma tarefa atrasar, na demanda X, mudar a prioridade para Alta." */
export function fraseDaRegra(r: {
  gatilho: GatilhoRegra
  acao: AcaoRegra
  demandaNome?: string | null
  pessoaNome?: string | null
  etiquetaNome?: string | null
}): string {
  const onde = r.demandaNome ? `, na demanda "${r.demandaNome}"` : ", em qualquer demanda ou avulsa"
  const alvo =
    PARAMETRO_DA_ACAO[r.acao] === "pessoa"
      ? ` ${r.pessoaNome ?? "(pessoa)"}`
      : PARAMETRO_DA_ACAO[r.acao] === "etiqueta"
        ? ` "${r.etiquetaNome ?? "(etiqueta)"}"`
        : ""
  return `${ROTULOS_GATILHO[r.gatilho]}${onde}, ${ROTULOS_ACAO[r.acao]}${alvo}.`
}

// ── Modelos: prazos relativos ───────────────────────────────────────────────

/** Prazo do item do modelo: a data de referência mais os dias (negativo = antes). */
export function prazoDoItem(referencia: string, dias: number): string {
  return somarDias(referencia, dias)
}

/** "10 dias antes", "no dia", "1 dia depois". */
export function rotuloDias(dias: number): string {
  if (dias === 0) return "no dia"
  const n = Math.abs(dias)
  return `${n} dia${n === 1 ? "" : "s"} ${dias < 0 ? "antes" : "depois"}`
}

/** Dias do item a partir de um prazo e da referência (para "Salvar como modelo"). */
export function diasEntre(referencia: string, prazo: string): number {
  return Math.round((Date.parse(`${prazo}T12:00:00Z`) - Date.parse(`${referencia}T12:00:00Z`)) / 86400000)
}
