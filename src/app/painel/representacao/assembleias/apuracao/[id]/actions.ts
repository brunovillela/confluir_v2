"use server"

import { revalidatePath } from "next/cache"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { encerrarApuracao, reabrirApuracao } from "@/lib/db/assembleias"
import { validarEmSeparado } from "@/lib/db/votacao-mesarios"

function inteiro(formData: FormData, campo: string): number | null {
  const v = String(formData.get(campo) ?? "").trim()
  if (v === "") return null
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null
}

export async function encerrarApuracaoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("assembleias")
  const id = String(formData.get("assembleia_id") ?? "")
  if (!id) return { erro: "Assembleia inválida." }

  const r = await encerrarApuracao(id, {
    aprovado: inteiro(formData, "aprovado"),
    reprovado: inteiro(formData, "reprovado"),
    em_branco: inteiro(formData, "em_branco"),
    abstencao: inteiro(formData, "abstencao"),
    total_votos: inteiro(formData, "total_votos"),
  })
  if (r.erro) return { erro: r.erro }
  revalidatePath(`/painel/representacao/assembleias/apuracao/${id}`)
  return { ok: "Apuração encerrada. O resultado final ficou disponível." }
}

export async function reabrirApuracaoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("assembleias")
  const id = String(formData.get("assembleia_id") ?? "")
  if (!id) return { erro: "Assembleia inválida." }
  const r = await reabrirApuracao(id)
  if (r.erro) return { erro: r.erro }
  revalidatePath(`/painel/representacao/assembleias/apuracao/${id}`)
  return { ok: "Apuração reaberta." }
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
  revalidatePath(`/painel/representacao/assembleias/apuracao/${assembleiaId}`)
  return { ok: status === "deferido" ? "Voto deferido." : "Voto indeferido." }
}
