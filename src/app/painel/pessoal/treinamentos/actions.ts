"use server"

import { tenantAtual } from "@/lib/tenant"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import {
  alunoJaMatriculado,
  notificarMatriculaTreinamento,
} from "@/lib/db/treinamentos"
import { createAdminClient } from "@/lib/supabase/admin"

async function exigirAcesso() {
  // Sem chave dedicada no Bubble para treinamentos — só a gestão.
  await requirePermissao("pessoal_gestao")
}

function revalidar(treinamentoId?: string) {
  revalidatePath("/painel/pessoal/treinamentos")
  if (treinamentoId) {
    revalidatePath(`/painel/pessoal/treinamentos/${treinamentoId}`)
  }
  revalidatePath("/painel/perfil/contracheques")
}

// ── Treinamentos (catálogo) ────────────────────────────────────────────────

function lerCamposTreinamento(formData: FormData) {
  const treinamento = String(formData.get("treinamento") ?? "").trim()
  const cargaBruta = String(formData.get("carga_horaria") ?? "")
    .trim()
    .replace(",", ".")
  const vencimentoBruto = String(formData.get("vencimento_meses") ?? "").trim()

  if (!treinamento) return { erro: "Informe o nome do treinamento." }
  const carga_horaria = cargaBruta ? Number(cargaBruta) : null
  if (cargaBruta && (Number.isNaN(carga_horaria) || carga_horaria! <= 0)) {
    return { erro: "Carga horária inválida (ex.: 8)." }
  }
  const vencimento_meses = vencimentoBruto ? Number(vencimentoBruto) : null
  if (
    vencimentoBruto &&
    (!Number.isInteger(vencimento_meses) || vencimento_meses! <= 0)
  ) {
    return {
      erro: "Validade em meses deve ser um inteiro (em branco = não expira).",
    }
  }
  return { treinamento, carga_horaria, vencimento_meses }
}

export async function criarTreinamento(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await exigirAcesso()

  const dados = lerCamposTreinamento(formData)
  if ("erro" in dados) return dados

  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("pessoal_treinamentos")
    .insert({ ...dados, emp_proprietaria_id: await tenantAtual() })
    .select("id")
    .single()
  if (error || !data) {
    return { erro: `Não foi possível criar: ${error?.message}` }
  }

  revalidar(data.id)
  redirect(`/painel/pessoal/treinamentos/${data.id}?salvo=1`)
}

export async function atualizarTreinamento(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await exigirAcesso()

  const id = String(formData.get("id") ?? "")
  if (!id) return { erro: "Treinamento inválido." }

  const dados = lerCamposTreinamento(formData)
  if ("erro" in dados) return dados

  const admin = await createAdminClient()
  const { error, count } = await admin
    .from("pessoal_treinamentos")
    .update(
      { ...dados, updated_at: new Date().toISOString() },
      { count: "exact" }
    )
    .eq("id", id)
  if (error) return { erro: `Não foi possível salvar: ${error.message}` }
  if (count === 0) return { erro: "Treinamento não encontrado." }

  revalidar(id)
  redirect(`/painel/pessoal/treinamentos/${id}?salvo=1`)
}

export async function excluirTreinamento(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await exigirAcesso()

  const id = String(formData.get("id") ?? "")
  if (!id) return { erro: "Treinamento inválido." }

  const admin = await createAdminClient()
  const { count } = await admin
    .from("pessoal_treinamentos_alunos")
    .select("id", { count: "exact", head: true })
    .eq("treinamento_id", id)
  if ((count ?? 0) > 0) {
    return {
      erro: `O treinamento tem ${count} aluno${count === 1 ? "" : "s"} — exclua os alunos antes.`,
    }
  }

  const { error, count: excluidos } = await admin
    .from("pessoal_treinamentos")
    .delete({ count: "exact" })
    .eq("id", id)
  if (error) return { erro: `Não foi possível excluir: ${error.message}` }
  if (excluidos === 0) return { erro: "Treinamento não encontrado." }

  revalidar()
  redirect("/painel/pessoal/treinamentos?excluido=1")
}

// ── Alunos do treinamento ──────────────────────────────────────────────────

/** Upload opcional do certificado (PDF/JPG/PNG/WebP ≤5MB, bucket 'pessoal'). */
async function subirCertificado(
  formData: FormData,
  treinamentoId: string
): Promise<{ caminho: string | null } | { erro: string }> {
  const arquivo = formData.get("certificado")
  if (!(arquivo instanceof File) || arquivo.size === 0) return { caminho: null }

  const tipos: Record<string, string> = {
    "application/pdf": "pdf",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  }
  const ext = tipos[arquivo.type]
  if (!ext) return { erro: "Envie PDF, JPG, PNG ou WebP." }
  if (arquivo.size > 5 * 1024 * 1024) {
    return { erro: "O arquivo deve ter no máximo 5 MB." }
  }

  const caminho = `treinamentos/${treinamentoId}/${Date.now()}.${ext}`
  const admin = await createAdminClient()
  const { error } = await admin.storage
    .from("pessoal")
    .upload(caminho, arquivo, { contentType: arquivo.type })
  if (error) return { erro: `Falha ao subir o certificado: ${error.message}` }
  return { caminho }
}

function lerCamposAluno(formData: FormData) {
  const aluno_id = String(formData.get("aluno_id") ?? "")
  const data_inicio = String(formData.get("data_inicio") ?? "")
  const data_termino = String(formData.get("data_termino") ?? "")
  if (!aluno_id) return { erro: "Escolha o funcionário." }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data_inicio)) {
    return { erro: "Informe a data de início do treinamento." }
  }
  if (data_termino && data_termino < data_inicio) {
    return { erro: "O término não pode ser antes do início." }
  }
  return {
    aluno_id,
    data_inicio,
    data_termino: data_termino || null,
  }
}

export async function criarAlunoTreinamento(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await exigirAcesso()

  const treinamentoId = String(formData.get("treinamento_id") ?? "")
  if (!treinamentoId) return { erro: "Treinamento inválido." }

  const dados = lerCamposAluno(formData)
  if ("erro" in dados) return dados

  if (await alunoJaMatriculado(treinamentoId, dados.aluno_id)) {
    return { erro: "Este funcionário já está neste treinamento." }
  }

  const certificado = await subirCertificado(formData, treinamentoId)
  if ("erro" in certificado) return certificado

  const admin = await createAdminClient()
  const { error } = await admin.from("pessoal_treinamentos_alunos").insert({
    treinamento_id: treinamentoId,
    ...dados,
    certificado_url: certificado.caminho,
    emp_proprietaria_id: await tenantAtual(),
  })
  if (error) return { erro: `Não foi possível matricular: ${error.message}` }

  await notificarMatriculaTreinamento(dados.aluno_id, treinamentoId)
  revalidar(treinamentoId)
  return { ok: "Aluno adicionado." }
}

export async function atualizarAlunoTreinamento(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await exigirAcesso()

  const treinamentoId = String(formData.get("treinamento_id") ?? "")
  const id = String(formData.get("id") ?? "")
  if (!treinamentoId || !id) return { erro: "Registro inválido." }

  const dados = lerCamposAluno(formData)
  if ("erro" in dados) return dados

  if (await alunoJaMatriculado(treinamentoId, dados.aluno_id, id)) {
    return { erro: "Este funcionário já está neste treinamento." }
  }

  const certificado = await subirCertificado(formData, treinamentoId)
  if ("erro" in certificado) return certificado

  const admin = await createAdminClient()
  const { error, count } = await admin
    .from("pessoal_treinamentos_alunos")
    .update(
      {
        ...dados,
        ...(certificado.caminho !== null
          ? { certificado_url: certificado.caminho }
          : {}),
        updated_at: new Date().toISOString(),
      },
      { count: "exact" }
    )
    .eq("id", id)
    .eq("treinamento_id", treinamentoId)
  if (error) return { erro: `Não foi possível salvar: ${error.message}` }
  if (count === 0) return { erro: "Registro não encontrado." }

  revalidar(treinamentoId)
  redirect(`/painel/pessoal/treinamentos/${treinamentoId}?salvo=1`)
}

export async function excluirAlunoTreinamento(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await exigirAcesso()

  const treinamentoId = String(formData.get("treinamento_id") ?? "")
  const id = String(formData.get("id") ?? "")
  if (!id) return { erro: "Registro inválido." }

  const admin = await createAdminClient()
  const { error, count } = await admin
    .from("pessoal_treinamentos_alunos")
    .delete({ count: "exact" })
    .eq("id", id)
  if (error) return { erro: `Não foi possível excluir: ${error.message}` }
  if (count === 0) return { erro: "Registro não encontrado." }

  revalidar(treinamentoId)
  return { ok: "Aluno excluído." }
}
