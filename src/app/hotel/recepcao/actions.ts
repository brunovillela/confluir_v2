"use server"

import { sessaoHotelParaEditar } from "@/lib/hotel-acesso"
import { revalidatePath } from "next/cache"

import {
  buscarReservasNaPorta,
  ehGarantida,
  registrarPresencaNaPorta,
  type ReservaNaPorta,
} from "@/lib/db/hospedagem-garantida"

/**
 * Recepção do hotel (demanda garantida). A sessão define o hotel: a busca e o
 * registro de entrada só alcançam reservas DESTE hotel.
 */

const SO_GARANTIDA =
  "A recepção por QR Code é do convênio de demanda garantida."

export async function buscarReservasAction(
  termo: string
): Promise<{ erro?: string; reservas?: ReservaNaPorta[] }> {
  const sessao = await sessaoHotelParaEditar("recepcao")
  if ("erro" in sessao) return { erro: sessao.erro }
  const { hotel } = sessao
  if (!ehGarantida(hotel)) return { erro: SO_GARANTIDA }
  try {
    return { reservas: await buscarReservasNaPorta(hotel.id, termo) }
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "Falha na busca." }
  }
}

export async function registrarEntradaAction(input: {
  cupomId: string
  metodo: "qr" | "busca"
}): Promise<{ erro?: string; nome?: string | null; jaEstava?: boolean }> {
  const sessao = await sessaoHotelParaEditar("recepcao")
  if ("erro" in sessao) return { erro: sessao.erro }
  const { hotel, user } = sessao
  if (!ehGarantida(hotel)) return { erro: SO_GARANTIDA }
  const resultado = await registrarPresencaNaPorta({
    cupomId: input.cupomId,
    hotelId: hotel.id,
    autorId: user.id,
    metodo: input.metodo === "qr" ? "qr" : "busca",
  })
  if (!resultado.erro) {
    revalidatePath("/hotel/hospedes")
    revalidatePath("/painel/hospedagem/mapa")
  }
  return resultado
}
