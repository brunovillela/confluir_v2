"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { baixarCobranca, subirArquivoVeiculos } from "@/lib/db/veiculos"

export async function baixarCobrancaAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await requirePermissao("financeiro_pagamento")
  const infracaoId = String(formData.get("infracao_id") ?? "").trim()
  const observacao = String(formData.get("observacao") ?? "").trim()
  if (!infracaoId) return { erro: "Cobrança inválida." }
  if (!observacao) {
    return {
      erro: "Descreva como o valor foi recebido (referência do contracheque, diária, depósito…).",
    }
  }

  let comprovanteUrl: string | null = null
  const comprovante = formData.get("comprovante")
  if (comprovante instanceof File && comprovante.size > 0) {
    const { caminho, erro } = await subirArquivoVeiculos(
      `baixas/${infracaoId}`,
      comprovante
    )
    if (erro) return { erro }
    comprovanteUrl = caminho ?? null
  }

  const { erro } = await baixarCobranca(infracaoId, sessao.usuario.id, {
    observacao,
    comprovante_url: comprovanteUrl,
  })
  if (erro) return { erro }
  revalidatePath("/painel/financeiro/multas")
  revalidatePath(`/painel/veiculos/infracoes/${infracaoId}`)
  revalidatePath("/painel/veiculos/infracoes")
  redirect("/painel/financeiro/multas?salvo=1")
}
