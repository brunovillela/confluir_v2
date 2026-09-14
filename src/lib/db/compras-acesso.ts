import "server-only"

import { esquemaAusente } from "@/lib/db/comum"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Compras — por quais departamentos cada pessoa compra e vê compras.
 *
 * Sem departamento definido, a pessoa alcança TODOS (o comportamento de
 * antes). Com departamentos, só escolhe esses na nova compra e só vê as
 * compras deles — mais as que ela mesma registrou (`solicitante_id`). As
 * compras do legado, sem departamento, ficam só para quem alcança todos.
 * SQL: supabase/compras-restricao-departamento.sql.
 */

export type EscopoCompras = {
  /** true = sem restrição (nenhum departamento definido ou SQL não rodado). */
  todos: boolean
  departamentoIds: string[]
  usuarioId: string
}

export async function escopoComprasDoUsuario(usuarioId: string): Promise<EscopoCompras> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("compras_departamentos_acesso")
    .select("departamento_id")
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("usuario_id", usuarioId)
  if (error) {
    if (esquemaAusente(error)) return { todos: true, departamentoIds: [], usuarioId }
    throw new Error(`Falha ao ler os departamentos de compras: ${error.message}`)
  }
  const departamentoIds = (data ?? []).map((d) => String(d.departamento_id))
  return { todos: departamentoIds.length === 0, departamentoIds, usuarioId }
}

/** A compra (departamento e quem registrou) está ao alcance da pessoa? */
export function compraNoEscopo(
  escopo: EscopoCompras,
  compra: { departamentoId: string | null; solicitanteId: string | null }
): boolean {
  if (escopo.todos) return true
  if (compra.solicitanteId && compra.solicitanteId === escopo.usuarioId) return true
  return Boolean(compra.departamentoId && escopo.departamentoIds.includes(compra.departamentoId))
}

/** Filtro PostgREST `or` para listas de compras_solicitacoes (null = sem filtro). */
export function filtroDoEscopo(escopo: EscopoCompras): string | null {
  if (escopo.todos) return null
  const ids = escopo.departamentoIds.join(",")
  return `solicitacao_departamento_id.in.(${ids}),solicitante_id.eq.${escopo.usuarioId}`
}

export async function departamentosComprasDoUsuario(
  usuarioId: string
): Promise<{ disponivel: boolean; departamentoIds: string[] }> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("compras_departamentos_acesso")
    .select("departamento_id")
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("usuario_id", usuarioId)
  if (error) {
    if (esquemaAusente(error)) return { disponivel: false, departamentoIds: [] }
    throw new Error(`Falha ao ler os departamentos de compras: ${error.message}`)
  }
  return { disponivel: true, departamentoIds: (data ?? []).map((d) => String(d.departamento_id)) }
}

/** Troca o conjunto de departamentos da pessoa (vazio = todos). */
export async function definirDepartamentosCompras(
  usuarioId: string,
  departamentoIds: string[],
  definidoPor: string
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { error: erroApagar } = await admin
    .from("compras_departamentos_acesso")
    .delete()
    .eq("emp_proprietaria_id", emp)
    .eq("usuario_id", usuarioId)
  if (erroApagar) {
    if (esquemaAusente(erroApagar)) {
      return { erro: "Rode supabase/compras-restricao-departamento.sql no Supabase." }
    }
    return { erro: `Falha ao salvar os departamentos: ${erroApagar.message}` }
  }
  if (departamentoIds.length === 0) return {}
  const { error } = await admin.from("compras_departamentos_acesso").insert(
    departamentoIds.map((departamento_id) => ({
      emp_proprietaria_id: emp,
      usuario_id: usuarioId,
      departamento_id,
      definido_por: definidoPor,
    }))
  )
  if (error) return { erro: `Falha ao salvar os departamentos: ${error.message}` }
  return {}
}
