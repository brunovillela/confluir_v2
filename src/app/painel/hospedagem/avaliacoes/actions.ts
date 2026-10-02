"use server"

import { revalidatePath } from "next/cache"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { ocultarDoHotel, tratarAvaliacao } from "@/lib/db/hospedagem-avaliacoes"
import { tenantAtual } from "@/lib/tenant"

function revalidar() {
  revalidatePath("/painel/hospedagem/avaliacoes")
  revalidatePath("/painel/hospedagem")
  // A moderação muda o que o hotel vê.
  revalidatePath("/hotel/avaliacoes")
}

/** Nota baixa: registra a providência (com o nome de quem tratou) e marca tratada. */
export async function tratarAction(_prev: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const sessao = await requirePermissao("filiacao_hospedagens_gestao")
  const id = String(formData.get("id") ?? "")
  const providencia = String(formData.get("providencia") ?? "")
  const { erro } = await tratarAvaliacao(await tenantAtual(), id, sessao.usuario.id, providencia)
  if (erro) return { erro }
  revalidar()
  return { ok: "Providência registrada." }
}

/**
 * Moderação: tira do hotel um comentário ofensivo (ou devolve). O sindicato
 * continua vendo o texto; o hotel passa a ver "Comentário moderado".
 */
export async function ocultarAction(_prev: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const sessao = await requirePermissao("filiacao_hospedagens_gestao")
  const id = String(formData.get("id") ?? "")
  const ocultar = formData.get("ocultar") === "1"
  const { erro } = await ocultarDoHotel(await tenantAtual(), id, sessao.usuario.id, ocultar)
  if (erro) return { erro }
  revalidar()
  return { ok: ocultar ? "Comentário oculto do hotel." : "Comentário visível ao hotel." }
}
