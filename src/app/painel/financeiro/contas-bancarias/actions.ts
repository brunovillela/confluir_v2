"use server"

import { revalidatePath } from "next/cache"

import { requirePermissao } from "@/lib/auth"
import { corrigirTitular, juntarContas } from "@/lib/db/contas-saude"

/** Ações da tela Saúde das contas bancárias — só quem paga ordens mexe. */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type EstadoAcao = { erro?: string; ok?: string }

export async function juntarContasAction(_prev: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  await requirePermissao("financeiro_pagamento")
  const fica = String(formData.get("fica") ?? "")
  const copias = String(formData.get("copias") ?? "").split(",").filter((id) => UUID.test(id))
  if (!UUID.test(fica) || copias.length === 0) return { erro: "Contas inválidas." }
  const r = await juntarContas(fica, copias)
  if (r.erro) return { erro: r.erro }
  revalidatePath("/painel/financeiro/contas-bancarias")
  return { ok: `Juntadas: ${copias.length} cópia(s) removida(s)${r.ordens ? `, ${r.ordens} ordem(ns) repassada(s)` : ""}.` }
}

export async function corrigirTitularAction(_prev: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  await requirePermissao("financeiro_pagamento")
  const conta = String(formData.get("conta") ?? "")
  if (!UUID.test(conta)) return { erro: "Conta inválida." }
  const r = await corrigirTitular(conta, String(formData.get("documento") ?? ""))
  if (r.erro) return { erro: r.erro }
  revalidatePath("/painel/financeiro/contas-bancarias")
  return { ok: "Documento do titular gravado." }
}
