"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { concluirTarefasPendentes, definirSituacaoDemanda, demandaDoProjeto } from "@/lib/db/nucleo"
import {
  atualizarProjeto,
  criarMarco,
  criarProjeto,
  definirFinalizado,
  definirMarcoConcluido,
  editarMarco,
  excluirMarco,
  transferirDespesa,
  type DadosProjeto,
} from "@/lib/db/projetos"

function texto(formData: FormData, campo: string): string {
  return String(formData.get(campo) ?? "").trim()
}

function dataISO(valor: string): string | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(valor) ? valor : null
}

function moeda(valor: string): number | null {
  if (!valor) return null
  const n = Number(valor.replace(",", "."))
  return Number.isFinite(n) && n >= 0 ? n : null
}

function lerDados(formData: FormData): DadosProjeto {
  return {
    titulo: texto(formData, "titulo"),
    tipo: texto(formData, "tipo") || null,
    detalhamento: texto(formData, "detalhamento") || null,
    orcamento: moeda(texto(formData, "orcamento")),
    inicio: dataISO(texto(formData, "inicio")),
    termino_previsao: dataISO(texto(formData, "termino_previsao")),
    centro_custo_id: texto(formData, "centro_custo_id") || null,
    estrategico: texto(formData, "estrategico") === "1",
  }
}

export async function criarProjetoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("ferramentas_projetos_edicao")
  const dados = lerDados(formData)
  if (!dados.titulo) return { erro: "Informe o título do projeto." }
  if (!dados.tipo) return { erro: "Selecione o tipo do projeto." }

  const { id, erro } = await criarProjeto(dados)
  if (erro) return { erro }
  revalidatePath("/painel/ferramentas/projetos")
  redirect(`/painel/ferramentas/projetos/${id}?salvo=1`)
}

export async function atualizarProjetoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("ferramentas_projetos_edicao")
  const id = texto(formData, "projeto_id")
  if (!id) return { erro: "Projeto inválido." }
  const dados = lerDados(formData)
  if (!dados.titulo) return { erro: "Informe o título do projeto." }
  if (!dados.tipo) return { erro: "Selecione o tipo do projeto." }

  const { erro } = await atualizarProjeto(id, dados)
  if (erro) return { erro }
  revalidatePath("/painel/ferramentas/projetos")
  revalidatePath(`/painel/ferramentas/projetos/${id}`)
  redirect(`/painel/ferramentas/projetos/${id}?salvo=1`)
}

export async function alternarFinalizadoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("ferramentas_projetos_edicao")
  const id = texto(formData, "projeto_id")
  const finalizado = texto(formData, "finalizado") === "1"
  if (!id) return { erro: "Projeto inválido." }

  const { erro } = await definirFinalizado(id, finalizado)
  if (erro) return { erro }
  // A demanda do projeto acompanha: finalizar conclui as tarefas abertas (a
  // tela avisa antes) e fecha a demanda; reabrir só reabre a demanda.
  const demanda = await demandaDoProjeto(id)
  if (finalizado) {
    const r = await concluirTarefasPendentes({ projetoId: id, demandaId: demanda?.id ?? null })
    if (r.erro) return { erro: r.erro }
  }
  if (demanda) {
    await definirSituacaoDemanda(demanda.id, finalizado ? "Feito" : "Fazendo")
    revalidatePath(`/painel/ferramentas/demandas/${demanda.id}`)
    revalidatePath("/painel/ferramentas/demandas")
  }
  revalidatePath("/painel/ferramentas/tarefas")
  revalidatePath("/painel/ferramentas/projetos")
  revalidatePath(`/painel/ferramentas/projetos/${id}`)
  redirect(`/painel/ferramentas/projetos/${id}?salvo=1`)
}

// ── Marcos (etapas com data) ────────────────────────────────────────────────

function revalidarMarcos(projetoId: string | undefined): void {
  revalidatePath("/painel/ferramentas/projetos")
  if (projetoId) revalidatePath(`/painel/ferramentas/projetos/${projetoId}`)
}

function lerMarco(formData: FormData): { titulo: string; dataPrevista: string | null } {
  return { titulo: texto(formData, "titulo"), dataPrevista: dataISO(texto(formData, "data_prevista")) }
}

export async function criarMarcoAction(_prev: EstadoForm, formData: FormData): Promise<EstadoForm> {
  await requirePermissao("ferramentas_projetos_edicao")
  const projetoId = texto(formData, "projeto_id")
  const { titulo, dataPrevista } = lerMarco(formData)
  if (!projetoId) return { erro: "Projeto inválido." }
  if (!titulo) return { erro: "Diga o que deve estar pronto no marco." }
  if (!dataPrevista) return { erro: "Informe a data prevista do marco." }
  const { erro } = await criarMarco(projetoId, { titulo, dataPrevista })
  if (erro) return { erro }
  revalidarMarcos(projetoId)
  return { ok: "Marco criado." }
}

export async function editarMarcoAction(_prev: EstadoForm, formData: FormData): Promise<EstadoForm> {
  await requirePermissao("ferramentas_projetos_edicao")
  const id = texto(formData, "marco_id")
  const { titulo, dataPrevista } = lerMarco(formData)
  if (!id) return { erro: "Marco inválido." }
  if (!titulo) return { erro: "Diga o que deve estar pronto no marco." }
  if (!dataPrevista) return { erro: "Informe a data prevista do marco." }
  const { erro, projetoId } = await editarMarco(id, { titulo, dataPrevista })
  if (erro) return { erro }
  revalidarMarcos(projetoId)
  return { ok: "Marco salvo." }
}

export async function alternarMarcoAction(_prev: EstadoForm, formData: FormData): Promise<EstadoForm> {
  await requirePermissao("ferramentas_projetos_edicao")
  const id = texto(formData, "marco_id")
  if (!id) return { erro: "Marco inválido." }
  const { erro, projetoId } = await definirMarcoConcluido(id, texto(formData, "concluir") === "1")
  if (erro) return { erro }
  revalidarMarcos(projetoId)
  return { ok: "Marco atualizado." }
}

export async function excluirMarcoAction(_prev: EstadoForm, formData: FormData): Promise<EstadoForm> {
  await requirePermissao("ferramentas_projetos_edicao")
  const id = texto(formData, "marco_id")
  if (!id) return { erro: "Marco inválido." }
  const { erro, projetoId } = await excluirMarco(id)
  if (erro) return { erro }
  revalidarMarcos(projetoId)
  return { ok: "Marco excluído." }
}

/** Transfere a compra (com as ordens dela) ou a ordem para outro projeto aberto. */
export async function transferirDespesaAction(_prev: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const sessao = await requirePermissao("ferramentas_projetos_edicao")
  const origemId = texto(formData, "origem_id")
  const tipo = texto(formData, "tipo") === "ordem" ? "ordem" : "compra"
  const r = await transferirDespesa({
    origemId,
    destinoId: texto(formData, "destino_id"),
    tipo,
    itemId: texto(formData, "item_id"),
    motivo: texto(formData, "motivo"),
    usuarioId: sessao.usuario.id,
  })
  if (r.erro) return { erro: r.erro }
  revalidatePath("/painel/ferramentas/projetos")
  revalidatePath(`/painel/ferramentas/projetos/${origemId}`)
  return { ok: r.ok }
}
