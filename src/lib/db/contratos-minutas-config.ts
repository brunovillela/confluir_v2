import "server-only"

import { esquemaAusente } from "@/lib/db/comum"
import type { ClausulaFixa, TipoMinutaConfig } from "@/lib/contratos-minutas-constantes"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Configuração das minutas pela entidade: tipos de contrato e cláusulas
 * fixas. Ver supabase/contratos-minutas-config.sql.
 */

export const AVISO_SQL_CONFIG =
  "Tipos e cláusulas fixas usam tabelas novas — rode supabase/contratos-minutas-config.sql no Supabase."

const txt = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null)

export async function listarTiposMinuta(): Promise<{
  disponivel: boolean
  tipos: TipoMinutaConfig[]
}> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("contratos_minuta_tipos")
    .select("id, nome, descricao, orientacao, ativo, ordem")
    .eq("emp_proprietaria_id", await tenantAtual())
    .order("ordem", { ascending: true })
    .order("nome", { ascending: true })
  if (error) {
    if (esquemaAusente(error)) return { disponivel: false, tipos: [] }
    throw new Error(`Falha ao listar os tipos de contrato: ${error.message}`)
  }
  return {
    disponivel: true,
    tipos: (data ?? []).map((t) => ({
      id: t.id as string,
      nome: String(t.nome ?? ""),
      descricao: txt(t.descricao),
      orientacao: txt(t.orientacao),
      ativo: t.ativo !== false,
      ordem: Number(t.ordem ?? 0),
    })),
  }
}

export async function listarClausulasFixas(): Promise<{
  disponivel: boolean
  clausulas: ClausulaFixa[]
}> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("contratos_clausulas_fixas")
    .select("id, titulo, texto, ativa, ordem, tipos")
    .eq("emp_proprietaria_id", await tenantAtual())
    .order("ordem", { ascending: true })
    .order("titulo", { ascending: true })
  if (error) {
    if (esquemaAusente(error)) return { disponivel: false, clausulas: [] }
    throw new Error(`Falha ao listar as cláusulas fixas: ${error.message}`)
  }
  return {
    disponivel: true,
    clausulas: (data ?? []).map((c) => ({
      id: c.id as string,
      titulo: String(c.titulo ?? ""),
      texto: String(c.texto ?? ""),
      ativa: c.ativa !== false,
      ordem: Number(c.ordem ?? 0),
      tipos: Array.isArray(c.tipos) ? (c.tipos as string[]) : [],
    })),
  }
}

/** Cria (sem id) ou atualiza um tipo de contrato. */
export async function salvarTipoMinuta(
  id: string | null,
  dados: { nome: string; descricao: string | null; orientacao: string | null; ativo: boolean; ordem: number }
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const empId = await tenantAtual()
  const { error } = id
    ? await admin
        .from("contratos_minuta_tipos")
        .update({ ...dados, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("emp_proprietaria_id", empId)
    : await admin.from("contratos_minuta_tipos").insert({ ...dados, emp_proprietaria_id: empId })
  if (error) return { erro: esquemaAusente(error) ? AVISO_SQL_CONFIG : `Não foi possível salvar: ${error.message}` }
  return {}
}

/** Cria (sem id) ou atualiza uma cláusula fixa. */
export async function salvarClausulaFixa(
  id: string | null,
  dados: { titulo: string; texto: string; ativa: boolean; ordem: number; tipos: string[] }
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const empId = await tenantAtual()
  const { error } = id
    ? await admin
        .from("contratos_clausulas_fixas")
        .update({ ...dados, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("emp_proprietaria_id", empId)
    : await admin.from("contratos_clausulas_fixas").insert({ ...dados, emp_proprietaria_id: empId })
  if (error) return { erro: esquemaAusente(error) ? AVISO_SQL_CONFIG : `Não foi possível salvar: ${error.message}` }
  return {}
}

export async function excluirClausulaFixa(id: string): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin
    .from("contratos_clausulas_fixas")
    .delete()
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: `Não foi possível excluir: ${error.message}` }
  return {}
}
