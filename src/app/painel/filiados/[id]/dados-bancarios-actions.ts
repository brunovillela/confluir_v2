"use server"

import { revalidatePath } from "next/cache"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { lerDadosBancariosForm } from "@/lib/dados-bancarios"
import { excluirDadoBancarioFiliado, salvarDadoBancarioFiliado } from "@/lib/db/filiacao-dados-bancarios"

/** Dados bancários na ficha do filiado — só a gestão da filiação edita. */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function salvarDadoBancarioFiliadoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("filiacao_gestao")
  const filiadoId = String(formData.get("filiado_id") ?? "")
  if (!UUID.test(filiadoId)) return { erro: "Filiado inválido." }
  const lido = lerDadosBancariosForm(formData)
  if ("erro" in lido) return { erro: lido.erro }
  const id = String(formData.get("dado_id") ?? "")
  const { erro } = await salvarDadoBancarioFiliado({
    filiadoId,
    id: UUID.test(id) ? id : null,
    dados: lido.dados,
    principal: formData.get("principal") === "on",
  })
  if (erro) return { erro }
  revalidatePath(`/painel/filiados/${filiadoId}`)
  return { ok: "Dados bancários salvos." }
}

export async function excluirDadoBancarioFiliadoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("filiacao_gestao")
  const filiadoId = String(formData.get("filiado_id") ?? "")
  const id = String(formData.get("dado_id") ?? "")
  if (!UUID.test(filiadoId) || !UUID.test(id)) return { erro: "Dado bancário inválido." }
  const { erro } = await excluirDadoBancarioFiliado(filiadoId, id)
  if (erro) return { erro }
  revalidatePath(`/painel/filiados/${filiadoId}`)
  return { ok: "Dado bancário excluído." }
}
