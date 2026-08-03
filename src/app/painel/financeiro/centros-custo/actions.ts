"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { usoCentroCusto } from "@/lib/db/financeiro"
import { createAdminClient } from "@/lib/supabase/admin"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function lerCampos(formData: FormData):
  | {
      nome_da_conta: string
      acesso: string | null
      classificador: string | null
      tipo_da_conta: string | null
      usavel: boolean
      indicacoes: string | null
      contraindicacoes: string | null
    }
  | { erro: string } {
  const nome = String(formData.get("nome_da_conta") ?? "").trim()
  if (!nome) return { erro: "O nome da conta é obrigatório." }
  const texto = (campo: string) =>
    String(formData.get(campo) ?? "").trim() || null
  return {
    nome_da_conta: nome,
    acesso: texto("acesso"),
    classificador: texto("classificador"),
    tipo_da_conta: texto("tipo_da_conta"),
    usavel: formData.get("usavel") === "on",
    indicacoes: texto("indicacoes"),
    contraindicacoes: texto("contraindicacoes"),
  }
}

function revalidar(id?: string): void {
  revalidatePath("/painel/financeiro/centros-custo")
  if (id) revalidatePath(`/painel/financeiro/centros-custo/${id}`)
}

export async function criarCentroCusto(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("financeiro_pagamento", ["financeiro_caixa"])

  const campos = lerCampos(formData)
  if ("erro" in campos) return campos

  const admin = await createAdminClient()
  const { data: criada, error } = await admin
    .from("centros_de_custo")
    .insert(campos)
    .select("id")
    .single()
  if (error || !criada) {
    return { erro: `Não foi possível criar: ${error?.message ?? "?"}` }
  }

  revalidar(criada.id)
  redirect(`/painel/financeiro/centros-custo/${criada.id}?salvo=1`)
}

export async function atualizarCentroCusto(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("financeiro_pagamento", ["financeiro_caixa"])

  const id = String(formData.get("centro_id") ?? "")
  if (!UUID.test(id)) return { erro: "Centro de custo inválido." }

  const campos = lerCampos(formData)
  if ("erro" in campos) return campos

  const admin = await createAdminClient()
  const { error, count } = await admin
    .from("centros_de_custo")
    .update(
      { ...campos, updated_at: new Date().toISOString() },
      { count: "exact" }
    )
    .eq("id", id)
  if (error) return { erro: `Não foi possível salvar: ${error.message}` }
  if (count === 0) return { erro: "Centro de custo não encontrado." }

  revalidar(id)
  redirect(`/painel/financeiro/centros-custo/${id}?salvo=1`)
}

export async function excluirCentroCusto(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("financeiro_pagamento", ["financeiro_caixa"])

  const id = String(formData.get("centro_id") ?? "")
  if (!UUID.test(id)) return { erro: "Centro de custo inválido." }

  // Centro usado em ordens/contratos não pode sumir — marque como não usável
  const uso = await usoCentroCusto(id)
  if (uso.ordens > 0 || uso.contratos > 0) {
    return {
      erro: `Este centro de custo está em ${uso.ordens.toLocaleString("pt-BR")} ordem(ns) de pagamento e ${uso.contratos.toLocaleString("pt-BR")} contrato(s) — desmarque “usável” em vez de excluir.`,
    }
  }

  const admin = await createAdminClient()
  const { error } = await admin.from("centros_de_custo").delete().eq("id", id)
  if (error) return { erro: `Não foi possível excluir: ${error.message}` }

  revalidar()
  redirect("/painel/financeiro/centros-custo?excluido=1")
}
