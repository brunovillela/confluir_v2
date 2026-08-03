"use server"

import { tenantAtual } from "@/lib/tenant"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { createAdminClient } from "@/lib/supabase/admin"
import { parseValorBR } from "@/lib/valores"

function revalidarOrdem(id: string) {
  revalidatePath(`/painel/financeiro/ordens/${id}`)
  revalidatePath("/painel/financeiro/ordens")
  revalidatePath("/painel/financeiro")
}

/**
 * Registra/atualiza o pagamento da ordem: valor, data, comprovante (PDF no
 * bucket 'comprovantes', caminho ordens/…) e centro de custo da receita.
 * Registrar marca a ordem como Paga e grava o pagador (usuário logado).
 */
export async function salvarPagamento(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await requirePermissao("financeiro_pagamento")

  const id = String(formData.get("id") ?? "")
  if (!id) return { erro: "Ordem inválida." }

  const valor = parseValorBR(String(formData.get("valor_pago") ?? ""))
  if (valor === null || valor <= 0) {
    return { erro: "Informe o valor do pagamento." }
  }
  const dataPagamento = String(formData.get("data_pagamento") ?? "")
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataPagamento)) {
    return { erro: "Informe a data do pagamento." }
  }
  const centroReceitaId = String(formData.get("centro_custo_receita_id") ?? "") || null

  const admin = await createAdminClient()
  const { data: ordem } = await admin
    .from("ordens_pagamento")
    .select("id, arquivo_pagamento")
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (!ordem) return { erro: "Ordem não encontrada." }

  if (centroReceitaId) {
    const { data: centro } = await admin
      .from("centros_de_custo")
      .select("id")
      .eq("id", centroReceitaId)
      .maybeSingle()
    if (!centro) return { erro: "Centro de custo da receita inválido." }
  }

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
  await requirePermissao("financeiro_pagamento")

  const id = String(formData.get("id") ?? "")
  if (!id) return { erro: "Ordem inválida." }

  const admin = await createAdminClient()
  const { data: ordem } = await admin
    .from("ordens_pagamento")
    .select("id, autorizacao_esta_autorizado")
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

  revalidarOrdem(id)
  redirect(`/painel/financeiro/ordens/${id}?removido=1`)
}
