"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import {
  atualizarItem,
  atualizarNota,
  atualizarRecinto,
  criarItem,
  criarNota,
  criarRecinto,
  definirResponsavelRecinto,
  encerrarCautela,
  gravarArquivoCautela,
  gravarArquivoNota,
  registrarCautela,
} from "@/lib/db/patrimonio"
import { SEDES_RECINTO } from "@/lib/patrimonio-constantes"

function texto(formData: FormData, campo: string): string {
  return String(formData.get(campo) ?? "").trim()
}

function dataISO(valor: string): string | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(valor) ? valor : null
}

// Alinhado ao serverActions.bodySizeLimit (4mb) do next.config.ts — acima
// disso o Next rejeita o request antes de chegar aqui.
const MAX_ARQUIVO = 4 * 1024 * 1024 // 4 MB

/** Lê um arquivo do FormData; retorna erro de validação se inválido. */
function lerArquivo(
  formData: FormData,
  campo: string
): { arquivo?: File; erro?: string } {
  const v = formData.get(campo)
  if (!(v instanceof File) || v.size === 0) return {}
  if (v.size > MAX_ARQUIVO) return { erro: "O arquivo deve ter no máximo 4 MB." }
  return { arquivo: v }
}

function lerDadosItem(formData: FormData) {
  return {
    nome: texto(formData, "nome"),
    descricao: texto(formData, "descricao") || null,
    numero_patrimonio: texto(formData, "numero_patrimonio") || null,
    numero_patrimonio_antigo: texto(formData, "numero_patrimonio_antigo") || null,
    numero_unico: texto(formData, "numero_unico") || null,
    recinto_id: texto(formData, "recinto_id") || null,
  }
}

export async function criarItemAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("patrimonio_geral")
  const dados = lerDadosItem(formData)
  if (!dados.nome) return { erro: "Informe o nome do item." }

  const { id, erro } = await criarItem(dados)
  if (erro) return { erro }
  revalidatePath("/painel/patrimonio/itens")
  revalidatePath("/painel/patrimonio")
  redirect(`/painel/patrimonio/${id}?salvo=1`)
}

export async function atualizarItemAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("patrimonio_geral")
  const id = texto(formData, "item_id")
  if (!id) return { erro: "Item inválido." }
  const dados = lerDadosItem(formData)
  if (!dados.nome) return { erro: "Informe o nome do item." }

  const { erro } = await atualizarItem(id, dados)
  if (erro) return { erro }
  revalidatePath(`/painel/patrimonio/${id}`)
  revalidatePath("/painel/patrimonio/itens")
  redirect(`/painel/patrimonio/${id}?salvo=1`)
}

export async function registrarCautelaAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("patrimonio_geral")
  const itemId = texto(formData, "item_id")
  const responsavelId = texto(formData, "responsavel_id")
  if (!itemId) return { erro: "Item inválido." }
  if (!responsavelId) return { erro: "Escolha o responsável pela cautela." }

  const { arquivo, erro: erroArq } = lerArquivo(formData, "arquivo_cautela_file")
  if (erroArq) return { erro: erroArq }

  const { id, erro } = await registrarCautela({
    itemId,
    responsavelId,
    inicio: dataISO(texto(formData, "inicio")),
  })
  if (erro) return { erro }
  if (arquivo && id) {
    const { erro: erroUp } = await gravarArquivoCautela(id, arquivo)
    if (erroUp) return { erro: erroUp }
  }
  revalidatePath(`/painel/patrimonio/${itemId}`)
  revalidatePath("/painel/patrimonio")
  redirect(`/painel/patrimonio/${itemId}?salvo=1`)
}

export async function encerrarCautelaAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("patrimonio_geral")
  const itemId = texto(formData, "item_id")
  const cautelaId = texto(formData, "cautela_id")
  if (!cautelaId) return { erro: "Cautela inválida." }

  const { erro } = await encerrarCautela({
    cautelaId,
    termino: dataISO(texto(formData, "termino")),
  })
  if (erro) return { erro }
  if (itemId) revalidatePath(`/painel/patrimonio/${itemId}`)
  revalidatePath("/painel/patrimonio")
  redirect(`/painel/patrimonio/${itemId}?salvo=1`)
}

// ── Recintos ─────────────────────────────────────────────────────────────────

function sedeValida(v: string): string | null {
  return (SEDES_RECINTO as readonly string[]).includes(v) ? v : null
}

function lerDadosRecinto(formData: FormData) {
  return {
    nome: texto(formData, "nome"),
    codigo: texto(formData, "codigo") || null,
    descricao_fisica: texto(formData, "descricao_fisica") || null,
    sede: sedeValida(texto(formData, "sede")),
  }
}

export async function criarRecintoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("patrimonio_geral")
  const dados = lerDadosRecinto(formData)
  if (!dados.nome) return { erro: "Informe o nome do recinto." }
  const { id, erro } = await criarRecinto(dados)
  if (erro) return { erro }
  revalidatePath("/painel/patrimonio/recintos")
  redirect(`/painel/patrimonio/recintos/${id}?salvo=1`)
}

export async function atualizarRecintoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("patrimonio_geral")
  const id = texto(formData, "recinto_id")
  if (!id) return { erro: "Recinto inválido." }
  const dados = lerDadosRecinto(formData)
  if (!dados.nome) return { erro: "Informe o nome do recinto." }
  const { erro } = await atualizarRecinto(id, dados)
  if (erro) return { erro }
  revalidatePath(`/painel/patrimonio/recintos/${id}`)
  revalidatePath("/painel/patrimonio/recintos")
  redirect(`/painel/patrimonio/recintos/${id}?salvo=1`)
}

export async function definirResponsavelRecintoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("patrimonio_geral")
  const recintoId = texto(formData, "recinto_id")
  const funcionarioId = texto(formData, "funcionario_id")
  if (!recintoId) return { erro: "Recinto inválido." }
  if (!funcionarioId) return { erro: "Escolha o responsável." }
  const { erro } = await definirResponsavelRecinto({
    recintoId,
    funcionarioId,
    inicio: dataISO(texto(formData, "inicio")),
  })
  if (erro) return { erro }
  revalidatePath(`/painel/patrimonio/recintos/${recintoId}`)
  redirect(`/painel/patrimonio/recintos/${recintoId}?salvo=1`)
}

// ── Notas fiscais ────────────────────────────────────────────────────────────

function lerDadosNota(formData: FormData) {
  return {
    numero_nota: texto(formData, "numero_nota") || null,
    entrada: texto(formData, "entrada") !== "saida", // default = entrada
    data_emissao: dataISO(texto(formData, "data_emissao")),
    fornecedor_id: texto(formData, "fornecedor_id") || null,
    // arquivo_nota é gerido pelo upload (gravarArquivoNota) — não sobrescrever aqui.
  }
}

export async function criarNotaAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("patrimonio_geral")
  const dados = lerDadosNota(formData)
  if (!dados.numero_nota) return { erro: "Informe o número da nota." }
  const { arquivo, erro: erroArq } = lerArquivo(formData, "arquivo_nota_file")
  if (erroArq) return { erro: erroArq }

  const { id, erro } = await criarNota(dados)
  if (erro) return { erro }
  if (arquivo && id) {
    const { erro: erroUp } = await gravarArquivoNota(id, arquivo)
    if (erroUp) return { erro: erroUp }
  }
  revalidatePath("/painel/patrimonio/notas")
  redirect(`/painel/patrimonio/notas/${id}?salvo=1`)
}

export async function atualizarNotaAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("patrimonio_geral")
  const id = texto(formData, "nota_id")
  if (!id) return { erro: "Nota inválida." }
  const dados = lerDadosNota(formData)
  if (!dados.numero_nota) return { erro: "Informe o número da nota." }
  const { arquivo, erro: erroArq } = lerArquivo(formData, "arquivo_nota_file")
  if (erroArq) return { erro: erroArq }

  const { erro } = await atualizarNota(id, dados)
  if (erro) return { erro }
  if (arquivo) {
    const { erro: erroUp } = await gravarArquivoNota(id, arquivo)
    if (erroUp) return { erro: erroUp }
  }
  revalidatePath(`/painel/patrimonio/notas/${id}`)
  revalidatePath("/painel/patrimonio/notas")
  redirect(`/painel/patrimonio/notas/${id}?salvo=1`)
}

export async function alternarAtivoItemAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("patrimonio_geral")
  const id = texto(formData, "item_id")
  const ativo = texto(formData, "ativo") === "1"
  if (!id) return { erro: "Item inválido." }
  const { erro } = await atualizarItem(id, { ativo })
  if (erro) return { erro }
  revalidatePath(`/painel/patrimonio/${id}`)
  revalidatePath("/painel/patrimonio/itens")
  redirect(`/painel/patrimonio/${id}?salvo=1`)
}
