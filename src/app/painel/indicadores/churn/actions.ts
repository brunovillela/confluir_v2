"use server"

import { revalidatePath } from "next/cache"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { definirMotivoEmLote } from "@/lib/db/filiacao-motivos"

/** O mesmo motivo em vários vínculos encerrados (lista do churn e Cadastros pendentes). */
export async function definirMotivoEmLoteAction(vinculoIds: string[], motivo: string): Promise<EstadoForm> {
  const sessao = await requirePermissao("filiacao_gestao", ["filiacao_filiados"])
  const ids = (Array.isArray(vinculoIds) ? vinculoIds : []).filter((id) => /^[0-9a-f-]{36}$/i.test(String(id)))
  const { atualizados, erro } = await definirMotivoEmLote(ids, motivo, sessao.usuario.id)
  revalidatePath("/painel")
  revalidatePath("/painel/filiados/cadastros-pendentes")
  if (erro) return { erro }
  return { ok: `Motivo registrado em ${atualizados} vínculo(s).` }
}
