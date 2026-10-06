"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { atualizarAnalitica } from "@/lib/db/analitica"

/** "Atualizar agora": recalcula os fatos mensais (só quem configura a organização). */
export async function atualizarAnaliticaAction(): Promise<void> {
  await requirePermissao("configuracoes")
  const r = await atualizarAnalitica()
  revalidatePath("/painel")
  redirect(`/painel?aba=indicadores&${r.ok ? "atualizado=1" : `erro=${encodeURIComponent(r.erro ?? "falha")}`}`)
}
