/**
 * Constantes e rótulos do Custeio Institucional, compartilhados entre client e
 * server. Fica FORA de `server-only` — forms e badges importam daqui, nunca da
 * camada de dados (lição do módulo Saúde: client não importa de server-only).
 *
 * Reaproveita a mecânica de parcelas de contratos-constantes (mesmo cálculo de
 * vencimentos) para não duplicar regra de recorrência.
 */

export {
  PERIODICIDADES,
  MAX_PARCELAS,
  vencimentoParcela,
  parcelasSugeridas,
  type Periodicidade,
} from "@/lib/contratos-constantes"

/** Tipos de beneficiário do custeio (o "quem recebe"). */
export const TIPOS_BENEFICIARIO = [
  { chave: "diretor", rotulo: "Diretor" },
  { chave: "filiado", rotulo: "Filiado (demitido político)" },
  { chave: "convidado", rotulo: "Convidado externo" },
  { chave: "assessoria", rotulo: "Assessoria" },
] as const

export type TipoBeneficiario = (typeof TIPOS_BENEFICIARIO)[number]["chave"]

export const ROTULO_TIPO_BENEFICIARIO: Record<string, string> =
  Object.fromEntries(TIPOS_BENEFICIARIO.map((t) => [t.chave, t.rotulo]))

/** Cadência: pontual (1 ordem) ou recorrente (N ordens no tempo). */
export const CADENCIAS = [
  { chave: "pontual", rotulo: "Pontual (uma parcela)" },
  { chave: "recorrente", rotulo: "Recorrente (várias parcelas)" },
] as const

export type Cadencia = (typeof CADENCIAS)[number]["chave"]

/**
 * Fluxo interno do custeio, ANTES da alçada do Financeiro.
 * rascunho → aguardando_autorizacao → autorizado (gera ordens) | reprovado.
 * cancelado encerra a qualquer momento.
 * "concluido" NÃO é gravada: é o autorizado cujas ordens estão todas pagas
 * ou canceladas (ao menos uma paga) — ver situacaoExibidaCusteio.
 */
export const SITUACOES_CUSTEIO = [
  "rascunho",
  "aguardando_autorizacao",
  "autorizado",
  "concluido",
  "reprovado",
  "cancelado",
] as const

export type SituacaoCusteio = (typeof SITUACOES_CUSTEIO)[number]

export const ROTULOS_SITUACAO_CUSTEIO: Record<SituacaoCusteio, string> = {
  rascunho: "Rascunho",
  aguardando_autorizacao: "Aguardando autorização",
  autorizado: "Autorizado",
  concluido: "Concluído",
  reprovado: "Reprovado",
  cancelado: "Cancelado",
}

/** Cor do badge por situação (tokens do design system). */
export const COR_SITUACAO_CUSTEIO: Record<SituacaoCusteio, string> = {
  rascunho: "neutro",
  aguardando_autorizacao: "atencao",
  autorizado: "sucesso",
  concluido: "info",
  reprovado: "perigo",
  cancelado: "neutro",
}

/** Sugestões de tipo de beneficiário guardadas na finalidade. */
export const TIPOS_BENEFICIARIO_SUGERIDO = [
  ...TIPOS_BENEFICIARIO,
  { chave: "livre", rotulo: "Livre (o usuário escolhe)" },
] as const

/**
 * Situação que a tela mostra: o custeio autorizado vira "concluido" quando
 * todas as ordens estão pagas ou canceladas e ao menos uma foi paga. Nada é
 * gravado — uma ordem nova (ou reaberta) o devolve a "autorizado".
 */
export function situacaoExibidaCusteio(
  situacao: string,
  situacoesDasOrdens: (string | null)[]
): string {
  if (situacao !== "autorizado" || situacoesDasOrdens.length === 0) return situacao
  const encerradas = situacoesDasOrdens.every((s) => s === "Paga" || s === "Cancelada")
  return encerradas && situacoesDasOrdens.includes("Paga") ? "concluido" : situacao
}
