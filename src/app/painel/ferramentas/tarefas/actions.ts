"use server"

import { revalidatePath } from "next/cache"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import {
  atualizarTarefa,
  criarTarefa,
  definirConclusaoTarefa,
  type DadosTarefa,
} from "@/lib/db/nucleo"

function texto(formData: FormData, campo: string): string {
  return String(formData.get(campo) ?? "").trim()
}

function dataISO(valor: string): string | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(valor) ? valor : null
}

/** Revalida a lista global e o detalhe do pai (se houver) informado no form. */
function revalidarTarefa(formData: FormData): void {
  revalidatePath("/painel/ferramentas/tarefas")
  const demandaId = texto(formData, "demanda_id")
  const projetoId = texto(formData, "projeto_id")
  const anomaliaId = texto(formData, "anomalia_id")
  if (demandaId) revalidatePath(`/painel/ferramentas/demandas/${demandaId}`)
  if (anomaliaId) revalidatePath(`/painel/ferramentas/anomalias/${anomaliaId}`)
  if (projetoId) revalidatePath(`/painel/ferramentas/projetos/${projetoId}`)
}

function lerDados(formData: FormData): DadosTarefa {
  return {
    titulo: texto(formData, "titulo"),
    tipo: texto(formData, "tipo") || null,
    data_prazo_entrega: dataISO(texto(formData, "data_prazo_entrega")),
    demandante_id: texto(formData, "demandante_id") || null,
    demandado_id: texto(formData, "demandado_id") || null,
    demanda_id: texto(formData, "demanda_id") || null,
    projeto_id: texto(formData, "projeto_id") || null,
    anomalia_id: texto(formData, "anomalia_id") || null,
  }
}

export async function criarTarefaAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("ferramentas_tarefas", ["ferramentas_demandas"])
  const dados = lerDados(formData)
  if (!dados.titulo) return { erro: "Descreva a tarefa." }

  const { erro } = await criarTarefa(dados)
  if (erro) return { erro }
  revalidarTarefa(formData)
  return { ok: "Tarefa criada." }
}

export async function atualizarTarefaAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("ferramentas_tarefas", ["ferramentas_demandas"])
  const id = texto(formData, "tarefa_id")
  if (!id) return { erro: "Tarefa inválida." }
  const dados = lerDados(formData)
  if (!dados.titulo) return { erro: "Descreva a tarefa." }

  const { erro } = await atualizarTarefa(id, dados)
  if (erro) return { erro }
  revalidarTarefa(formData)
  return { ok: "Tarefa salva." }
}

export async function alternarConclusaoTarefaAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("ferramentas_tarefas", ["ferramentas_demandas"])
  const id = texto(formData, "tarefa_id")
  const concluir = texto(formData, "concluir") === "1"
  if (!id) return { erro: "Tarefa inválida." }

  const { erro } = await definirConclusaoTarefa(id, concluir)
  if (erro) return { erro }
  revalidarTarefa(formData)
  return { ok: "Tarefa atualizada." }
}
