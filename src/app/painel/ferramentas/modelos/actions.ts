"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import {
  adicionarItemModelo,
  aplicarModeloNaDemanda,
  aplicarModeloNoProjeto,
  criarModelo,
  editarModelo,
  excluirItemModelo,
  excluirModelo,
  salvarDemandaComoModelo,
} from "@/lib/db/modelos"
import { criarDemanda } from "@/lib/db/nucleo"
import { excluirFormulario, salvarFormulario } from "@/lib/db/pedidos"
import { ehPrioridadeTarefa } from "@/lib/nucleo-constantes"

const BASE = "/painel/ferramentas/modelos"
const t = (fd: FormData, c: string) => String(fd.get(c) ?? "").trim()
const data = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null)

export async function criarModeloAction(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  await requirePermissao("ferramentas_demandas")
  const nome = t(fd, "nome").slice(0, 120)
  if (!nome) return { erro: "Dê um nome ao modelo." }
  const r = await criarModelo({ nome, tipo: t(fd, "tipo") === "projeto" ? "projeto" : "demanda", descricao: t(fd, "descricao") || null })
  if (r.erro || !r.id) return { erro: r.erro }
  revalidatePath(BASE)
  redirect(`${BASE}/${r.id}`)
}

export async function editarModeloAction(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  await requirePermissao("ferramentas_demandas")
  const id = t(fd, "modelo_id")
  const nome = t(fd, "nome").slice(0, 120)
  if (!nome) return { erro: "Dê um nome ao modelo." }
  const r = await editarModelo(id, { nome, descricao: t(fd, "descricao") || null })
  if (r.erro) return { erro: r.erro }
  revalidatePath(`${BASE}/${id}`)
  revalidatePath(BASE)
  return { ok: "Modelo salvo." }
}

export async function excluirModeloAction(id: string): Promise<EstadoForm> {
  await requirePermissao("ferramentas_demandas")
  const r = await excluirModelo(id)
  if (r.erro) return { erro: r.erro }
  revalidatePath(BASE)
  redirect(BASE)
}

export async function adicionarItemModeloAction(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  await requirePermissao("ferramentas_demandas")
  const modeloId = t(fd, "modelo_id")
  const titulo = t(fd, "titulo").slice(0, 200)
  if (!titulo) return { erro: "Descreva a tarefa ou o marco." }
  const n = Math.abs(Math.trunc(Number(t(fd, "dias_n") || "0")))
  const sentido = t(fd, "sentido")
  const dias = sentido === "antes" ? -n : sentido === "depois" ? n : 0
  const prioridade = t(fd, "prioridade")
  const r = await adicionarItemModelo(modeloId, {
    tipo: t(fd, "tipo") === "marco" ? "marco" : "tarefa",
    titulo,
    dias,
    prioridade: ehPrioridadeTarefa(prioridade) ? prioridade : "media",
    procedimentoId: t(fd, "procedimento_id") || null,
    checklist: t(fd, "checklist")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, 30),
  })
  if (r.erro) return { erro: r.erro }
  revalidatePath(`${BASE}/${modeloId}`)
  return { ok: "Adicionado ao modelo." }
}

export async function excluirItemModeloAction(itemId: string): Promise<EstadoForm> {
  await requirePermissao("ferramentas_demandas")
  const r = await excluirItemModelo(itemId)
  if (r.erro) return { erro: r.erro }
  if (r.modeloId) revalidatePath(`${BASE}/${r.modeloId}`)
  return { ok: "Item excluído." }
}

// ── Usar o modelo ────────────────────────────────────────────────────────────

/** Nova demanda a partir de um modelo (Demandas). */
export async function novaDemandaDoModeloAction(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const sessao = await requirePermissao("ferramentas_demandas")
  const modeloId = t(fd, "modelo_id")
  const nome = t(fd, "nome").slice(0, 200)
  const referencia = data(t(fd, "referencia"))
  const responsavel = t(fd, "responsavel_id") || null
  if (!modeloId) return { erro: "Escolha o modelo." }
  if (!nome) return { erro: "Dê um nome à demanda." }
  if (!referencia) return { erro: "Informe a data de referência (o dia do evento ou da entrega)." }
  const eu = String(sessao.usuario.id)
  const { id, erro } = await criarDemanda(
    { nome, descricao: null, situacao: "A fazer", prazo: referencia, orcamento: null, membro_responsavel_id: responsavel },
    eu
  )
  if (erro || !id) return { erro: erro ?? "Falha ao criar a demanda." }
  const r = await aplicarModeloNaDemanda(modeloId, id, referencia, responsavel, eu)
  if (r.erro) return { erro: r.erro }
  revalidatePath("/painel/ferramentas/demandas")
  redirect(`/painel/ferramentas/demandas/${id}?salvo=1`)
}

/** Aplica um modelo a uma demanda que já existe (página da demanda). */
export async function aplicarModeloNaDemandaAction(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const sessao = await requirePermissao("ferramentas_demandas")
  const demandaId = t(fd, "demanda_id")
  const referencia = data(t(fd, "referencia"))
  if (!referencia) return { erro: "Informe a data de referência." }
  const r = await aplicarModeloNaDemanda(t(fd, "modelo_id"), demandaId, referencia, t(fd, "responsavel_id") || null, String(sessao.usuario.id))
  if (r.erro) return { erro: r.erro }
  revalidatePath(`/painel/ferramentas/demandas/${demandaId}`)
  return { ok: `${r.criadas} tarefa${r.criadas === 1 ? "" : "s"} criada${r.criadas === 1 ? "" : "s"} pelo modelo.` }
}

/** Aplica um modelo de projeto: marcos e tarefas (página do projeto). */
export async function aplicarModeloNoProjetoAction(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const sessao = await requirePermissao("ferramentas_projetos_edicao")
  const projetoId = t(fd, "projeto_id")
  const referencia = data(t(fd, "referencia"))
  if (!referencia) return { erro: "Informe a data de referência." }
  const r = await aplicarModeloNoProjeto(t(fd, "modelo_id"), projetoId, referencia, String(sessao.usuario.id))
  if (r.erro) return { erro: r.erro }
  revalidatePath(`/painel/ferramentas/projetos/${projetoId}`)
  return { ok: `${r.marcos} marco${r.marcos === 1 ? "" : "s"} e ${r.criadas} tarefa${r.criadas === 1 ? "" : "s"} criados pelo modelo.` }
}

/** Salva as tarefas da demanda como um modelo novo. */
export async function salvarComoModeloAction(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  await requirePermissao("ferramentas_demandas")
  const nome = t(fd, "nome").slice(0, 120)
  if (!nome) return { erro: "Dê um nome ao modelo." }
  const r = await salvarDemandaComoModelo(t(fd, "demanda_id"), nome)
  if (r.erro || !r.id) return { erro: r.erro }
  revalidatePath(BASE)
  redirect(`${BASE}/${r.id}`)
}

// ── Formulários de pedido ────────────────────────────────────────────────────

export async function salvarFormularioAction(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  await requirePermissao("ferramentas_demandas")
  const nome = t(fd, "nome").slice(0, 80)
  if (!nome) return { erro: "Dê um nome ao formulário (ex.: Pedido à Comunicação)." }
  const responsavelId = t(fd, "responsavel_id") || null
  if (!responsavelId) return { erro: "Escolha quem recebe os pedidos." }
  const r = await salvarFormulario(t(fd, "formulario_id") || null, {
    nome,
    descricao: t(fd, "descricao") || null,
    responsavelId,
    modeloId: t(fd, "modelo_id") || null,
    ativo: fd.get("ativo") === "1",
  })
  if (r.erro) return { erro: r.erro }
  revalidatePath(BASE)
  revalidatePath("/painel/pedidos")
  return { ok: "Formulário salvo." }
}

export async function excluirFormularioAction(id: string): Promise<EstadoForm> {
  await requirePermissao("ferramentas_demandas")
  const r = await excluirFormulario(id)
  if (r.erro) return { erro: r.erro }
  revalidatePath(BASE)
  revalidatePath("/painel/pedidos")
  return { ok: "Formulário excluído." }
}
