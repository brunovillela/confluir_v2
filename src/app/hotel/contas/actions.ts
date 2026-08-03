"use server"

import { revalidatePath } from "next/cache"

import { requireSessaoHotel } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { createAdminClient } from "@/lib/supabase/admin"

/** Dados bancários de recebimento do hotel (Pix e depósito/TED). */
export async function criarContaHotel(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const { hotel } = await requireSessaoHotel()

  const texto = (campo: string) => {
    const v = String(formData.get(campo) ?? "").trim()
    return v === "" ? null : v
  }
  const tipo = String(formData.get("tipo") ?? "")
  if (tipo !== "pix" && tipo !== "deposito") {
    return { erro: "Escolha o tipo da conta (Pix ou depósito)." }
  }

  const dados = {
    hotel_id: hotel.id,
    tipo,
    titular: texto("titular"),
    documento: texto("documento"),
    banco: texto("banco"),
    agencia: texto("agencia"),
    conta: texto("conta"),
    chave_pix: texto("chave_pix"),
    ativo: true,
  }
  if (tipo === "pix" && !dados.chave_pix) {
    return { erro: "Informe a chave Pix." }
  }
  if (tipo === "deposito" && (!dados.banco || !dados.conta)) {
    return { erro: "Informe pelo menos banco e conta para depósito." }
  }

  const admin = await createAdminClient()
  const { error } = await admin.from("hospedagem_hotel_contas").insert(dados)
  if (error) {
    if (error.code === "PGRST205" || error.code === "42P01") {
      return {
        erro: "O cadastro de contas ainda não existe no banco — o sindicato precisa rodar supabase/hospedagem-faturamento.sql.",
      }
    }
    return { erro: `Não foi possível salvar a conta: ${error.message}` }
  }

  revalidatePath("/hotel/contas")
  revalidatePath("/hotel/faturamento/nova")
  return { ok: "Conta cadastrada." }
}

export async function alternarContaHotel(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const { hotel } = await requireSessaoHotel()

  const id = String(formData.get("id") ?? "")
  const ativo = String(formData.get("ativo") ?? "") === "true"
  if (!id) return { erro: "Conta inválida." }

  const admin = await createAdminClient()
  const { error, count } = await admin
    .from("hospedagem_hotel_contas")
    .update({ ativo }, { count: "exact" })
    .eq("id", id)
    .eq("hotel_id", hotel.id)
  if (error) return { erro: `Não foi possível salvar: ${error.message}` }
  if (count === 0) return { erro: "Conta não encontrada." }

  revalidatePath("/hotel/contas")
  revalidatePath("/hotel/faturamento/nova")
  return { ok: ativo ? "Conta reativada." : "Conta desativada." }
}
