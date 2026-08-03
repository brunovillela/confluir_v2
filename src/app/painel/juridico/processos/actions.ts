"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import {
  atualizarProcesso,
  criarProcesso,
  type DadosProcesso,
} from "@/lib/db/juridico"
import { statusProcessoValido, tipoProcessoValido } from "@/lib/juridico-constantes"

const CHAVES: [string, string[]] = [
  "juridico_geral",
  ["juridico_gestao", "juridico_homologacoes"],
]

function texto(formData: FormData, campo: string): string {
  return String(formData.get(campo) ?? "").trim()
}

function dataISO(valor: string): string | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(valor) ? valor : null
}

function revalidar(id?: string) {
  revalidatePath("/painel/juridico")
  revalidatePath("/painel/juridico/processos")
  if (id) revalidatePath(`/painel/juridico/processos/${id}`)
}

function lerDados(formData: FormData): { dados?: DadosProcesso; erro?: string } {
  const numero = texto(formData, "numero_processo")
  if (!numero) return { erro: "Informe o número do processo." }

  const tipoBruto = texto(formData, "tipo")
  if (tipoBruto && !tipoProcessoValido(tipoBruto)) {
    return { erro: "Área do direito inválida." }
  }

  const statusBruto = texto(formData, "status_processo")
  if (statusBruto && !statusProcessoValido(statusBruto)) {
    return { erro: "Status inválido." }
  }

  const outrasPartes = texto(formData, "outras_partes")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)

  const filiadoIds = formData
    .getAll("filiado_id")
    .map((v) => String(v).trim())
    .filter(Boolean)

  return {
    dados: {
      numero_processo: numero,
      tipo: tipoBruto || null,
      coletivo: texto(formData, "coletivo") === "sim",
      status_processo: statusBruto || null,
      data_abertura: dataISO(texto(formData, "data_abertura")),
      parte_assessorada: texto(formData, "parte_assessorada") || null,
      outras_partes: outrasPartes,
      observacoes: texto(formData, "observacoes") || null,
      assessoria_id: texto(formData, "assessoria_id") || null,
      responsavel_id: texto(formData, "responsavel_id") || null,
      filiadoIds,
    },
  }
}

export async function criarProcessoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await requirePermissao(...CHAVES)

  const { dados, erro } = lerDados(formData)
  if (erro) return { erro }

  const criado = await criarProcesso(dados!, sessao.usuario.id)
  if (criado.erro) return { erro: criado.erro }

  revalidar(criado.id)
  redirect(`/painel/juridico/processos/${criado.id}?salvo=1`)
}

export async function atualizarProcessoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao(...CHAVES)

  const id = texto(formData, "id")
  if (!id) return { erro: "Processo inválido." }

  const { dados, erro } = lerDados(formData)
  if (erro) return { erro }

  const atualizado = await atualizarProcesso(id, dados!)
  if (atualizado.erro) return { erro: atualizado.erro }

  revalidar(id)
  redirect(`/painel/juridico/processos/${id}?salvo=1`)
}
