"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import {
  atualizarAso,
  criarAso,
  excluirAso,
  TIPOS_ASO,
} from "@/lib/db/pessoal-saude"
import { createAdminClient } from "@/lib/supabase/admin"

async function exigirAcesso() {
  // Chave dedicada do Bubble libera a seção sem a gestão completa.
  await requirePermissao("pessoal_gestao", ["pessoal_aso"])
}

function revalidar(funcionarioId?: string | null) {
  revalidatePath("/painel/pessoal/aso")
  revalidatePath("/painel/perfil/contracheques")
  if (funcionarioId) revalidatePath(`/painel/pessoal/${funcionarioId}`)
}

/** Upload opcional ao bucket 'pessoal' (PDF/JPG/PNG/WebP, ≤5MB). */
async function subirArquivo(
  formData: FormData,
  funcionarioId: string
): Promise<{ caminho: string | null } | { erro: string }> {
  const arquivo = formData.get("arquivo")
  if (!(arquivo instanceof File) || arquivo.size === 0) return { caminho: null }

  const tipos: Record<string, string> = {
    "application/pdf": "pdf",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  }
  const ext = tipos[arquivo.type]
  if (!ext) return { erro: "Envie PDF, JPG, PNG ou WebP." }
  if (arquivo.size > 5 * 1024 * 1024) {
    return { erro: "O arquivo deve ter no máximo 5 MB." }
  }

  const caminho = `aso/${funcionarioId}-${Date.now()}.${ext}`
  const admin = await createAdminClient()
  const { error } = await admin.storage
    .from("pessoal")
    .upload(caminho, arquivo, { contentType: arquivo.type })
  if (error) return { erro: `Falha ao subir o arquivo: ${error.message}` }
  return { caminho }
}

function lerCampos(formData: FormData) {
  const funcionario_id = String(formData.get("funcionario_id") ?? "")
  const data = String(formData.get("data") ?? "")
  const tipo = String(formData.get("tipo") ?? "")
  const vencimento = String(formData.get("vencimento") ?? "")

  if (!funcionario_id) return { erro: "Escolha o funcionário." }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    return { erro: "Informe a data do ASO." }
  }
  if (!(TIPOS_ASO as readonly string[]).includes(tipo)) {
    return { erro: "Escolha o tipo do ASO." }
  }
  if (vencimento && vencimento < data) {
    return { erro: "O vencimento não pode ser antes da data do exame." }
  }
  return {
    funcionario_id,
    data,
    tipo,
    vencimento: vencimento || null,
    realizado: formData.get("realizado") === "on",
    enviado: formData.get("enviado") === "on",
  }
}

export async function criarAsoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await exigirAcesso()

  const dados = lerCampos(formData)
  if ("erro" in dados) return dados

  const arquivo = await subirArquivo(formData, dados.funcionario_id)
  if ("erro" in arquivo) return arquivo

  const { erro } = await criarAso({ ...dados, arquivo: arquivo.caminho })
  if (erro) return { erro }

  revalidar(dados.funcionario_id)
  redirect("/painel/pessoal/aso?salvo=1")
}

export async function atualizarAsoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await exigirAcesso()

  const id = String(formData.get("id") ?? "")
  if (!id) return { erro: "ASO inválido." }

  const dados = lerCampos(formData)
  if ("erro" in dados) return dados

  const arquivo = await subirArquivo(formData, dados.funcionario_id)
  if ("erro" in arquivo) return arquivo

  const { erro } = await atualizarAso(id, { ...dados, arquivo: arquivo.caminho })
  if (erro) return { erro }

  revalidar(dados.funcionario_id)
  redirect("/painel/pessoal/aso?salvo=1")
}

export async function excluirAsoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await exigirAcesso()

  const id = String(formData.get("id") ?? "")
  if (!id) return { erro: "ASO inválido." }

  const { erro } = await excluirAso(id)
  if (erro) return { erro }

  revalidar()
  return { ok: "ASO excluído." }
}
