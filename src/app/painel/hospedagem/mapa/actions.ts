"use server"

import { revalidatePath } from "next/cache"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import {
  cancelarReservaGarantida,
  remanejarReserva,
} from "@/lib/db/hospedagem-garantida"

function revalidar() {
  revalidatePath("/painel/hospedagem/mapa")
  revalidatePath("/painel/hospedagem")
  revalidatePath("/hotel/hospedes")
  revalidatePath("/portal/hospedagem")
}

/** Remanejamento pela equipe: a estadia inteira muda de quarto. */
export async function remanejarAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("filiacao_hospedagens_gestao")
  const cupomId = String(formData.get("cupom_id") ?? "")
  const quarto = Number(formData.get("quarto"))
  const { erro } = await remanejarReserva(cupomId, quarto)
  if (erro) return { erro }
  revalidar()
  return { ok: `Movido para o quarto ${quarto}.` }
}

/** Cancelamento pela equipe: sem prazo, mas nunca depois da entrada. */
export async function cancelarReservaEquipeAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("filiacao_hospedagens_gestao")
  const cupomId = String(formData.get("cupom_id") ?? "")
  const { erro } = await cancelarReservaGarantida(cupomId, { porEquipe: true })
  if (erro) return { erro }
  revalidar()
  return { ok: "Reserva cancelada." }
}
