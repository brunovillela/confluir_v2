"use server"

import { revalidatePath } from "next/cache"

import { requireSessaoPainel } from "@/lib/auth"
import { definirPreferenciasDeAviso, type PreferenciasAviso } from "@/lib/db/avisos"
import { EVENTOS_TELEGRAM, type PreferenciasTelegram } from "@/lib/telegram-eventos"

export type EstadoPrefsAviso = { ok?: boolean; erro?: string }

export async function salvarPreferenciasAvisoAction(
  _prev: EstadoPrefsAviso,
  formData: FormData
): Promise<EstadoPrefsAviso> {
  const { usuario } = await requireSessaoPainel()
  const prefs: PreferenciasAviso = {
    email: {} as PreferenciasTelegram,
    telegram: {} as PreferenciasTelegram,
  }
  for (const { chave } of EVENTOS_TELEGRAM) {
    // checkbox marcado envia "on"; ausente = desligado.
    prefs.email[chave] = formData.get(`email:${chave}`) != null
    prefs.telegram[chave] = formData.get(`telegram:${chave}`) != null
  }
  const { erro } = await definirPreferenciasDeAviso(usuario.id as string, prefs)
  if (erro) return { erro }
  revalidatePath("/painel/perfil/avisos")
  return { ok: true }
}
