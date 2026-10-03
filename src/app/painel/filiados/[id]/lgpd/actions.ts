"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import type { EstadoForm } from "@/lib/contas"
import { anonimizarFiliacao } from "@/lib/db/lgpd"

export async function anonimizarFiliacaoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await requirePermissao("filiacao_lgpd", ["configuracoes"])
  const filiacaoId = String(formData.get("filiacao_id") ?? "").trim()
  const motivo = String(formData.get("motivo") ?? "").trim()
  if (!filiacaoId) return { erro: "Filiação inválida." }
  if (motivo.length < 10) return { erro: "Descreva o motivo e a referência do pedido (pelo menos 10 caracteres)." }
  if (String(formData.get("confirmacao") ?? "").trim() !== "ANONIMIZAR") {
    return { erro: "Digite ANONIMIZAR para confirmar." }
  }
  const r = await anonimizarFiliacao({ filiacaoId, executadoPor: sessao.usuario.id, motivo })
  if (r.erro) return { erro: r.erro }
  revalidatePath(`/painel/filiados/${filiacaoId}`)
  revalidatePath("/painel/filiados/lista")
  redirect(`/painel/filiados/${filiacaoId}/lgpd`)
}
