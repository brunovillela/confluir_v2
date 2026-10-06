"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { listarCentrosDeDebito } from "@/lib/db/financeiro"
import { obterConfigFinanceiro, salvarConfigFinanceiro } from "@/lib/db/ordens-ciclo"

export async function salvarCentroCaixaAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("financeiro_caixa_admin", ["financeiro_pagamento"])
  const id = String(formData.get("centro_custo_caixa_id") ?? "").trim() || null
  if (id) {
    const { centroCustoCaixaId } = await obterConfigFinanceiro()
    const debitos = await listarCentrosDeDebito(centroCustoCaixaId)
    if (!debitos.some((c) => c.id === id)) {
      return { erro: "Escolha uma conta de pagamento (caixa, banco) para o débito do caixa." }
    }
  }
  const { erro } = await salvarConfigFinanceiro(id)
  if (erro) return { erro }
  revalidatePath("/painel/financeiro/caixas")
  redirect("/painel/financeiro/caixas?config=1")
}
