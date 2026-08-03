"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import {
  atualizarFornecedor,
  criarFornecedor,
  definirInativa,
  excluirConta,
  excluirEndereco,
  excluirFornecedor,
  salvarConta,
  salvarEndereco,
  type DadosFornecedor,
} from "@/lib/db/fornecedores"

function texto(formData: FormData, campo: string): string {
  return String(formData.get(campo) ?? "").trim()
}

function ouNull(v: string): string | null {
  return v || null
}

/** Gerir fornecedores = papel de fornecedores OU operação de compras. */
async function requireGestaoFornecedores() {
  return requirePermissao("aquisicoes_fornecedores", [
    "aquisicoes_compras_edicao",
  ])
}

function revalidarFornecedor(id?: string) {
  revalidatePath("/painel/compras/fornecedores")
  if (id) revalidatePath(`/painel/compras/fornecedores/${id}`)
}

function lerDados(formData: FormData): DadosFornecedor {
  return {
    nome_fantasia: ouNull(texto(formData, "nome_fantasia")),
    nome_razao: ouNull(texto(formData, "nome_razao")),
    cnpj_cpf: ouNull(texto(formData, "cnpj_cpf").replace(/\D/g, "")),
    pessoa_juridica: texto(formData, "pessoa_juridica") === "on",
    fornecedor_bloqueado: texto(formData, "fornecedor_bloqueado") === "on",
  }
}

export async function criarFornecedorAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requireGestaoFornecedores()
  const { id, erro } = await criarFornecedor(lerDados(formData))
  if (erro || !id) return { erro: erro ?? "Falha ao cadastrar." }
  revalidarFornecedor(id)
  redirect(`/painel/compras/fornecedores/${id}?salvo=1`)
}

export async function atualizarFornecedorAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requireGestaoFornecedores()
  const id = texto(formData, "fornecedor_id")
  if (!id) return { erro: "Fornecedor inválido." }
  const { erro } = await atualizarFornecedor(id, lerDados(formData))
  if (erro) return { erro }
  revalidarFornecedor(id)
  redirect(`/painel/compras/fornecedores/${id}?salvo=1`)
}

export async function definirInativaAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requireGestaoFornecedores()
  const id = texto(formData, "fornecedor_id")
  if (!id) return { erro: "Fornecedor inválido." }
  const { erro } = await definirInativa(id, texto(formData, "inativa") === "1")
  if (erro) return { erro }
  revalidarFornecedor(id)
  redirect(`/painel/compras/fornecedores/${id}?salvo=1`)
}

export async function excluirFornecedorAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requireGestaoFornecedores()
  const id = texto(formData, "fornecedor_id")
  if (!id) return { erro: "Fornecedor inválido." }
  const { erro } = await excluirFornecedor(id)
  if (erro) return { erro }
  revalidarFornecedor()
  redirect("/painel/compras/fornecedores?excluido=1")
}

export async function salvarEnderecoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requireGestaoFornecedores()
  const fornecedorId = texto(formData, "fornecedor_id")
  if (!fornecedorId) return { erro: "Fornecedor inválido." }
  const enderecoId = texto(formData, "endereco_id") || undefined
  const { erro } = await salvarEndereco(
    fornecedorId,
    {
      nome_endereco: ouNull(texto(formData, "nome_endereco")),
      cep: ouNull(texto(formData, "cep").replace(/\D/g, "")),
      logradouro: ouNull(texto(formData, "logradouro")),
      numero: ouNull(texto(formData, "numero")),
      complemento: ouNull(texto(formData, "complemento")),
      bairro: ouNull(texto(formData, "bairro")),
      cidade: ouNull(texto(formData, "cidade")),
      estado: ouNull(texto(formData, "estado").toUpperCase().slice(0, 2)),
    },
    enderecoId
  )
  if (erro) return { erro }
  revalidarFornecedor(fornecedorId)
  redirect(`/painel/compras/fornecedores/${fornecedorId}?salvo=1`)
}

export async function excluirEnderecoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requireGestaoFornecedores()
  const fornecedorId = texto(formData, "fornecedor_id")
  const enderecoId = texto(formData, "endereco_id")
  if (!fornecedorId || !enderecoId) return { erro: "Endereço inválido." }
  const { erro } = await excluirEndereco(fornecedorId, enderecoId)
  if (erro) return { erro }
  revalidarFornecedor(fornecedorId)
  redirect(`/painel/compras/fornecedores/${fornecedorId}?salvo=1`)
}

export async function salvarContaAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requireGestaoFornecedores()
  const fornecedorId = texto(formData, "fornecedor_id")
  if (!fornecedorId) return { erro: "Fornecedor inválido." }
  const contaId = texto(formData, "conta_id") || undefined
  const { erro } = await salvarConta(
    fornecedorId,
    {
      banco: ouNull(texto(formData, "banco")),
      agencia: ouNull(texto(formData, "agencia")),
      conta: ouNull(texto(formData, "conta")),
      tipo_conta: ouNull(texto(formData, "tipo_conta")),
      pix: ouNull(texto(formData, "pix")),
      favorecido: ouNull(texto(formData, "favorecido")),
    },
    contaId
  )
  if (erro) return { erro }
  revalidarFornecedor(fornecedorId)
  redirect(`/painel/compras/fornecedores/${fornecedorId}?salvo=1`)
}

export async function excluirContaAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requireGestaoFornecedores()
  const fornecedorId = texto(formData, "fornecedor_id")
  const contaId = texto(formData, "conta_id")
  if (!fornecedorId || !contaId) return { erro: "Conta inválida." }
  const { erro } = await excluirConta(fornecedorId, contaId)
  if (erro) return { erro }
  revalidarFornecedor(fornecedorId)
  redirect(`/painel/compras/fornecedores/${fornecedorId}?salvo=1`)
}
