"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { alcadaDoUsuario, avaliarOrdemCompra } from "@/lib/db/compras"

export async function avaliarOrdemAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await requirePermissao("aquisicoes_avaliacoes")

  const ordemId = String(formData.get("ordem_id") ?? "")
  if (!ordemId) return { erro: "Ordem inválida." }
  const aprovar = String(formData.get("decisao") ?? "") === "aprovar"
  const observacao = String(formData.get("observacao") ?? "").trim() || null

  const { erro } = await avaliarOrdemCompra(
    ordemId,
    sessao.usuario.id,
    alcadaDoUsuario(sessao.permissoes),
    aprovar,
    observacao
  )
  if (erro) return { erro }

  revalidatePath("/painel/compras/avaliacoes")
  revalidatePath("/painel/compras")
  redirect("/painel/compras/avaliacoes?salvo=1")
}
