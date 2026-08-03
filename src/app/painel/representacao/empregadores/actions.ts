"use server"

import { tenantAtual } from "@/lib/tenant"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { invalidarCacheFontes, TIPO_FONTE_PAGADORA } from "@/lib/db/fontes"
import { createAdminClient } from "@/lib/supabase/admin"

function lerCampos(formData: FormData) {
  const texto = (campo: string) => {
    const v = String(formData.get(campo) ?? "").trim()
    return v === "" ? null : v
  }
  const cnpj = texto("cnpj_cpf")
  return {
    nome_fantasia: texto("nome_fantasia"),
    nome_razao: texto("nome_razao"),
    cnpj_cpf: cnpj ? cnpj.replace(/\D/g, "") : null,
    fundo_pensao: formData.get("fundo_pensao") === "on",
  }
}

export async function criarFontePagadora(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("empregadores")

  const dados = lerCampos(formData)
  if (!dados.nome_fantasia) return { erro: "O nome da fonte é obrigatório." }

  const admin = await createAdminClient()
  const { error } = await admin.from("empresa").insert({
    ...dados,
    tipo: TIPO_FONTE_PAGADORA,
    pessoa_juridica: true,
    inativa: false,
    emp_proprietaria_id: await tenantAtual(),
  })
  if (error) return { erro: `Não foi possível criar: ${error.message}` }

  invalidarCacheFontes()
  revalidatePath("/painel/representacao/empregadores")
  redirect("/painel/representacao/empregadores?salvo=1")
}

export async function atualizarFontePagadora(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("empregadores")

  const id = String(formData.get("id") ?? "")
  if (!id) return { erro: "Fonte inválida." }

  const dados = lerCampos(formData)
  if (!dados.nome_fantasia) return { erro: "O nome da fonte é obrigatório." }

  const inativa = formData.get("inativa") === "on"

  const admin = await createAdminClient()
  const { error, count } = await admin
    .from("empresa")
    .update(
      {
        ...dados,
        tipo: TIPO_FONTE_PAGADORA,
        inativa,
        inativa_data: inativa ? new Date().toISOString().slice(0, 10) : null,
      },
      { count: "exact" }
    )
    .eq("id", id)
  if (error) return { erro: `Não foi possível salvar: ${error.message}` }
  if (count === 0) return { erro: "Fonte não encontrada." }

  invalidarCacheFontes()
  revalidatePath("/painel/representacao/empregadores")
  revalidatePath(`/painel/representacao/empregadores/${id}`)
  redirect("/painel/representacao/empregadores?salvo=1")
}

export async function excluirFontePagadora(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("empregadores")

  const id = String(formData.get("id") ?? "")
  if (!id) return { erro: "Fonte inválida." }

  const admin = await createAdminClient()

  // Fonte com vínculos de filiação não sai do quadro — o caminho é inativar.
  const { count } = await admin
    .from("filiacao_vinculos")
    .select("id", { count: "exact", head: true })
    .eq("fonte_pagadora_id", id)
  if ((count ?? 0) > 0) {
    return {
      erro: "Esta fonte tem vínculos de filiação ligados a ela e não pode ser excluída — marque como inativa.",
    }
  }

  // Remoção lógica: tira o marcador de fonte pagadora e o cadastro da
  // empresa é mantido. O DELETE físico esbarra em statement timeout — as
  // FKs que apontam para `empresa` não têm índice no snapshot migrado.
  const { error } = await admin
    .from("empresa")
    .update({ tipo: null, inativa: true })
    .eq("id", id)
  if (error) return { erro: `Não foi possível excluir: ${error.message}` }

  invalidarCacheFontes()
  revalidatePath("/painel/representacao/empregadores")
  redirect("/painel/representacao/empregadores?excluida=1")
}
