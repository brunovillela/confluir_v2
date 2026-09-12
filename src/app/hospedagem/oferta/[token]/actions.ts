"use server"

import { revalidatePath } from "next/cache"

import { type EstadoForm } from "@/lib/contas"
import { confirmarOferta } from "@/lib/db/hospedagem-garantida"

/**
 * Confirmação de vaga da lista de espera pelo link do e-mail. Sem login: o
 * token (aleatório, um por pedido) é a credencial, como nos links de evento.
 */
export async function confirmarOfertaPublicaAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const token = String(formData.get("token") ?? "")
  const { erro } = await confirmarOferta(token)
  if (erro) return { erro }
  revalidatePath("/portal/hospedagem")
  revalidatePath("/painel/hospedagem/mapa")
  revalidatePath("/hotel/hospedes")
  return {
    ok: "Reserva confirmada! Enviamos os detalhes para o seu e-mail. O QR Code para a recepção fica no portal, em Hospedagem.",
  }
}
