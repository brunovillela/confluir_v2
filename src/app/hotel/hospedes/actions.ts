"use server"

import { revalidatePath } from "next/cache"

import { requireSessaoHotel } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { anotarQuartoHotel, ehGarantida } from "@/lib/db/hospedagem-garantida"

/** A recepção anota em que quarto do hotel ficou cada quarto do convênio. */
export async function anotarQuartoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const { hotel, user } = await requireSessaoHotel()
  if (!ehGarantida(hotel)) return { erro: "Disponível no convênio de demanda garantida." }

  const noite = String(formData.get("noite") ?? "")
  const quarto = Number(formData.get("quarto"))
  const quartoHotel = String(formData.get("quarto_hotel") ?? "")

  const { erro } = await anotarQuartoHotel({
    hotelId: hotel.id,
    noite,
    quarto,
    quartoHotel,
    autorId: user.id,
  })
  if (erro) return { erro }

  revalidatePath("/hotel/hospedes")
  revalidatePath("/painel/hospedagem/mapa")
  return { ok: "Anotado." }
}
