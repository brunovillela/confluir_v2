/**
 * Motivos de desfiliação em lista fechada (onda 4, I6). Sem lista não há
 * churn que se analise: "outros" em texto livre vira 200 motivos diferentes.
 * Gravado em `filiacoes.desfiliacao_motivo` (supabase/filiacao-motivo-desfiliacao.sql).
 */
export const MOTIVOS_DESFILIACAO = [
  { chave: "aposentadoria", rotulo: "Aposentadoria" },
  { chave: "desligamento", rotulo: "Desligamento da empresa" },
  { chave: "transferencia", rotulo: "Transferência de base ou categoria" },
  { chave: "financeiro", rotulo: "Custo da contribuição" },
  { chave: "insatisfacao", rotulo: "Insatisfação com o sindicato" },
  { chave: "oposicao", rotulo: "Oposição à contribuição" },
  { chave: "falecimento", rotulo: "Falecimento" },
  { chave: "outro", rotulo: "Outro motivo" },
] as const

export type MotivoDesfiliacao = (typeof MOTIVOS_DESFILIACAO)[number]["chave"]

export function rotuloMotivoDesfiliacao(chave: string | null | undefined): string {
  return MOTIVOS_DESFILIACAO.find((m) => m.chave === chave)?.rotulo ?? "Não informado"
}

export function motivoDesfiliacaoValido(chave: string): chave is MotivoDesfiliacao {
  return MOTIVOS_DESFILIACAO.some((m) => m.chave === chave)
}
