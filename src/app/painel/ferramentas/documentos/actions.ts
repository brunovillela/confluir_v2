"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import {
  atualizarCategoriaDocumento,
  atualizarDocumento,
  criarCategoriaDocumento,
  criarDocumento,
  criarVersaoDocumento,
  excluirCategoriaDocumento,
  excluirDocumento,
  excluirVersaoDocumento,
  subirPdfDocumento,
} from "@/lib/db/documentos"

const PERMISSAO = "ferramentas_documentos"

function texto(formData: FormData, campo: string): string {
  return String(formData.get(campo) ?? "").trim()
}

function ouNull(v: string): string | null {
  return v || null
}

function revalidar(id?: string) {
  revalidatePath("/painel/ferramentas/documentos")
  revalidatePath("/painel/ferramentas/documentos/categorias")
  if (id) revalidatePath(`/painel/ferramentas/documentos/${id}`)
}

// ── Documento ────────────────────────────────────────────────────────────────

export async function criarDocumentoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao(PERMISSAO)
  const categoriaIds = formData.getAll("categoria_id").map(String)
  const { id, erro } = await criarDocumento({
    documento: ouNull(texto(formData, "documento")),
    categoriaIds,
  })
  if (erro || !id) return { erro: erro ?? "Falha ao criar." }

  // Primeira versão é opcional: só grava se um PDF foi enviado.
  const arquivo = formData.get("arquivo")
  if (arquivo instanceof File && arquivo.size > 0) {
    const { caminho, erro: erroUp } = await subirPdfDocumento(id, arquivo)
    if (erroUp) {
      // Documento já criado; leva ao detalhe com o aviso do arquivo.
      revalidar(id)
      redirect(`/painel/ferramentas/documentos/${id}?erroArquivo=1`)
    }
    if (caminho) {
      await criarVersaoDocumento(id, {
        nome: ouNull(texto(formData, "versao_nome")),
        arquivo_url: caminho,
        vigencia_inicio: ouNull(texto(formData, "vigencia_inicio")),
        vigencia_termino: ouNull(texto(formData, "vigencia_termino")),
        sem_vigencia: texto(formData, "sem_vigencia") === "on",
      })
    }
  }

  revalidar(id)
  redirect(`/painel/ferramentas/documentos/${id}?salvo=1`)
}

export async function atualizarDocumentoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao(PERMISSAO)
  const id = texto(formData, "documento_id")
  if (!id) return { erro: "Documento inválido." }
  const { erro } = await atualizarDocumento(id, {
    documento: ouNull(texto(formData, "documento")),
    categoriaIds: formData.getAll("categoria_id").map(String),
  })
  if (erro) return { erro }
  revalidar(id)
  redirect(`/painel/ferramentas/documentos/${id}?salvo=1`)
}

export async function excluirDocumentoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao(PERMISSAO)
  const id = texto(formData, "documento_id")
  if (!id) return { erro: "Documento inválido." }
  const { erro } = await excluirDocumento(id)
  if (erro) return { erro }
  revalidar()
  redirect("/painel/ferramentas/documentos?excluido=1")
}

// ── Versão ───────────────────────────────────────────────────────────────────

export async function criarVersaoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao(PERMISSAO)
  const documentoId = texto(formData, "documento_id")
  if (!documentoId) return { erro: "Documento inválido." }
  const arquivo = formData.get("arquivo")
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { erro: "Escolha o PDF da nova versão." }
  }
  const { caminho, erro: erroUp } = await subirPdfDocumento(documentoId, arquivo)
  if (erroUp || !caminho) return { erro: erroUp ?? "Falha no upload." }

  const { erro } = await criarVersaoDocumento(documentoId, {
    nome: ouNull(texto(formData, "versao_nome")),
    arquivo_url: caminho,
    vigencia_inicio: ouNull(texto(formData, "vigencia_inicio")),
    vigencia_termino: ouNull(texto(formData, "vigencia_termino")),
    sem_vigencia: texto(formData, "sem_vigencia") === "on",
  })
  if (erro) return { erro }
  revalidar(documentoId)
  redirect(`/painel/ferramentas/documentos/${documentoId}?salvo=1`)
}

export async function excluirVersaoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao(PERMISSAO)
  const versaoId = texto(formData, "versao_id")
  const documentoId = texto(formData, "documento_id")
  if (!versaoId) return { erro: "Versão inválida." }
  const { erro } = await excluirVersaoDocumento(versaoId)
  if (erro) return { erro }
  revalidar(documentoId)
  redirect(`/painel/ferramentas/documentos/${documentoId}?salvo=1`)
}

// ── Categorias ───────────────────────────────────────────────────────────────

export async function criarCategoriaAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao(PERMISSAO)
  const { erro } = await criarCategoriaDocumento(texto(formData, "nome"))
  if (erro) return { erro }
  revalidar()
  return { ok: "Categoria criada." }
}

export async function atualizarCategoriaAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao(PERMISSAO)
  const id = texto(formData, "categoria_id")
  if (!id) return { erro: "Categoria inválida." }
  const { erro } = await atualizarCategoriaDocumento(id, texto(formData, "nome"))
  if (erro) return { erro }
  revalidar()
  return { ok: "Categoria atualizada." }
}

export async function excluirCategoriaAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao(PERMISSAO)
  const id = texto(formData, "categoria_id")
  if (!id) return { erro: "Categoria inválida." }
  const { erro } = await excluirCategoriaDocumento(id)
  if (erro) return { erro }
  revalidar()
  return { ok: "Categoria excluída." }
}
