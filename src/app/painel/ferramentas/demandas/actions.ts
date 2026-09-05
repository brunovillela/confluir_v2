"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import {
  atualizarDemanda,
  criarDemanda,
  definirSituacaoDemanda,
  excluirDemanda,
  obterDemanda,
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
  const sessao = await requirePermissao("ferramentas_demandas")
  const dados = lerDados(formData)
  if (!dados.nome) return { erro: "Informe o nome da demanda." }

  const { id, erro } = await criarDemanda(dados, sessao.usuario.id)
  if (erro) return { erro }
  revalidatePath("/painel/ferramentas/demandas")
  redirect(`/painel/ferramentas/demandas/${id}?salvo=1`)
}

/**
 * Só o CRIADOR apaga a própria demanda.
 *
 * Exceção para as linhas antigas: elas nasceram antes da coluna `criado_por`
 * existir (vieram do Bubble), e sem uma saída ficariam impossíveis de remover.
 * Nesses casos quem responde pela demanda — o responsável — assume o papel.
 */
export async function excluirDemandaAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await requirePermissao("ferramentas_demandas")
  const id = texto(formData, "demanda_id")
  if (!id) return { erro: "Demanda inválida." }

  const demanda = await obterDemanda(id)
  if (!demanda) return { erro: "Demanda não encontrada." }

  const eu = sessao.usuario.id
  const podeApagar = demanda.criadoPorId
    ? demanda.criadoPorId === eu
    : demanda.responsavelId === eu

  if (!podeApagar) {
    return {
      erro: demanda.criadoPorId
        ? "Só quem criou a demanda pode excluí-la."
        : "Esta demanda não registra quem a criou (é anterior ao sistema atual). Só o responsável por ela pode excluí-la.",
    }
  }

  const { erro } = await excluirDemanda(id)
  if (erro) return { erro }

  revalidatePath("/painel/ferramentas/demandas")
  redirect("/painel/ferramentas/demandas?excluida=1")
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
