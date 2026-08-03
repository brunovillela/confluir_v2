"use server"

import { tenantAtual } from "@/lib/tenant"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import {
  notificarInformeLiberado,
  proximaOrdemRemessaInformes,
} from "@/lib/db/informes"
import { createAdminClient } from "@/lib/supabase/admin"

async function exigirAcesso() {
  // Chave dedicada do Bubble libera a seção sem a gestão completa.
  await requirePermissao("pessoal_gestao", ["pessoal_informes_rendimentos"])
}

function revalidar(remessaId?: string) {
  revalidatePath("/painel/pessoal/informes")
  if (remessaId) revalidatePath(`/painel/pessoal/informes/${remessaId}`)
  revalidatePath("/painel/perfil/contracheques")
}

function lerCamposRemessa(formData: FormData) {
  const ano = String(formData.get("ano_referencia_os") ?? "").trim()
  if (!/^\d{4}$/.test(ano)) {
    return { erro: "Informe o ano-base com 4 dígitos (ex.: 2025)." }
  }
  return {
    ano_referencia_os: ano,
    fechada: formData.get("fechada") === "on",
  }
}

/** Remessa fechada não aceita inclusão, edição ou exclusão de informes. */
async function remessaAberta(
  remessaId: string
): Promise<{ ano: string | null } | { erro: string }> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("pessoal_informes_rendimentos_remessas")
    .select("id, ano_referencia_os, fechada")
    .eq("id", remessaId)
    .maybeSingle()
  if (!data) return { erro: "Remessa não encontrada." }
  if (data.fechada === true) {
    return {
      erro: "A remessa está fechada — reabra a remessa para mexer nos informes.",
    }
  }
  return { ano: data.ano_referencia_os }
}

export async function criarRemessaInformes(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await exigirAcesso()

  const dados = lerCamposRemessa(formData)
  if ("erro" in dados) return dados

  const admin = await createAdminClient()
  // Uma remessa por ano-base.
  const { data: existente } = await admin
    .from("pessoal_informes_rendimentos_remessas")
    .select("id")
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("ano_referencia_os", dados.ano_referencia_os)
    .limit(1)
  if ((existente ?? []).length > 0) {
    return { erro: `Já existe remessa para o ano-base ${dados.ano_referencia_os}.` }
  }

  const { data, error } = await admin
    .from("pessoal_informes_rendimentos_remessas")
    .insert({
      ...dados,
      ordem: await proximaOrdemRemessaInformes(),
      emp_proprietaria_id: await tenantAtual(),
    })
    .select("id")
    .single()
  if (error || !data) {
    return { erro: `Não foi possível criar a remessa: ${error?.message}` }
  }

  revalidar(data.id)
  redirect(`/painel/pessoal/informes/${data.id}?salvo=1`)
}

export async function atualizarRemessaInformes(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await exigirAcesso()

  const id = String(formData.get("id") ?? "")
  if (!id) return { erro: "Remessa inválida." }

  const dados = lerCamposRemessa(formData)
  if ("erro" in dados) return dados

  const admin = await createAdminClient()
  const { data: existente } = await admin
    .from("pessoal_informes_rendimentos_remessas")
    .select("id")
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("ano_referencia_os", dados.ano_referencia_os)
    .neq("id", id)
    .limit(1)
  if ((existente ?? []).length > 0) {
    return { erro: `Já existe remessa para o ano-base ${dados.ano_referencia_os}.` }
  }

  const { error, count } = await admin
    .from("pessoal_informes_rendimentos_remessas")
    .update(
      { ...dados, updated_at: new Date().toISOString() },
      { count: "exact" }
    )
    .eq("id", id)
  if (error) return { erro: `Não foi possível salvar: ${error.message}` }
  if (count === 0) return { erro: "Remessa não encontrada." }

  revalidar(id)
  redirect(`/painel/pessoal/informes/${id}?salvo=1`)
}

/** Exclusão só de remessa VAZIA — com informes, exclua os informes antes. */
export async function excluirRemessaInformes(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await exigirAcesso()

  const id = String(formData.get("id") ?? "")
  if (!id) return { erro: "Remessa inválida." }

  const admin = await createAdminClient()
  const { data: remessa } = await admin
    .from("pessoal_informes_rendimentos_remessas")
    .select("id, fechada")
    .eq("id", id)
    .maybeSingle()
  if (!remessa) return { erro: "Remessa não encontrada." }
  if (remessa.fechada === true) {
    return { erro: "Remessa fechada não pode ser excluída — reabra antes." }
  }

  const { count } = await admin
    .from("pessoal_informes_rendimentos")
    .select("id", { count: "exact", head: true })
    .eq("remessa_id", id)
  if ((count ?? 0) > 0) {
    return {
      erro: `A remessa tem ${count} informe${count === 1 ? "" : "s"} — exclua os informes antes.`,
    }
  }

  const { error } = await admin
    .from("pessoal_informes_rendimentos_remessas")
    .delete()
    .eq("id", id)
  if (error) return { erro: `Não foi possível excluir: ${error.message}` }

  revalidar()
  redirect("/painel/pessoal/informes?excluida=1")
}

// ── Informes da remessa ────────────────────────────────────────────────────

export async function criarInforme(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await exigirAcesso()

  const remessaId = String(formData.get("remessa_id") ?? "")
  const funcionarioId = String(formData.get("funcionario_id") ?? "")
  const liberado = formData.get("liberado") === "on"
  if (!remessaId) return { erro: "Remessa inválida." }
  if (!funcionarioId) return { erro: "Escolha o funcionário." }

  const remessa = await remessaAberta(remessaId)
  if ("erro" in remessa) return remessa

  const admin = await createAdminClient()
  // Um informe por funcionário na remessa.
  const { data: existente } = await admin
    .from("pessoal_informes_rendimentos")
    .select("id")
    .eq("remessa_id", remessaId)
    .eq("funcionario_id", funcionarioId)
    .limit(1)
  if ((existente ?? []).length > 0) {
    return { erro: "Este funcionário já tem informe nesta remessa." }
  }

  const arquivo = formData.get("arquivo")
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { erro: "Envie o informe em PDF." }
  }
  if (arquivo.type !== "application/pdf") {
    return { erro: "O informe deve ser um arquivo PDF." }
  }
  if (arquivo.size > 5 * 1024 * 1024) {
    return { erro: "O arquivo deve ter no máximo 5 MB." }
  }

  const caminho = `informes/${remessaId}/${funcionarioId}-${Date.now()}.pdf`
  const { error: erroUpload } = await admin.storage
    .from("pessoal")
    .upload(caminho, arquivo, { contentType: "application/pdf" })
  if (erroUpload) {
    return { erro: `Falha ao subir o arquivo: ${erroUpload.message}` }
  }

  const { error } = await admin.from("pessoal_informes_rendimentos").insert({
    remessa_id: remessaId,
    funcionario_id: funcionarioId,
    liberado,
    arquivo_url: caminho,
    ano_referencia_os: remessa.ano,
    emp_proprietaria_id: await tenantAtual(),
  })
  if (error) return { erro: `Não foi possível criar: ${error.message}` }

  if (liberado) await notificarInformeLiberado(funcionarioId, remessa.ano)

  revalidar(remessaId)
  return { ok: "Informe adicionado." }
}

export async function alternarLiberadoInforme(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await exigirAcesso()

  const id = String(formData.get("id") ?? "")
  const remessaId = String(formData.get("remessa_id") ?? "")
  const liberado = String(formData.get("liberado") ?? "") === "true"
  if (!id || !remessaId) return { erro: "Informe inválido." }

  const remessa = await remessaAberta(remessaId)
  if ("erro" in remessa) return remessa

  const admin = await createAdminClient()
  const { data: alterados, error } = await admin
    .from("pessoal_informes_rendimentos")
    .update({ liberado, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("remessa_id", remessaId)
    .select("funcionario_id")
  if (error) return { erro: `Não foi possível salvar: ${error.message}` }
  if ((alterados ?? []).length === 0) return { erro: "Informe não encontrado." }

  if (liberado && alterados![0].funcionario_id) {
    await notificarInformeLiberado(alterados![0].funcionario_id, remessa.ano)
  }

  revalidar(remessaId)
  return { ok: liberado ? "Informe liberado." : "Informe bloqueado." }
}

export async function excluirInforme(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await exigirAcesso()

  const id = String(formData.get("id") ?? "")
  const remessaId = String(formData.get("remessa_id") ?? "")
  if (!id || !remessaId) return { erro: "Informe inválido." }

  const remessa = await remessaAberta(remessaId)
  if ("erro" in remessa) return remessa

  const admin = await createAdminClient()
  const { error, count } = await admin
    .from("pessoal_informes_rendimentos")
    .delete({ count: "exact" })
    .eq("id", id)
    .eq("remessa_id", remessaId)
  if (error) return { erro: `Não foi possível excluir: ${error.message}` }
  if (count === 0) return { erro: "Informe não encontrado." }

  revalidar(remessaId)
  return { ok: "Informe excluído." }
}
