"use server"

import { headers } from "next/headers"
import { revalidatePath } from "next/cache"

import { assinarMinuta, recusarMinuta, solicitarCodigoMinuta } from "@/lib/db/minuta-assinatura"

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

export async function pedirCodigoMinutaAction(_prev: Estado, fd: FormData): Promise<Estado> {
  const { erro, destino } = await solicitarCodigoMinuta(txt(fd, "token"), await contexto())
  if (erro) return { erro }
  return { ok: `Código enviado para ${destino}.` }
}

export async function assinarMinutaAction(_prev: Estado, fd: FormData): Promise<Estado> {
  const token = txt(fd, "token")
  const { erro } = await assinarMinuta(
    token,
    {
      codigo: txt(fd, "codigo"),
      nome: txt(fd, "nome"),
      cpf: txt(fd, "cpf"),
      aceiteConteudo: fd.get("aceite_conteudo") === "on",
      aceiteEletronico: fd.get("aceite_eletronico") === "on",
    },
    await contexto()
  )
  if (erro) return { erro }
  revalidatePath(`/assinar/${token}`)
  return {}
}

export async function recusarMinutaAction(_prev: Estado, fd: FormData): Promise<Estado> {
  const token = txt(fd, "token")
  const { erro } = await recusarMinuta(token, txt(fd, "motivo"), await contexto())
  if (erro) return { erro }
  revalidatePath(`/assinar/${token}`)
  return {}
}
