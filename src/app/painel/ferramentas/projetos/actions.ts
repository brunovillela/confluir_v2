"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import {
  atualizarProjeto,
  criarProjeto,
  definirFinalizado,
  type DadosProjeto,
} from "@/lib/db/projetos"

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

function lerDados(formData: FormData): DadosProjeto {
  return {
    titulo: texto(formData, "titulo"),
    tipo: texto(formData, "tipo") || null,
    detalhamento: texto(formData, "detalhamento") || null,
    orcamento: moeda(texto(formData, "orcamento")),
    inicio: dataISO(texto(formData, "inicio")),
    termino_previsao: dataISO(texto(formData, "termino_previsao")),
    centro_custo_id: texto(formData, "centro_custo_id") || null,
    estrategico: texto(formData, "estrategico") === "1",
  }
}

export async function criarProjetoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("ferramentas_projetos_edicao")
  const dados = lerDados(formData)
  if (!dados.titulo) return { erro: "Informe o título do projeto." }
  if (!dados.tipo) return { erro: "Selecione o tipo do projeto." }

  const { id, erro } = await criarProjeto(dados)
  if (erro) return { erro }
  revalidatePath("/painel/ferramentas/projetos")
  redirect(`/painel/ferramentas/projetos/${id}?salvo=1`)
}

export async function atualizarProjetoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("ferramentas_projetos_edicao")
  const id = texto(formData, "projeto_id")
  if (!id) return { erro: "Projeto inválido." }
  const dados = lerDados(formData)
  if (!dados.titulo) return { erro: "Informe o título do projeto." }
  if (!dados.tipo) return { erro: "Selecione o tipo do projeto." }

  const { erro } = await atualizarProjeto(id, dados)
  if (erro) return { erro }
  revalidatePath("/painel/ferramentas/projetos")
  revalidatePath(`/painel/ferramentas/projetos/${id}`)
  redirect(`/painel/ferramentas/projetos/${id}?salvo=1`)
}

export async function alternarFinalizadoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("ferramentas_projetos_edicao")
  const id = texto(formData, "projeto_id")
  const finalizado = texto(formData, "finalizado") === "1"
  if (!id) return { erro: "Projeto inválido." }

  const { erro } = await definirFinalizado(id, finalizado)
  if (erro) return { erro }
  revalidatePath("/painel/ferramentas/projetos")
  revalidatePath(`/painel/ferramentas/projetos/${id}`)
  redirect(`/painel/ferramentas/projetos/${id}?salvo=1`)
}
