"use server"

import { revalidatePath } from "next/cache"

import { requireSessaoPainel } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { marcarTodasLidas } from "@/lib/db/notificacoes"

export async function marcarTodasComoLidas(
  _prev: EstadoForm,
  _formData: FormData
): Promise<EstadoForm> {
  const sessao = await requireSessaoPainel()
  await marcarTodasLidas(sessao.usuario.id)
  revalidatePath("/painel/notificacoes")
  revalidatePath("/painel", "layout")
  return { ok: "Todas as notificações foram marcadas como lidas." }
}
