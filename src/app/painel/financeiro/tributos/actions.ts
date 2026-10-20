"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import {
  atualizarTributo,
  cancelarGuiaPrevista,
  criarTributo,
  lancarGuia,
  type DadosTributo,
} from "@/lib/db/tributos"
import { ESFERAS_TRIBUTO, PERIODICIDADES_TRIBUTO, type EsferaTributo, type PeriodicidadeTributo } from "@/lib/tributos-constantes"
import { parseValorBR } from "@/lib/valores"

const BASE = "/painel/financeiro/tributos"

function texto(formData: FormData, campo: string): string {
  return String(formData.get(campo) ?? "").trim()
}

function lerCadastro(formData: FormData): { erro?: string; dados?: DadosTributo } {
  const nome = texto(formData, "nome")
  if (!nome) return { erro: "Dê o nome do tributo." }
  const esfera = texto(formData, "esfera") as EsferaTributo
  if (!ESFERAS_TRIBUTO.some((e) => e.valor === esfera)) return { erro: "Escolha a esfera." }
  const periodicidade = texto(formData, "periodicidade") as PeriodicidadeTributo
  if (!PERIODICIDADES_TRIBUTO.some((p) => p.valor === periodicidade)) return { erro: "Escolha a periodicidade." }
  const diaTexto = texto(formData, "dia_vencimento")
  const dia = diaTexto ? Number(diaTexto) : null
  if (periodicidade === "mensal" && !(dia && dia >= 1 && dia <= 31)) {
    return { erro: "Tributo mensal precisa do dia habitual de vencimento (1 a 31) — é por ele que as guias são previstas." }
  }
  const valorTexto = texto(formData, "valor_esperado")
  const valorEsperado = valorTexto ? parseValorBR(valorTexto) : null
  if (valorTexto && (valorEsperado === null || valorEsperado <= 0)) return { erro: "Valor esperado inválido." }
  const beneficiarioId = texto(formData, "beneficiario_id") || null
  if (!beneficiarioId) return { erro: "Escolha o órgão que recebe o tributo (vira o favorecido das ordens)." }
  return {
    dados: {
      nome,
      abreviacao: texto(formData, "abreviacao") || null,
      esfera,
      beneficiarioId,
      centroCustoId: texto(formData, "centro_custo_id") || null,
      departamentoId: texto(formData, "departamento_id") || null,
      periodicidade,
      diaVencimento: dia,
      valorEsperado,
      formaPagamento: texto(formData, "forma_pagamento") || "Boleto",
      observacoes: texto(formData, "observacoes") || null,
    },
  }
}

export async function salvarTributoAction(_prev: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const sessao = await requirePermissao("financeiro_tributos")
  const { erro, dados } = lerCadastro(formData)
  if (erro || !dados) return { erro }
  const id = texto(formData, "tributo_id")
  if (id) {
    const r = await atualizarTributo(id, { ...dados, ativo: texto(formData, "ativo") !== "0" })
    if (r.erro) return { erro: r.erro }
    revalidatePath(BASE, "layout")
    return { ok: "Tributo salvo." }
  }
  const r = await criarTributo(dados, sessao.usuario.id)
  if (r.erro || !r.id) return { erro: r.erro ?? "Não foi possível cadastrar." }
  revalidatePath(BASE, "layout")
  redirect(`${BASE}/${r.id}?novo=1`)
}

export async function lancarGuiaAction(_prev: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const sessao = await requirePermissao("financeiro_tributos")
  const tributoId = texto(formData, "tributo_id")
  const valor = parseValorBR(texto(formData, "valor"))
  if (valor === null || !(valor > 0)) return { erro: "Informe o valor da guia." }
  const arquivo = formData.get("arquivo")
  if (!(arquivo instanceof File) || arquivo.size === 0) return { erro: "Anexe a guia (PDF ou foto)." }
  const r = await lancarGuia(
    {
      tributoId,
      guiaId: texto(formData, "guia_id") || null,
      competencia: texto(formData, "competencia"),
      valor,
      vencimento: texto(formData, "vencimento"),
      arquivo,
      linhaDigitavel: texto(formData, "linha_digitavel").replace(/\D/g, "") || null,
    },
    sessao.usuario.id
  )
  if (r.erro) return { erro: r.erro }
  revalidatePath(BASE, "layout")
  revalidatePath("/painel/financeiro/ordens")
  redirect(`${BASE}/${tributoId}?lancada=${r.dispensada ? "apagar" : "alcada"}`)
}

export async function cancelarGuiaAction(formData: FormData): Promise<void> {
  await requirePermissao("financeiro_tributos")
  const guiaId = texto(formData, "guia_id")
  const tributoId = texto(formData, "tributo_id")
  if (guiaId) await cancelarGuiaPrevista(guiaId)
  revalidatePath(`${BASE}/${tributoId}`)
}
