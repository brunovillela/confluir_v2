"use server"

import { revalidatePath } from "next/cache"

import { requireSessaoPainel } from "@/lib/auth"
import { definirPreferenciasDeAviso, type PreferenciasAviso } from "@/lib/db/avisos"
import { EVENTOS_TELEGRAM, type PreferenciasTelegram } from "@/lib/telegram-eventos"

import { avisosPermitidos } from "./perfil-avisos"

export type EstadoPrefsAviso = { ok?: boolean; erro?: string }

export async function salvarPreferenciasAvisoAction(
  _prev: EstadoPrefsAviso,
  formData: FormData
): Promise<EstadoPrefsAviso> {
  const sessao = await requireSessaoPainel()
  // Só liga o que a pessoa pode receber — o resto grava desligado.
  const permitidos = new Set(await avisosPermitidos(sessao))
  const prefs: PreferenciasAviso = {
    email: {} as PreferenciasTelegram,
    telegram: {} as PreferenciasTelegram,
    push: {} as PreferenciasTelegram,
  }
  for (const { chave } of EVENTOS_TELEGRAM) {
    const pode = permitidos.has(chave)
    // checkbox marcado envia "on"; ausente = desligado.
    prefs.email[chave] = pode && formData.get(`email:${chave}`) != null
    prefs.telegram[chave] = pode && formData.get(`telegram:${chave}`) != null
    prefs.push[chave] = pode && formData.get(`push:${chave}`) != null
  }
  const { erro } = await definirPreferenciasDeAviso(sessao.usuario.id as string, prefs)
  if (erro) return { erro }
  revalidatePath("/painel/perfil/avisos")
  return { ok: true }
}
