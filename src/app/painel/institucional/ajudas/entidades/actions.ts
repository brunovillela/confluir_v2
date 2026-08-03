"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import {
  atualizarFornecedor,
  criarEntidadeApoiada,
  definirInativa,
  excluirConta,
  excluirEndereco,
  excluirEntidadeApoiada,
  salvarConta,
  salvarEndereco,
  type DadosFornecedor,
} from "@/lib/db/fornecedores"

const BASE = "/painel/institucional/ajudas/entidades"

function texto(formData: FormData, campo: string): string {
  return String(formData.get(campo) ?? "").trim()
}

function ouNull(v: string): string | null {
  return v || null
}

async function requireEdicao() {
  return requirePermissao("apoio_institucional_edicao")
}

function revalidar(id?: string) {
  revalidatePath(BASE)
  if (id) revalidatePath(`${BASE}/${id}`)
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

export async function criarEntidadeAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requireEdicao()
  const { id, erro } = await criarEntidadeApoiada(lerDados(formData))
  if (erro || !id) return { erro: erro ?? "Falha ao cadastrar." }
  revalidar(id)
  redirect(`${BASE}/${id}?salvo=1`)
}

export async function atualizarEntidadeAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requireEdicao()
  const id = texto(formData, "fornecedor_id")
  if (!id) return { erro: "Entidade inválida." }
  const { erro } = await atualizarFornecedor(id, lerDados(formData))
  if (erro) return { erro }
  revalidar(id)
  redirect(`${BASE}/${id}?salvo=1`)
}

export async function definirInativaEntidadeAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requireEdicao()
  const id = texto(formData, "fornecedor_id")
  if (!id) return { erro: "Entidade inválida." }
  const { erro } = await definirInativa(id, texto(formData, "inativa") === "1")
  if (erro) return { erro }
  revalidar(id)
  redirect(`${BASE}/${id}?salvo=1`)
}

export async function excluirEntidadeAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requireEdicao()
  const id = texto(formData, "fornecedor_id")
  if (!id) return { erro: "Entidade inválida." }
  const { erro } = await excluirEntidadeApoiada(id)
  if (erro) return { erro }
  revalidar()
  redirect(`${BASE}?excluido=1`)
}

export async function salvarEnderecoEntidadeAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requireEdicao()
  const entidadeId = texto(formData, "fornecedor_id")
  if (!entidadeId) return { erro: "Entidade inválida." }
  const enderecoId = texto(formData, "endereco_id") || undefined
  const { erro } = await salvarEndereco(
    entidadeId,
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
  revalidar(entidadeId)
  redirect(`${BASE}/${entidadeId}?salvo=1`)
}

export async function excluirEnderecoEntidadeAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requireEdicao()
  const entidadeId = texto(formData, "fornecedor_id")
  const enderecoId = texto(formData, "endereco_id")
  if (!entidadeId || !enderecoId) return { erro: "Endereço inválido." }
  const { erro } = await excluirEndereco(entidadeId, enderecoId)
  if (erro) return { erro }
  revalidar(entidadeId)
  redirect(`${BASE}/${entidadeId}?salvo=1`)
}

export async function salvarContaEntidadeAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requireEdicao()
  const entidadeId = texto(formData, "fornecedor_id")
  if (!entidadeId) return { erro: "Entidade inválida." }
  const contaId = texto(formData, "conta_id") || undefined
  const { erro } = await salvarConta(
    entidadeId,
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
  revalidar(entidadeId)
  redirect(`${BASE}/${entidadeId}?salvo=1`)
}

export async function excluirContaEntidadeAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requireEdicao()
  const entidadeId = texto(formData, "fornecedor_id")
  const contaId = texto(formData, "conta_id")
  if (!entidadeId || !contaId) return { erro: "Conta inválida." }
  const { erro } = await excluirConta(entidadeId, contaId)
  if (erro) return { erro }
  revalidar(entidadeId)
  redirect(`${BASE}/${entidadeId}?salvo=1`)
}
