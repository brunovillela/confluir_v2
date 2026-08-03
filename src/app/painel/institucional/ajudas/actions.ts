"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import {
  atualizarContrato,
  criarContrato,
  excluirContrato,
  gerarOrdensContrato,
} from "@/lib/db/contratos"
import { subirPdfCompras } from "@/lib/db/compras"
import { PERIODICIDADES, type Periodicidade } from "@/lib/contratos-constantes"
import { parseValorBR } from "@/lib/valores"

import { lerDadosContrato } from "../../compras/contratos/dados-form"

function texto(formData: FormData, campo: string): string {
  return String(formData.get(campo) ?? "").trim()
}

function ouNull(v: string): string | null {
  return v || null
}

async function requireEdicaoAjudas() {
  return requirePermissao("apoio_institucional_edicao")
}

function revalidar(id?: string) {
  revalidatePath("/painel/institucional/ajudas")
  if (id) revalidatePath(`/painel/institucional/ajudas/${id}`)
}

/** Sobe o PDF quando enviado; devolve o caminho ou `undefined` (não mexer). */
async function lerArquivo(
  formData: FormData
): Promise<{ caminho?: string | null; erro?: string }> {
  const arquivo = formData.get("arquivo")
  if (!(arquivo instanceof File) || arquivo.size === 0)
    return { caminho: undefined }
  const { caminho, erro } = await subirPdfCompras("contratos", arquivo)
  if (erro) return { erro }
  return { caminho }
}

export async function criarAjudaAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requireEdicaoAjudas()
  const { caminho, erro: erroArquivo } = await lerArquivo(formData)
  if (erroArquivo) return { erro: erroArquivo }
  const { id, erro } = await criarContrato({
    ...lerDadosContrato(formData),
    apoio_institucional: true,
    arquivo_contrato: caminho ?? null,
  })
  if (erro || !id) return { erro: erro ?? "Falha ao cadastrar." }
  revalidar(id)
  redirect(`/painel/institucional/ajudas/${id}?salvo=1`)
}

export async function atualizarAjudaAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requireEdicaoAjudas()
  const id = texto(formData, "contrato_id")
  if (!id) return { erro: "Ajuda inválida." }
  const { caminho, erro: erroArquivo } = await lerArquivo(formData)
  if (erroArquivo) return { erro: erroArquivo }
  const { erro } = await atualizarContrato(id, {
    ...lerDadosContrato(formData),
    apoio_institucional: true,
    arquivo_contrato: caminho,
  })
  if (erro) return { erro }
  revalidar(id)
  redirect(`/painel/institucional/ajudas/${id}?salvo=1`)
}

export async function gerarOrdensAjudaAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requireEdicaoAjudas()
  const id = texto(formData, "contrato_id")
  if (!id) return { erro: "Ajuda inválida." }

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
  redirect(`/painel/institucional/ajudas/${id}?${params.toString()}`)
}

export async function excluirAjudaAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requireEdicaoAjudas()
  const id = texto(formData, "contrato_id")
  if (!id) return { erro: "Ajuda inválida." }
  const { erro } = await excluirContrato(id)
  if (erro) return { erro }
  revalidar()
  redirect("/painel/institucional/ajudas?excluido=1")
}
