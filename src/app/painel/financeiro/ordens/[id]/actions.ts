"use server"

import { tenantAtual } from "@/lib/tenant"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import {
  cancelarOrdem,
  corrigirOrdem,
  registrarEvento,
  reenviarParaAutorizacao,
  SITUACOES_PAGAVEIS,
} from "@/lib/db/ordens-ciclo"
import { createAdminClient } from "@/lib/supabase/admin"
import { parseValorBR } from "@/lib/valores"

function revalidarOrdem(id: string) {
  revalidatePath(`/painel/financeiro/ordens/${id}`)
  revalidatePath("/painel/financeiro/ordens")
  revalidatePath("/painel/financeiro")
  revalidatePath("/painel/compras/avaliacoes")
}

function texto(formData: FormData, campo: string): string {
  return String(formData.get(campo) ?? "").trim()
}

/**
 * Registra/atualiza o pagamento da ordem: valor, data, comprovante (PDF no
 * bucket 'comprovantes', caminho ordens/…) e centro de custo da receita — a
 * conta de onde o dinheiro saiu (banco, caixa). Só ordem AUTORIZADA ("A
 * pagar") é paga; registrar marca Paga e grava o pagador (usuário logado).
 */
export async function salvarPagamento(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await requirePermissao("financeiro_pagamento")

  const id = texto(formData, "id")
  if (!id) return { erro: "Ordem inválida." }

  const valor = parseValorBR(texto(formData, "valor_pago"))
  if (valor === null || valor <= 0) {
    return { erro: "Informe o valor do pagamento." }
  }
  const dataPagamento = texto(formData, "data_pagamento")
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataPagamento)) {
    return { erro: "Informe a data do pagamento." }
  }
  const centroReceitaId = texto(formData, "centro_custo_receita_id") || null
  if (!centroReceitaId) {
    return { erro: "Informe o centro de custo do débito — a conta de onde o dinheiro saiu." }
  }

  const admin = await createAdminClient()
  const { data: ordem } = await admin
    .from("ordens_pagamento")
    .select("id, situacao, arquivo_pagamento, data_pagamento, valor_pago")
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (!ordem) return { erro: "Ordem não encontrada." }
  // Primeiro registro exige autorização; editar um pagamento já registrado
  // (ordem Paga) é permitido.
  const editando = ordem.situacao === "Paga"
  if (!editando && !SITUACOES_PAGAVEIS.includes(String(ordem.situacao))) {
    return {
      erro:
        ordem.situacao === "Em autorização" || ordem.situacao === "Aguardando informações"
          ? "A ordem ainda não foi autorizada — só ordem \"A pagar\" pode ser paga."
          : `Ordem "${ordem.situacao}" não pode ser paga.`,
    }
  }

  const { data: centro } = await admin
    .from("centros_de_custo")
    .select("id")
    .eq("id", centroReceitaId)
    .maybeSingle()
  if (!centro) return { erro: "Centro de custo do débito inválido." }

  // Comprovante é opcional na edição (mantém o atual se nenhum for enviado).
  let arquivoPagamento: string | undefined
  const arquivo = formData.get("comprovante")
  if (arquivo instanceof File && arquivo.size > 0) {
    if (arquivo.type !== "application/pdf") {
      return { erro: "O comprovante deve ser um arquivo PDF." }
    }
    if (arquivo.size > 3 * 1024 * 1024) {
      return { erro: "O comprovante deve ter no máximo 3 MB." }
    }
    const caminho = `ordens/${id}/${Date.now()}.pdf`
    const { error: erroUpload } = await admin.storage
      .from("comprovantes")
      .upload(caminho, arquivo, { contentType: "application/pdf" })
    if (erroUpload) {
      return { erro: `Falha ao subir o comprovante: ${erroUpload.message}` }
    }
    arquivoPagamento = caminho
  }

  const { error } = await admin
    .from("ordens_pagamento")
    .update({
      valor_pago: valor,
      data_pagamento: dataPagamento,
      centro_custo_receita_id: centroReceitaId,
      pagador_id: sessao.usuario.id,
      situacao: "Paga",
      ...(arquivoPagamento ? { arquivo_pagamento: arquivoPagamento } : {}),
    })
    .eq("id", id)
  if (error) return { erro: `Não foi possível salvar o pagamento: ${error.message}` }

  await registrarEvento(
    id,
    "paga",
    sessao.usuario.id,
    editando ? "Dados do pagamento alterados." : null,
    {
      valor_pago: valor,
      data_pagamento: dataPagamento,
      centro_custo_receita_id: centroReceitaId,
      comprovante: Boolean(arquivoPagamento ?? ordem.arquivo_pagamento),
      ...(editando
        ? { antes: { valor_pago: ordem.valor_pago, data_pagamento: ordem.data_pagamento } }
        : {}),
    }
  )
  revalidarOrdem(id)
  redirect(`/painel/financeiro/ordens/${id}?salvo=1`)
}

/**
 * Remove o registro de pagamento: limpa valor/data/comprovante/pagador e a
 * situação volta para "A pagar" (autorizada) ou "Em autorização".
 */
export async function removerPagamento(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await requirePermissao("financeiro_pagamento")

  const id = texto(formData, "id")
  if (!id) return { erro: "Ordem inválida." }

  const admin = await createAdminClient()
  const { data: ordem } = await admin
    .from("ordens_pagamento")
    .select("id, autorizacao_esta_autorizado, valor_pago, data_pagamento")
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (!ordem) return { erro: "Ordem não encontrada." }

  const { error } = await admin
    .from("ordens_pagamento")
    .update({
      valor_pago: null,
      data_pagamento: null,
      arquivo_pagamento: null,
      pagador_id: null,
      situacao:
        ordem.autorizacao_esta_autorizado === true ? "A pagar" : "Em autorização",
    })
    .eq("id", id)
  if (error) return { erro: `Não foi possível remover o pagamento: ${error.message}` }

  await registrarEvento(id, "pagamento_removido", sessao.usuario.id, null, {
    valor_pago: ordem.valor_pago,
    data_pagamento: ordem.data_pagamento,
  })
  revalidarOrdem(id)
  redirect(`/painel/financeiro/ordens/${id}?removido=1`)
}

export async function cancelarOrdemAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await requirePermissao("financeiro_pagamento")
  const id = texto(formData, "id")
  if (!id) return { erro: "Ordem inválida." }
  const { erro } = await cancelarOrdem(id, sessao.usuario.id, texto(formData, "motivo"))
  if (erro) return { erro }
  revalidarOrdem(id)
  redirect(`/painel/financeiro/ordens/${id}?cancelada=1`)
}

export async function corrigirOrdemAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await requirePermissao("financeiro_pagamento")
  const id = texto(formData, "id")
  if (!id) return { erro: "Ordem inválida." }
  const valorTexto = texto(formData, "valor")
  const valor = valorTexto ? parseValorBR(valorTexto) : null
  if (valorTexto && (valor === null || valor <= 0)) return { erro: "Valor inválido." }
  const vencimento = texto(formData, "vencimento")
  if (vencimento && !/^\d{4}-\d{2}-\d{2}$/.test(vencimento)) {
    return { erro: "Vencimento inválido." }
  }
  const { erro, voltouParaAutorizacao } = await corrigirOrdem(
    id,
    sessao.usuario.id,
    {
      descricao: texto(formData, "descricao") || null,
      valor,
      vencimento: vencimento || null,
      centroCustoDespesaId: texto(formData, "centro_custo_despesa_id") || null,
      formaPagamento: texto(formData, "forma_pagamento") || null,
    },
    texto(formData, "motivo")
  )
  if (erro) return { erro }
  revalidarOrdem(id)
  redirect(
    `/painel/financeiro/ordens/${id}?corrigida=${voltouParaAutorizacao ? "reautorizar" : "1"}`
  )
}

export async function reenviarOrdemAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await requirePermissao("financeiro_pagamento", ["aquisicoes_avaliacoes"])
  const id = texto(formData, "id")
  if (!id) return { erro: "Ordem inválida." }
  const { erro } = await reenviarParaAutorizacao(id, sessao.usuario.id, texto(formData, "observacao"))
  if (erro) return { erro }
  revalidarOrdem(id)
  redirect(`/painel/financeiro/ordens/${id}?reenviada=1`)
}
