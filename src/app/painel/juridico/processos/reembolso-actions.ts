"use server"

import { revalidatePath } from "next/cache"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import {
  avaliarReembolso,
  criarReembolso,
  definirCentroCustoJuridico,
  gravarComprovanteReembolso,
} from "@/lib/db/juridico"
import { parseValorBR } from "@/lib/valores"

function texto(formData: FormData, campo: string): string {
  return String(formData.get(campo) ?? "").trim()
}

function dataISO(valor: string): string | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(valor) ? valor : null
}

function revalidar(processoId: string) {
  revalidatePath(`/painel/juridico/processos/${processoId}`)
  revalidatePath("/painel/juridico/reembolsos")
  revalidatePath("/painel/juridico")
}

/** Registra uma despesa do escritório para reembolso (situação 'aguardando'). */
export async function registrarReembolsoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await requirePermissao("juridico_geral", [
    "juridico_gestao",
    "juridico_homologacoes",
  ])

  const processoId = texto(formData, "processo_id")
  if (!processoId) return { erro: "Processo inválido." }

  const valor = parseValorBR(texto(formData, "valor"))
  if (valor === null || valor <= 0) return { erro: "Informe o valor da despesa." }

  const descricao = texto(formData, "descricao_despesa")
  if (!descricao) return { erro: "Descreva a despesa reembolsada." }

  const comprovante = formData.get("comprovante")
  if (!(comprovante instanceof File) || comprovante.size === 0) {
    return { erro: "Anexe o comprovante da despesa." }
  }

  const criado = await criarReembolso(
    {
      processo_id: processoId,
      valor,
      descricao_despesa: descricao,
      data_despesa: dataISO(texto(formData, "data_despesa")),
    },
    sessao.usuario.id
  )
  if (criado.erro) return { erro: criado.erro }

  const up = await gravarComprovanteReembolso(criado.id!, comprovante)
  if (up.erro) return { erro: up.erro }

  revalidar(processoId)
  return { ok: "Despesa registrada — aguardando aprovação." }
}

/** Avalia (aprova/reprova) o reembolso. Aprovar gera a ordem 'Em autorização'. */
export async function avaliarReembolsoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await requirePermissao("juridico_gestao", ["juridico_geral"])

  const id = texto(formData, "reembolso_id")
  const processoId = texto(formData, "processo_id")
  if (!id) return { erro: "Reembolso inválido." }

  const decisao = texto(formData, "decisao")
  if (decisao !== "aprovar" && decisao !== "reprovar") {
    return { erro: "Escolha aprovar ou reprovar." }
  }
  const observacao = texto(formData, "observacao") || null
  if (decisao === "reprovar" && !observacao) {
    return { erro: "Informe o motivo da reprovação." }
  }

  const { erro } = await avaliarReembolso(id, sessao.usuario.id, {
    aprovar: decisao === "aprovar",
    observacao,
  })
  if (erro) return { erro }

  if (processoId) revalidar(processoId)
  else {
    revalidatePath("/painel/juridico/reembolsos")
    revalidatePath("/painel/juridico")
  }
  return { ok: decisao === "aprovar" ? "Reembolso aprovado." : "Reembolso reprovado." }
}

/** Define o centro de custo padrão das ordens de reembolso do jurídico. */
export async function definirCentroCustoJuridicoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("juridico_gestao", ["juridico_geral"])

  const centroCustoId = texto(formData, "centro_custo_id") || null
  const { erro } = await definirCentroCustoJuridico(centroCustoId)
  if (erro) return { erro }

  revalidatePath("/painel/juridico/reembolsos")
  return {
    ok: centroCustoId
      ? "Centro de custo dos reembolsos atualizado."
      : "Centro de custo removido.",
  }
}
