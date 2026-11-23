import "server-only"

import { esquemaAusente, nomesDosUsuarios, texto } from "@/lib/db/comum"
import { consultaCanonica, type PaginaFiltro } from "@/lib/ferramentas-acompanhamento"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * FILTROS SALVOS (Onda 4, 23/11/2026): atalhos de um clique para Tarefas e
 * Demandas. Cada um guarda a consulta da página (em forma canônica); o
 * compartilhado aparece para todos que veem a página, mas só quem salvou
 * apaga.
 */

export type FiltroSalvo = {
  id: string
  nome: string
  consulta: string
  compartilhado: boolean
  meu: boolean
  autorNome: string | null
}

const TABELA = "demandas_filtros_salvos"
/** Teto por pessoa e página: os atalhos cabem numa linha. */
export const MAX_FILTROS_POR_PAGINA = 15

export async function listarFiltrosSalvos(pagina: PaginaFiltro, usuarioId: string): Promise<FiltroSalvo[]> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from(TABELA)
    .select("id, usuario_id, nome, consulta, compartilhado")
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("pagina", pagina)
    .or(`usuario_id.eq.${usuarioId},compartilhado.eq.true`)
    .order("nome")
    .limit(100)
  if (error) {
    if (esquemaAusente(error)) return []
    throw new Error(`Falha ao ler os filtros salvos: ${error.message}`)
  }
  const linhas = data ?? []
  const nomes = await nomesDosUsuarios(
    linhas.filter((l) => String(l.usuario_id) !== usuarioId).map((l) => String(l.usuario_id)),
    "guerra"
  )
  return linhas
    .map((l) => ({
      id: String(l.id),
      nome: String(l.nome),
      consulta: String(l.consulta ?? ""),
      compartilhado: l.compartilhado === true,
      meu: String(l.usuario_id) === usuarioId,
      autorNome: String(l.usuario_id) === usuarioId ? null : (nomes.get(String(l.usuario_id)) ?? null),
    }))
    .sort((a, b) => Number(b.meu) - Number(a.meu) || a.nome.localeCompare(b.nome, "pt-BR"))
}

export async function salvarFiltro(
  usuarioId: string,
  dados: { pagina: PaginaFiltro; nome: string; consulta: string; compartilhado: boolean }
): Promise<{ erro?: string }> {
  const nome = dados.nome.trim().slice(0, 60)
  if (!nome) return { erro: "Dê um nome ao filtro." }
  const consulta = consultaCanonica(dados.pagina, dados.consulta)
  if (!consulta) return { erro: "Escolha algum filtro antes de salvar." }
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data: meus } = await admin
    .from(TABELA)
    .select("id, nome")
    .eq("emp_proprietaria_id", emp)
    .eq("pagina", dados.pagina)
    .eq("usuario_id", usuarioId)
  const existente = (meus ?? []).find((f) => String(f.nome).toLocaleLowerCase("pt-BR") === nome.toLocaleLowerCase("pt-BR"))
  if (existente) {
    // Mesmo nome: atualiza o atalho (é o jeito de "editar" um filtro).
    const { error } = await admin
      .from(TABELA)
      .update({ consulta, compartilhado: dados.compartilhado })
      .eq("id", existente.id)
    return error ? { erro: `Não foi possível salvar o filtro: ${error.message}` } : {}
  }
  if ((meus ?? []).length >= MAX_FILTROS_POR_PAGINA) {
    return { erro: `Você já tem ${MAX_FILTROS_POR_PAGINA} filtros nesta página. Apague um antes.` }
  }
  const { error } = await admin.from(TABELA).insert({
    emp_proprietaria_id: emp,
    usuario_id: usuarioId,
    pagina: dados.pagina,
    nome,
    consulta,
    compartilhado: dados.compartilhado,
  })
  return error ? { erro: `Não foi possível salvar o filtro: ${error.message}` } : {}
}

/** Só quem salvou apaga. */
export async function excluirFiltro(usuarioId: string, id: string): Promise<{ erro?: string; pagina?: string }> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from(TABELA)
    .delete()
    .eq("id", id)
    .eq("usuario_id", usuarioId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .select("pagina")
  if (error) return { erro: `Não foi possível apagar o filtro: ${error.message}` }
  if (!data?.length) return { erro: "Só quem salvou o filtro pode apagá-lo." }
  return { pagina: texto(data[0].pagina) ?? undefined }
}
