"use server"

import { headers } from "next/headers"
import { revalidatePath } from "next/cache"

import {
  assinarCessao,
  avisoTermoCompleto,
  envelopeCessaoPorToken,
  recusarCessao,
  solicitarCodigoCessao,
} from "@/lib/db/cessao-assinatura"
import { mascararEmailAssinatura } from "@/lib/db/assinatura-comum"

type Estado = { erro?: string; ok?: string }

const txt = (fd: FormData, nome: string) => String(fd.get(nome) ?? "").trim()

/** IP e navegador vão para a trilha da assinatura. */
async function contexto(): Promise<{ ip: string | null; userAgent: string | null }> {
  const h = await headers()
  return {
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null,
    userAgent: h.get("user-agent"),
  }
}

export async function pedirCodigoCessaoAction(
  _prev: Estado,
  fd: FormData
): Promise<Estado> {
  const { erro, destino } = await solicitarCodigoCessao(txt(fd, "token"))
  if (erro) return { erro }
  return { ok: `Código enviado para ${mascararEmailAssinatura(destino ?? null)}.` }
}

export async function assinarCessaoAction(
  _prev: Estado,
  fd: FormData
): Promise<Estado> {
  const token = txt(fd, "token")
  const { erro, concluido } = await assinarCessao(
    token,
    { codigo: txt(fd, "codigo"), aceite: fd.get("aceite") === "on" },
    await contexto()
  )
  if (erro) return { erro }
  if (concluido) {
    const envelope = await envelopeCessaoPorToken(token)
    if (envelope) await avisoTermoCompleto(envelope.solicitacaoId)
  }
  revalidatePath(`/assinar/${token}`)
  return {}
}

export async function recusarCessaoAction(
  _prev: Estado,
  fd: FormData
): Promise<Estado> {
  const token = txt(fd, "token")
  const { erro } = await recusarCessao(token, txt(fd, "motivo"), await contexto())
  if (erro) return { erro }
  revalidatePath(`/assinar/${token}`)
  return {}
}
