import "server-only"

import { esquemaAusente } from "@/lib/db/comum"
import { invalidarCacheFontes } from "@/lib/db/fontes"
import {
  type BaseCategoria,
  type CategoriaFonte,
  categoriasSistema,
  ehBaseCategoria,
} from "@/lib/saude-cadastros"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Categorias de fonte pagadora criadas pela entidade (supabase/fonte-categorias.sql).
 * Sem a tabela, só existem as duas do sistema. A escrita vai pelo service
 * role (a tabela não está em TABELAS_TENANT) com o emp explícito; a leitura
 * passa pelo RLS tenant_isolation.
 */

export type CategoriaCriada = {
  id: string
  nome: string
  base: BaseCategoria
  /** Fontes que apontam para a categoria. */
  fontes: number
}

/** Categorias criadas, em ordem alfabética; `disponivel` = a tabela existe. */
export async function listarCategoriasCriadas(): Promise<{
  categorias: CategoriaCriada[]
  disponivel: boolean
}> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data, error } = await admin
    .from("fonte_categorias")
    .select("id, nome, base")
    .eq("emp_proprietaria_id", emp)
    .order("nome")
  if (error) return { categorias: [], disponivel: false }

  const usos = new Map<string, number>()
  const { data: fontes } = await admin
    .from("empresa")
    .select("fonte_categoria_id")
    .not("fonte_categoria_id", "is", null)
    .in("fonte_categoria_id", (data ?? []).map((c) => c.id))
  for (const f of fontes ?? []) {
    const id = String(f.fonte_categoria_id)
    usos.set(id, (usos.get(id) ?? 0) + 1)
  }

  return {
    categorias: (data ?? []).map((c) => ({
      id: String(c.id),
      nome: String(c.nome),
      base: ehBaseCategoria(c.base) ? c.base : "empregador",
      fontes: usos.get(String(c.id)) ?? 0,
    })),
    disponivel: true,
  }
}

/** As duas do sistema seguidas das criadas — a lista das abas e do seletor. */
export async function listarCategoriasFonte(): Promise<CategoriaFonte[]> {
  const { categorias } = await listarCategoriasCriadas()
  return [
    ...categoriasSistema(),
    ...categorias.map((c) => ({ chave: c.id, nome: c.nome, base: c.base, sistema: false })),
  ]
}

function erroDeGravacao(error: { message: string; code?: string }): string {
  if (esquemaAusente(error)) return "Rode supabase/fonte-categorias.sql para habilitar as categorias."
  if (error.code === "23505") return "Já existe uma categoria com esse nome."
  return `Falha ao salvar a categoria: ${error.message}`
}

function nomeValido(nome: string): string | null {
  const n = nome.trim().replace(/\s+/g, " ")
  if (!n) return null
  const reservado = categoriasSistema().some(
    (c) => c.nome.toLowerCase() === n.toLowerCase()
  )
  return reservado ? null : n.slice(0, 80)
}

export async function criarCategoriaFonte(
  nome: string,
  base: BaseCategoria
): Promise<{ erro?: string }> {
  const n = nomeValido(nome)
  if (!n) return { erro: "Informe um nome diferente de Empregador e Fundo de pensão." }
  const admin = await createAdminClient()
  const { error } = await admin
    .from("fonte_categorias")
    .insert({ nome: n, base, emp_proprietaria_id: await tenantAtual() })
  return error ? { erro: erroDeGravacao(error) } : {}
}

/**
 * Renomeia ou troca a base. Trocar a base acerta a marca fundo_pensao das
 * fontes da categoria, que é o que as regras de vínculo usam.
 */
export async function atualizarCategoriaFonte(
  id: string,
  nome: string,
  base: BaseCategoria
): Promise<{ erro?: string }> {
  const n = nomeValido(nome)
  if (!n) return { erro: "Informe um nome diferente de Empregador e Fundo de pensão." }
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { error, count } = await admin
    .from("fonte_categorias")
    .update({ nome: n, base, updated_at: new Date().toISOString() }, { count: "exact" })
    .eq("id", id)
    .eq("emp_proprietaria_id", emp)
  if (error) return { erro: erroDeGravacao(error) }
  if (count === 0) return { erro: "Categoria não encontrada." }

  const { error: erroFontes } = await admin
    .from("empresa")
    .update({ fundo_pensao: base === "fundo_pensao" })
    .eq("fonte_categoria_id", id)
  if (erroFontes) return { erro: `Categoria salva, mas as fontes não foram acertadas: ${erroFontes.message}` }
  invalidarCacheFontes()
  return {}
}

/** Só exclui categoria sem fonte — senão a fonte mudaria de aba sem aviso. */
export async function excluirCategoriaFonte(id: string): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { count } = await admin
    .from("empresa")
    .select("id", { count: "exact", head: true })
    .eq("fonte_categoria_id", id)
  if ((count ?? 0) > 0) {
    return { erro: "Há fontes nesta categoria — mude a categoria delas antes de excluir." }
  }
  const { error } = await admin
    .from("fonte_categorias")
    .delete()
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  return error ? { erro: erroDeGravacao(error) } : {}
}
