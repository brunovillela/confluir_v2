"use server"

import { presencaPeloCodigoDaSala } from "@/lib/db/congressos-dia"
import { tenantAtual } from "@/lib/tenant"

/** Presença pelo código da sala, feita pela própria pessoa no link pessoal. */
export async function presencaNaSalaAction(d: { token: string; texto: string }): Promise<{ erro?: string; ok?: string }> {
  const tenantId = await tenantAtual()
  const r = await presencaPeloCodigoDaSala(tenantId, d.token, d.texto)
  if (r.erro) return { erro: r.erro }
  return { ok: r.jaEstava ? `Sua presença em "${r.sessao}" já estava registrada.` : `Presença registrada em "${r.sessao}".` }
}
