"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requireSessaoPainel } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { quadroParaDiaria } from "@/lib/db/diarias-diretoria"
import {
  cancelarMinhaViagem,
  criarViagem,
  lerEventoDoForm,
  lerItensDoForm,
} from "@/lib/db/viagens"
import { avisarEquipeNovaViagem } from "@/lib/db/viagens-atendimento"

function revalidar() {
  revalidatePath("/painel/perfil/viagens")
  revalidatePath("/painel/institucional/viagens", "layout")
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
  const evento = lerEventoDoForm(formData)
  if (formData.get("evento_id") === "__externo" && !evento.eventoExterno) {
    return { erro: "Informe o nome do evento externo." }
  }

  const { erro, id } = await criarViagem({
    beneficiarioTipo: quadro.quadro,
    beneficiarioUsuarioId: usuarioId,
    solicitanteId: usuarioId,
    departamentoId:
      String(formData.get("departamento_id") ?? "").trim() || quadro.departamentoId,
    ...evento,
    motivo,
    itens: lidos.itens,
  })
  if (erro || !id) return { erro: erro ?? "Não foi possível registrar a viagem." }

  // Aviso à equipe (Configurações): falha de e-mail não desfaz o pedido.
  await avisarEquipeNovaViagem(id).catch((e) => console.error("Aviso de viagem nova:", e))
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
