"use server"

import { revalidatePath } from "next/cache"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { encerrarApuracao, reabrirApuracao } from "@/lib/db/assembleias"
import { validarEmSeparado } from "@/lib/db/votacao-mesarios"

export async function encerrarApuracaoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("assembleias")
  const id = String(formData.get("assembleia_id") ?? "")
  if (!id) return { erro: "Assembleia inválida." }

  const r = await encerrarApuracao(id)
  if (r.erro) return { erro: r.erro }
  revalidatePath(`/painel/representacao/votacoes/assembleias/${id}`)
  return { ok: "Apuração encerrada. O resultado final ficou disponível, com o hash e a conferência." }
}

export async function reabrirApuracaoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("assembleias")
  const id = String(formData.get("assembleia_id") ?? "")
  if (!id) return { erro: "Assembleia inválida." }
  const motivo = String(formData.get("motivo") ?? "")
  const r = await reabrirApuracao(id, motivo)
  if (r.erro) return { erro: r.erro }
  revalidatePath(`/painel/representacao/votacoes/assembleias/${id}`)
  return { ok: "Apuração reaberta. O motivo e o resultado anterior ficaram no livro da apuração." }
}

export async function validarEmSeparadoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("assembleias")
  const assembleiaId = String(formData.get("assembleia_id") ?? "")
  const id = String(formData.get("em_separado_id") ?? "")
  const status =
    String(formData.get("status") ?? "") === "deferido"
      ? "deferido"
      : "indeferido"
  if (!id) return { erro: "Registro inválido." }
  const r = await validarEmSeparado(id, status)
  if (r.erro) return { erro: r.erro }
  revalidatePath(`/painel/representacao/votacoes/assembleias/${assembleiaId}`)
  return { ok: status === "deferido" ? "Voto deferido." : "Voto indeferido." }
}
