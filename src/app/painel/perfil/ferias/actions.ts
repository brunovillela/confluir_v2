"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requireSessaoPainel } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import {
  cancelarGozo,
  solicitarGozo,
} from "@/lib/db/ferias"
import { lerDias } from "@/lib/periodo-dias"

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
  const dias = lerDias(formData.get("dias"))
  const abono = formData.get("abono") === "on"

  if (!periodoId) return { erro: "Escolha o período aquisitivo.", campo: "periodo_id" }
  if (!inicio) return { erro: "Informe a data de início das férias.", campo: "inicio" }
  if (dias === null) return { erro: "Informe a quantidade de dias (número inteiro).", campo: "dias" }

  const { erro } = await solicitarGozo(sessao.usuario.id, {
    periodoId,
    inicio,
    dias,
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

  // Pelo perfil vale a regra do funcionário: só até o início das férias.
  const { erro, dias } = await cancelarGozo(id, { usuarioId: sessao.usuario.id, gestao: false })
  if (erro) return { erro }

  revalidar()
  return { ok: dias ? `Cancelado. Os ${dias} dias voltaram ao período.` : "Cancelado." }
}
