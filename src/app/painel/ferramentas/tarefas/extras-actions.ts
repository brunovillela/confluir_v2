"use server"

import { revalidatePath } from "next/cache"

import { requirePermissao, requireSessaoPainel } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { paisDaTarefa } from "@/lib/db/nucleo"
import { tarefaDaConversa } from "@/lib/db/tarefa-conversa"
import {
  adicionarItem,
  criarEtiqueta,
  editarEtiqueta,
  excluirEtiqueta,
  excluirItem,
  listarEtiquetas,
  listarItens,
  marcarItem,
  tarefaDoItem,
  type Etiqueta,
  type ItemChecklist,
} from "@/lib/db/tarefa-extras"
import { podeAcessar } from "@/lib/permissoes"

/**
 * Checklist e etiquetas das tarefas (Onda 2). O checklist fica fora do portão
 * de rota de Ferramentas (o responsável sem a permissão de Tarefas o usa pelo
 * Meu perfil): o acesso é conferido no banco a cada chamada.
 */

/** Vê o checklist quem vê a tarefa; mexe quem cuida dela ou é o responsável/quem pediu. */
async function acessoAoChecklist(tarefaId: string): Promise<{ ve: boolean; mexe: boolean }> {
  const sessao = await requireSessaoPainel()
  const eu = String(sessao.usuario.id)
  const p = sessao.permissoes
  const tarefa = await tarefaDaConversa(tarefaId, { id: eu, permissoes: p })
  if (!tarefa) return { ve: false, mexe: false }
  if (podeAcessar(p, "ferramentas_tarefas", ["ferramentas_demandas"]) || tarefa.responsavelId === eu || tarefa.demandanteId === eu) {
    return { ve: true, mexe: true }
  }
  const pais = await paisDaTarefa(tarefaId)
  const mexe =
    (Boolean(pais?.projetoId) && podeAcessar(p, "ferramentas_projetos_edicao")) ||
    (Boolean(pais?.anomaliaId) && podeAcessar(p, "ferramentas_anomalias"))
  return { ve: true, mexe }
}

function revalidarListas(): void {
  revalidatePath("/painel/ferramentas/tarefas")
  revalidatePath("/painel/perfil/tarefas")
  revalidatePath("/painel/ferramentas/demandas", "layout")
  revalidatePath("/painel/ferramentas/projetos", "layout")
  revalidatePath("/painel/ferramentas/anomalias", "layout")
}

export async function carregarChecklistAction(
  tarefaId: string
): Promise<{ erro?: string; itens?: ItemChecklist[]; mexe?: boolean }> {
  const acesso = await acessoAoChecklist(tarefaId)
  if (!acesso.ve) return { erro: "Você não tem acesso a esta tarefa." }
  return { itens: await listarItens(tarefaId), mexe: acesso.mexe }
}

export async function adicionarItemAction(tarefaId: string, texto: string): Promise<EstadoForm> {
  const acesso = await acessoAoChecklist(tarefaId)
  if (!acesso.mexe) return { erro: "Você não pode mexer no checklist desta tarefa." }
  const { erro } = await adicionarItem(tarefaId, texto)
  if (erro) return { erro }
  revalidarListas()
  return { ok: "Item adicionado." }
}

export async function marcarItemAction(itemId: string, feito: boolean): Promise<EstadoForm> {
  const tarefaId = await tarefaDoItem(itemId)
  if (!tarefaId) return { erro: "Item não encontrado." }
  const acesso = await acessoAoChecklist(tarefaId)
  if (!acesso.mexe) return { erro: "Você não pode mexer no checklist desta tarefa." }
  const { erro } = await marcarItem(itemId, feito)
  if (erro) return { erro }
  revalidarListas()
  return { ok: "Item atualizado." }
}

export async function excluirItemAction(itemId: string): Promise<EstadoForm> {
  const tarefaId = await tarefaDoItem(itemId)
  if (!tarefaId) return { erro: "Item não encontrado." }
  const acesso = await acessoAoChecklist(tarefaId)
  if (!acesso.mexe) return { erro: "Você não pode mexer no checklist desta tarefa." }
  const { erro } = await excluirItem(itemId)
  if (erro) return { erro }
  revalidarListas()
  return { ok: "Item excluído." }
}

// ── Etiquetas ────────────────────────────────────────────────────────────────

async function exigirGestorDeTarefas() {
  await requirePermissao("ferramentas_tarefas", ["ferramentas_demandas", "ferramentas_anomalias", "ferramentas_projetos_edicao"])
}

/** As etiquetas da entidade (o seletor do diálogo carrega ao abrir). */
export async function opcoesDeEtiquetaAction(): Promise<Etiqueta[]> {
  await exigirGestorDeTarefas()
  return listarEtiquetas()
}

export async function criarEtiquetaAction(nome: string, cor: string): Promise<EstadoForm & { id?: string }> {
  await requirePermissao("ferramentas_tarefas", ["ferramentas_demandas"])
  const r = await criarEtiqueta(nome, cor)
  if (r.erro) return { erro: r.erro }
  revalidarListas()
  return { ok: "Etiqueta criada.", id: r.id }
}

export async function editarEtiquetaAction(id: string, nome: string, cor: string): Promise<EstadoForm> {
  await requirePermissao("ferramentas_tarefas", ["ferramentas_demandas"])
  const { erro } = await editarEtiqueta(id, nome, cor)
  if (erro) return { erro }
  revalidarListas()
  return { ok: "Etiqueta salva." }
}

export async function excluirEtiquetaAction(id: string): Promise<EstadoForm> {
  await requirePermissao("ferramentas_tarefas", ["ferramentas_demandas"])
  const { erro } = await excluirEtiqueta(id)
  if (erro) return { erro }
  revalidarListas()
  return { ok: "Etiqueta excluída." }
}
