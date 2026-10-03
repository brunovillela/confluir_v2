"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import type { EstadoComApontamentos } from "@/lib/auditoria-confirmacao"
import { lerConfirmacao } from "@/lib/db/ordens-verificacao"
import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import {
  atualizarCategoriaContrato,
  atualizarContrato,
  criarCategoriaContrato,
  criarContrato,
  excluirCategoriaContrato,
  excluirContrato,
  excluirOrdensContrato,
  gerarOrdensContrato,
  receberDocumentoOrdemContrato,
} from "@/lib/db/contratos"
import { subirPdfCompras } from "@/lib/db/compras"
import {
  meiosPagamentoFornecedor,
  type ContaFornecedor,
  type PixFornecedor,
} from "@/lib/db/compras-pagamento"
import { lerPagamentoOrdemFutura } from "@/lib/db/compras-pagamento-form"
import { FORMAS_ORDEM_CONTRATO } from "@/lib/compras-constantes"
import { PERIODICIDADES, type Periodicidade } from "@/lib/contratos-constantes"
import { parseValorBR } from "@/lib/valores"

import { lerDadosContrato } from "./dados-form"

function texto(formData: FormData, campo: string): string {
  return String(formData.get(campo) ?? "").trim()
}

function marcado(formData: FormData, campo: string): boolean {
  return texto(formData, campo) === "on"
}

async function requireEdicaoContratos() {
  return requirePermissao("aquisicoes_contratos_edicao")
}

function revalidar(id?: string) {
  revalidatePath("/painel/compras/contratos")
  if (id) revalidatePath(`/painel/compras/contratos/${id}`)
}

const lerDados = lerDadosContrato

/** Sobe o PDF quando enviado; devolve o caminho ou `undefined` (não mexer). */
async function lerArquivo(
  formData: FormData
): Promise<{ caminho?: string | null; erro?: string }> {
  const arquivo = formData.get("arquivo")
  if (!(arquivo instanceof File) || arquivo.size === 0) return { caminho: undefined }
  const { caminho, erro } = await subirPdfCompras("contratos", arquivo)
  if (erro) return { erro }
  return { caminho }
}

export async function criarContratoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requireEdicaoContratos()
  const { caminho, erro: erroArquivo } = await lerArquivo(formData)
  if (erroArquivo) return { erro: erroArquivo }
  const { id, erro } = await criarContrato({
    ...lerDados(formData),
    apoio_institucional: false,
    arquivo_contrato: caminho ?? null,
  })
  if (erro || !id) return { erro: erro ?? "Falha ao cadastrar." }
  revalidar(id)
  redirect(`/painel/compras/contratos/${id}?salvo=1`)
}

export async function atualizarContratoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requireEdicaoContratos()
  const id = texto(formData, "contrato_id")
  if (!id) return { erro: "Contrato inválido." }
  const { caminho, erro: erroArquivo } = await lerArquivo(formData)
  if (erroArquivo) return { erro: erroArquivo }
  const { erro } = await atualizarContrato(id, {
    ...lerDados(formData),
    apoio_institucional: false,
    arquivo_contrato: caminho,
  })
  if (erro) return { erro }
  revalidar(id)
  redirect(`/painel/compras/contratos/${id}?salvo=1`)
}

export async function gerarOrdensContratoAction(
  _prev: EstadoComApontamentos,
  formData: FormData
): Promise<EstadoComApontamentos> {
  await requireEdicaoContratos()
  const id = texto(formData, "contrato_id")
  if (!id) return { erro: "Contrato inválido." }

  const per = texto(formData, "periodicidade")
  const periodicidade = PERIODICIDADES.some((p) => p.chave === per)
    ? (per as Periodicidade)
    : "mensal"
  const valorBruto = texto(formData, "valor_parcela")
  const forma = texto(formData, "forma_pagamento")
  if (!(FORMAS_ORDEM_CONTRATO as readonly string[]).includes(forma)) {
    return { erro: "Escolha a forma de pagamento." }
  }

  const { geradas, puladas, erro, apontamentos } = await gerarOrdensContrato(id, {
    confirmacao: lerConfirmacao(formData),
    periodicidade,
    valorParcela: (valorBruto ? parseValorBR(valorBruto) : 0) ?? 0,
    primeiroVencimento: texto(formData, "primeiro_vencimento"),
    quantidade: Number(texto(formData, "quantidade")) || 1,
    formaPagamento: forma,
    aguardarDocumento: true,
    pagamento: (fornecedorId) =>
      lerPagamentoOrdemFutura(
        formData,
        forma as (typeof FORMAS_ORDEM_CONTRATO)[number],
        fornecedorId
      ),
  })
  if (apontamentos) return { apontamentos }
  if (erro) return { erro }

  revalidar(id)
  const params = new URLSearchParams({
    geradas: String(geradas ?? 0),
    puladas: String(puladas ?? 0),
  })
  redirect(`/painel/compras/contratos/${id}?${params.toString()}`)
}

/** Nota da parcela recorrente: a ordem sai do contrato e vai para autorização. */
export async function receberDocumentoOrdemAction(
  _prev: EstadoComApontamentos,
  formData: FormData
): Promise<EstadoComApontamentos> {
  await requireEdicaoContratos()
  const contratoId = texto(formData, "contrato_id")
  const ordemId = texto(formData, "ordem_id")
  if (!contratoId || !ordemId) return { erro: "Ordem inválida." }
  const arquivo = formData.get("nota")
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { erro: "Anexe a nota (PDF ou imagem)." }
  }
  const valorTexto = texto(formData, "valor")
  const valor = valorTexto ? parseValorBR(valorTexto) : null
  if (valorTexto && (valor === null || valor <= 0)) return { erro: "Valor da nota inválido." }

  const { erro, situacao, apontamentos } = await receberDocumentoOrdemContrato(contratoId, ordemId, {
    arquivo,
    valor,
    confirmacao: lerConfirmacao(formData),
  })
  if (apontamentos) return { apontamentos }
  if (erro) return { erro }
  revalidar(contratoId)
  revalidatePath("/painel/financeiro/ordens")
  revalidatePath("/painel/compras/avaliacoes")
  return {
    ok:
      situacao === "A pagar"
        ? "Nota recebida — parcela fixa do contrato, seguiu direto para pagamento."
        : "Nota recebida — a ordem seguiu para autorização.",
  }
}

/** Exclusão em massa das ordens ainda não autorizadas do contrato. */
export async function excluirOrdensContratoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requireEdicaoContratos()
  const contratoId = texto(formData, "contrato_id")
  if (!contratoId) return { erro: "Contrato inválido." }
  const ids = formData.getAll("ordem_ids").map(String)
  const { erro, excluidas, recusadas } = await excluirOrdensContrato(contratoId, ids)
  if (erro) return { erro }
  revalidar(contratoId)
  revalidatePath("/painel/financeiro/ordens")
  revalidatePath("/painel/compras/avaliacoes")
  return {
    ok: `${excluidas} ordem(ns) excluída(s)${recusadas ? `; ${recusadas} não puderam (já autorizadas ou mudaram de situação)` : ""}.`,
  }
}

/** Chaves Pix e contas do fornecedor, para a forma das ordens do contrato. */
export async function meiosDoFornecedorContrato(
  fornecedorId: string
): Promise<{ pix: PixFornecedor[]; contas: ContaFornecedor[] }> {
  await requireEdicaoContratos()
  if (!fornecedorId) return { pix: [], contas: [] }
  return meiosPagamentoFornecedor(fornecedorId)
}

export async function excluirContratoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requireEdicaoContratos()
  const id = texto(formData, "contrato_id")
  if (!id) return { erro: "Contrato inválido." }
  const { erro } = await excluirContrato(id)
  if (erro) return { erro }
  revalidar()
  redirect("/painel/compras/contratos?excluido=1")
}

// ── Categorias ───────────────────────────────────────────────────────────────

function revalidarCategorias() {
  revalidatePath("/painel/compras/contratos/categorias")
  revalidatePath("/painel/compras/contratos")
}

export async function criarCategoriaAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requireEdicaoContratos()
  const { erro } = await criarCategoriaContrato(
    texto(formData, "nome"),
    marcado(formData, "sigiloso")
  )
  if (erro) return { erro }
  revalidarCategorias()
  return { ok: "Categoria criada." }
}

export async function atualizarCategoriaAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requireEdicaoContratos()
  const id = texto(formData, "categoria_id")
  if (!id) return { erro: "Categoria inválida." }
  const { erro } = await atualizarCategoriaContrato(
    id,
    texto(formData, "nome"),
    marcado(formData, "sigiloso")
  )
  if (erro) return { erro }
  revalidarCategorias()
  return { ok: "Categoria atualizada." }
}

export async function excluirCategoriaAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requireEdicaoContratos()
  const id = texto(formData, "categoria_id")
  if (!id) return { erro: "Categoria inválida." }
  const { erro } = await excluirCategoriaContrato(id)
  if (erro) return { erro }
  revalidarCategorias()
  return { ok: "Categoria excluída." }
}
