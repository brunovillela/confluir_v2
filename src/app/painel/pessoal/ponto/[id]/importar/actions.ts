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
import { posterioresPorFuncionario, recalcularPosteriores } from "@/lib/db/ponto-cascata"

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

/** Funcionário aplicado que tem registro em remessas posteriores. */
export type PosteriorAfetado = { id: string; nome: string; remessas: string[]; finalizada: string | null }

export async function aplicarItensAction(
  remessaId: string,
  importacaoId: string,
  itemIds: string[]
): Promise<{ aplicados: number; pulados: string[]; erro?: string; posteriores?: PosteriorAfetado[] }> {
  const sessao = await requirePermissao("pessoal_gestao")
  const { funcionarios, ...r } = await aplicarItens(importacaoId, itemIds, sessao.usuario.id)
  revalidatePath(caminho(remessaId, importacaoId))
  revalidatePath(`/painel/pessoal/ponto/${remessaId}`)
  revalidatePath("/painel/pessoal/ponto")
  // Aplicar numa remessa antiga muda o saldo de que as seguintes partem: a
  // tela pergunta se recalcula (lib/db/ponto-cascata).
  if (!funcionarios?.length) return r
  const depois = await posterioresPorFuncionario(remessaId)
  const posteriores = funcionarios
    .filter((f) => depois[f.id]?.length)
    .map((f) => ({
      id: f.id,
      nome: f.nome,
      remessas: depois[f.id].map((d) => d.remessa),
      finalizada: depois[f.id].find((d) => d.finalizada)?.remessa ?? null,
    }))
  return { ...r, posteriores }
}

/** Resposta "Recalcular" depois de aplicar: refaz os saldos das remessas seguintes. */
export async function recalcularPosterioresAction(
  remessaId: string,
  funcionarioIds: string[]
): Promise<{ ok?: string; erro?: string }> {
  await requirePermissao("pessoal_gestao")
  const feitas = new Set<string>()
  const paradas = new Set<string>()
  try {
    for (const f of funcionarioIds) {
      const r = await recalcularPosteriores(remessaId, f)
      r.recalculadas.forEach((n) => feitas.add(n))
      if (r.paradaEm) paradas.add(r.paradaEm)
    }
  } catch (e) {
    return { erro: (e as Error).message }
  }
  revalidatePath("/painel/pessoal/ponto", "layout")
  return {
    ok:
      (feitas.size
        ? `Saldos recalculados de ${funcionarioIds.length} funcionário(s) em: ${[...feitas].join(", ")}.`
        : "Nenhuma remessa posterior foi recalculada.") +
      (paradas.size ? ` Finalizadas (ficaram como estavam, com as seguintes): ${[...paradas].join(", ")}.` : ""),
  }
}
