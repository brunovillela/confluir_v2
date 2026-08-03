"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { atualizarVeiculo, criarVeiculo } from "@/lib/db/veiculos"

function texto(formData: FormData, campo: string): string {
  return String(formData.get(campo) ?? "").trim()
}

function dataISO(valor: string): string | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(valor) ? valor : null
}

/** '2016' → '2016-01-01' (colunas DATE no legado). */
function anoParaData(valor: string): string | null {
  return /^\d{4}$/.test(valor) ? `${valor}-01-01` : null
}

function lerDadosVeiculo(formData: FormData) {
  return {
    placa: texto(formData, "placa"),
    marca_modelo: texto(formData, "marca_modelo"),
    cor: texto(formData, "cor") || null,
    combustivel: texto(formData, "combustivel") || null,
    lotacao: texto(formData, "lotacao") || null,
    renavan: texto(formData, "renavan") || null,
    ano_fabricacao: anoParaData(texto(formData, "ano_fabricacao")),
    ano_modelo: anoParaData(texto(formData, "ano_modelo")),
    seguro_vencimento: dataISO(texto(formData, "seguro_vencimento")),
    contrato_aluguel_id: texto(formData, "contrato_aluguel_id") || null,
  }
}

export async function criarVeiculoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("veiculos_gestao")
  const dados = lerDadosVeiculo(formData)
  if (!dados.placa) return { erro: "Informe a placa." }
  if (!dados.marca_modelo) return { erro: "Informe a marca e o modelo." }

  const { id, erro } = await criarVeiculo({
    ...dados,
    eh_alugado: dados.contrato_aluguel_id !== null,
  })
  if (erro) return { erro }
  revalidatePath("/painel/veiculos")
  redirect(`/painel/veiculos/${id}?salvo=1`)
}

export async function atualizarVeiculoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("veiculos_gestao")
  const id = texto(formData, "veiculo_id")
  if (!id) return { erro: "Veículo inválido." }
  const dados = lerDadosVeiculo(formData)
  if (!dados.placa) return { erro: "Informe a placa." }
  if (!dados.marca_modelo) return { erro: "Informe a marca e o modelo." }

  const { erro } = await atualizarVeiculo(id, {
    ...dados,
    eh_alugado: dados.contrato_aluguel_id !== null,
  })
  if (erro) return { erro }
  revalidatePath(`/painel/veiculos/${id}`)
  revalidatePath("/painel/veiculos")
  redirect(`/painel/veiculos/${id}?salvo=1`)
}

export async function alternarManutencaoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("veiculos_gestao")
  const id = texto(formData, "veiculo_id")
  const emManutencao = texto(formData, "manutencao") === "1"
  if (!id) return { erro: "Veículo inválido." }
  const { erro } = await atualizarVeiculo(id, { manutencao: emManutencao })
  if (erro) return { erro }
  revalidatePath(`/painel/veiculos/${id}`)
  revalidatePath("/painel/veiculos")
  redirect(`/painel/veiculos/${id}?salvo=1`)
}

export async function alternarInatividadeAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("veiculos_gestao")
  const id = texto(formData, "veiculo_id")
  const inativo = texto(formData, "inativo") === "1"
  if (!id) return { erro: "Veículo inválido." }
  const { erro } = await atualizarVeiculo(id, { inativo })
  if (erro) return { erro }
  revalidatePath(`/painel/veiculos/${id}`)
  revalidatePath("/painel/veiculos")
  redirect(`/painel/veiculos/${id}?salvo=1`)
}
