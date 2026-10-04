"use server"

import { revalidatePath } from "next/cache"

import { requirePermissao } from "@/lib/auth"
import { salvarOrcamento } from "@/lib/db/financeiro-gerencial"
import { parseValorBR } from "@/lib/valores"

export type EstadoOrcamento = { ok?: boolean; erro?: string; campo?: string }

export async function salvarOrcamentoAction(_prev: EstadoOrcamento, formData: FormData): Promise<EstadoOrcamento> {
  const sessao = await requirePermissao("financeiro_pagamento")
  const ano = Number(formData.get("ano"))
  const centroCustoId = String(formData.get("centro_custo_id") ?? "")
  const bruto = String(formData.get("valor_anual") ?? "").trim()
  const valor = bruto === "" ? 0 : parseValorBR(bruto)
  if (!Number.isInteger(ano) || ano < 2000 || ano > 2100) return { erro: "Ano inválido." }
  if (!/^[0-9a-f-]{36}$/i.test(centroCustoId)) return { erro: "Escolha o centro de custo.", campo: "centro_custo_id" }
  if (valor === null || valor < 0) return { erro: "Informe o valor anual (ex.: 120.000,00).", campo: "valor_anual" }
  const { erro } = await salvarOrcamento({ ano, centroCustoId, valorAnual: valor, usuarioId: sessao.usuario.id })
  if (erro) return { erro }
  revalidatePath("/painel/financeiro/gerencial")
  return { ok: true }
}
