"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { FORMAS_PAGAMENTO_COMPRAS } from "@/lib/compras-constantes"
import {
  criarCompraDireta,
  criarSolicitacao,
  subirPdfCompras,
} from "@/lib/db/compras"
import { parseValorBR } from "@/lib/valores"

function texto(formData: FormData, campo: string): string {
  return String(formData.get(campo) ?? "").trim()
}

function dataISO(valor: string): string | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(valor) ? valor : null
}

export async function criarCompra(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await requirePermissao("aquisicoes_compras", [
    "aquisicoes_compras_edicao",
  ])

  const direta = texto(formData, "modalidade") === "direta"
  const produto = texto(formData, "produto")
  if (!produto) return { erro: "Descreva o produto ou serviço." }
  const departamentoId = texto(formData, "departamento_id")
  if (!departamentoId) return { erro: "Informe o departamento solicitante." }

  const base = {
    produto,
    e_produto:
      texto(formData, "e_produto") === ""
        ? null
        : texto(formData, "e_produto") === "bem",
    observacao: texto(formData, "observacao") || null,
    departamento_id: departamentoId,
    centro_custo_id: texto(formData, "centro_custo_id") || null,
    projeto_id: texto(formData, "projeto_id") || null,
    data_limite: dataISO(texto(formData, "data_limite")),
    local_entrega: texto(formData, "local_entrega") || null,
  }

  if (!direta) {
    const { id, erro } = await criarSolicitacao(base)
    if (erro || !id) return { erro: erro ?? "Falha ao registrar." }
    revalidatePath("/painel/compras")
    redirect(`/painel/compras/${id}?criado=1`)
  }

  // Aquisição direta: fornecedor, valor e data são obrigatórios.
  const fornecedorId = texto(formData, "fornecedor_id")
  if (!fornecedorId) return { erro: "Busque e selecione o fornecedor." }
  const valor = parseValorBR(texto(formData, "valor"))
  if (valor === null || valor <= 0) return { erro: "Informe o valor da compra." }
  const dataCompra = dataISO(texto(formData, "data_compra"))
  if (!dataCompra) return { erro: "Informe a data da compra." }
  const formaBruta = texto(formData, "forma_pagamento")
  const forma = (FORMAS_PAGAMENTO_COMPRAS as readonly string[]).includes(
    formaBruta
  )
    ? formaBruta
    : null

  let notaFiscal: string | null = null
  const arquivo = formData.get("nota_fiscal")
  if (arquivo instanceof File && arquivo.size > 0) {
    const { caminho, erro } = await subirPdfCompras("notas", arquivo)
    if (erro) return { erro }
    notaFiscal = caminho ?? null
  }

  const { id, erro } = await criarCompraDireta({
    ...base,
    fornecedor_id: fornecedorId,
    valor,
    forma_pagamento: forma,
    data_compra: dataCompra,
    vencimento: dataISO(texto(formData, "vencimento")),
    comprador_id: sessao.usuario.id,
    nota_fiscal_url: notaFiscal,
    ja_recebido: texto(formData, "ja_recebido") === "on",
    recebedor_id: sessao.usuario.id,
  })
  if (erro || !id) return { erro: erro ?? "Falha ao registrar." }
  revalidatePath("/painel/compras")
  redirect(`/painel/compras/${id}?criado=1`)
}
