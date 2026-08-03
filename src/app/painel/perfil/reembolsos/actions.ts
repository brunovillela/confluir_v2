"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requireSessaoPainel } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { cancelarReembolso, criarReembolso } from "@/lib/db/reembolsos"
import { createAdminClient } from "@/lib/supabase/admin"

function revalidar() {
  revalidatePath("/painel/perfil/reembolsos")
  revalidatePath("/painel/pessoal/reembolsos")
}

/** Comprovante obrigatório (PDF/JPG/PNG/WebP ≤5MB, bucket 'pessoal'). */
async function subirComprovante(
  formData: FormData,
  funcionarioId: string
): Promise<{ caminho: string } | { erro: string }> {
  const arquivo = formData.get("comprovante")
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { erro: "Anexe o comprovante da despesa (nota fiscal/recibo)." }
  }
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
  const caminho = `reembolsos/${funcionarioId}-${Date.now()}.${ext}`
  const admin = await createAdminClient()
  const { error } = await admin.storage
    .from("pessoal")
    .upload(caminho, arquivo, { contentType: arquivo.type })
  if (error) return { erro: `Falha ao subir o comprovante: ${error.message}` }
  return { caminho }
}

export async function solicitarReembolso(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await requireSessaoPainel()

  const tipoId = String(formData.get("tipo_id") ?? "")
  const valorBruto = String(formData.get("valor_solicitado") ?? "")
    .trim()
    .replace(/\./g, "")
    .replace(",", ".")
  const descricao = String(formData.get("descricao") ?? "").trim()

  if (!tipoId) return { erro: "Escolha o tipo de reembolso." }
  const valor = Number(valorBruto)
  if (!valorBruto || Number.isNaN(valor) || valor <= 0) {
    return { erro: "Informe o valor da despesa (ex.: 350,00)." }
  }
  if (!descricao) {
    return { erro: "Descreva a despesa (ex.: mensalidade da creche de junho)." }
  }

  const comprovante = await subirComprovante(
    formData,
    sessao.usuario.id as string
  )
  if ("erro" in comprovante) return comprovante

  const { erro } = await criarReembolso({
    funcionario_id: sessao.usuario.id as string,
    tipo_id: tipoId,
    valor_solicitado: valor,
    descricao,
    comprovante_url: comprovante.caminho,
  })
  if (erro) return { erro }

  revalidar()
  redirect("/painel/perfil/reembolsos?salvo=1")
}

export async function cancelarMeuReembolso(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await requireSessaoPainel()

  const id = String(formData.get("id") ?? "")
  if (!id) return { erro: "Solicitação inválida." }

  const { erro } = await cancelarReembolso(id, sessao.usuario.id as string)
  if (erro) return { erro }

  revalidar()
  return { ok: "Solicitação cancelada." }
}
