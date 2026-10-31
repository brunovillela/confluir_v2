"use server"

import { revalidatePath } from "next/cache"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { fecharMes, reabrirMes } from "@/lib/db/meses-fechados"
import { salvarEmailContabilidade } from "@/lib/db/rpa-contabilidade"

function texto(formData: FormData, campo: string): string {
  return String(formData.get(campo) ?? "").trim()
}

/** Fecha o mês para a contabilidade: trava a reclassificação das ordens pagas nele. */
export async function fecharMesAction(_prev: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const sessao = await requirePermissao("financeiro_pagamento")
  const mes = texto(formData, "mes")
  const { erro } = await fecharMes(mes, sessao.usuario.id, texto(formData, "observacao") || null)
  if (erro) return { erro }
  revalidatePath("/painel/financeiro/contabil")
  return { ok: `${mes.slice(5, 7)}/${mes.slice(0, 4)} fechado.` }
}

export async function reabrirMesAction(_prev: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const sessao = await requirePermissao("financeiro_pagamento")
  const { erro } = await reabrirMes(texto(formData, "id"), sessao.usuario.id, texto(formData, "motivo"))
  if (erro) return { erro }
  revalidatePath("/painel/financeiro/contabil")
  return { ok: "Mês reaberto." }
}

/** E-mail da contabilidade: recebe o relatório de RPAs no dia seguinte ao fechamento do mês. */
export async function salvarEmailContabilidadeAction(_prev: EstadoForm, formData: FormData): Promise<EstadoForm> {
  await requirePermissao("financeiro_pagamento")
  const { erro } = await salvarEmailContabilidade(texto(formData, "email") || null)
  if (erro) return { erro }
  revalidatePath("/painel/financeiro/contabil")
  return { ok: "E-mail da contabilidade salvo." }
}
