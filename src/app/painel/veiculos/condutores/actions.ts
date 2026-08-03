"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import {
  definirAutorizacaoCondutor,
  salvarCondutor,
  subirArquivoVeiculos,
} from "@/lib/db/veiculos"
import { CATEGORIAS_CNH } from "@/lib/veiculos-constantes"

function texto(formData: FormData, campo: string): string {
  return String(formData.get(campo) ?? "").trim()
}

function dataISO(valor: string): string | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(valor) ? valor : null
}

export async function salvarCondutorAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("veiculos_gestao")
  const usuarioId = texto(formData, "usuario_id")
  if (!usuarioId) return { erro: "Escolha o usuário." }
  const categoriaBruta = texto(formData, "cnh_categoria")
  const categoria = (CATEGORIAS_CNH as readonly string[]).includes(
    categoriaBruta
  )
    ? categoriaBruta
    : null

  let arquivoUrl: string | null = null
  const arquivo = formData.get("cnh_arquivo")
  if (arquivo instanceof File && arquivo.size > 0) {
    const { caminho, erro } = await subirArquivoVeiculos(
      `cnh/${usuarioId}`,
      arquivo
    )
    if (erro) return { erro }
    arquivoUrl = caminho ?? null
  }

  const { erro } = await salvarCondutor({
    usuario_id: usuarioId,
    cnh_numero: texto(formData, "cnh_numero") || null,
    cnh_categoria: categoria,
    cnh_validade: dataISO(texto(formData, "cnh_validade")),
    cnh_arquivo_url: arquivoUrl,
    observacao: texto(formData, "observacao") || null,
  })
  if (erro) return { erro }
  revalidatePath("/painel/veiculos/condutores")
  revalidatePath("/painel/veiculos")
  redirect("/painel/veiculos/condutores?salvo=1")
}

export async function definirAutorizacaoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await requirePermissao("veiculos_gestao")
  const condutorId = texto(formData, "condutor_id")
  const autorizado = texto(formData, "autorizado") === "1"
  if (!condutorId) return { erro: "Condutor inválido." }
  const { erro } = await definirAutorizacaoCondutor(
    condutorId,
    autorizado,
    sessao.usuario.id
  )
  if (erro) return { erro }
  revalidatePath("/painel/veiculos/condutores")
  revalidatePath("/painel/veiculos")
  redirect("/painel/veiculos/condutores?salvo=1")
}
