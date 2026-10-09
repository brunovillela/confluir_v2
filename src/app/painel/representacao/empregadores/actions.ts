"use server"

import { tenantAtual } from "@/lib/tenant"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { esquemaAusente } from "@/lib/db/comum"
import { invalidarCacheCadastrosPendentes } from "@/lib/db/filiacao-cadastros-pendentes"
import { listarCategoriasFonte } from "@/lib/db/fonte-categorias"
import { invalidarCacheFontes, TIPO_FONTE_PAGADORA } from "@/lib/db/fontes"
import { ehBaseCategoria } from "@/lib/saude-cadastros"
import { createAdminClient } from "@/lib/supabase/admin"

async function lerCampos(formData: FormData) {
  const texto = (campo: string) => {
    const v = String(formData.get(campo) ?? "").trim()
    return v === "" ? null : v
  }
  const cnpj = texto("cnpj_cpf")
  // Categoria do sistema → só a marca fundo_pensao; criada → aponta para ela
  // e a marca segue a base da categoria (é o que as regras de vínculo usam).
  const chave = texto("categoria") ?? "empregador"
  const criada = ehBaseCategoria(chave)
    ? null
    : (await listarCategoriasFonte()).find((c) => c.chave === chave && !c.sistema)
  const base = criada ? criada.base : ehBaseCategoria(chave) ? chave : "empregador"
  return {
    nome_fantasia: texto("nome_fantasia"),
    nome_razao: texto("nome_razao"),
    cnpj_cpf: cnpj ? cnpj.replace(/\D/g, "") : null,
    fundo_pensao: base === "fundo_pensao",
    categoriaId: criada?.chave ?? null,
  }
}

/** Grava a categoria criada; sem a coluna (SQL não rodou), só vale a marca. */
async function gravarCategoria(id: string, categoriaId: string | null): Promise<string | null> {
  const admin = await createAdminClient()
  const { error } = await admin
    .from("empresa")
    .update({ fonte_categoria_id: categoriaId })
    .eq("id", id)
  if (!error || (esquemaAusente(error) && !categoriaId)) return null
  return esquemaAusente(error)
    ? "Rode supabase/fonte-categorias.sql para usar categorias criadas."
    : `Não foi possível gravar a categoria: ${error.message}`
}

export async function criarFontePagadora(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("empregadores")

  const { categoriaId, ...dados } = await lerCampos(formData)
  if (!dados.nome_fantasia) return { erro: "O nome da fonte é obrigatório." }

  const admin = await createAdminClient()
  const { data: criada, error } = await admin
    .from("empresa")
    .insert({
      ...dados,
      tipo: TIPO_FONTE_PAGADORA,
      pessoa_juridica: true,
      inativa: false,
      emp_proprietaria_id: await tenantAtual(),
    })
    .select("id")
    .single()
  if (error) return { erro: `Não foi possível criar: ${error.message}` }
  if (categoriaId) {
    const erroCategoria = await gravarCategoria(String(criada.id), categoriaId)
    if (erroCategoria) return { erro: `Fonte criada, mas: ${erroCategoria}` }
  }

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

  const { categoriaId, ...dados } = await lerCampos(formData)
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
  const erroCategoria = await gravarCategoria(id, categoriaId)
  if (erroCategoria) return { erro: erroCategoria }

  invalidarCacheFontes()
  invalidarCacheCadastrosPendentes()
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
