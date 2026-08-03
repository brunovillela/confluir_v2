"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import {
  atualizarCampanha,
  criarCampanha,
  criarRodada,
} from "@/lib/db/assembleias"

function texto(formData: FormData, campo: string): string {
  return String(formData.get(campo) ?? "").trim()
}

function dataISO(valor: string): string | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(valor) ? valor : null
}

export async function salvarCampanha(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("assembleias")

  const id = texto(formData, "campanha_id")
  const tema = texto(formData, "tema")
  if (!tema) return { erro: "Informe o tema da campanha." }
  const fonteIds = formData
    .getAll("fonte_id")
    .map(String)
    .filter((f) => f.length > 0)

  if (!id) {
    const { id: novoId, erro } = await criarCampanha({ tema, fonteIds })
    if (erro) return { erro }
    revalidatePath("/painel/representacao/assembleias")
    redirect(`/painel/representacao/assembleias/campanhas/${novoId}?criada=1`)
  }

  const { erro } = await atualizarCampanha(id, {
    tema,
    finalizado: texto(formData, "finalizado") === "on",
    fonteIds,
  })
  if (erro) return { erro }
  revalidatePath("/painel/representacao/assembleias")
  revalidatePath(`/painel/representacao/assembleias/campanhas/${id}`)
  return { ok: "Campanha salva." }
}

export async function novaRodada(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("assembleias")

  const campanhaId = texto(formData, "campanha_id")
  if (!campanhaId) return { erro: "Campanha inválida." }
  const nome = texto(formData, "nome")
  if (!nome) return { erro: "Informe o nome da rodada." }

  const { id, erro } = await criarRodada({
    campanha_id: campanhaId,
    nome,
    descricao: texto(formData, "descricao") || null,
    inicio: dataISO(texto(formData, "inicio")),
    termino: dataISO(texto(formData, "termino")),
  })
  if (erro || !id) return { erro: erro ?? "Falha ao criar a rodada." }
  revalidatePath(`/painel/representacao/assembleias/campanhas/${campanhaId}`)
  redirect(`/painel/representacao/assembleias/rodadas/${id}?criada=1`)
}
