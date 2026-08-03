"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import {
  atenderAgendamento,
  cancelarAgendamento,
  criarAgendamento,
  negarAgendamento,
  registrarDevolucao,
  registrarRetirada,
} from "@/lib/db/veiculos"
import { parseValorBR } from "@/lib/valores"

function texto(formData: FormData, campo: string): string {
  return String(formData.get(campo) ?? "").trim()
}

function dataISO(valor: string): string | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(valor) ? valor : null
}

function revalidar() {
  revalidatePath("/painel/veiculos/agendamentos")
  revalidatePath("/painel/veiculos")
}

export async function solicitarVeiculoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await requirePermissao("veiculos", ["veiculos_gestao"])
  const motivo = texto(formData, "motivo")
  const destino = texto(formData, "destino")
  const dataRetirada = dataISO(texto(formData, "data_retirada"))
  const sede = texto(formData, "sede")
  if (!motivo) return { erro: "Informe o motivo." }
  if (!destino) return { erro: "Informe o destino." }
  if (!dataRetirada) return { erro: "Informe a data de retirada." }
  if (!sede) return { erro: "Informe a sede de retirada." }

  const { erro } = await criarAgendamento({
    condutor_usuario_id: sessao.usuario.id,
    motivo,
    destino,
    data_retirada: dataRetirada,
    data_retorno: dataISO(texto(formData, "data_retorno")),
    sede_retirada: sede,
  })
  if (erro) return { erro }
  revalidar()
  redirect("/painel/veiculos/agendamentos?salvo=1")
}

export async function cancelarAgendamentoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await requirePermissao("veiculos", ["veiculos_gestao"])
  const id = texto(formData, "agendamento_id")
  if (!id) return { erro: "Solicitação inválida." }
  const { erro } = await cancelarAgendamento(id, sessao.usuario.id)
  if (erro) return { erro }
  revalidar()
  redirect("/painel/veiculos/agendamentos?salvo=1")
}

export async function atenderAgendamentoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await requirePermissao("veiculos_gestao")
  const id = texto(formData, "agendamento_id")
  const veiculoId = texto(formData, "veiculo_id")
  if (!id) return { erro: "Solicitação inválida." }
  if (!veiculoId) return { erro: "Escolha o veículo." }
  const { erro } = await atenderAgendamento(id, veiculoId, sessao.usuario.id)
  if (erro) return { erro }
  revalidar()
  redirect("/painel/veiculos/agendamentos?salvo=1")
}

export async function negarAgendamentoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await requirePermissao("veiculos_gestao")
  const id = texto(formData, "agendamento_id")
  const motivo = texto(formData, "motivo")
  if (!id) return { erro: "Solicitação inválida." }
  if (!motivo) return { erro: "Informe o motivo da negativa." }
  const { erro } = await negarAgendamento(id, sessao.usuario.id, motivo)
  if (erro) return { erro }
  revalidar()
  redirect("/painel/veiculos/agendamentos?salvo=1")
}

export async function registrarRetiradaAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await requirePermissao("veiculos_gestao")
  const veiculoId = texto(formData, "veiculo_id")
  const condutorId = texto(formData, "condutor_usuario_id")
  const hodometro = parseValorBR(texto(formData, "hodometro"))
  const sede = texto(formData, "sede")
  if (!veiculoId) return { erro: "Escolha o veículo." }
  if (!condutorId) return { erro: "Escolha o condutor." }
  if (hodometro === null || hodometro < 0) {
    return { erro: "Informe o hodômetro da retirada." }
  }
  if (!sede) return { erro: "Informe a sede de retirada." }

  const { erro } = await registrarRetirada({
    agendamento_id: texto(formData, "agendamento_id") || null,
    veiculo_id: veiculoId,
    condutor_usuario_id: condutorId,
    hodometro,
    sede,
    motivo: texto(formData, "motivo") || null,
    destino: texto(formData, "destino") || null,
    registrado_por_id: sessao.usuario.id,
  })
  if (erro) return { erro }
  revalidar()
  redirect("/painel/veiculos/agendamentos?salvo=1")
}

export async function registrarDevolucaoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("veiculos_gestao")
  const movimentacaoId = texto(formData, "movimentacao_id")
  const hodometro = parseValorBR(texto(formData, "hodometro"))
  const sede = texto(formData, "sede")
  if (!movimentacaoId) return { erro: "Movimentação inválida." }
  if (hodometro === null || hodometro < 0) {
    return { erro: "Informe o hodômetro da devolução." }
  }
  if (!sede) return { erro: "Informe a sede de devolução." }

  const { erro } = await registrarDevolucao({
    movimentacao_id: movimentacaoId,
    hodometro,
    sede,
    observacao: texto(formData, "observacao") || null,
  })
  if (erro) return { erro }
  revalidar()
  redirect("/painel/veiculos/agendamentos?salvo=1")
}
