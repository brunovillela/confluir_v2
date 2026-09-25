"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requireSessaoPainel } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { quadroParaDiaria } from "@/lib/db/diarias-diretoria"
import { cancelarMinhaViagem, criarViagem, lerItensDoForm } from "@/lib/db/viagens"

function revalidar() {
  revalidatePath("/painel/perfil/viagens")
  revalidatePath("/painel/viagens")
}

export async function solicitarViagem(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await requireSessaoPainel()
  const usuarioId = sessao.usuario.id as string
  // Mesma régua das diárias: funcionário com vínculo em vigor ou diretor em
  // exercício. Convidado não tem conta — a equipe de viagens pede por ele.
  const quadro = await quadroParaDiaria(usuarioId)
  if (!quadro) {
    return {
      erro: "Só funcionários com vínculo em vigor ou diretores em exercício fazem este pedido.",
    }
  }

  const motivo = String(formData.get("motivo") ?? "").trim()
  if (!motivo) return { erro: "Descreva o motivo da viagem." }
  const lidos = lerItensDoForm(formData)
  if ("erro" in lidos) return { erro: lidos.erro }

  const { erro, id } = await criarViagem({
    beneficiarioTipo: quadro.quadro,
    beneficiarioUsuarioId: usuarioId,
    solicitanteId: usuarioId,
    departamentoId:
      String(formData.get("departamento_id") ?? "").trim() || quadro.departamentoId,
    eventoId: String(formData.get("evento_id") ?? "").trim() || null,
    motivo,
    itens: lidos.itens,
  })
  if (erro) return { erro }

  revalidar()
  redirect(`/painel/perfil/viagens/${id}?salvo=1`)
}

export async function cancelarViagemAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await requireSessaoPainel()
  const { erro } = await cancelarMinhaViagem(
    String(formData.get("id") ?? ""),
    sessao.usuario.id as string
  )
  if (erro) return { erro }
  revalidar()
  return { ok: "Viagem cancelada." }
}
