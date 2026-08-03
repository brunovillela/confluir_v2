"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { excluirAgendamento, salvarAgendamento } from "@/lib/db/atendimentos"

const PERMISSAO = "saude_atendimento"
const ALTERNATIVAS = ["saude_gestao"]

function texto(formData: FormData, campo: string): string {
  return String(formData.get(campo) ?? "").trim()
}

export async function salvarAgendamentoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao(PERMISSAO, ALTERNATIVAS)

  const inicio = texto(formData, "inicio")
  if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio)) {
    return { erro: "Informe a data do agendamento." }
  }

  const { erro } = await salvarAgendamento(
    {
      assistido_id: texto(formData, "assistido_id"),
      profissional_id: texto(formData, "profissional_id") || null,
      inicio,
      termino: texto(formData, "termino") || null,
      online: formData.get("online") === "on",
    },
    texto(formData, "id") || undefined
  )
  if (erro) return { erro }

  revalidatePath("/painel/saude/agenda")
  redirect("/painel/saude/agenda?salvo=1")
}

export async function excluirAgendamentoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao(PERMISSAO, ALTERNATIVAS)
  const { erro } = await excluirAgendamento(texto(formData, "id"))
  if (erro) return { erro }
  revalidatePath("/painel/saude/agenda")
  redirect("/painel/saude/agenda?excluido=1")
}
