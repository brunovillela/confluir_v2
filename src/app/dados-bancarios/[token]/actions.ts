"use server"

import { lerDadosBancariosForm } from "@/lib/dados-bancarios"
import { responderPedido } from "@/lib/db/pedidos-dados-bancarios"

export type EstadoResposta = { erro?: string; ok?: boolean }

/** O favorecido envia a chave Pix ou a conta (página pública, sem login). */
export async function responderPedidoAction(_prev: EstadoResposta, formData: FormData): Promise<EstadoResposta> {
  const token = String(formData.get("token") ?? "")
  const lido = lerDadosBancariosForm(formData)
  if ("erro" in lido) return { erro: lido.erro }
  const r = await responderPedido(token, lido.dados)
  return r.erro ? { erro: r.erro } : { ok: true }
}
