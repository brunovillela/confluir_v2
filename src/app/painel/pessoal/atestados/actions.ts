"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import {
  atualizarAtestado,
  atualizarAusencia,
  criarAtestado,
  criarAusencia,
  excluirAtestado,
  excluirAusencia,
} from "@/lib/db/pessoal-saude"
import { createAdminClient } from "@/lib/supabase/admin"

async function exigirAcesso() {
  // Sem chave dedicada no Bubble para atestados/ausências — só a gestão.
  await requirePermissao("pessoal_gestao")
}

function revalidar(funcionarioId?: string | null) {
  revalidatePath("/painel/pessoal/atestados")
  if (funcionarioId) revalidatePath(`/painel/pessoal/${funcionarioId}`)
}

/** Upload opcional ao bucket 'pessoal' (PDF/JPG/PNG/WebP, ≤5MB). */
async function subirArquivo(
  formData: FormData,
  pasta: string,
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

  const caminho = `${pasta}/${funcionarioId}-${Date.now()}.${ext}`
  const admin = await createAdminClient()
  const { error } = await admin.storage
    .from("pessoal")
    .upload(caminho, arquivo, { contentType: arquivo.type })
  if (error) return { erro: `Falha ao subir o arquivo: ${error.message}` }
  return { caminho }
}

// ── Atestados ──────────────────────────────────────────────────────────────

function lerCamposAtestado(formData: FormData) {
  const funcionario_id = String(formData.get("funcionario_id") ?? "")
  const inicio = String(formData.get("inicio") ?? "")
  const termino = String(formData.get("termino") ?? "")
  const diasBruto = String(formData.get("quantidade_dias") ?? "").trim()
  const acompanhamento = formData.get("atestado_acompanhamento") === "on"

  if (!funcionario_id) return { erro: "Escolha o funcionário." }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio)) {
    return { erro: "Informe a data de início do atestado." }
  }
  if (termino && termino < inicio) {
    return { erro: "O término não pode ser antes do início." }
  }
  const quantidade_dias = diasBruto ? Number(diasBruto) : null
  if (diasBruto && (!Number.isInteger(quantidade_dias) || quantidade_dias! <= 0)) {
    return { erro: "Quantidade de dias deve ser um número inteiro." }
  }
  return {
    funcionario_id,
    inicio,
    termino: termino || null,
    quantidade_dias,
    cid10: String(formData.get("cid10") ?? "").trim() || null,
    consideracao: String(formData.get("consideracao") ?? "").trim() || null,
    atestado_acompanhamento: acompanhamento,
    nome_acompanhado: acompanhamento
      ? String(formData.get("nome_acompanhado") ?? "").trim() || null
      : null,
    filho_menor_6_anos:
      acompanhamento && formData.get("filho_menor_6_anos") === "on",
  }
}

export async function criarAtestadoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await exigirAcesso()

  const dados = lerCamposAtestado(formData)
  if ("erro" in dados) return dados

  const arquivo = await subirArquivo(formData, "atestados", dados.funcionario_id)
  if ("erro" in arquivo) return arquivo

  const { erro } = await criarAtestado({ ...dados, arquivo: arquivo.caminho })
  if (erro) return { erro }

  revalidar(dados.funcionario_id)
  redirect("/painel/pessoal/atestados?salvo=1")
}

export async function atualizarAtestadoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await exigirAcesso()

  const id = String(formData.get("id") ?? "")
  if (!id) return { erro: "Atestado inválido." }

  const dados = lerCamposAtestado(formData)
  if ("erro" in dados) return dados

  const arquivo = await subirArquivo(formData, "atestados", dados.funcionario_id)
  if ("erro" in arquivo) return arquivo

  const { erro } = await atualizarAtestado(id, {
    ...dados,
    arquivo: arquivo.caminho,
  })
  if (erro) return { erro }

  revalidar(dados.funcionario_id)
  redirect("/painel/pessoal/atestados?salvo=1")
}

export async function excluirAtestadoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await exigirAcesso()

  const id = String(formData.get("id") ?? "")
  if (!id) return { erro: "Atestado inválido." }

  const { erro } = await excluirAtestado(id)
  if (erro) return { erro }

  revalidar()
  return { ok: "Atestado excluído." }
}

// ── Ausências ──────────────────────────────────────────────────────────────

function lerCamposAusencia(formData: FormData) {
  const funcionario_id = String(formData.get("funcionario_id") ?? "")
  const inicio = String(formData.get("inicio") ?? "")
  const termino = String(formData.get("termino") ?? "")
  if (!funcionario_id) return { erro: "Escolha o funcionário." }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio)) {
    return { erro: "Informe a data de início da ausência." }
  }
  if (termino && termino < inicio) {
    return { erro: "O término não pode ser antes do início." }
  }
  return {
    funcionario_id,
    inicio,
    termino: termino || null,
    motivo: String(formData.get("motivo") ?? "").trim() || null,
  }
}

export async function criarAusenciaAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await exigirAcesso()

  const dados = lerCamposAusencia(formData)
  if ("erro" in dados) return dados

  const { erro } = await criarAusencia(dados)
  if (erro) return { erro }

  revalidar(dados.funcionario_id)
  redirect("/painel/pessoal/atestados?aba=ausencias&salvo=1")
}

export async function atualizarAusenciaAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await exigirAcesso()

  const id = String(formData.get("id") ?? "")
  if (!id) return { erro: "Ausência inválida." }

  const dados = lerCamposAusencia(formData)
  if ("erro" in dados) return dados

  const { erro } = await atualizarAusencia(id, dados)
  if (erro) return { erro }

  revalidar(dados.funcionario_id)
  redirect("/painel/pessoal/atestados?aba=ausencias&salvo=1")
}

export async function excluirAusenciaAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await exigirAcesso()

  const id = String(formData.get("id") ?? "")
  if (!id) return { erro: "Ausência inválida." }

  const { erro } = await excluirAusencia(id)
  if (erro) return { erro }

  revalidar()
  return { ok: "Ausência excluída." }
}
