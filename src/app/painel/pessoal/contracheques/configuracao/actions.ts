"use server"

import { revalidatePath } from "next/cache"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import {
  centrosDeCustoParaFolha,
  salvarConfigContracheques,
} from "@/lib/db/contracheques-ordens"
import { listarDepartamentos } from "@/lib/db/compras"
import { salvarConfigHE } from "@/lib/db/ponto-horas-pagas"
import { normalizarRubricas } from "@/lib/ponto-horas-pagas"

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

/** Horas extras no contracheque (Ponto, Fase 2 — 28/11/2026): rubricas e o que a IA pode ver. */
export async function salvarConfigHEAction(_prev: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const sessao = await requirePermissao("pessoal_gestao")
  let bruto: unknown = []
  try {
    bruto = JSON.parse(String(formData.get("rubricas") ?? "[]"))
  } catch {
    return { erro: "Rubricas inválidas." }
  }
  const rubricas = normalizarRubricas(bruto)
  if (rubricas.length > 40) return { erro: "No máximo 40 rubricas." }
  const { erro } = await salvarConfigHE(
    {
      rubricas,
      referencia: formData.get("referencia") === "hhmm" ? "hhmm" : "decimal",
      iaLinhas: formData.get("ia_linhas") === "on",
      lerImagem: formData.get("ler_imagem") === "on",
    },
    sessao.usuario.id
  )
  if (erro) return { erro }
  revalidatePath("/painel/pessoal/contracheques", "layout")
  revalidatePath("/painel/pessoal/ponto", "layout")
  return { ok: rubricas.length ? `Configuração salva: ${rubricas.length} rubrica(s).` : "Configuração salva, sem rubricas: a leitura das horas pagas fica desligada." }
}
