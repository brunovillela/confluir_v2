"use server"

import { revalidatePath } from "next/cache"

import { requirePermissao } from "@/lib/auth"
import { confirmarAlteracao, recusarAlteracao } from "@/lib/db/meus-dados-bancarios"

import type { EstadoAcao } from "../actions"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function revalidar() {
  revalidatePath("/painel/financeiro/contas-bancarias/alteracoes")
  revalidatePath("/painel/financeiro/contas-bancarias")
  revalidatePath("/painel/perfil/dados-bancarios")
  revalidatePath("/painel")
}

/** Financeiro ciente: aplica a alteração pedida pelo funcionário/diretor. */
export async function confirmarAlteracaoAction(_prev: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const sessao = await requirePermissao("financeiro_pagamento")
  const id = String(formData.get("id") ?? "")
  if (!UUID.test(id)) return { erro: "Pedido inválido." }
  const { erro } = await confirmarAlteracao(id, sessao.usuario.id)
  if (erro) return { erro }
  revalidar()
  return { ok: "Confirmado — a conta já vale para os pagamentos." }
}

/** Recusa com motivo: nada muda na conta e a pessoa é avisada. */
export async function recusarAlteracaoAction(_prev: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const sessao = await requirePermissao("financeiro_pagamento")
  const id = String(formData.get("id") ?? "")
  if (!UUID.test(id)) return { erro: "Pedido inválido." }
  const motivo = String(formData.get("motivo") ?? "").trim()
  if (motivo.length < 5) return { erro: "Diga por que o pedido foi recusado." }
  const { erro } = await recusarAlteracao(id, sessao.usuario.id, motivo)
  if (erro) return { erro }
  revalidar()
  return { ok: "Pedido recusado." }
}
