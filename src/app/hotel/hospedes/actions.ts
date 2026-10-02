"use server"

import { sessaoHotelParaEditar } from "@/lib/hotel-acesso"
import { revalidatePath } from "next/cache"

import { type EstadoForm } from "@/lib/contas"
import { anotarQuartoHotel, ehGarantida } from "@/lib/db/hospedagem-garantida"

/** A recepção anota em que quarto do hotel ficou cada quarto do convênio. */
export async function anotarQuartoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await sessaoHotelParaEditar("hospedes")
  if ("erro" in sessao) return { erro: sessao.erro }
  const { hotel, user } = sessao
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
