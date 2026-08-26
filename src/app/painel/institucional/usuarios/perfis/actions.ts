"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import {
  excluirPerfil,
  salvarChavesPerfil,
  salvarPerfil,
} from "@/lib/db/perfis"

const CHAVE = "permissoes"
const ALT = ["configuracoes"]
const BASE = "/painel/institucional/usuarios/perfis"

function texto(formData: FormData, campo: string): string {
  return String(formData.get(campo) ?? "").trim()
}

export async function salvarPerfilAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao(CHAVE, ALT)
  const id = texto(formData, "perfil_id") || undefined
  const alcadaTxt = texto(formData, "alcada_aprovacao")
  const alcada = alcadaTxt ? Number(alcadaTxt.replace(",", ".")) : null

  const r = await salvarPerfil({
    id,
    nome: texto(formData, "nome"),
    descricao: texto(formData, "descricao") || null,
    alcadaAprovacao: alcada !== null && Number.isFinite(alcada) ? alcada : null,
    ativo: formData.get("ativo") === "1",
    padraoOnboarding: formData.get("padrao_onboarding") === "1",
  })
  if ("erro" in r) return { erro: r.erro }

  revalidatePath(BASE)
  if (!id) redirect(`${BASE}/${r.id}`)
  revalidatePath(`${BASE}/${id}`)
  return { ok: "Perfil salvo." }
}

export async function salvarChavesPerfilAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao(CHAVE, ALT)
  const perfilId = texto(formData, "perfil_id")
  if (!perfilId) return { erro: "Perfil inválido." }

  const chaves = formData.getAll("chave").map((v) => String(v)).filter(Boolean)
  const r = await salvarChavesPerfil(perfilId, chaves)
  if ("erro" in r) return { erro: r.erro }
  revalidatePath(`${BASE}/${perfilId}`)
  return { ok: "Permissões do perfil salvas." }
}

export async function excluirPerfilAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao(CHAVE, ALT)
  const perfilId = texto(formData, "perfil_id")
  if (!perfilId) return { erro: "Perfil inválido." }
  const r = await excluirPerfil(perfilId)
  if ("erro" in r) return { erro: r.erro }
  revalidatePath(BASE)
  redirect(BASE)
}
