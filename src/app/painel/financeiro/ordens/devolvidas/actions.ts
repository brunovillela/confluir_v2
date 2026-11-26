"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { cancelarOrdem } from "@/lib/db/ordens-ciclo"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Cancela, pela triagem das devolvidas paradas, uma ordem que não vai mais
 * ser paga (26/11/2026). Só a que ainda está devolvida: se quem lançou
 * corrigiu nesse meio-tempo, não cancela. O motivo vai para a trilha.
 */
export async function cancelarDevolvidaAction(_prev: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const sessao = await requirePermissao("financeiro_pagamento")
  const id = String(formData.get("id") ?? "").trim()
  const motivo = String(formData.get("motivo") ?? "").replace(/\s+/g, " ").trim()
  if (!id) return { erro: "Ordem inválida." }
  if (motivo.length < 10) return { erro: "Diga por que a ordem não será paga (pelo menos 10 caracteres)." }
  const { data: o } = await (await createAdminClient())
    .from("ordens_pagamento")
    .select("situacao, codigo")
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (!o) return { erro: "Ordem não encontrada." }
  if (o.situacao !== "Aguardando informações") {
    return { erro: `A ordem não está mais devolvida (agora: ${o.situacao}) — atualize a página.` }
  }
  const { erro } = await cancelarOrdem(id, sessao.usuario.id, `Devolvida e não corrigida — ${motivo}`.slice(0, 500))
  if (erro) return { erro }
  revalidatePath("/painel/financeiro/ordens/devolvidas")
  revalidatePath("/painel/financeiro")
  revalidatePath(`/painel/financeiro/ordens/${id}`)
  // A linha sai da lista ao recarregar: o aviso fica no topo da página.
  redirect(`/painel/financeiro/ordens/devolvidas?cancelada=${encodeURIComponent(String(o.codigo ?? "a ordem"))}`)
}
