"use server"

import { tenantAtual } from "@/lib/tenant"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { invalidarCacheProntuarios } from "@/lib/db/prontuario"
import { createAdminClient } from "@/lib/supabase/admin"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function lerCampos(formData: FormData):
  | { data: string | null; tipo: string | null; descricao: string }
  | { erro: string } {
  const descricao = String(formData.get("descricao") ?? "").trim()
  if (!descricao) return { erro: "Escreva o apontamento." }
  const dataBruta = String(formData.get("data") ?? "")
  return {
    // `data` é timestamptz — meio-dia em SP evita deslocamento de dia
    data: /^\d{4}-\d{2}-\d{2}$/.test(dataBruta)
      ? `${dataBruta}T12:00:00-03:00`
      : null,
    tipo: String(formData.get("tipo") ?? "").trim() || null,
    descricao,
  }
}

function voltar(filiacaoId: string, flag: string): never {
  revalidatePath(`/painel/filiados/${filiacaoId}`)
  revalidatePath(`/painel/filiados/${filiacaoId}/prontuario`)
  revalidatePath("/painel/filiados/prontuarios")
  redirect(`/painel/filiados/${filiacaoId}/prontuario?${flag}=1`)
}

/** Novo apontamento no prontuário (exige gestão — briefing do schema). */
export async function criarApontamento(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await requirePermissao("filiacao_gestao")

  const filiacaoId = String(formData.get("filiado_id") ?? "")
  if (!UUID.test(filiacaoId)) return { erro: "Filiado inválido." }

  const campos = lerCampos(formData)
  if ("erro" in campos) return campos

  const agora = new Date().toISOString()
  const admin = await createAdminClient()
  const { error } = await admin.from("filiacao_prontuario").insert({
    filiacao_id: filiacaoId,
    data: campos.data ?? agora,
    tipo: campos.tipo,
    descricao: campos.descricao,
    diretor_funcionario_id: sessao.usuario.id,
    emp_proprietaria_id: await tenantAtual(),
    created_at: agora,
    modified_at: agora,
  })
  if (error) {
    if (error.code === "PGRST205" || error.code === "42P01") {
      return { erro: "A tabela do prontuário ainda não existe no banco." }
    }
    return { erro: `Não foi possível registrar: ${error.message}` }
  }

  invalidarCacheProntuarios()
  voltar(filiacaoId, "salvo")
}

/** Edita um apontamento (data, tipo e descrição). */
export async function atualizarApontamento(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("filiacao_gestao")

  const filiacaoId = String(formData.get("filiado_id") ?? "")
  const apontamentoId = String(formData.get("apontamento_id") ?? "")
  if (!UUID.test(filiacaoId) || !UUID.test(apontamentoId)) {
    return { erro: "Apontamento inválido." }
  }

  const campos = lerCampos(formData)
  if ("erro" in campos) return campos

  const admin = await createAdminClient()
  const { error, count } = await admin
    .from("filiacao_prontuario")
    .update(
      {
        ...(campos.data ? { data: campos.data } : {}),
        tipo: campos.tipo,
        descricao: campos.descricao,
        modified_at: new Date().toISOString(),
      },
      { count: "exact" }
    )
    .eq("id", apontamentoId)
    .eq("filiacao_id", filiacaoId)
  if (error) return { erro: `Não foi possível salvar: ${error.message}` }
  if (count === 0) return { erro: "Apontamento não encontrado." }

  invalidarCacheProntuarios()
  voltar(filiacaoId, "salvo")
}

/** Exclui um apontamento do prontuário. */
export async function excluirApontamento(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("filiacao_gestao")

  const filiacaoId = String(formData.get("filiado_id") ?? "")
  const apontamentoId = String(formData.get("apontamento_id") ?? "")
  if (!UUID.test(filiacaoId) || !UUID.test(apontamentoId)) {
    return { erro: "Apontamento inválido." }
  }

  const admin = await createAdminClient()
  const { error } = await admin
    .from("filiacao_prontuario")
    .delete()
    .eq("id", apontamentoId)
    .eq("filiacao_id", filiacaoId)
  if (error) return { erro: `Não foi possível excluir: ${error.message}` }

  invalidarCacheProntuarios()
  voltar(filiacaoId, "excluido")
}
