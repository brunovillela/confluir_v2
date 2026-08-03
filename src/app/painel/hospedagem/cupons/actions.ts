"use server"

import { tenantAtual } from "@/lib/tenant"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { createAdminClient } from "@/lib/supabase/admin"

import { CHAVE_EMITIR_CUPOM, CHAVES_EMITIR_CUPOM_ALT } from "./chaves"

const SEXOS = ["Masculino", "Feminino", "Outro"]

export async function criarCupom(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao(CHAVE_EMITIR_CUPOM, CHAVES_EMITIR_CUPOM_ALT)

  const filiadoId = String(formData.get("filiado_id") ?? "")
  const hotelId = String(formData.get("hotel_id") ?? "")
  const checkIn = String(formData.get("check_in") ?? "")
  const sexoBruto = String(formData.get("sexo") ?? "")
  const sexo = SEXOS.includes(sexoBruto) ? sexoBruto : null
  const aceitaColetivo = formData.get("aceita_quarto_coletivo") === "on"

  if (!filiadoId) return { erro: "Selecione o filiado." }
  if (!hotelId) return { erro: "Selecione o hotel." }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkIn)) {
    return { erro: "Informe a data de check-in." }
  }

  const admin = await createAdminClient()

  const [{ data: filiado }, { data: hotel }] = await Promise.all([
    admin
      .from("filiacoes")
      .select("id, filiacao_condicao")
      .eq("id", filiadoId)
      .eq("emp_proprietaria_id", await tenantAtual())
      .maybeSingle(),
    admin
      .from("hospedagem_hotel")
      .select("id, ativo")
      .eq("id", hotelId)
      .eq("emp_proprietaria_id", await tenantAtual())
      .maybeSingle(),
  ])
  if (!filiado) return { erro: "Filiado não encontrado." }
  if (filiado.filiacao_condicao !== "Ativo") {
    return {
      erro: "O subsídio de hospedagem é para filiados com condição “Ativo” — confira a situação do cadastro.",
    }
  }
  if (!hotel) return { erro: "Hotel não encontrado." }
  if (hotel.ativo === false) {
    return { erro: "Este hotel está inativo e não recebe novos cupons." }
  }

  const { error } = await admin.from("hospedagem_cupom").insert({
    filiado_id: filiadoId,
    hotel_id: hotelId,
    check_in: checkIn,
    sexo,
    aceita_quarto_coletivo: aceitaColetivo,
    cancelado: false,
    compareceu: false,
  })
  if (error) return { erro: `Não foi possível emitir o cupom: ${error.message}` }

  revalidatePath("/painel/hospedagem/cupons")
  revalidatePath("/painel/hospedagem")
  redirect("/painel/hospedagem/cupons?salvo=1")
}

export async function cancelarCupom(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao(CHAVE_EMITIR_CUPOM, CHAVES_EMITIR_CUPOM_ALT)

  const id = String(formData.get("id") ?? "")
  if (!id) return { erro: "Cupom inválido." }

  const admin = await createAdminClient()
  const { error, count } = await admin
    .from("hospedagem_cupom")
    .update({ cancelado: true }, { count: "exact" })
    .eq("id", id)
    .eq("cancelado", false)
  if (error) return { erro: `Não foi possível cancelar: ${error.message}` }
  if (count === 0) return { erro: "Cupom não encontrado ou já cancelado." }

  revalidatePath("/painel/hospedagem/cupons")
  revalidatePath("/painel/hospedagem")
  return { ok: "Cupom cancelado." }
}
