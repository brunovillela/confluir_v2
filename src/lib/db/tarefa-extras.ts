import "server-only"

import { esquemaAusente, texto } from "@/lib/db/comum"
import { ehCorEtiqueta, MAX_ITEM_CHECKLIST, nomeDeEtiqueta, type CorEtiqueta } from "@/lib/nucleo-constantes"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * CHECKLIST E ETIQUETAS DAS TAREFAS (Onda 2, 22/11/2026). Não importa
 * lib/db/nucleo (que importa daqui): só as tabelas novas.
 */

// ── Checklist ────────────────────────────────────────────────────────────────

export type ItemChecklist = { id: string; texto: string; feito: boolean }
export type ProgressoChecklist = { total: number; feitos: number }

/** Total e feitos do checklist de cada tarefa (o "2/5" do cartão). */
export async function progressoDosChecklists(tarefaIds: string[]): Promise<Map<string, ProgressoChecklist>> {
  const mapa = new Map<string, ProgressoChecklist>()
  if (!tarefaIds.length) return mapa
  const admin = await createAdminClient()
  for (let i = 0; i < tarefaIds.length; i += 200) {
    const { data, error } = await admin
      .from("demandas_tarefa_itens")
      .select("tarefa_id, feito")
      .in("tarefa_id", tarefaIds.slice(i, i + 200))
      .limit(5000)
    if (error) return mapa // sem a tabela (antes da migração)
    for (const l of data ?? []) {
      const atual = mapa.get(String(l.tarefa_id)) ?? { total: 0, feitos: 0 }
      atual.total++
      if (l.feito === true) atual.feitos++
      mapa.set(String(l.tarefa_id), atual)
    }
  }
  return mapa
}

export async function listarItens(tarefaId: string): Promise<ItemChecklist[]> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("demandas_tarefa_itens")
    .select("id, texto, feito")
    .eq("tarefa_id", tarefaId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .order("ordem")
    .order("created_at")
  if (error) {
    if (esquemaAusente(error)) return []
    throw new Error(`Falha ao ler o checklist: ${error.message}`)
  }
  return (data ?? []).map((i) => ({ id: String(i.id), texto: String(i.texto), feito: i.feito === true }))
}

export async function adicionarItem(tarefaId: string, bruto: string): Promise<{ erro?: string }> {
  const textoItem = bruto.replace(/\s+/g, " ").trim().slice(0, MAX_ITEM_CHECKLIST)
  if (!textoItem) return { erro: "Escreva o item." }
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data: ultimo } = await admin
    .from("demandas_tarefa_itens")
    .select("ordem")
    .eq("tarefa_id", tarefaId)
    .order("ordem", { ascending: false })
    .limit(1)
    .maybeSingle()
  const { error } = await admin.from("demandas_tarefa_itens").insert({
    emp_proprietaria_id: emp,
    tarefa_id: tarefaId,
    texto: textoItem,
    ordem: (Number(ultimo?.ordem) || 0) + 1,
  })
  if (error) return { erro: `Falha ao adicionar o item: ${error.message}` }
  return {}
}

/** A tarefa do item (para conferir o acesso antes de mexer nele). */
export async function tarefaDoItem(itemId: string): Promise<string | null> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("demandas_tarefa_itens")
    .select("tarefa_id")
    .eq("id", itemId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  return data ? String(data.tarefa_id) : null
}

export async function marcarItem(itemId: string, feito: boolean): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin
    .from("demandas_tarefa_itens")
    .update({ feito })
    .eq("id", itemId)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: `Falha ao marcar o item: ${error.message}` }
  return {}
}

export async function excluirItem(itemId: string): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin.from("demandas_tarefa_itens").delete().eq("id", itemId).eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: `Falha ao excluir o item: ${error.message}` }
  return {}
}

// ── Etiquetas ────────────────────────────────────────────────────────────────

export type Etiqueta = { id: string; nome: string; cor: CorEtiqueta }

function paraEtiqueta(e: Record<string, unknown>): Etiqueta {
  return { id: String(e.id), nome: String(e.nome), cor: ehCorEtiqueta(e.cor) ? e.cor : "cinza" }
}

export async function listarEtiquetas(): Promise<Etiqueta[]> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("demandas_etiquetas")
    .select("id, nome, cor")
    .eq("emp_proprietaria_id", await tenantAtual())
    .order("nome")
  if (error) return []
  return (data ?? []).map(paraEtiqueta)
}

export async function criarEtiqueta(nomeBruto: string, cor: string): Promise<{ erro?: string; id?: string }> {
  const nome = nomeDeEtiqueta(nomeBruto)
  if (!nome) return { erro: "Dê um nome à etiqueta." }
  if (!ehCorEtiqueta(cor)) return { erro: "Escolha uma cor da lista." }
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("demandas_etiquetas")
    .insert({ emp_proprietaria_id: await tenantAtual(), nome, cor })
    .select("id")
    .single()
  if (error) return { erro: error.code === "23505" ? `Já existe a etiqueta "${nome}".` : `Falha ao criar a etiqueta: ${error.message}` }
  return { id: String(data.id) }
}

export async function editarEtiqueta(id: string, nomeBruto: string, cor: string): Promise<{ erro?: string }> {
  const nome = nomeDeEtiqueta(nomeBruto)
  if (!nome) return { erro: "Dê um nome à etiqueta." }
  if (!ehCorEtiqueta(cor)) return { erro: "Escolha uma cor da lista." }
  const admin = await createAdminClient()
  const { error } = await admin.from("demandas_etiquetas").update({ nome, cor }).eq("id", id).eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: error.code === "23505" ? `Já existe a etiqueta "${nome}".` : `Falha ao salvar a etiqueta: ${error.message}` }
  return {}
}

export async function excluirEtiqueta(id: string): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin.from("demandas_etiquetas").delete().eq("id", id).eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: `Falha ao excluir a etiqueta: ${error.message}` }
  return {}
}

/** As etiquetas de cada tarefa. */
export async function etiquetasDasTarefas(tarefaIds: string[]): Promise<Map<string, Etiqueta[]>> {
  const mapa = new Map<string, Etiqueta[]>()
  if (!tarefaIds.length) return mapa
  const admin = await createAdminClient()
  for (let i = 0; i < tarefaIds.length; i += 200) {
    const { data, error } = await admin
      .from("demandas_tarefa_etiquetas")
      .select("tarefa_id, etiqueta:etiqueta_id (id, nome, cor)")
      .in("tarefa_id", tarefaIds.slice(i, i + 200))
      .limit(5000)
    if (error) return mapa
    for (const l of data ?? []) {
      const e = (Array.isArray(l.etiqueta) ? l.etiqueta[0] : l.etiqueta) as Record<string, unknown> | null
      if (!e) continue
      mapa.set(String(l.tarefa_id), [...(mapa.get(String(l.tarefa_id)) ?? []), paraEtiqueta(e)])
    }
  }
  for (const l of mapa.values()) l.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
  return mapa
}

/** Tarefas com a etiqueta (filtro das listas). Sem a tabela, nenhuma. */
export async function tarefasComEtiqueta(etiquetaId: string): Promise<string[]> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("demandas_tarefa_etiquetas")
    .select("tarefa_id")
    .eq("etiqueta_id", etiquetaId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .limit(5000)
  if (error) return []
  return (data ?? []).map((l) => String(l.tarefa_id))
}

/** Troca as etiquetas da tarefa (só as da entidade valem). */
export async function definirEtiquetasDaTarefa(tarefaId: string, etiquetaIds: string[]): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const ids = [...new Set(etiquetaIds.filter(Boolean))]
  const validas = ids.length
    ? ((await admin.from("demandas_etiquetas").select("id").eq("emp_proprietaria_id", emp).in("id", ids)).data ?? []).map((e) => String(e.id))
    : []
  const { error: erroApagar } = await admin.from("demandas_tarefa_etiquetas").delete().eq("tarefa_id", tarefaId).eq("emp_proprietaria_id", emp)
  if (erroApagar) return { erro: `Falha ao salvar as etiquetas: ${erroApagar.message}` }
  if (validas.length) {
    const { error } = await admin
      .from("demandas_tarefa_etiquetas")
      .insert(validas.map((etiqueta_id) => ({ emp_proprietaria_id: emp, tarefa_id: tarefaId, etiqueta_id })))
    if (error) return { erro: `Falha ao salvar as etiquetas: ${error.message}` }
  }
  return {}
}

/** A tarefa que se repete leva o checklist (desmarcado) e as etiquetas para a próxima. */
export async function copiarExtrasDaTarefa(de: string, para: string): Promise<void> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const [{ data: itens }, { data: etiquetas }] = await Promise.all([
    admin.from("demandas_tarefa_itens").select("texto, ordem").eq("tarefa_id", de),
    admin.from("demandas_tarefa_etiquetas").select("etiqueta_id").eq("tarefa_id", de),
  ])
  if (itens?.length) {
    await admin.from("demandas_tarefa_itens").insert(
      itens.map((i) => ({ emp_proprietaria_id: emp, tarefa_id: para, texto: texto(i.texto) ?? "", ordem: Number(i.ordem) || 0, feito: false }))
    )
  }
  if (etiquetas?.length) {
    await admin
      .from("demandas_tarefa_etiquetas")
      .insert(etiquetas.map((e) => ({ emp_proprietaria_id: emp, tarefa_id: para, etiqueta_id: e.etiqueta_id })))
  }
}
