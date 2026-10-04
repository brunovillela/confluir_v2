"use server"

import { revalidatePath } from "next/cache"

import { getSessaoPortal } from "@/lib/auth"
import { definirPreferenciasDoFiliado } from "@/lib/db/portal-avisos"
import { EVENTOS_PORTAL, type PreferenciasPortal } from "@/lib/portal-avisos-eventos"

export type EstadoPrefsPortal = { ok?: boolean; erro?: string }

export async function salvarPreferenciasPortalAction(
  _prev: EstadoPrefsPortal,
  formData: FormData
): Promise<EstadoPrefsPortal> {
  // Só o próprio filiado (a visualização pela gestão é somente leitura).
  const sessao = await getSessaoPortal()
  if (!sessao) return { erro: "Sessão expirada — entre de novo." }
  const prefs = {} as PreferenciasPortal
  for (const { chave } of EVENTOS_PORTAL) {
    // switch marcado envia "on"; ausente = desligado.
    prefs[chave] = formData.get(chave) != null
  }
  const { erro } = await definirPreferenciasDoFiliado(sessao.filiado.cpf, prefs)
  if (erro) return { erro }
  revalidatePath("/portal/avisos/preferencias")
  return { ok: true }
}
