"use server"

import { revalidatePath } from "next/cache"

import { requirePermissao } from "@/lib/auth"
import type { EstadoForm } from "@/lib/contas"
import { salvarPrazoCotacao } from "@/lib/db/compras-config"

/** Prazo para iniciar a cotação: o comprador ou quem configura o sistema. */
export async function salvarPrazoCotacaoAction(_prev: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const sessao = await requirePermissao("aquisicoes_comprador", ["configuracoes"])
  const bruto = String(formData.get("prazo") ?? "").trim()
  const prazo = bruto === "" ? null : Number(bruto)
  if (prazo !== null && Number.isNaN(prazo)) return { erro: "Informe o prazo em dias úteis." }
  const { erro } = await salvarPrazoCotacao(prazo, sessao.usuario.id)
  if (erro) return { erro }
  revalidatePath("/painel/compras/comprador")
  revalidatePath("/painel/compras/minhas")
  return { ok: "Prazo salvo." }
}
