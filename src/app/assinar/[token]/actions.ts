"use server"

import { headers } from "next/headers"
import { revalidatePath } from "next/cache"

import { assinar, recusar, solicitarCodigo } from "@/lib/db/oficios-assinatura"

export type EstadoAssinatura = {
  erro?: string
  /** E-mail mascarado para onde o código foi. */
  codigoEnviadoPara?: string
  concluido?: "assinado" | "recusado"
}

async function contexto() {
  const h = await headers()
  return {
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null,
    userAgent: h.get("user-agent"),
  }
}

export async function solicitarCodigoAction(
  _prev: EstadoAssinatura,
  formData: FormData
): Promise<EstadoAssinatura> {
  const token = String(formData.get("token") ?? "")
  const { erro, email } = await solicitarCodigo(token, await contexto())
  if (erro) return { erro }
  return { codigoEnviadoPara: email }
}

export async function assinarAction(
  prev: EstadoAssinatura,
  formData: FormData
): Promise<EstadoAssinatura> {
  const token = String(formData.get("token") ?? "")
  const { erro } = await assinar(
    token,
    { codigo: String(formData.get("codigo") ?? ""), aceite: formData.get("aceite") === "on" },
    await contexto()
  )
  if (erro) return { ...prev, erro }
  revalidatePath(`/assinar/${token}`)
  return { concluido: "assinado" }
}

export async function recusarAction(
  _prev: EstadoAssinatura,
  formData: FormData
): Promise<EstadoAssinatura> {
  const token = String(formData.get("token") ?? "")
  const { erro } = await recusar(token, String(formData.get("motivo") ?? ""), await contexto())
  if (erro) return { erro }
  revalidatePath(`/assinar/${token}`)
  return { concluido: "recusado" }
}
