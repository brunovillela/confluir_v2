"use server"

import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { registrarVotoUrna } from "@/lib/db/votacao-portal"

/** Registra o voto de um apto na urna (o mesário é o usuário logado). */
export async function votarNaUrnaAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("assembleias")
  const assembleiaId = String(formData.get("assembleia_id") ?? "")
  const aptoId = String(formData.get("apto_id") ?? "")
  if (!assembleiaId || !aptoId) return { erro: "Dados inválidos." }

  const escolhas: { perguntaId: string; opcaoId: string }[] = []
  for (const [chave, valor] of formData.entries()) {
    if (chave.startsWith("p_") && typeof valor === "string" && valor) {
      escolhas.push({ perguntaId: chave.slice(2), opcaoId: valor })
    }
  }
  const r = await registrarVotoUrna(assembleiaId, aptoId, escolhas)
  if (r.erro) return { erro: r.erro }
  // Volta à lista da urna para o próximo eleitor.
  redirect(`/painel/representacao/assembleias/urna/${assembleiaId}?votou=1`)
}
