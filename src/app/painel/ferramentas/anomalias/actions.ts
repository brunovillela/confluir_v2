"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { abrirAnomaliaDaSugestao, descartarSugestao } from "@/lib/db/anomalias-sugestoes"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import {
  atualizarAnomalia,
  criarAnomalia,
  type DadosAnomalia,
} from "@/lib/db/nucleo"

function texto(formData: FormData, campo: string): string {
  return String(formData.get(campo) ?? "").trim()
}

function dataISO(valor: string): string | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(valor) ? valor : null
}

function lerDados(formData: FormData): DadosAnomalia {
  return {
    fato: texto(formData, "fato"),
    conformidade: texto(formData, "conformidade") || null,
    descricao_detalhada: texto(formData, "descricao_detalhada") || null,
    data_ocorrencia: dataISO(texto(formData, "data_ocorrencia")),
    responsavel_id: texto(formData, "responsavel_id") || null,
    causa_raiz: texto(formData, "causa_raiz") || null,
    investigacao_pq1: texto(formData, "investigacao_pq1") || null,
    investigacao_pq2: texto(formData, "investigacao_pq2") || null,
    investigacao_pq3: texto(formData, "investigacao_pq3") || null,
    investigacao_pq4: texto(formData, "investigacao_pq4") || null,
    investigacao_pq5: texto(formData, "investigacao_pq5") || null,
    anomalia_investigada: texto(formData, "anomalia_investigada") === "1",
    anomalia_tratada: texto(formData, "anomalia_tratada") === "1",
    eficacia_verificada: texto(formData, "eficacia_verificada") === "1",
  }
}

export async function criarAnomaliaAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("ferramentas_anomalias")
  const dados = lerDados(formData)
  if (!dados.fato) return { erro: "Descreva o fato (o que aconteceu)." }

  const { id, erro } = await criarAnomalia(dados)
  if (erro) return { erro }
  revalidatePath("/painel/ferramentas/anomalias")
  redirect(`/painel/ferramentas/anomalias/${id}?salvo=1`)
}

export async function atualizarAnomaliaAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("ferramentas_anomalias")
  const id = texto(formData, "anomalia_id")
  if (!id) return { erro: "Anomalia inválida." }
  const dados = lerDados(formData)
  if (!dados.fato) return { erro: "Descreva o fato (o que aconteceu)." }

  const { erro } = await atualizarAnomalia(id, dados)
  if (erro) return { erro }
  revalidatePath("/painel/ferramentas/anomalias")
  revalidatePath(`/painel/ferramentas/anomalias/${id}`)
  redirect(`/painel/ferramentas/anomalias/${id}?salvo=1`)
}

// ── Sugestões do sistema ─────────────────────────────────────────────────────

/** Abre a anomalia já preenchida a partir da sugestão e leva à página dela. */
export async function abrirSugestaoAction(_prev: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const sessao = await requirePermissao("ferramentas_anomalias")
  const id = String(formData.get("sugestao_id") ?? "")
  if (!id) return { erro: "Sugestão inválida." }
  const { erro, anomaliaId } = await abrirAnomaliaDaSugestao(id, String(sessao.usuario.id))
  if (erro || !anomaliaId) return { erro: erro ?? "Falha ao abrir a anomalia." }
  revalidatePath("/painel/ferramentas/anomalias")
  redirect(`/painel/ferramentas/anomalias/${anomaliaId}?salvo=1`)
}

export async function descartarSugestaoAction(_prev: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const sessao = await requirePermissao("ferramentas_anomalias")
  const id = String(formData.get("sugestao_id") ?? "")
  if (!id) return { erro: "Sugestão inválida." }
  const { erro } = await descartarSugestao(id, String(sessao.usuario.id))
  if (erro) return { erro }
  revalidatePath("/painel/ferramentas/anomalias")
  return { ok: "Sugestão descartada." }
}
