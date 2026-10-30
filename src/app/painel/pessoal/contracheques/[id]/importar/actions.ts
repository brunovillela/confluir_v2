"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import {
  aplicarItensCC,
  associarFuncionarioCC,
  criarImportacaoCC,
  descartarItemCC,
  lerPendentesCC,
} from "@/lib/db/contracheque-importacao"

const exigirAcesso = () => requirePermissao("pessoal_gestao", ["pessoal_contracheque"])

const caminho = (remessaId: string, importacaoId?: string) =>
  `/painel/pessoal/contracheques/${remessaId}/importar${importacaoId ? `/${importacaoId}` : ""}`

export async function importarFolhaAction(_prev: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const sessao = await exigirAcesso()
  const remessaId = String(formData.get("remessa_id") ?? "")
  const arquivo = formData.get("arquivo")
  if (!remessaId) return { erro: "Remessa inválida." }
  if (!(arquivo instanceof File) || arquivo.size === 0) return { erro: "Escolha o PDF da folha.", campo: "arquivo" }
  if (arquivo.size > 4 * 1024 * 1024) return { erro: "O PDF deve ter no máximo 4 MB.", campo: "arquivo" }
  const r = await criarImportacaoCC({ remessaId, arquivo, usuarioId: sessao.usuario.id })
  if (r.erro || !r.id) return { erro: r.erro ?? "Não foi possível importar." }
  redirect(caminho(remessaId, r.id))
}

/** Lê um lote de contracheques com a IA; a tela chama de novo enquanto faltar. */
export async function lerImportacaoCCAction(
  remessaId: string,
  importacaoId: string
): Promise<{ lidos: number; erros: number; faltam: number }> {
  await exigirAcesso()
  const r = await lerPendentesCC(importacaoId)
  revalidatePath(caminho(remessaId, importacaoId))
  return r
}

export async function associarFuncionarioCCAction(
  remessaId: string,
  importacaoId: string,
  itemId: string,
  funcionarioId: string
): Promise<{ erro?: string }> {
  await exigirAcesso()
  const r = await associarFuncionarioCC(itemId, funcionarioId || null)
  revalidatePath(caminho(remessaId, importacaoId))
  return r
}

export async function descartarItemCCAction(
  remessaId: string,
  importacaoId: string,
  itemId: string,
  voltar: boolean
): Promise<{ erro?: string }> {
  await exigirAcesso()
  const r = await descartarItemCC(itemId, voltar)
  revalidatePath(caminho(remessaId, importacaoId))
  return r
}

export async function aplicarItensCCAction(
  remessaId: string,
  importacaoId: string,
  itemIds: string[]
): Promise<{ aplicados: number; ordens: number; semDadosBancarios: string[]; pulados: string[]; erro?: string }> {
  const sessao = await exigirAcesso()
  const r = await aplicarItensCC(importacaoId, itemIds, sessao.usuario.id)
  revalidatePath(caminho(remessaId, importacaoId))
  revalidatePath("/painel/pessoal/contracheques", "layout")
  revalidatePath("/painel/financeiro/ordens")
  return r
}
