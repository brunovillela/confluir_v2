"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import {
  atualizarDemanda,
  criarDemanda,
  definirSituacaoDemanda,
  type DadosDemanda,
} from "@/lib/db/nucleo"
import {
  SITUACOES_DEMANDA,
  type SituacaoDemanda,
} from "@/lib/nucleo-constantes"

function texto(formData: FormData, campo: string): string {
  return String(formData.get(campo) ?? "").trim()
}

function dataISO(valor: string): string | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(valor) ? valor : null
}

function moeda(valor: string): number | null {
  if (!valor) return null
  const n = Number(valor.replace(",", "."))
  return Number.isFinite(n) && n >= 0 ? n : null
}

function situacao(valor: string): SituacaoDemanda {
  return (SITUACOES_DEMANDA as readonly string[]).includes(valor)
    ? (valor as SituacaoDemanda)
    : "A fazer"
}

function lerDados(formData: FormData): DadosDemanda {
  return {
    nome: texto(formData, "nome"),
    descricao: texto(formData, "descricao") || null,
    situacao: situacao(texto(formData, "situacao")),
    prazo: dataISO(texto(formData, "prazo")),
    orcamento: moeda(texto(formData, "orcamento")),
    membro_responsavel_id: texto(formData, "membro_responsavel_id") || null,
  }
}

export async function criarDemandaAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("ferramentas_demandas")
  const dados = lerDados(formData)
  if (!dados.nome) return { erro: "Informe o nome da demanda." }

  const { id, erro } = await criarDemanda(dados)
  if (erro) return { erro }
  revalidatePath("/painel/ferramentas/demandas")
  redirect(`/painel/ferramentas/demandas/${id}?salvo=1`)
}

export async function atualizarDemandaAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("ferramentas_demandas")
  const id = texto(formData, "demanda_id")
  if (!id) return { erro: "Demanda inválida." }
  const dados = lerDados(formData)
  if (!dados.nome) return { erro: "Informe o nome da demanda." }

  const { erro } = await atualizarDemanda(id, dados)
  if (erro) return { erro }
  revalidatePath("/painel/ferramentas/demandas")
  revalidatePath(`/painel/ferramentas/demandas/${id}`)
  redirect(`/painel/ferramentas/demandas/${id}?salvo=1`)
}

export async function definirSituacaoDemandaAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("ferramentas_demandas")
  const id = texto(formData, "demanda_id")
  const nova = situacao(texto(formData, "situacao"))
  if (!id) return { erro: "Demanda inválida." }

  const { erro } = await definirSituacaoDemanda(id, nova)
  if (erro) return { erro }
  revalidatePath("/painel/ferramentas/demandas")
  revalidatePath(`/painel/ferramentas/demandas/${id}`)
  return { ok: "Situação atualizada." }
}
