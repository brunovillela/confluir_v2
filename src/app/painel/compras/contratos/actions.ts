"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import {
  atualizarCategoriaContrato,
  atualizarContrato,
  criarCategoriaContrato,
  criarContrato,
  excluirCategoriaContrato,
  excluirContrato,
  gerarOrdensContrato,
} from "@/lib/db/contratos"
import { subirPdfCompras } from "@/lib/db/compras"
import { PERIODICIDADES, type Periodicidade } from "@/lib/contratos-constantes"
import { parseValorBR } from "@/lib/valores"

import { lerDadosContrato } from "./dados-form"

function texto(formData: FormData, campo: string): string {
  return String(formData.get(campo) ?? "").trim()
}

function ouNull(v: string): string | null {
  return v || null
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
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requireEdicaoContratos()
  const id = texto(formData, "contrato_id")
  if (!id) return { erro: "Contrato inválido." }

  const per = texto(formData, "periodicidade")
  const periodicidade = PERIODICIDADES.some((p) => p.chave === per)
    ? (per as Periodicidade)
    : "mensal"
  const valorBruto = texto(formData, "valor_parcela")

  const { geradas, puladas, erro } = await gerarOrdensContrato(id, {
    periodicidade,
    valorParcela: (valorBruto ? parseValorBR(valorBruto) : 0) ?? 0,
    primeiroVencimento: texto(formData, "primeiro_vencimento"),
    quantidade: Number(texto(formData, "quantidade")) || 1,
    formaPagamento: ouNull(texto(formData, "forma_pagamento")),
  })
  if (erro) return { erro }

  revalidar(id)
  const params = new URLSearchParams({
    geradas: String(geradas ?? 0),
    puladas: String(puladas ?? 0),
  })
  redirect(`/painel/compras/contratos/${id}?${params.toString()}`)
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
