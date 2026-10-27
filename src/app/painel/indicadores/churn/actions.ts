"use server"

import { revalidatePath } from "next/cache"

import { requirePermissao } from "@/lib/auth"
import { motivoDesfiliacaoValido } from "@/lib/churn-constantes"
import { type EstadoForm } from "@/lib/contas"
import { definirMotivoDesfiliacao } from "@/lib/db/churn"

/** Grava o motivo da desfiliação de um vínculo (tela de churn). */
export async function definirMotivoDesfiliacaoAction(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  await requirePermissao("filiacao_gestao", ["filiacao_filiados"])
  const id = String(fd.get("vinculo_id") ?? "").trim()
  const motivo = String(fd.get("motivo") ?? "").trim()
  const detalhe = String(fd.get("detalhe") ?? "").trim() || null
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { erro: "Vínculo inválido." }
  if (motivo && !motivoDesfiliacaoValido(motivo)) return { erro: "Motivo inválido.", campo: "motivo" }
  const { erro, filiadoId } = await definirMotivoDesfiliacao(id, motivo || null, detalhe)
  if (erro) return { erro }
  revalidatePath("/painel/indicadores/churn")
  if (filiadoId) revalidatePath(`/painel/filiados/${filiadoId}`)
  return { ok: "Motivo registrado." }
}
