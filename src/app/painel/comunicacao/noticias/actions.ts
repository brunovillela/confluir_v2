"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import {
  atualizarNoticia,
  criarNoticia,
  excluirNoticia,
} from "@/lib/db/noticias"

function texto(formData: FormData, campo: string): string {
  return String(formData.get(campo) ?? "").trim()
}

function ouNull(v: string): string | null {
  return v || null
}

function arquivo(formData: FormData): File | null {
  const f = formData.get("imagem")
  return f instanceof File && f.size > 0 ? f : null
}

async function requireNoticias() {
  return requirePermissao("noticias")
}

function revalidar(id?: string) {
  revalidatePath("/painel/comunicacao/noticias")
  revalidatePath("/painel") // widget do dashboard
  if (id) revalidatePath(`/painel/comunicacao/noticias/${id}`)
}

export async function criarNoticiaAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requireNoticias()
  const { id, erro } = await criarNoticia({
    manchete: texto(formData, "manchete"),
    noticia: ouNull(texto(formData, "noticia")),
    imagemArquivo: arquivo(formData),
  })
  if (erro || !id) return { erro: erro ?? "Falha ao publicar." }
  revalidar(id)
  redirect(`/painel/comunicacao/noticias/${id}?salvo=1`)
}

export async function atualizarNoticiaAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requireNoticias()
  const id = texto(formData, "id")
  if (!id) return { erro: "Notícia inválida." }
  const { erro } = await atualizarNoticia(id, {
    manchete: texto(formData, "manchete"),
    noticia: ouNull(texto(formData, "noticia")),
    imagemArquivo: arquivo(formData),
  })
  if (erro) return { erro }
  revalidar(id)
  redirect(`/painel/comunicacao/noticias/${id}?salvo=1`)
}

export async function excluirNoticiaAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requireNoticias()
  const id = texto(formData, "id")
  if (!id) return { erro: "Notícia inválida." }
  const { erro } = await excluirNoticia(id)
  if (erro) return { erro }
  revalidar()
  redirect("/painel/comunicacao/noticias?excluido=1")
}
