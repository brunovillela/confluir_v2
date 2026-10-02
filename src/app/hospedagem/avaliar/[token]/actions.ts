"use server"

import { registrarAvaliacao } from "@/lib/db/hospedagem-avaliacoes"

/** Envio da avaliação pelo link sem senha (o token identifica a estadia). */
export async function enviarAvaliacaoAction(
  _prev: { erro?: string; ok?: boolean },
  fd: FormData
): Promise<{ erro?: string; ok?: boolean }> {
  const token = String(fd.get("token") ?? "")
  const nota = Number(fd.get("nota") ?? 0)
  const etiquetas = fd.getAll("etiquetas").map(String)
  const comentario = String(fd.get("comentario") ?? "")
  const { erro } = await registrarAvaliacao(token, { nota, etiquetas, comentario })
  return erro ? { erro } : { ok: true }
}
