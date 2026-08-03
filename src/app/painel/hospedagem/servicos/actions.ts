"use server"

import { tenantAtual } from "@/lib/tenant"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import {
  definirReservaFinalizada,
  desvincularCupomDaReserva,
  efetivarReserva,
  lerCamposReserva,
  registrarComparecimento,
  vincularCupomAReserva,
} from "@/lib/db/hospedagem"
import { createAdminClient } from "@/lib/supabase/admin"

function revalidarServicos(servicoId?: string) {
  revalidatePath("/painel/hospedagem/servicos")
  if (servicoId) revalidatePath(`/painel/hospedagem/servicos/${servicoId}`)
  revalidatePath("/painel/hospedagem/cupons")
  revalidatePath("/painel/hospedagem")
  revalidatePath("/hotel/inicio")
  if (servicoId) revalidatePath(`/hotel/reservas/${servicoId}`)
}

async function exigirEdicao() {
  await requirePermissao("filiacao_hospedagens_edicao", [
    "filiacao_hospedagens_gestao",
  ])
}

export async function criarServico(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await exigirEdicao()

  const hotelId = String(formData.get("hotel_id") ?? "")
  if (!hotelId) return { erro: "Selecione o hotel." }

  const campos = lerCamposReserva(formData)
  if ("erro" in campos) return campos

  const admin = await createAdminClient()
  const { data: hotel } = await admin
    .from("hospedagem_hotel")
    .select("id")
    .eq("id", hotelId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (!hotel) return { erro: "Hotel não encontrado." }

  const resultado = await efetivarReserva({
    hotelId,
    checkin: campos.checkin,
    checkout: campos.checkout,
    coletivo: campos.coletivo,
    cupomIds: campos.cupons,
  })
  if ("erro" in resultado) return resultado

  revalidarServicos(resultado.id)
  redirect(`/painel/hospedagem/servicos/${resultado.id}?salvo=1`)
}

export async function vincularCupom(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await exigirEdicao()

  const servicoId = String(formData.get("servico_id") ?? "")
  const cupomId = String(formData.get("cupom_id") ?? "")
  if (!servicoId || !cupomId) return { erro: "Selecione o cupom." }

  const resultado = await vincularCupomAReserva(servicoId, cupomId)
  if ("ok" in resultado) revalidarServicos(servicoId)
  return resultado
}

export async function desvincularCupom(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await exigirEdicao()

  const servicoId = String(formData.get("servico_id") ?? "")
  const cupomId = String(formData.get("cupom_id") ?? "")
  if (!servicoId || !cupomId) return { erro: "Cupom inválido." }

  const resultado = await desvincularCupomDaReserva(servicoId, cupomId)
  if ("ok" in resultado) revalidarServicos(servicoId)
  return resultado
}

export async function marcarComparecimento(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await exigirEdicao()

  const servicoId = String(formData.get("servico_id") ?? "")
  const cupomId = String(formData.get("cupom_id") ?? "")
  const compareceu = String(formData.get("compareceu") ?? "") === "true"
  if (!cupomId) return { erro: "Cupom inválido." }

  const resultado = await registrarComparecimento(cupomId, compareceu)
  if ("ok" in resultado) revalidarServicos(servicoId || undefined)
  return resultado
}

export async function definirFinalizado(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await exigirEdicao()

  const servicoId = String(formData.get("servico_id") ?? "")
  const finalizado = String(formData.get("finalizado") ?? "") === "true"
  if (!servicoId) return { erro: "Reserva inválida." }

  const resultado = await definirReservaFinalizada(servicoId, finalizado)
  if ("ok" in resultado) revalidarServicos(servicoId)
  return resultado
}
