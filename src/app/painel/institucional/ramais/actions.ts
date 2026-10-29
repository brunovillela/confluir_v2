"use server"

import { revalidatePath } from "next/cache"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { atualizarRamal, criarRamal, excluirRamal, type DadosRamal } from "@/lib/db/ramais"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const campo = (f: FormData, c: string) => String(f.get(c) ?? "").trim() || null

function dadosDe(f: FormData): DadosRamal {
  const usuarioId = campo(f, "usuario_id")
  return {
    ramal: campo(f, "ramal"),
    telefoneDireto: campo(f, "telefone_direto"),
    local: campo(f, "local"),
    usuarioId: usuarioId && UUID.test(usuarioId) ? usuarioId : null,
    observacao: campo(f, "observacao"),
  }
}

/** Mesma permissão das Linhas institucionais. */
async function requireRamais() {
  return requirePermissao("ferramentas_linhas_telefone", ["configuracoes"])
}

function revalidar() {
  revalidatePath("/painel/institucional/ramais")
  revalidatePath("/painel/perfil")
}

export async function criarRamalAction(_prev: EstadoForm, formData: FormData): Promise<EstadoForm> {
  await requireRamais()
  const { erro } = await criarRamal(dadosDe(formData))
  if (erro) return { erro }
  revalidar()
  return { ok: "Ramal cadastrado." }
}

export async function atualizarRamalAction(_prev: EstadoForm, formData: FormData): Promise<EstadoForm> {
  await requireRamais()
  const id = String(formData.get("id") ?? "")
  if (!UUID.test(id)) return { erro: "Registro inválido." }
  const { erro } = await atualizarRamal(id, dadosDe(formData))
  if (erro) return { erro }
  revalidar()
  return { ok: "Alterações salvas." }
}

export async function excluirRamalAction(_prev: EstadoForm, formData: FormData): Promise<EstadoForm> {
  await requireRamais()
  const id = String(formData.get("id") ?? "")
  if (!UUID.test(id)) return { erro: "Registro inválido." }
  const { erro } = await excluirRamal(id)
  if (erro) return { erro }
  revalidar()
  return { ok: "Ramal removido." }
}
