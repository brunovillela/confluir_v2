import "server-only"

import { esquemaAusente, texto } from "@/lib/db/comum"
import { criarTarefa, garantirDemandaDoProjeto } from "@/lib/db/nucleo"
import { aplicarRegras } from "@/lib/db/regras"
import { adicionarItem } from "@/lib/db/tarefa-extras"
import { diasEntre, prazoDoItem } from "@/lib/ferramentas-regras"
import { ehPrioridadeTarefa, type PrioridadeTarefa } from "@/lib/nucleo-constantes"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * MODELOS DE DEMANDA E DE PROJETO (Onda 3, 22/11/2026): as tarefas (e, no
 * projeto, os marcos) pré-montadas, com o prazo em dias relativos a uma data
 * de referência informada ao usar o modelo.
 */

type Linha = Record<string, unknown>
export type TipoModelo = "demanda" | "projeto"

export type ItemModelo = {
  id: string
  tipo: "tarefa" | "marco"
  titulo: string
  dias: number
  prioridade: PrioridadeTarefa
  procedimentoId: string | null
  checklist: string[]
}

export type Modelo = { id: string; nome: string; tipo: TipoModelo; descricao: string | null; itens: ItemModelo[] }

function paraItem(i: Linha): ItemModelo {
  return {
    id: String(i.id),
    tipo: i.tipo === "marco" ? "marco" : "tarefa",
    titulo: String(i.titulo),
    dias: Number(i.dias) || 0,
    prioridade: ehPrioridadeTarefa(i.prioridade) ? i.prioridade : "media",
    procedimentoId: texto(i.procedimento_id),
    checklist: Array.isArray(i.checklist) ? (i.checklist as string[]) : [],
  }
}

export async function listarModelos(tipo?: TipoModelo): Promise<Modelo[]> {
  const admin = await createAdminClient()
  let q = admin
    .from("demandas_modelos")
    .select("id, nome, tipo, descricao, itens:demandas_modelo_itens (id, tipo, titulo, dias, prioridade, procedimento_id, checklist, ordem)")
    .eq("emp_proprietaria_id", await tenantAtual())
    .order("nome")
  if (tipo) q = q.eq("tipo", tipo)
  const { data, error } = await q
  if (error) {
    if (esquemaAusente(error)) return []
    throw new Error(`Falha ao ler os modelos: ${error.message}`)
  }
  return ((data ?? []) as Linha[]).map((m) => ({
    id: String(m.id),
    nome: String(m.nome),
    tipo: m.tipo === "projeto" ? "projeto" : "demanda",
    descricao: texto(m.descricao),
    itens: ((m.itens as Linha[]) ?? [])
      .sort((a, b) => Number(a.ordem) - Number(b.ordem) || Number(a.dias) - Number(b.dias))
      .map(paraItem),
  }))
}

export async function obterModelo(id: string): Promise<Modelo | null> {
  return (await listarModelos()).find((m) => m.id === id) ?? null
}

export async function criarModelo(dados: { nome: string; tipo: TipoModelo; descricao: string | null }): Promise<{ erro?: string; id?: string }> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("demandas_modelos")
    .insert({ emp_proprietaria_id: await tenantAtual(), ...dados })
    .select("id")
    .single()
  if (error) return { erro: `Falha ao criar o modelo: ${error.message}` }
  return { id: String(data.id) }
}

export async function editarModelo(id: string, dados: { nome: string; descricao: string | null }): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin.from("demandas_modelos").update(dados).eq("id", id).eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: `Falha ao salvar o modelo: ${error.message}` }
  return {}
}

export async function excluirModelo(id: string): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin.from("demandas_modelos").delete().eq("id", id).eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: `Falha ao excluir o modelo: ${error.message}` }
  return {}
}

export async function adicionarItemModelo(
  modeloId: string,
  item: { tipo: "tarefa" | "marco"; titulo: string; dias: number; prioridade: PrioridadeTarefa; procedimentoId: string | null; checklist: string[] }
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data: m } = await admin.from("demandas_modelos").select("id, tipo").eq("id", modeloId).eq("emp_proprietaria_id", emp).maybeSingle()
  if (!m) return { erro: "Modelo não encontrado." }
  if (item.tipo === "marco" && m.tipo !== "projeto") return { erro: "Marcos só existem em modelos de projeto." }
  const { count } = await admin.from("demandas_modelo_itens").select("id", { count: "exact", head: true }).eq("modelo_id", modeloId)
  const { error } = await admin.from("demandas_modelo_itens").insert({
    emp_proprietaria_id: emp,
    modelo_id: modeloId,
    tipo: item.tipo,
    titulo: item.titulo,
    dias: item.dias,
    prioridade: item.prioridade,
    procedimento_id: item.procedimentoId,
    checklist: item.checklist,
    ordem: (count ?? 0) + 1,
  })
  if (error) return { erro: `Falha ao adicionar ao modelo: ${error.message}` }
  return {}
}

export async function excluirItemModelo(itemId: string): Promise<{ erro?: string; modeloId?: string }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data } = await admin.from("demandas_modelo_itens").select("modelo_id").eq("id", itemId).eq("emp_proprietaria_id", emp).maybeSingle()
  if (!data) return { erro: "Item não encontrado." }
  const { error } = await admin.from("demandas_modelo_itens").delete().eq("id", itemId).eq("emp_proprietaria_id", emp)
  if (error) return { erro: `Falha ao excluir o item: ${error.message}` }
  return { modeloId: String(data.modelo_id) }
}

/** Cria as tarefas do modelo na demanda (prazo = referência + dias), com o checklist e o procedimento. */
async function criarTarefasDoModelo(
  modelo: Modelo,
  alvo: { demandaId: string; projetoId?: string | null },
  referencia: string,
  responsavelId: string | null,
  criadoPor: string
): Promise<{ criadas: number; erro?: string }> {
  let criadas = 0
  for (const i of modelo.itens.filter((x) => x.tipo === "tarefa")) {
    const { id, erro } = await criarTarefa({
      titulo: i.titulo,
      tipo: null,
      data_prazo_entrega: prazoDoItem(referencia, i.dias),
      demandante_id: criadoPor,
      demandado_id: responsavelId,
      prioridade: i.prioridade,
      procedimento_id: i.procedimentoId,
      demanda_id: alvo.demandaId,
      projeto_id: alvo.projetoId ?? null,
    })
    if (erro || !id) return { criadas, erro: erro ?? "Falha ao criar a tarefa." }
    for (const passo of i.checklist) await adicionarItem(id, passo)
    await aplicarRegras("tarefa_criada", id).catch(() => 0)
    criadas++
  }
  return { criadas }
}

/** Aplica o modelo a uma demanda que já existe. */
export async function aplicarModeloNaDemanda(
  modeloId: string,
  demandaId: string,
  referencia: string,
  responsavelId: string | null,
  criadoPor: string
): Promise<{ criadas: number; erro?: string }> {
  const modelo = await obterModelo(modeloId)
  if (!modelo) return { criadas: 0, erro: "Modelo não encontrado." }
  return criarTarefasDoModelo(modelo, { demandaId }, referencia, responsavelId, criadoPor)
}

/** Aplica o modelo ao projeto: os marcos e as tarefas (na demanda do projeto). */
export async function aplicarModeloNoProjeto(
  modeloId: string,
  projetoId: string,
  referencia: string,
  criadoPor: string
): Promise<{ criadas: number; marcos: number; erro?: string }> {
  const modelo = await obterModelo(modeloId)
  if (!modelo) return { criadas: 0, marcos: 0, erro: "Modelo não encontrado." }
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const marcos = modelo.itens.filter((i) => i.tipo === "marco")
  if (marcos.length) {
    const { error } = await admin.from("projeto_marcos").insert(
      marcos.map((m) => ({ emp_proprietaria_id: emp, projeto_id: projetoId, titulo: m.titulo, data_prevista: prazoDoItem(referencia, m.dias) }))
    )
    if (error) return { criadas: 0, marcos: 0, erro: `Falha ao criar os marcos: ${error.message}` }
  }
  let criadas = 0
  if (modelo.itens.some((i) => i.tipo === "tarefa")) {
    const demanda = await garantirDemandaDoProjeto(projetoId, criadoPor)
    if (demanda.erro || !demanda.id) return { criadas: 0, marcos: marcos.length, erro: demanda.erro ?? "Falha ao criar a demanda do projeto." }
    const r = await criarTarefasDoModelo(modelo, { demandaId: demanda.id, projetoId }, referencia, null, criadoPor)
    if (r.erro) return { criadas: r.criadas, marcos: marcos.length, erro: r.erro }
    criadas = r.criadas
  }
  return { criadas, marcos: marcos.length }
}

/**
 * Salva as tarefas da demanda como um modelo novo: o prazo de cada uma vira
 * "dias em relação ao prazo da demanda" (ou ao último prazo das tarefas).
 */
export async function salvarDemandaComoModelo(demandaId: string, nome: string): Promise<{ erro?: string; id?: string; itens?: number }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data: d } = await admin.from("demandas").select("prazo").eq("id", demandaId).eq("emp_proprietaria_id", emp).maybeSingle()
  if (!d) return { erro: "Demanda não encontrada." }
  const { data: ts } = await admin
    .from("demandas_check_tarefas")
    .select("id, titulo, data_prazo_entrega, prioridade, procedimento_id")
    .eq("demanda_id", demandaId)
    .eq("emp_proprietaria_id", emp)
    .order("data_prazo_entrega", { ascending: true, nullsFirst: false })
  const tarefas = (ts ?? []) as Linha[]
  if (!tarefas.length) return { erro: "A demanda não tem tarefas para virar modelo." }
  const prazos = tarefas.map((t) => texto(t.data_prazo_entrega)).filter((v): v is string => !!v).sort()
  const referencia = texto(d.prazo) ?? prazos.at(-1) ?? null
  const { data: itensCheck } = await admin
    .from("demandas_tarefa_itens")
    .select("tarefa_id, texto, ordem")
    .in("tarefa_id", tarefas.map((t) => String(t.id)))
    .order("ordem")
  const criado = await criarModelo({ nome, tipo: "demanda", descricao: null })
  if (criado.erro || !criado.id) return { erro: criado.erro }
  for (const t of tarefas) {
    const prazo = texto(t.data_prazo_entrega)
    await adicionarItemModelo(criado.id, {
      tipo: "tarefa",
      titulo: String(t.titulo ?? "(sem título)"),
      dias: referencia && prazo ? diasEntre(referencia, prazo) : 0,
      prioridade: ehPrioridadeTarefa(t.prioridade) ? t.prioridade : "media",
      procedimentoId: texto(t.procedimento_id),
      checklist: (itensCheck ?? []).filter((c) => String(c.tarefa_id) === String(t.id)).map((c) => String(c.texto)),
    })
  }
  return { id: criado.id, itens: tarefas.length }
}
