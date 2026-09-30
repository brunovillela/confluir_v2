"use server"

import { revalidatePath } from "next/cache"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { salvarConfigFinanceiro } from "@/lib/db/ordens-ciclo"
import { createAdminClient } from "@/lib/supabase/admin"

export async function salvarCentroCaixaAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("financeiro_caixa_admin", ["financeiro_pagamento"])
  const id = String(formData.get("centro_custo_caixa_id") ?? "").trim() || null
  if (id) {
    const admin = await createAdminClient()
    const { data } = await admin.from("centros_de_custo").select("id").eq("id", id).maybeSingle()
    if (!data) return { erro: "Centro de custo inválido." }
  }
  const { erro } = await salvarConfigFinanceiro(id)
  if (erro) return { erro }
  revalidatePath("/painel/financeiro/caixas")
  return { ok: "Centro de custo do caixa salvo." }
}
