"use server"

import { revalidatePath } from "next/cache"

import { requirePermissao } from "@/lib/auth"
import { conferirContas, corrigirTitular, desfazerConferencia, juntarContas } from "@/lib/db/contas-saude"

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

export async function conferirContasAction(_prev: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const sessao = await requirePermissao("financeiro_pagamento")
  const ids = String(formData.get("contas") ?? "").split(",").filter((id) => UUID.test(id))
  if (ids.length === 0) return { erro: "Contas inválidas." }
  const obs = String(formData.get("obs") ?? "").trim().slice(0, 500)
  if (!obs) return { erro: "Diga por que a conta está certa (ex.: conta do cônjuge)." }
  const r = await conferirContas(ids, obs, sessao.usuario.id)
  if (r.erro) return { erro: r.erro }
  revalidatePath("/painel/financeiro/contas-bancarias")
  return { ok: "Conta marcada como conferida." }
}

export async function desfazerConferenciaAction(_prev: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  await requirePermissao("financeiro_pagamento")
  const conta = String(formData.get("conta") ?? "")
  if (!UUID.test(conta)) return { erro: "Conta inválida." }
  const r = await desfazerConferencia(conta)
  if (r.erro) return { erro: r.erro }
  revalidatePath("/painel/financeiro/contas-bancarias")
  return { ok: "Conferência desfeita." }
}
