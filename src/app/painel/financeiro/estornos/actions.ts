"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { salvarPrazoEstorno } from "@/lib/db/ordens-estorno"

export async function salvarPrazoEstornoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("financeiro_estorno")
  const dias = Number(String(formData.get("dias") ?? "").trim())
  const { erro } = await salvarPrazoEstorno(dias)
  if (erro) return { erro }
  revalidatePath("/painel/financeiro/estornos")
  redirect("/painel/financeiro/estornos?prazo=1")
}
