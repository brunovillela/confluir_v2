import type { User } from "@supabase/supabase-js"

/**
 * VERIFICAÇÃO EM DUAS ETAPAS (onda 1, S7) — regras puras, usadas no proxy,
 * nas páginas e nas actions. O fator é o TOTP do Supabase Auth (aplicativo
 * autenticador); não há SMS.
 *
 * Duas regras:
 *  1. Quem TEM um fator verificado só entra no painel e no /admin com a
 *     sessão elevada (aal2): o proxy manda para /login/verificacao.
 *  2. Com MFA_OBRIGATORIO=1, quem tem permissão sensível (pagamento, alçada,
 *     usuários e permissões, configurações, super-admin) e ainda não tem
 *     fator só consegue abrir /conta/seguranca até cadastrar um. Fica
 *     desligado por padrão para a equipe cadastrar com calma.
 */

export const ROTA_VERIFICACAO = "/login/verificacao"
export const ROTA_SEGURANCA = "/conta/seguranca"

export function mfaObrigatorio(): boolean {
  return process.env.MFA_OBRIGATORIO === "1"
}

/** A conta tem um aplicativo autenticador cadastrado e confirmado. */
export function fatorVerificado(user: Pick<User, "factors"> | null | undefined): boolean {
  return Boolean(
    user?.factors?.some((f) => f.factor_type === "totp" && f.status === "verified")
  )
}

/** As permissões efetivas pedem segundo fator (quando MFA_OBRIGATORIO=1). */
export function permissoesExigem2FA(p: Record<string, unknown> | null | undefined): boolean {
  if (!mfaObrigatorio() || !p) return false
  const alcada = Number(p.alcada_aprovacao ?? 0)
  return (
    p.concede_tudo === true ||
    p.financeiro_pagamento === true ||
    p.permissoes === true ||
    p.configuracoes === true ||
    (Number.isFinite(alcada) && alcada > 0)
  )
}

/** Só caminhos internos (uma barra, sem `//`), senão o padrão. */
export function destinoSeguro(next: string | null | undefined, padrao: string): string {
  return next && /^\/(?![/\\])/.test(next) ? next : padrao
}
