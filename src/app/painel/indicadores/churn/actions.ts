"use server"

import { revalidatePath } from "next/cache"

import { requirePermissao } from "@/lib/auth"
import { motivoDesfiliacaoValido } from "@/lib/churn-constantes"
import { type EstadoForm } from "@/lib/contas"
import { definirMotivoDesfiliacao } from "@/lib/db/churn"

/** Grava o motivo da desfiliação (tela de churn e ficha do filiado). */
export async function definirMotivoDesfiliacaoAction(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  await requirePermissao("filiacao_gestao", ["filiacao_filiados"])
  const id = String(fd.get("filiacao_id") ?? "").trim()
  const motivo = String(fd.get("motivo") ?? "").trim()
  const detalhe = String(fd.get("detalhe") ?? "").trim() || null
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { erro: "Cadastro inválido." }
  if (motivo && !motivoDesfiliacaoValido(motivo)) return { erro: "Motivo inválido.", campo: "motivo" }
  const { erro } = await definirMotivoDesfiliacao(id, motivo || null, detalhe)
  if (erro) return { erro }
  revalidatePath("/painel/indicadores/churn")
  revalidatePath(`/painel/filiados/${id}`)
  return { ok: "Motivo registrado." }
}
