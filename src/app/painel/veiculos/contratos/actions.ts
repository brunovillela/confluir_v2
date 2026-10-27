"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import {
  criarContrato,
  finalizarContrato,
  gerarOrdemAluguel,
  subirArquivoVeiculos,
} from "@/lib/db/veiculos"
import { parseValorBR } from "@/lib/valores"

function texto(formData: FormData, campo: string): string {
  return String(formData.get(campo) ?? "").trim()
}

function arquivo(formData: FormData, campo: string): File | null {
  const f = formData.get(campo)
  return f instanceof File && f.size > 0 ? f : null
}

function dataISO(valor: string): string | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(valor) ? valor : null
}

export async function criarContratoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await requirePermissao("veiculos_gestao")
  const numero = texto(formData, "numero")
  const fornecedorId = texto(formData, "fornecedor_id")
  const inicio = dataISO(texto(formData, "vigencia_inicio"))
  if (!numero) return { erro: "Informe o número do contrato na locadora." }
  if (!fornecedorId) return { erro: "Busque e selecione a locadora." }
  if (!inicio) return { erro: "Informe o início da vigência." }

  let arquivoUrl: string | null = null
  const arquivo = formData.get("arquivo_contrato")
  if (arquivo instanceof File && arquivo.size > 0) {
    const { caminho, erro } = await subirArquivoVeiculos("contratos", arquivo)
    if (erro) return { erro }
    arquivoUrl = caminho ?? null
  }

  const { id, erro } = await criarContrato({
    numero,
    fornecedor_id: fornecedorId,
    responsavel_id: texto(formData, "responsavel_id") || sessao.usuario.id,
    vigencia_inicio: inicio,
    vigencia_termino: dataISO(texto(formData, "vigencia_termino")),
    valor_mensal: parseValorBR(texto(formData, "valor_mensal")),
    finalidade: texto(formData, "finalidade") || null,
    centro_custo_id: texto(formData, "centro_custo_id") || null,
    departamento_id: texto(formData, "departamento_id") || null,
    arquivo_contrato_url: arquivoUrl,
  })
  if (erro) return { erro }
  revalidatePath("/painel/veiculos/contratos")
  redirect(`/painel/veiculos/contratos/${id}?salvo=1`)
}

export async function finalizarContratoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("veiculos_gestao")
  const id = texto(formData, "contrato_id")
  if (!id) return { erro: "Contrato inválido." }
  const { erro } = await finalizarContrato(id)
  if (erro) return { erro }
  revalidatePath(`/painel/veiculos/contratos/${id}`)
  revalidatePath("/painel/veiculos/contratos")
  revalidatePath("/painel/veiculos")
  redirect(`/painel/veiculos/contratos/${id}?salvo=1`)
}

export async function gerarOrdemAluguelAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("veiculos_gestao")
  const id = texto(formData, "contrato_id")
  const de = dataISO(texto(formData, "periodo_inicio"))
  const ate = dataISO(texto(formData, "periodo_fim"))
  const valor = parseValorBR(texto(formData, "valor"))
  if (!id) return { erro: "Contrato inválido." }
  if (!de || !ate) return { erro: "Informe o período cobrado (de/até)." }
  if (ate < de) return { erro: "O fim do período é anterior ao início." }
  if (valor === null || valor <= 0) return { erro: "Informe o valor da cobrança." }

  const br = (iso: string) => iso.split("-").reverse().join("/")
  const { erro } = await gerarOrdemAluguel(id, {
    periodo: `${br(de)} a ${br(ate)}`,
    valor,
    vencimento: dataISO(texto(formData, "vencimento")),
    fatura: arquivo(formData, "fatura"),
    boleto: arquivo(formData, "boleto"),
  })
  if (erro) return { erro }
  revalidatePath(`/painel/veiculos/contratos/${id}`)
  redirect(`/painel/veiculos/contratos/${id}?salvo=1`)
}
