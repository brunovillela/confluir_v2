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
  mesclarFornecedores,
  salvarConta,
  salvarEndereco,
  type DadosEndereco,
  type DadosFornecedor,
} from "@/lib/db/fornecedores"
import { fichaPorCnpj, type DadosCnpj } from "@/lib/db/fornecedores-cnpj"
import { CHAVE_EDICAO_FORNECEDORES } from "@/lib/fornecedores-acesso"

function texto(formData: FormData, campo: string): string {
  return String(formData.get(campo) ?? "").trim()
}

function ouNull(v: string): string | null {
  return v || null
}

/** Gerir fornecedores tem chave própria (05/10/2026). A flag base
 * `aquisicoes_fornecedores` é só consulta (não escreve). */
async function requireGestaoFornecedores() {
  return requirePermissao(CHAVE_EDICAO_FORNECEDORES)
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
  await gravarEnderecoReceita(id, formData)
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
  await gravarEnderecoReceita(id, formData)
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

/**
 * Endereço que veio da consulta do CNPJ: entra como endereço do fornecedor
 * quando o usuário deixou marcado "Adicionar o endereço da Receita".
 */
async function gravarEnderecoReceita(fornecedorId: string, formData: FormData) {
  if (texto(formData, "receita_endereco_usar") !== "on") return
  const bruto = texto(formData, "receita_endereco")
  if (!bruto) return
  let e: Partial<DadosEndereco>
  try {
    e = JSON.parse(bruto) as Partial<DadosEndereco>
  } catch {
    return
  }
  const limpo = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null)
  // Endereço é complemento do cadastro: falha aqui não desfaz o fornecedor.
  await salvarEndereco(fornecedorId, {
    nome_endereco: "Sede (Receita Federal)",
    cep: limpo(e.cep)?.replace(/\D/g, "") ?? null,
    logradouro: limpo(e.logradouro),
    numero: limpo(e.numero),
    complemento: limpo(e.complemento),
    bairro: limpo(e.bairro),
    cidade: limpo(e.cidade),
    estado: limpo(e.estado)?.toUpperCase().slice(0, 2) ?? null,
  })
}

/** "Preencher pelo CNPJ": Receita Federal + padronização por IA. */
export async function consultarCnpjFornecedor(
  cnpj: string
): Promise<{ ficha?: DadosCnpj; erro?: string }> {
  await requireGestaoFornecedores()
  return fichaPorCnpj(cnpj)
}

/** Mescla cadastros com o mesmo CPF/CNPJ no escolhido como principal. */
export async function mesclarFornecedoresAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await requireGestaoFornecedores()
  const principal = texto(formData, "principal")
  const todos = formData.getAll("cadastro_ids").map(String)
  if (!principal) return { erro: "Escolha o cadastro que fica." }
  const { erro, resumo, pendentes } = await mesclarFornecedores({
    principal,
    secundarios: todos.filter((id) => id !== principal),
    usuarioId: sessao.usuario.id,
  })
  if (erro) return { erro }
  revalidarFornecedor(principal)
  revalidatePath("/painel/compras/fornecedores/lista")
  revalidatePath("/painel/compras/fornecedores/duplicados")
  revalidatePath("/painel/compras/contratos")
  revalidatePath("/painel/financeiro/ordens")
  const q = new URLSearchParams({ mesclado: resumo ?? "" })
  if (pendentes?.length) q.set("pendentes", pendentes.join(","))
  redirect(`/painel/compras/fornecedores/${principal}?${q.toString()}`)
}
