import "server-only"

import type { SessaoPainel } from "@/lib/auth"
import { podeAcessar } from "@/lib/permissoes"

/** Financeiro vê e corrige qualquer estorno do tenant. */
export function ehFinanceiro(sessao: SessaoPainel): boolean {
  return podeAcessar(sessao.permissoes, "financeiro_pagamento", ["financeiro_estorno"])
}

/** Quem lançou a ordem (responsável pelo estorno) ou o Financeiro. */
export function podeVerEstorno(sessao: SessaoPainel, responsavelId: string | null): boolean {
  return (
    responsavelId === sessao.usuario.id ||
    ehFinanceiro(sessao) ||
    podeAcessar(sessao.permissoes, "financeiro_leitura")
  )
}

export function podeCorrigirEstorno(sessao: SessaoPainel, responsavelId: string | null): boolean {
  return responsavelId === sessao.usuario.id || ehFinanceiro(sessao)
}
