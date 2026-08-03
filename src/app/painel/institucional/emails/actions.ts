"use server"

import { revalidatePath } from "next/cache"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import {
  atualizarEmailInstitucional,
  criarEmailInstitucional,
  excluirEmailInstitucional,
} from "@/lib/db/emails-institucionais"

function texto(formData: FormData, campo: string): string {
  return String(formData.get(campo) ?? "").trim()
}

function ouNull(v: string): string | null {
  return v || null
}

async function requireEmails() {
  return requirePermissao("ferramentas_emails_internos")
}

function revalidar() {
  revalidatePath("/painel/institucional/emails")
}

export async function criarEmailAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requireEmails()
  const { erro } = await criarEmailInstitucional({
    endereco: texto(formData, "endereco"),
    usuarioId: ouNull(texto(formData, "usuario_id")),
  })
  if (erro) return { erro }
  revalidar()
  return { ok: "E-mail cadastrado." }
}

export async function atualizarEmailAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requireEmails()
  const id = texto(formData, "id")
  if (!id) return { erro: "Registro inválido." }
  const { erro } = await atualizarEmailInstitucional(id, {
    endereco: texto(formData, "endereco"),
    usuarioId: ouNull(texto(formData, "usuario_id")),
  })
  if (erro) return { erro }
  revalidar()
  return { ok: "Alterações salvas." }
}

export async function excluirEmailAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requireEmails()
  const id = texto(formData, "id")
  if (!id) return { erro: "Registro inválido." }
  const { erro } = await excluirEmailInstitucional(id)
  if (erro) return { erro }
  revalidar()
  return { ok: "E-mail removido." }
}
