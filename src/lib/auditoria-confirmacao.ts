/**
 * Tela de confirmação da auditoria antes de gravar uma ordem de pagamento —
 * tipos compartilhados entre o motor (lib/db/ordens-verificacao.ts) e os
 * formulários (components/confirmacao-auditoria.tsx). Client-safe.
 */

/** Outra ordem citada pelo alerta (ex.: a possível duplicada), para conferir lado a lado. */
export type OrdemRelacionada = {
  id: string
  codigo: string | null
  descricao: string | null
  vencimento: string | null
  situacao: string | null
  valor: number | null
}

/** Mínimo de caracteres da justificativa de um alerta confirmado. */
export const JUSTIFICATIVA_MINIMA = 10

/** O que a tela de confirmação mostra: cada ponto não ok, uma vez. */
export type Apontamento = {
  codigo: string
  titulo: string
  detalhe: string
  /** Regra "bloquear": não se confirma, só se ajusta. */
  bloqueia: boolean
  /** Já confirmado antes (continua na lista para quem registra ver). */
  confirmado: boolean
  /** Confirmar pede justificativa (regra com "Exigir justificativa" ligado). */
  pedeJustificativa?: boolean
  /** A justificativa já enviada, se houver. */
  justificativa?: string
  /** Ordens que o alerta cita (duplicidade): para abrir e comparar. */
  relacionadas?: OrdemRelacionada[]
}

/** Estado das actions que registram ordem com confirmação. */
export type EstadoComApontamentos = {
  erro?: string
  /** `name` do campo que causou o erro (components/ui/erro-no-campo). */
  campo?: string
  ok?: string
  apontamentos?: Apontamento[]
}
