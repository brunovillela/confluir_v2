import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { hrefAssembleia } from "@/lib/votacao-navegacao"

/**
 * "Apuração" virou a aba "apuracao" da página da assembleia (reorganização de
 * 17/10/2026). A rota antiga continua valendo: links salvos caem na aba certa.
 */
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ fonte?: string }>
}) {
  await requirePermissao("assembleias")
  const { id } = await params
  const { fonte } = await searchParams
  redirect(hrefAssembleia(id, fonte ?? null, "apuracao"))
}
