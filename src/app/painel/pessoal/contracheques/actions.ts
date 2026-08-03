"use server"

import { tenantAtual } from "@/lib/tenant"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { notificarLiberacaoPessoal, proximaOrdemRemessa } from "@/lib/db/pessoal"
import { createAdminClient } from "@/lib/supabase/admin"

async function exigirAcesso() {
  await requirePermissao("pessoal_gestao", ["pessoal_contracheque"])
}

function revalidar(remessaId?: string) {
  revalidatePath("/painel/pessoal/contracheques")
  if (remessaId) revalidatePath(`/painel/pessoal/contracheques/${remessaId}`)
  revalidatePath("/painel/perfil/contracheques")
}

const NATUREZAS = [
  "mensal",
  "adiantamento",
  "decimo_terceiro",
  "ferias",
  "complementar_mensal",
] as const

/** Nome e natureza são obrigatórios; a natureza é ÚNICA por remessa. */
function lerCamposRemessa(formData: FormData) {
  const nome = String(formData.get("nome_remessa") ?? "").trim()
  const natureza = String(formData.get("natureza") ?? "")
  if (!nome) return { erro: "Informe o nome da remessa." }
  if (!(NATUREZAS as readonly string[]).includes(natureza)) {
    return { erro: "Escolha a natureza da remessa." }
  }
  return {
    nome_remessa: nome,
    decimo_terceiro: natureza === "decimo_terceiro",
    ferias: natureza === "ferias",
    adiantamento: natureza === "adiantamento",
    complementar_mensal: natureza === "complementar_mensal",
    finalizada: formData.get("finalizada") === "on",
  }
}

/** Remessa finalizada não aceita inclusão, edição ou exclusão de itens. */
async function remessaAberta(
  remessaId: string
): Promise<{ ordem: number | null } | { erro: string }> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("pessoal_contracheques_remessas")
    .select("id, ordem, finalizada")
    .eq("id", remessaId)
    .maybeSingle()
  if (!data) return { erro: "Remessa não encontrada." }
  if (data.finalizada === true) {
    return {
      erro: "A remessa está finalizada — reabra a remessa para mexer nos contracheques.",
    }
  }
  return { ordem: data.ordem }
}

export async function criarRemessaContracheques(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await exigirAcesso()

  const dados = lerCamposRemessa(formData)
  if ("erro" in dados) return dados

  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("pessoal_contracheques_remessas")
    .insert({
      ...dados,
      ordem: await proximaOrdemRemessa("pessoal_contracheques_remessas"),
      emp_proprietaria_id: await tenantAtual(),
    })
    .select("id")
    .single()
  if (error || !data) {
    return { erro: `Não foi possível criar a remessa: ${error?.message}` }
  }

  revalidar(data.id)
  redirect(`/painel/pessoal/contracheques/${data.id}?salvo=1`)
}

export async function atualizarRemessaContracheques(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await exigirAcesso()

  const id = String(formData.get("id") ?? "")
  if (!id) return { erro: "Remessa inválida." }

  const dados = lerCamposRemessa(formData)
  if ("erro" in dados) return dados

  const admin = await createAdminClient()
  const { error, count } = await admin
    .from("pessoal_contracheques_remessas")
    .update(dados, { count: "exact" })
    .eq("id", id)
  if (error) return { erro: `Não foi possível salvar: ${error.message}` }
  if (count === 0) return { erro: "Remessa não encontrada." }

  revalidar(id)
  redirect(`/painel/pessoal/contracheques/${id}?salvo=1`)
}

/** Exclusão só de remessa VAZIA — com contracheques, o caminho é excluí-los antes. */
export async function excluirRemessaContracheques(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await exigirAcesso()

  const id = String(formData.get("id") ?? "")
  if (!id) return { erro: "Remessa inválida." }

  const admin = await createAdminClient()
  const { data: remessa } = await admin
    .from("pessoal_contracheques_remessas")
    .select("id, finalizada")
    .eq("id", id)
    .maybeSingle()
  if (!remessa) return { erro: "Remessa não encontrada." }
  if (remessa.finalizada === true) {
    return { erro: "Remessa finalizada não pode ser excluída — reabra antes." }
  }

  const { count } = await admin
    .from("pessoal_contracheques")
    .select("id", { count: "exact", head: true })
    .eq("remessa_id", id)
  if ((count ?? 0) > 0) {
    return {
      erro: `A remessa tem ${count} contracheque${count === 1 ? "" : "s"} — exclua os contracheques antes.`,
    }
  }

  const { error } = await admin
    .from("pessoal_contracheques_remessas")
    .delete()
    .eq("id", id)
  if (error) return { erro: `Não foi possível excluir: ${error.message}` }

  revalidar()
  redirect("/painel/pessoal/contracheques?excluida=1")
}

// ── Contracheques da remessa ───────────────────────────────────────────────

export async function criarContracheque(
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
  // Um contracheque por funcionário na remessa.
  const { data: existente } = await admin
    .from("pessoal_contracheques")
    .select("id")
    .eq("remessa_id", remessaId)
    .eq("funcionario_id", funcionarioId)
    .limit(1)
  if ((existente ?? []).length > 0) {
    return { erro: "Este funcionário já tem contracheque nesta remessa." }
  }

  const arquivo = formData.get("arquivo")
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { erro: "Envie o contracheque em PDF." }
  }
  if (arquivo.type !== "application/pdf") {
    return { erro: "O contracheque deve ser um arquivo PDF." }
  }
  if (arquivo.size > 5 * 1024 * 1024) {
    return { erro: "O arquivo deve ter no máximo 5 MB." }
  }

  const caminho = `contracheques/${remessaId}/${funcionarioId}-${Date.now()}.pdf`
  const { error: erroUpload } = await admin.storage
    .from("pessoal")
    .upload(caminho, arquivo, { contentType: "application/pdf" })
  if (erroUpload) return { erro: `Falha ao subir o arquivo: ${erroUpload.message}` }

  const { data: criado, error } = await admin
    .from("pessoal_contracheques")
    .insert({
      remessa_id: remessaId,
      funcionario_id: funcionarioId,
      ordem: remessa.ordem,
      liberado,
      arquivo: caminho,
    })
    .select("id")
    .single()
  if (error || !criado) {
    return { erro: `Não foi possível criar: ${error?.message}` }
  }

  if (liberado) {
    const { data: r } = await admin
      .from("pessoal_contracheques_remessas")
      .select("nome_remessa")
      .eq("id", remessaId)
      .maybeSingle()
    await notificarLiberacaoPessoal(
      funcionarioId,
      "contracheque",
      r?.nome_remessa ?? null,
      criado.id
    )
  }

  revalidar(remessaId)
  return { ok: "Contracheque adicionado." }
}

export async function alternarLiberadoContracheque(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await exigirAcesso()

  const id = String(formData.get("id") ?? "")
  const remessaId = String(formData.get("remessa_id") ?? "")
  const liberado = String(formData.get("liberado") ?? "") === "true"
  if (!id || !remessaId) return { erro: "Contracheque inválido." }

  const remessa = await remessaAberta(remessaId)
  if ("erro" in remessa) return remessa

  const admin = await createAdminClient()
  const { data: alterados, error } = await admin
    .from("pessoal_contracheques")
    .update({ liberado })
    .eq("id", id)
    .eq("remessa_id", remessaId)
    .select("funcionario_id")
  if (error) return { erro: `Não foi possível salvar: ${error.message}` }
  if ((alterados ?? []).length === 0) {
    return { erro: "Contracheque não encontrado." }
  }

  // Liberar dispara aviso ao funcionário (notificação interna + email).
  if (liberado && alterados![0].funcionario_id) {
    const { data: r } = await admin
      .from("pessoal_contracheques_remessas")
      .select("nome_remessa")
      .eq("id", remessaId)
      .maybeSingle()
    await notificarLiberacaoPessoal(
      alterados![0].funcionario_id,
      "contracheque",
      r?.nome_remessa ?? null,
      id
    )
  }

  revalidar(remessaId)
  return { ok: liberado ? "Contracheque liberado." : "Contracheque bloqueado." }
}

export async function excluirContracheque(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await exigirAcesso()

  const id = String(formData.get("id") ?? "")
  const remessaId = String(formData.get("remessa_id") ?? "")
  if (!id || !remessaId) return { erro: "Contracheque inválido." }

  const remessa = await remessaAberta(remessaId)
  if ("erro" in remessa) return remessa

  const admin = await createAdminClient()
  const { error, count } = await admin
    .from("pessoal_contracheques")
    .delete({ count: "exact" })
    .eq("id", id)
    .eq("remessa_id", remessaId)
  if (error) return { erro: `Não foi possível excluir: ${error.message}` }
  if (count === 0) return { erro: "Contracheque não encontrado." }

  revalidar(remessaId)
  return { ok: "Contracheque excluído." }
}
