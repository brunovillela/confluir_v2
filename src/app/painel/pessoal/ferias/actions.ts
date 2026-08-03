"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import {
  atualizarGozo,
  atualizarPeriodoFerias,
  criarGozo,
  criarPeriodoFerias,
  definirAutorizacaoGozo,
  excluirGozo,
  excluirPeriodoFerias,
} from "@/lib/db/ferias"
import { createAdminClient } from "@/lib/supabase/admin"

async function exigirAcesso() {
  // Sem chave dedicada no Bubble para férias — só a gestão.
  return requirePermissao("pessoal_gestao")
}

function revalidar(periodoId?: string, funcionarioId?: string | null) {
  revalidatePath("/painel/pessoal/ferias")
  if (periodoId) revalidatePath(`/painel/pessoal/ferias/${periodoId}`)
  revalidatePath("/painel/perfil/contracheques")
  if (funcionarioId) revalidatePath(`/painel/pessoal/${funcionarioId}`)
}

// ── Períodos ───────────────────────────────────────────────────────────────

function lerCamposPeriodo(formData: FormData) {
  const trabalhador_id = String(formData.get("trabalhador_id") ?? "")
  const aquisitivo_inicio = String(formData.get("aquisitivo_inicio") ?? "")
  const diasBruto = String(formData.get("dias_disponiveis") ?? "").trim()

  if (!trabalhador_id) return { erro: "Escolha o funcionário." }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(aquisitivo_inicio)) {
    return { erro: "Informe o início do período aquisitivo." }
  }
  const dias_disponiveis = Number(diasBruto)
  if (
    !diasBruto ||
    !Number.isInteger(dias_disponiveis) ||
    dias_disponiveis < 1 ||
    dias_disponiveis > 30
  ) {
    return {
      erro: "Dias de direito deve ser um inteiro de 1 a 30 (30 é o padrão; menos quando há faltas injustificadas).",
    }
  }

  const opcional = (nome: string) => {
    const v = String(formData.get(nome) ?? "")
    return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null
  }

  return {
    trabalhador_id,
    aquisitivo_inicio,
    aquisitivo_termino: opcional("aquisitivo_termino"),
    concessivo_inicio: opcional("concessivo_inicio"),
    concessivo_termino: opcional("concessivo_termino"),
    dias_disponiveis,
    abono_pecuniario: formData.get("abono_pecuniario") === "on",
    finalizado: formData.get("finalizado") === "on",
  }
}

export async function criarPeriodoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await exigirAcesso()

  const dados = lerCamposPeriodo(formData)
  if ("erro" in dados) return dados

  const { erro, id } = await criarPeriodoFerias(dados)
  if (erro || !id) return { erro: erro ?? "Falha ao criar." }

  revalidar(id, dados.trabalhador_id)
  redirect(`/painel/pessoal/ferias/${id}?salvo=1`)
}

export async function atualizarPeriodoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await exigirAcesso()

  const id = String(formData.get("id") ?? "")
  if (!id) return { erro: "Período inválido." }

  const dados = lerCamposPeriodo(formData)
  if ("erro" in dados) return dados

  const { erro } = await atualizarPeriodoFerias(id, dados)
  if (erro) return { erro }

  revalidar(id, dados.trabalhador_id)
  redirect(`/painel/pessoal/ferias/${id}?salvo=1`)
}

export async function excluirPeriodoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await exigirAcesso()

  const id = String(formData.get("id") ?? "")
  if (!id) return { erro: "Período inválido." }

  const { erro } = await excluirPeriodoFerias(id)
  if (erro) return { erro }

  revalidar()
  redirect("/painel/pessoal/ferias?excluido=1")
}

// ── Gozos ──────────────────────────────────────────────────────────────────

/** Upload opcional do aviso de férias (PDF ≤5MB, bucket 'pessoal'). */
async function subirAviso(
  formData: FormData,
  periodoId: string
): Promise<{ caminho: string | null } | { erro: string }> {
  const arquivo = formData.get("aviso")
  if (!(arquivo instanceof File) || arquivo.size === 0) return { caminho: null }
  if (arquivo.type !== "application/pdf") {
    return { erro: "O aviso de férias deve ser um PDF." }
  }
  if (arquivo.size > 5 * 1024 * 1024) {
    return { erro: "O arquivo deve ter no máximo 5 MB." }
  }
  const caminho = `ferias/${periodoId}/${Date.now()}.pdf`
  const admin = await createAdminClient()
  const { error } = await admin.storage
    .from("pessoal")
    .upload(caminho, arquivo, { contentType: "application/pdf" })
  if (error) return { erro: `Falha ao subir o aviso: ${error.message}` }
  return { caminho }
}

function lerCamposGozo(formData: FormData) {
  const inicio = String(formData.get("inicio") ?? "")
  const diasBruto = String(formData.get("dias") ?? "").trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio)) {
    return { erro: "Informe a data de início do gozo." }
  }
  const dias = Number(diasBruto)
  if (!diasBruto || !Number.isInteger(dias) || dias < 1) {
    return { erro: "Informe a quantidade de dias corridos (número inteiro)." }
  }
  return {
    inicio,
    dias,
    divisaoAcordada: formData.get("divisao_acordada") === "on",
    autorizador_observacoes:
      String(formData.get("autorizador_observacoes") ?? "").trim() || null,
  }
}

export async function criarGozoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await exigirAcesso()

  const periodoId = String(formData.get("periodo_id") ?? "")
  if (!periodoId) return { erro: "Período inválido." }

  const dados = lerCamposGozo(formData)
  if ("erro" in dados) return dados

  const aviso = await subirAviso(formData, periodoId)
  if ("erro" in aviso) return aviso

  const { erro } = await criarGozo(periodoId, {
    ...dados,
    aviso: aviso.caminho,
  })
  if (erro) return { erro }

  revalidar(periodoId)
  redirect(`/painel/pessoal/ferias/${periodoId}?salvo=1`)
}

export async function atualizarGozoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await exigirAcesso()

  const periodoId = String(formData.get("periodo_id") ?? "")
  const gozoId = String(formData.get("id") ?? "")
  if (!periodoId || !gozoId) return { erro: "Gozo inválido." }

  const dados = lerCamposGozo(formData)
  if ("erro" in dados) return dados

  const aviso = await subirAviso(formData, periodoId)
  if ("erro" in aviso) return aviso

  const { erro } = await atualizarGozo(periodoId, gozoId, {
    ...dados,
    aviso: aviso.caminho,
  })
  if (erro) return { erro }

  revalidar(periodoId)
  redirect(`/painel/pessoal/ferias/${periodoId}?salvo=1`)
}

export async function excluirGozoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await exigirAcesso()

  const periodoId = String(formData.get("periodo_id") ?? "")
  const gozoId = String(formData.get("id") ?? "")
  if (!gozoId) return { erro: "Gozo inválido." }

  const { erro } = await excluirGozo(gozoId)
  if (erro) return { erro }

  revalidar(periodoId)
  return { ok: "Gozo excluído." }
}

export async function alternarAutorizacaoGozo(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await exigirAcesso()

  const periodoId = String(formData.get("periodo_id") ?? "")
  const gozoId = String(formData.get("id") ?? "")
  const autorizar = String(formData.get("autorizar") ?? "") === "true"
  if (!gozoId) return { erro: "Gozo inválido." }

  const { erro } = await definirAutorizacaoGozo(
    gozoId,
    sessao.usuario.id as string,
    autorizar
  )
  if (erro) return { erro }

  revalidar(periodoId)
  return {
    ok: autorizar
      ? "Gozo autorizado — o funcionário foi avisado."
      : "Autorização desfeita.",
  }
}
