"use server"

import { revalidatePath } from "next/cache"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import {
  atualizarLinhaInstitucional,
  criarLinhaInstitucional,
  excluirLinhaInstitucional,
  type DadosLinha,
} from "@/lib/db/linhas-institucionais"

function texto(formData: FormData, campo: string): string {
  return String(formData.get(campo) ?? "").trim()
}

function ouNull(v: string): string | null {
  return v || null
}

async function requireLinhas() {
  return requirePermissao("ferramentas_linhas_telefone", ["configuracoes"])
}

function dadosDe(formData: FormData): DadosLinha {
  return {
    numero: texto(formData, "numero"),
    operadora: ouNull(texto(formData, "operadora")),
    chip: ouNull(texto(formData, "chip")),
    usuarioId: ouNull(texto(formData, "usuario_id")),
    observacao: ouNull(texto(formData, "observacao")),
  }
}

function revalidar() {
  revalidatePath("/painel/institucional/linhas")
}

export async function criarLinhaAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requireLinhas()
  const { erro } = await criarLinhaInstitucional(dadosDe(formData))
  if (erro) return { erro }
  revalidar()
  return { ok: "Linha cadastrada." }
}

export async function atualizarLinhaAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requireLinhas()
  const id = texto(formData, "id")
  if (!id) return { erro: "Registro inválido." }
  const { erro } = await atualizarLinhaInstitucional(id, dadosDe(formData))
  if (erro) return { erro }
  revalidar()
  return { ok: "Alterações salvas." }
}

export async function excluirLinhaAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requireLinhas()
  const id = texto(formData, "id")
  if (!id) return { erro: "Registro inválido." }
  const { erro } = await excluirLinhaInstitucional(id)
  if (erro) return { erro }
  revalidar()
  return { ok: "Linha removida." }
}
