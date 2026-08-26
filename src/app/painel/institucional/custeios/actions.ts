"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import {
  atualizarCusteio,
  autorizarCusteio,
  cancelarCusteio,
  criarCusteio,
  reprovarCusteio,
  salvarConvidado,
  salvarFinalidade,
  submeterCusteio,
  type DadosCusteio,
} from "@/lib/db/custeio"
import { type Periodicidade } from "@/lib/custeio-constantes"
import { parseValorBR } from "@/lib/valores"

function texto(formData: FormData, campo: string): string {
  return String(formData.get(campo) ?? "").trim()
}

function ouNull(v: string): string | null {
  return v || null
}

const BASE = "/painel/institucional/custeios"

function revalidar(id?: string) {
  revalidatePath(BASE)
  if (id) revalidatePath(`${BASE}/${id}`)
}

function lerDadosCusteio(formData: FormData): DadosCusteio {
  const valorBruto = texto(formData, "valor_parcela")
  const per = texto(formData, "periodicidade")
  const periodicidade: Periodicidade = ["mensal", "anual", "unica"].includes(per)
    ? (per as Periodicidade)
    : "mensal"
  return {
    finalidadeId: texto(formData, "finalidade_id"),
    tipoBeneficiario: texto(formData, "tipo_beneficiario"),
    beneficiarioId: texto(formData, "beneficiario_id"),
    descricao: ouNull(texto(formData, "descricao")),
    evento: ouNull(texto(formData, "evento")),
    centroCustoDespesaId: ouNull(texto(formData, "centro_custo_despesa_id")),
    cadencia: texto(formData, "cadencia") === "recorrente"
      ? "recorrente"
      : "pontual",
    valorParcela: (valorBruto ? parseValorBR(valorBruto) : 0) ?? 0,
    numParcelas: Number(texto(formData, "num_parcelas")) || 1,
    periodicidade,
    primeiroVencimento: ouNull(texto(formData, "primeiro_vencimento")),
    formaPagamento: ouNull(texto(formData, "forma_pagamento")),
  }
}

// ── Custeio ──────────────────────────────────────────────────────────────────

export async function criarCusteioAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await requirePermissao("custeio_institucional_edicao")
  const res = await criarCusteio(lerDadosCusteio(formData), sessao.usuario.id)
  if ("erro" in res) return { erro: res.erro }
  revalidar(res.id)
  redirect(`${BASE}/${res.id}?salvo=1`)
}

export async function atualizarCusteioAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("custeio_institucional_edicao")
  const id = texto(formData, "custeio_id")
  if (!id) return { erro: "Custeio inválido." }
  const res = await atualizarCusteio(id, lerDadosCusteio(formData))
  if ("erro" in res) return { erro: res.erro }
  revalidar(id)
  redirect(`${BASE}/${id}?salvo=1`)
}

export async function submeterCusteioAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("custeio_institucional_edicao")
  const id = texto(formData, "custeio_id")
  if (!id) return { erro: "Custeio inválido." }
  const res = await submeterCusteio(id)
  if ("erro" in res) return { erro: res.erro }
  revalidar(id)
  redirect(`${BASE}/${id}?submetido=1`)
}

export async function autorizarCusteioAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await requirePermissao("custeio_institucional_autorizacao")
  const id = texto(formData, "custeio_id")
  if (!id) return { erro: "Custeio inválido." }
  const res = await autorizarCusteio(id, sessao.usuario.id)
  if ("erro" in res) return { erro: res.erro }
  revalidar(id)
  const params = new URLSearchParams({
    geradas: String(res.geradas ?? 0),
    puladas: String(res.puladas ?? 0),
  })
  redirect(`${BASE}/${id}?${params.toString()}`)
}

export async function reprovarCusteioAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await requirePermissao("custeio_institucional_autorizacao")
  const id = texto(formData, "custeio_id")
  if (!id) return { erro: "Custeio inválido." }
  const res = await reprovarCusteio(
    id,
    texto(formData, "motivo_reprovacao"),
    sessao.usuario.id
  )
  if ("erro" in res) return { erro: res.erro }
  revalidar(id)
  redirect(`${BASE}/${id}?reprovado=1`)
}

export async function cancelarCusteioAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("custeio_institucional_edicao")
  const id = texto(formData, "custeio_id")
  if (!id) return { erro: "Custeio inválido." }
  const res = await cancelarCusteio(id)
  if ("erro" in res) return { erro: res.erro }
  revalidar(id)
  redirect(`${BASE}/${id}?cancelado=1`)
}

// ── Finalidades ──────────────────────────────────────────────────────────────

export async function salvarFinalidadeAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("custeio_institucional_edicao")
  const res = await salvarFinalidade({
    id: ouNull(texto(formData, "finalidade_id")) ?? undefined,
    nome: texto(formData, "nome"),
    descricao: ouNull(texto(formData, "descricao")),
    tipoBeneficiarioSugerido: texto(formData, "tipo_beneficiario_sugerido"),
    centroCustoDespesaId: ouNull(texto(formData, "centro_custo_despesa_id")),
    ativa: texto(formData, "ativa") === "on",
    ordem: Number(texto(formData, "ordem")) || 0,
  })
  if ("erro" in res) return { erro: res.erro }
  revalidatePath(`${BASE}/finalidades`)
  revalidatePath(BASE)
  redirect(`${BASE}/finalidades?salvo=1`)
}

// ── Convidados ───────────────────────────────────────────────────────────────

export async function salvarConvidadoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("custeio_institucional_edicao")
  const res = await salvarConvidado({
    id: ouNull(texto(formData, "convidado_id")) ?? undefined,
    nome: texto(formData, "nome"),
    cpf: ouNull(texto(formData, "cpf")),
    email: ouNull(texto(formData, "email")),
    telefone: ouNull(texto(formData, "telefone")),
    banco: ouNull(texto(formData, "banco")),
    agencia: ouNull(texto(formData, "agencia")),
    conta: ouNull(texto(formData, "conta")),
    tipoConta: ouNull(texto(formData, "tipo_conta")),
    pix: ouNull(texto(formData, "pix")),
    tipoChavePix: ouNull(texto(formData, "tipo_chave_pix")),
    observacoes: ouNull(texto(formData, "observacoes")),
  })
  if ("erro" in res) return { erro: res.erro }
  revalidatePath(`${BASE}/convidados`)
  redirect(`${BASE}/convidados?salvo=1`)
}
