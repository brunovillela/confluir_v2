"use server"

import { revalidatePath } from "next/cache"

import { requirePermissao } from "@/lib/auth"
import { cancelarPedido, criarPedido, type CanalPedido, type DonoPedido } from "@/lib/db/pedidos-dados-bancarios"
import { CHAVE_EDICAO_FORNECEDORES } from "@/lib/fornecedores-acesso"

/**
 * "Pedir dados bancários" nas fichas (fornecedor, funcionário, filiado): a
 * mesma permissão que edita a conta naquela ficha pode pedi-la por link. Quem
 * paga ordens também pede (Financeiro › Contas bancárias, ordens esperando conta).
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PERMISSAO: Record<DonoPedido["tipo"], string> = {
  fornecedor: CHAVE_EDICAO_FORNECEDORES,
  usuario: "pessoal_gestao",
  filiado: "filiacao_gestao",
}
const PAGINA: Record<DonoPedido["tipo"], string> = {
  fornecedor: "/painel/compras/fornecedores/",
  usuario: "/painel/pessoal/",
  filiado: "/painel/filiados/",
}

export type EstadoPedido = { erro?: string; link?: string; canal?: CanalPedido }

function donoDoForm(formData: FormData): DonoPedido | null {
  const tipo = String(formData.get("dono_tipo") ?? "")
  const id = String(formData.get("dono_id") ?? "")
  if (!(tipo in PERMISSAO) || !UUID.test(id)) return null
  return { tipo: tipo as DonoPedido["tipo"], id }
}

export async function pedirDadosBancariosAction(_prev: EstadoPedido, formData: FormData): Promise<EstadoPedido> {
  const dono = donoDoForm(formData)
  if (!dono) return { erro: "Favorecido inválido." }
  const sessao = await requirePermissao(PERMISSAO[dono.tipo], ["financeiro_pagamento"])
  const canal = (["link", "email", "whatsapp"] as const).find((c) => c === formData.get("canal")) ?? "link"
  const destino =
    canal === "email"
      ? String(formData.get("email") ?? "").trim()
      : canal === "whatsapp"
        ? String(formData.get("telefone") ?? "").replace(/\D/g, "")
        : ""
  if (canal === "whatsapp" && destino.length < 10) return { erro: "Informe o WhatsApp com DDD." }
  const r = await criarPedido(dono, canal, destino || null, sessao.usuario.id)
  revalidatePath(PAGINA[dono.tipo] + dono.id)
  revalidatePath("/painel/financeiro/contas-bancarias")
  return { ...r, canal }
}

export async function cancelarPedidoDadosBancariosAction(formData: FormData): Promise<void> {
  const dono = donoDoForm(formData)
  const pedidoId = String(formData.get("pedido_id") ?? "")
  if (!dono || !UUID.test(pedidoId)) return
  await requirePermissao(PERMISSAO[dono.tipo], ["financeiro_pagamento"])
  await cancelarPedido(dono, pedidoId)
  revalidatePath(PAGINA[dono.tipo] + dono.id)
  revalidatePath("/painel/financeiro/contas-bancarias")
}
