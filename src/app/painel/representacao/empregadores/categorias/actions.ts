"use server"

import { revalidatePath } from "next/cache"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { invalidarCacheCadastrosPendentes } from "@/lib/db/filiacao-cadastros-pendentes"
import {
  atualizarCategoriaFonte,
  criarCategoriaFonte,
  excluirCategoriaFonte,
} from "@/lib/db/fonte-categorias"
import { ehBaseCategoria } from "@/lib/saude-cadastros"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function revalidar() {
  invalidarCacheCadastrosPendentes()
  revalidatePath("/painel/representacao/empregadores", "layout")
  revalidatePath("/painel/filiados", "layout")
}

export async function criarCategoriaAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("empregadores")
  const base = formData.get("base")
  if (!ehBaseCategoria(base)) return { erro: "Escolha as regras que a categoria segue." }
  const { erro } = await criarCategoriaFonte(String(formData.get("nome") ?? ""), base)
  if (erro) return { erro }
  revalidar()
  return { ok: "Categoria criada." }
}

export async function atualizarCategoriaAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("empregadores")
  const id = String(formData.get("id") ?? "")
  const base = formData.get("base")
  if (!UUID.test(id)) return { erro: "Categoria inválida." }
  if (!ehBaseCategoria(base)) return { erro: "Escolha as regras que a categoria segue." }
  const { erro } = await atualizarCategoriaFonte(id, String(formData.get("nome") ?? ""), base)
  if (erro) return { erro }
  revalidar()
  return { ok: "Categoria salva." }
}

export async function excluirCategoriaAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("empregadores")
  const id = String(formData.get("id") ?? "")
  if (!UUID.test(id)) return { erro: "Categoria inválida." }
  const { erro } = await excluirCategoriaFonte(id)
  if (erro) return { erro }
  revalidar()
  return { ok: "Categoria excluída." }
}
