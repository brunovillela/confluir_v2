/**
 * Constantes do módulo Veículos compartilhadas entre servidor e cliente
 * (fora de db/veiculos.ts, que é server-only).
 */

export const SITUACOES_AGENDAMENTO = [
  "solicitada",
  "atendida",
  "retirada",
  "concluida",
  "negada",
  "cancelada",
  "expirada",
] as const

export type SituacaoAgendamento = (typeof SITUACOES_AGENDAMENTO)[number]

export const ROTULOS_SITUACAO_AGENDAMENTO: Record<SituacaoAgendamento, string> =
  {
    solicitada: "Solicitada",
    atendida: "Atendida (aguardando retirada)",
    retirada: "Veículo retirado",
    concluida: "Concluída",
    negada: "Negada",
    cancelada: "Cancelada",
    expirada: "Expirada",
  }

export const TIPOS_INFRACAO = [
  "Leve",
  "Média",
  "Grave",
  "Gravíssima",
] as const

export const SITUACOES_COBRANCA = ["pendente", "baixada", "isenta"] as const

export type SituacaoCobranca = (typeof SITUACOES_COBRANCA)[number]

export const ROTULOS_SITUACAO_COBRANCA: Record<SituacaoCobranca, string> = {
  pendente: "Cobrança pendente",
  baixada: "Baixada (recebida)",
  isenta: "Isenta (atividade sindical)",
}

export const FORMAS_COBRANCA = ["contracheque", "diaria"] as const

export type FormaCobranca = (typeof FORMAS_COBRANCA)[number]

export const ROTULOS_FORMA_COBRANCA: Record<FormaCobranca, string> = {
  contracheque: "Desconto em contracheque",
  diaria: "Desconto em diárias",
}

export const CATEGORIAS_CNH = [
  "A",
  "B",
  "AB",
  "C",
  "D",
  "E",
  "AC",
  "AD",
  "AE",
] as const

/** Combustíveis do legado + os básicos, para o cadastro da frota. */
export const COMBUSTIVEIS_VEICULO = [
  "Flex (Etanol e Gasolina)",
  "Flex (Etanol e Gasolina) + GNV",
  "Gasolina",
  "Etanol",
  "Diesel",
  "Elétrico",
  "Híbrido",
] as const

/** Tipos legados das ordens de pagamento do módulo (conferidos no banco). */
export const TIPO_ORDEM_MULTA = "Multa de trânsito"
export const TIPO_ORDEM_ALUGUEL = "Locação de veículos - Mensalidade"
