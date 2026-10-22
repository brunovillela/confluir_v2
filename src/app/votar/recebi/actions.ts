"use server"

import { redirect } from "next/navigation"

/** POST do "Recebi" (teste de entrega): só o formulário confirma — ver page.tsx. */
export async function confirmarRecebidoAction(formData: FormData): Promise<void> {
  const t = String(formData.get("t") ?? "")
  const { confirmarRecebido } = await import("@/lib/db/votacao-teste-entrega")
  const r = await confirmarRecebido(t)
  if (r.erro) redirect(`/votar/recebi?t=${encodeURIComponent(t)}&erro=${encodeURIComponent(r.erro)}`)
  redirect("/votar/recebi?feito=1")
}
