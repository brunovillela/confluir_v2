"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requireSessaoPainel } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import {
  cancelarMinhaSolicitacaoGozo,
  solicitarGozo,
} from "@/lib/db/ferias"

function revalidar() {
  revalidatePath("/painel/perfil/ferias")
  revalidatePath("/painel/pessoal/ferias")
}

export async function solicitarFeriasAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await requireSessaoPainel()

  const periodoId = String(formData.get("periodo_id") ?? "")
  const inicio = String(formData.get("inicio") ?? "")
  const termino = String(formData.get("termino") ?? "")
  const abono = formData.get("abono") === "on"

  if (!periodoId) return { erro: "Escolha o período aquisitivo." }
  if (!inicio) return { erro: "Informe a data de início das férias." }
  if (!termino) return { erro: "Informe a data de retorno ao trabalho." }

  const { erro } = await solicitarGozo(sessao.usuario.id, {
    periodoId,
    inicio,
    termino,
    abono,
  })
  if (erro) return { erro }

  revalidar()
  redirect("/painel/perfil/ferias?salvo=1")
}

export async function cancelarFeriasAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await requireSessaoPainel()

  const id = String(formData.get("id") ?? "")
  if (!id) return { erro: "Solicitação inválida." }

  const { erro } = await cancelarMinhaSolicitacaoGozo(id, sessao.usuario.id)
  if (erro) return { erro }

  revalidar()
  return { ok: "Solicitação cancelada." }
}
