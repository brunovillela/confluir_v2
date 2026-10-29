"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import {
  aplicarItens,
  associarFuncionario,
  criarImportacao,
  descartarItem,
  lerItensPendentes,
  reapurarImportacao,
} from "@/lib/db/ponto-importacao"

const caminho = (remessaId: string, importacaoId?: string) =>
  `/painel/pessoal/ponto/${remessaId}/importar${importacaoId ? `/${importacaoId}` : ""}`

export async function importarRelatorioAction(_prev: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const sessao = await requirePermissao("pessoal_gestao")
  const remessaId = String(formData.get("remessa_id") ?? "")
  const arquivo = formData.get("arquivo")
  if (!remessaId) return { erro: "Remessa inválida." }
  if (!(arquivo instanceof File) || arquivo.size === 0) return { erro: "Escolha o PDF do relatório.", campo: "arquivo" }
  if (arquivo.size > 4 * 1024 * 1024) return { erro: "O PDF deve ter no máximo 4 MB.", campo: "arquivo" }
  const r = await criarImportacao({ remessaId, arquivo, usuarioId: sessao.usuario.id })
  if (r.erro || !r.id) return { erro: r.erro ?? "Não foi possível importar." }
  redirect(caminho(remessaId, r.id))
}

/** Lê um lote de funcionários com a IA; a tela chama de novo enquanto faltar. */
export async function lerImportacaoAction(
  remessaId: string,
  importacaoId: string
): Promise<{ lidos: number; erros: number; faltam: number }> {
  await requirePermissao("pessoal_gestao")
  const r = await lerItensPendentes(importacaoId)
  revalidatePath(caminho(remessaId, importacaoId))
  return r
}

export async function associarFuncionarioAction(
  remessaId: string,
  importacaoId: string,
  itemId: string,
  funcionarioId: string
): Promise<{ erro?: string }> {
  await requirePermissao("pessoal_gestao")
  const r = await associarFuncionario(itemId, funcionarioId || null)
  revalidatePath(caminho(remessaId, importacaoId))
  return r
}

export async function descartarItemAction(
  remessaId: string,
  importacaoId: string,
  itemId: string,
  voltar: boolean
): Promise<{ erro?: string }> {
  await requirePermissao("pessoal_gestao")
  const r = await descartarItem(itemId, voltar)
  revalidatePath(caminho(remessaId, importacaoId))
  return r
}

export async function reapurarAction(remessaId: string, importacaoId: string): Promise<void> {
  await requirePermissao("pessoal_gestao")
  await reapurarImportacao(importacaoId)
  revalidatePath(caminho(remessaId, importacaoId))
}

export async function aplicarItensAction(
  remessaId: string,
  importacaoId: string,
  itemIds: string[]
): Promise<{ aplicados: number; pulados: string[]; erro?: string }> {
  const sessao = await requirePermissao("pessoal_gestao")
  const r = await aplicarItens(importacaoId, itemIds, sessao.usuario.id)
  revalidatePath(caminho(remessaId, importacaoId))
  revalidatePath(`/painel/pessoal/ponto/${remessaId}`)
  revalidatePath("/painel/pessoal/ponto")
  return r
}
