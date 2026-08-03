"use server"

import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { type EstadoForm } from "@/lib/contas"
import { subirFichaAssinada } from "@/lib/db/filiacao-publica"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function subirFichaAssinadaAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const token = String(formData.get("token") ?? "")
  if (!UUID.test(token)) return { erro: "Solicitação inválida." }

  const arquivo = formData.get("arquivo")
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { erro: "Selecione o PDF assinado." }
  }

  const h = await headers()
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null
  const ua = h.get("user-agent")

  const res = await subirFichaAssinada(token, arquivo, ip, ua)
  if (res.erro) return { erro: res.erro }

  redirect(`/ficha/${token}?enviado=1`)
}
