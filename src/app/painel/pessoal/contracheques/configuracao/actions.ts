"use server"

import { revalidatePath } from "next/cache"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import {
  centrosDeCustoParaFolha,
  salvarConfigContracheques,
} from "@/lib/db/contracheques-ordens"
import { listarDepartamentos } from "@/lib/db/compras"

export async function salvarConfigContrachequesAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await requirePermissao("pessoal_gestao")
  const centroCustoId = String(formData.get("centro_custo_id") ?? "") || null
  const departamentoId = String(formData.get("departamento_id") ?? "") || null
  const [centros, departamentos] = await Promise.all([
    centrosDeCustoParaFolha(),
    listarDepartamentos(),
  ])
  if (centroCustoId && !centros.some((c) => c.id === centroCustoId)) {
    return { erro: "Centro de custo inválido." }
  }
  if (departamentoId && !departamentos.some((d) => d.id === departamentoId)) {
    return { erro: "Departamento inválido." }
  }
  const gerarOrdem = formData.get("gerar_ordem") === "on"
  if (gerarOrdem && !centroCustoId) {
    return { erro: "Escolha o centro de custo da despesa — toda ordem da folha sai com ele." }
  }

  const { erro } = await salvarConfigContracheques(
    {
      gerarOrdem,
      centroCustoId,
      departamentoId,
      formaPagamento: String(formData.get("forma_pagamento") ?? ""),
    },
    sessao.usuario.id
  )
  if (erro) return { erro }
  revalidatePath("/painel/pessoal/contracheques", "layout")
  return { ok: "Configuração salva." }
}
