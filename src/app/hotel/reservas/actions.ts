"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requireSessaoHotel } from "@/lib/auth"
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

/**
 * Ações da interface do hotel: a sessão define o hotel e TODA operação é
 * restrita a cupons/reservas dele (restringirHotelId nas funções da lib).
 */

function revalidarHotel(servicoId?: string) {
  revalidatePath("/hotel/inicio")
  if (servicoId) revalidatePath(`/hotel/reservas/${servicoId}`)
  revalidatePath("/painel/hospedagem")
  revalidatePath("/painel/hospedagem/cupons")
  revalidatePath("/painel/hospedagem/servicos")
  if (servicoId) revalidatePath(`/painel/hospedagem/servicos/${servicoId}`)
}

export async function criarReservaHotel(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const { hotel } = await requireSessaoHotel()

  const campos = lerCamposReserva(formData)
  if ("erro" in campos) return campos

  // O hotel vem da sessão — o hotel_id do formulário é ignorado.
  const resultado = await efetivarReserva({
    hotelId: hotel.id,
    checkin: campos.checkin,
    checkout: campos.checkout,
    coletivo: campos.coletivo,
    cupomIds: campos.cupons,
  })
  if ("erro" in resultado) return resultado

  revalidarHotel(resultado.id)
  redirect(`/hotel/reservas/${resultado.id}?salvo=1`)
}

export async function vincularCupomHotel(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const { hotel } = await requireSessaoHotel()

  const servicoId = String(formData.get("servico_id") ?? "")
  const cupomId = String(formData.get("cupom_id") ?? "")
  if (!servicoId || !cupomId) return { erro: "Selecione o cupom." }

  const resultado = await vincularCupomAReserva(servicoId, cupomId, hotel.id)
  if ("ok" in resultado) revalidarHotel(servicoId)
  return resultado
}

export async function desvincularCupomHotel(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const { hotel } = await requireSessaoHotel()

  const servicoId = String(formData.get("servico_id") ?? "")
  const cupomId = String(formData.get("cupom_id") ?? "")
  if (!servicoId || !cupomId) return { erro: "Cupom inválido." }

  const resultado = await desvincularCupomDaReserva(servicoId, cupomId, hotel.id)
  if ("ok" in resultado) revalidarHotel(servicoId)
  return resultado
}

export async function marcarComparecimentoHotel(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const { hotel } = await requireSessaoHotel()

  const servicoId = String(formData.get("servico_id") ?? "")
  const cupomId = String(formData.get("cupom_id") ?? "")
  const compareceu = String(formData.get("compareceu") ?? "") === "true"
  if (!cupomId) return { erro: "Cupom inválido." }

  const resultado = await registrarComparecimento(cupomId, compareceu, hotel.id)
  if ("ok" in resultado) revalidarHotel(servicoId || undefined)
  return resultado
}

/**
 * Sobe o relatório/extrato da reserva (documento do hotel assinado pelos
 * hóspedes). Não é obrigatório hoje, mas pode ser exigido para faturar
 * (configuração do hotel no painel).
 */
export async function subirRelatorioHotel(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const { hotel } = await requireSessaoHotel()

  const servicoId = String(formData.get("servico_id") ?? "")
  if (!servicoId) return { erro: "Reserva inválida." }

  const arquivo = formData.get("relatorio")
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { erro: "Selecione o arquivo (PDF ou imagem)." }
  }
  const EXTENSOES: Record<string, string> = {
    "application/pdf": "pdf",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  }
  const extensao = EXTENSOES[arquivo.type]
  if (!extensao) return { erro: "O relatório deve ser PDF, JPG, PNG ou WebP." }
  if (arquivo.size > 5 * 1024 * 1024) {
    return { erro: "O arquivo deve ter no máximo 5 MB." }
  }

  const admin = await createAdminClient()
  const caminho = `relatorios/${hotel.id}/${servicoId}-${Date.now()}.${extensao}`
  const { error: erroUpload } = await admin.storage
    .from("hospedagem")
    .upload(caminho, arquivo, { contentType: arquivo.type })
  if (erroUpload) return { erro: `Falha ao subir o arquivo: ${erroUpload.message}` }

  const { error, count } = await admin
    .from("hospedagem_servico")
    .update({ relatorio: caminho }, { count: "exact" })
    .eq("id", servicoId)
    .eq("hotel_id", hotel.id)
  if (error) return { erro: `Não foi possível salvar: ${error.message}` }
  if (count === 0) return { erro: "Reserva não encontrada." }

  revalidarHotel(servicoId)
  return { ok: "Relatório enviado." }
}

export async function definirFinalizadoHotel(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const { hotel } = await requireSessaoHotel()

  const servicoId = String(formData.get("servico_id") ?? "")
  const finalizado = String(formData.get("finalizado") ?? "") === "true"
  if (!servicoId) return { erro: "Reserva inválida." }

  const resultado = await definirReservaFinalizada(servicoId, finalizado, hotel.id)
  if ("ok" in resultado) revalidarHotel(servicoId)
  return resultado
}
