"use server"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import { getSessaoPainel } from "@/lib/auth"
import { buscarHotel } from "@/lib/db/hospedagem"
import { podeAcessar } from "@/lib/permissoes"
import {
  alvoDaVisualizacaoHotel,
  COOKIE_VISUALIZACAO_HOTEL,
  gerarTokenVisualizacaoHotel,
  MAX_IDADE_VISUALIZACAO_HOTEL,
} from "@/lib/visualizacao-hotel"

/**
 * Abre a área de um hotel parceiro em modo somente leitura. Gate:
 * filiacao_hospedagens. Grava o cookie assinado e leva ao início do hotel.
 */
export async function iniciarVisualizacaoHotel(formData: FormData): Promise<void> {
  const painel = await getSessaoPainel()
  if (
    !painel ||
    !podeAcessar(painel.permissoes, "filiacao_hospedagens", [
      "filiacao_hospedagens_gestao",
      "filiacao_hospedagens_edicao",
    ])
  ) {
    redirect("/painel/sem-acesso")
  }

  const hotelId = String(formData.get("hotelId") ?? "")
  if (!hotelId) redirect("/painel/hospedagem/hoteis")

  // buscarHotel já limita ao tenant atual.
  const hotel = await buscarHotel(hotelId)
  if (!hotel) redirect("/painel/hospedagem/hoteis")

  const jar = await cookies()
  jar.set(COOKIE_VISUALIZACAO_HOTEL, gerarTokenVisualizacaoHotel(hotelId, painel.usuario.id), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_IDADE_VISUALIZACAO_HOTEL,
  })

  redirect("/hotel/inicio")
}

/** Encerra a visualização e volta ao cadastro do hotel. */
export async function encerrarVisualizacaoHotel(): Promise<void> {
  const alvo = await alvoDaVisualizacaoHotel()
  const jar = await cookies()
  jar.delete(COOKIE_VISUALIZACAO_HOTEL)
  redirect(alvo ? `/painel/hospedagem/hoteis/${alvo}` : "/painel/hospedagem/hoteis")
}
