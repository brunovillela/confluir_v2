"use server"

import { revalidatePath } from "next/cache"

import { requireSessaoPainel } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { lerDadosBancariosForm } from "@/lib/dados-bancarios"
import { cancelarAlteracao, pedirAlteracao, type AcaoAlteracao } from "@/lib/db/meus-dados-bancarios"

import { contaPropriaPermitida } from "./elegivel"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function revalidar() {
  revalidatePath("/painel/perfil/dados-bancarios")
  revalidatePath("/painel/financeiro/contas-bancarias/alteracoes")
}

/** Inclusão ou alteração da própria conta — fica aguardando o Financeiro. */
export async function pedirContaAction(_prev: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const { usuario } = await requireSessaoPainel()
  if (!(await contaPropriaPermitida(usuario.id)).pode) {
    return { erro: "Dados bancários pelo perfil são de funcionários e diretores." }
  }
  const contaId = String(formData.get("conta_id") ?? "") || null
  if (contaId && !UUID.test(contaId)) return { erro: "Conta inválida." }
  const lido = lerDadosBancariosForm(formData)
  if ("erro" in lido) return { erro: lido.erro }
  const acao: AcaoAlteracao = contaId ? "alterar" : "incluir"
  const { erro } = await pedirAlteracao({
    usuarioId: usuario.id,
    acao,
    contaId,
    dados: lido.dados,
    principal: formData.get("principal") === "on",
  })
  if (erro) return { erro }
  revalidar()
  return { ok: "Pedido enviado ao Financeiro. A conta passa a valer quando ele confirmar." }
}

/** Exclusão da própria conta — fica aguardando o Financeiro. */
export async function pedirExclusaoAction(_prev: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const { usuario } = await requireSessaoPainel()
  if (!(await contaPropriaPermitida(usuario.id)).pode) {
    return { erro: "Dados bancários pelo perfil são de funcionários e diretores." }
  }
  const contaId = String(formData.get("conta_id") ?? "")
  if (!UUID.test(contaId)) return { erro: "Conta inválida." }
  const { erro } = await pedirAlteracao({ usuarioId: usuario.id, acao: "excluir", contaId, dados: null, principal: false })
  if (erro) return { erro }
  revalidar()
  return { ok: "Pedido de exclusão enviado ao Financeiro." }
}

/** Desiste de um pedido que ainda aguarda o Financeiro. */
export async function cancelarPedidoAction(_prev: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const { usuario } = await requireSessaoPainel()
  const id = String(formData.get("id") ?? "")
  if (!UUID.test(id)) return { erro: "Pedido inválido." }
  const { erro } = await cancelarAlteracao(id, usuario.id)
  if (erro) return { erro }
  revalidar()
  return { ok: "Pedido cancelado." }
}
