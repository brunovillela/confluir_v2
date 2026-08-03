"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requireSessaoPainel } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import {
  cancelarSolicitacaoDiaria,
  criarSolicitacaoDiaria,
} from "@/lib/db/diarias"

function revalidar() {
  revalidatePath("/painel/perfil/diarias")
  revalidatePath("/painel/pessoal/diarias")
}

export async function solicitarDiaria(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await requireSessaoPainel()

  const diariaId = String(formData.get("diaria_id") ?? "")
  const quantidadeBruta = String(formData.get("quantidade") ?? "")
    .trim()
    .replace(",", ".")
  const motivo = String(formData.get("motivo") ?? "").trim()
  const dataInicio = String(formData.get("data_inicio") ?? "")
  const dataTermino = String(formData.get("data_termino") ?? "")

  if (!diariaId) return { erro: "Escolha o tipo de diária." }
  const quantidade = Number(quantidadeBruta)
  if (!quantidadeBruta || Number.isNaN(quantidade) || quantidade <= 0) {
    return { erro: "Informe a quantidade de diárias (ex.: 2)." }
  }
  if (!motivo) {
    return { erro: "Descreva o motivo (ex.: viagem ao Rio de Janeiro com pernoite)." }
  }
  if (dataInicio && dataTermino && dataTermino < dataInicio) {
    return { erro: "O término não pode ser antes do início." }
  }

  const { erro } = await criarSolicitacaoDiaria({
    funcionario_id: sessao.usuario.id as string,
    diaria_id: diariaId,
    quantidade,
    motivo,
    data_inicio: dataInicio || null,
    data_termino: dataTermino || null,
  })
  if (erro) return { erro }

  revalidar()
  redirect("/painel/perfil/diarias?salvo=1")
}

export async function cancelarMinhaDiaria(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await requireSessaoPainel()

  const id = String(formData.get("id") ?? "")
  if (!id) return { erro: "Solicitação inválida." }

  const { erro } = await cancelarSolicitacaoDiaria(
    id,
    sessao.usuario.id as string
  )
  if (erro) return { erro }

  revalidar()
  return { ok: "Solicitação cancelada." }
}
