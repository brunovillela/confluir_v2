/**
 * Constantes e helpers de Oposição à Contribuição Assistencial, compartilhados
 * entre client e server (FORA de `server-only` — badges e forms importam daqui).
 */

// ── Modo de formalização (por campanha) ─────────────────────────────────────
export const MODOS_FORMALIZACAO = [
  { chave: "tela", rotulo: "Só confirmação na tela" },
  { chave: "assinatura", rotulo: "Confirmação + assinatura gov.br + upload" },
  { chave: "hibrido", rotulo: "Híbrido (filiado só confirma; não-filiado assina)" },
] as const

export type ModoFormalizacao = (typeof MODOS_FORMALIZACAO)[number]["chave"]

/** O trabalhador precisa assinar/enviar documento neste modo+perfil? */
export function exigeDocumento(
  modo: ModoFormalizacao,
  ehFiliado: boolean
): boolean {
  if (modo === "assinatura") return true
  if (modo === "hibrido") return !ehFiliado
  return false
}

// ── Situação da campanha ─────────────────────────────────────────────────────
export const SITUACOES_CAMPANHA = [
  { chave: "rascunho", rotulo: "Rascunho" },
  { chave: "aberta", rotulo: "Aberta" },
  { chave: "encerrada", rotulo: "Encerrada" },
] as const

export type SituacaoCampanha = (typeof SITUACOES_CAMPANHA)[number]["chave"]

// ── Situação do opositor (as 5) ──────────────────────────────────────────────
export const SITUACOES_OPOSITOR = [
  { chave: "aguardando_documento", rotulo: "Aguardando documento" },
  { chave: "nao_avaliada", rotulo: "Não avaliada" },
  { chave: "aprovada", rotulo: "Aprovada" },
  { chave: "reprovada", rotulo: "Reprovada" },
  { chave: "desistente", rotulo: "Desistente" },
] as const

export type SituacaoOpositor = (typeof SITUACOES_OPOSITOR)[number]["chave"]

export const ROTULO_SITUACAO_OPOSITOR: Record<SituacaoOpositor, string> =
  Object.fromEntries(
    SITUACOES_OPOSITOR.map((s) => [s.chave, s.rotulo])
  ) as Record<SituacaoOpositor, string>

/**
 * Deriva a situação a partir dos campos legados (avaliacao/desistente) — usada
 * na migração e como fallback de exibição. `aguardando_documento` só existe no
 * fluxo novo, então não é derivável do legado.
 */
export function derivarSituacaoOpositor(o: {
  avaliacao?: boolean | null
  avaliacao_data?: string | null
  desistente?: boolean | null
}): SituacaoOpositor {
  if (o.desistente === true) return "desistente"
  if (o.avaliacao === true) return "aprovada"
  if (o.avaliacao === false && o.avaliacao_data) return "reprovada"
  return "nao_avaliada"
}

// ── Prazo ────────────────────────────────────────────────────────────────────
export type EstadoPrazo = "antes" | "aberto" | "depois" | "sem_prazo"

/**
 * Estado da janela de oposição (datas AAAA-MM-DD, `hoje` no fuso de SP passado
 * pelo servidor). Fora da janela o portal mostra informe e bloqueia o registro.
 */
export function estadoPrazo(
  inicio: string | null,
  fim: string | null,
  hoje: string
): EstadoPrazo {
  if (!inicio || !fim) return "sem_prazo"
  const h = hoje.slice(0, 10)
  if (h < inicio.slice(0, 10)) return "antes"
  if (h > fim.slice(0, 10)) return "depois"
  return "aberto"
}
