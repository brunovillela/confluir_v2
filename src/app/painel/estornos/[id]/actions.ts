"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requireSessaoPainel } from "@/lib/auth"
import { FORMAS_ESTORNO } from "@/lib/compras-constantes"
import { type EstadoForm } from "@/lib/contas"
import { hojeSP } from "@/lib/db/comum"
import { subirComprovanteCompras } from "@/lib/db/compras"
import {
  meiosPagamentoFornecedor,
  type ContaFornecedor,
  type PixFornecedor,
} from "@/lib/db/compras-pagamento"
import { lerDetalhePagamento } from "@/lib/db/compras-pagamento-form"
import { corrigirEstorno, obterEstorno } from "@/lib/db/ordens-estorno"

import { podeCorrigirEstorno } from "../acesso"

function texto(formData: FormData, campo: string): string {
  return String(formData.get(campo) ?? "").trim()
}

/**
 * Chaves Pix e contas do favorecido do estorno — ligada (bind) ao estorno:
 * quem lançou a ordem pode não ter a permissão de compra direta.
 */
export async function meiosDoEstorno(
  estornoId: string,
  fornecedorId: string
): Promise<{ pix: PixFornecedor[]; contas: ContaFornecedor[] }> {
  const sessao = await requireSessaoPainel()
  const e = await obterEstorno(estornoId)
  if (!e || !podeCorrigirEstorno(sessao, e.responsavelId)) return { pix: [], contas: [] }
  if (!fornecedorId || fornecedorId !== e.ordem.fornecedorId) return { pix: [], contas: [] }
  return meiosPagamentoFornecedor(fornecedorId)
}

/**
 * Grava a forma e os dados de pagamento conferidos e reencaminha a ordem
 * para autorização. Chave/conta NOVA vai para o cadastro do fornecedor.
 */
export async function corrigirEstornoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await requireSessaoPainel()
  const id = texto(formData, "id")
  const e = id ? await obterEstorno(id) : null
  if (!e) return { erro: "Estorno não encontrado." }
  if (!podeCorrigirEstorno(sessao, e.responsavelId)) {
    return { erro: "Só quem lançou a ordem ou o Financeiro corrige este estorno." }
  }
  if (e.resolvidoEm) return { erro: "Este estorno já foi resolvido." }

  const forma = texto(formData, "forma_pagamento")
  const permitidas: readonly string[] = e.ordem.fornecedorId
    ? FORMAS_ESTORNO
    : FORMAS_ESTORNO.filter((f) => f === "Pix (QR Code)" || f === "Boleto")
  if (!permitidas.includes(forma)) return { erro: "Escolha a forma de pagamento." }

  const vencimento = texto(formData, "vencimento")
  if (vencimento && !/^\d{4}-\d{2}-\d{2}$/.test(vencimento)) return { erro: "Vencimento inválido." }
  if (vencimento && vencimento < hojeSP()) {
    return { erro: "O novo vencimento não pode estar no passado." }
  }
  if (texto(formData, "observacao").length < 10) {
    return { erro: "Diga o que foi conferido ou corrigido (ex.: nova chave Pix confirmada com o fornecedor)." }
  }

  const { detalhe, boleto, erro: erroDetalhe } = await lerDetalhePagamento(
    formData,
    forma as (typeof FORMAS_ESTORNO)[number],
    e.ordem.fornecedorId ?? "",
    0
  )
  if (erroDetalhe || !detalhe) return { erro: erroDetalhe ?? "Dados de pagamento inválidos." }

  let novoBoleto: string | null = null
  if (boleto) {
    const r = await subirComprovanteCompras("boletos", boleto)
    if (r.erro || !r.caminho) return { erro: r.erro ?? "Falha ao subir o boleto." }
    novoBoleto = r.caminho
  }

  const { erro, ordemId } = await corrigirEstorno(id, sessao.usuario.id, {
    forma,
    detalhe,
    novoBoleto,
    observacao: texto(formData, "observacao"),
    vencimento: vencimento || null,
  })
  if (erro) return { erro }

  revalidatePath(`/painel/estornos/${id}`)
  revalidatePath("/painel/estornos")
  revalidatePath("/painel/financeiro/estornos")
  revalidatePath(`/painel/financeiro/ordens/${ordemId}`)
  revalidatePath("/painel/compras/avaliacoes")
  redirect(`/painel/estornos/${id}?corrigido=1`)
}
