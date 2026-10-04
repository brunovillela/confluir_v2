/**
 * Tela de confirmação da auditoria antes de gravar uma ordem de pagamento —
 * tipos compartilhados entre o motor (lib/db/ordens-verificacao.ts) e os
 * formulários (components/confirmacao-auditoria.tsx). Client-safe.
 */

/** O que a tela de confirmação mostra: cada ponto não ok, uma vez. */
export type Apontamento = {
  codigo: string
  titulo: string
  detalhe: string
  /** Regra "bloquear": não se confirma, só se ajusta. */
  bloqueia: boolean
  /** Já confirmado antes (continua na lista para quem registra ver). */
  confirmado: boolean
}

/** Estado das actions que registram ordem com confirmação. */
export type EstadoComApontamentos = {
  erro?: string
  /** `name` do campo que causou o erro (components/ui/erro-no-campo). */
  campo?: string
  ok?: string
  apontamentos?: Apontamento[]
}
