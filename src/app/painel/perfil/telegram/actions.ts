"use server"

import { revalidatePath } from "next/cache"

import { requireSessaoPainel } from "@/lib/auth"
import {
  confirmarCodigoTelefone,
  definirPreferenciasTelegram,
  desvincularTelegram,
  gerarCodigoTelegram,
  solicitarCodigoTelefone,
} from "@/lib/db/telegram"
import { linkVinculo } from "@/lib/telegram"
import { EVENTOS_TELEGRAM, type PreferenciasTelegram } from "@/lib/telegram-eventos"

export type EstadoTelegram = {
  erro?: string
  codigo?: string
  link?: string | null
  desvinculado?: boolean
}

export async function gerarCodigoTelegramAction(): Promise<EstadoTelegram> {
  const { usuario } = await requireSessaoPainel()
  const { codigo, erro } = await gerarCodigoTelegram(usuario.id as string)
  if (erro || !codigo) return { erro: erro ?? "Não foi possível gerar o código." }
  return { codigo, link: linkVinculo(codigo) }
}

export async function desvincularTelegramAction(): Promise<EstadoTelegram> {
  const { usuario } = await requireSessaoPainel()
  const { erro } = await desvincularTelegram(usuario.id as string)
  if (erro) return { erro }
  revalidatePath("/painel/perfil/telegram")
  return { desvinculado: true }
}

export type EstadoTelefone = {
  enviado?: boolean
  confirmado?: boolean
  erro?: string
}

export async function solicitarCodigoTelefoneAction(
  _prev: EstadoTelefone,
  formData: FormData
): Promise<EstadoTelefone> {
  const { usuario } = await requireSessaoPainel()
  const telefone = String(formData.get("telefone") ?? "")
  const { erro } = await solicitarCodigoTelefone(usuario.id as string, telefone)
  if (erro) return { erro }
  revalidatePath("/painel/perfil/telegram")
  return { enviado: true }
}

export async function confirmarCodigoTelefoneAction(
  _prev: EstadoTelefone,
  formData: FormData
): Promise<EstadoTelefone> {
  const { usuario } = await requireSessaoPainel()
  const codigo = String(formData.get("codigo") ?? "")
  const { erro } = await confirmarCodigoTelefone(usuario.id as string, codigo)
  if (erro) return { erro }
  revalidatePath("/painel/perfil/telegram")
  return { confirmado: true }
}

export type EstadoPrefsTelegram = { ok?: boolean; erro?: string }

export async function salvarPreferenciasTelegramAction(
  _prev: EstadoPrefsTelegram,
  formData: FormData
): Promise<EstadoPrefsTelegram> {
  const { usuario } = await requireSessaoPainel()
  const prefs = {} as PreferenciasTelegram
  for (const { chave } of EVENTOS_TELEGRAM) {
    // checkbox marcado envia "on"; ausente = desligado.
    prefs[chave] = formData.get(chave) != null
  }
  const { erro } = await definirPreferenciasTelegram(usuario.id as string, prefs)
  if (erro) return { erro }
  revalidatePath("/painel/perfil/telegram")
  return { ok: true }
}
