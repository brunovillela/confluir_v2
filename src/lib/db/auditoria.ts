import "server-only"

import { esquemaAusente } from "@/lib/db/comum"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/** Trilha genérica — ver supabase/auditoria.sql. */

export const TABELAS_AUDITADAS: { tabela: string; rotulo: string }[] = [
  { tabela: "permissoes", rotulo: "Permissões individuais" },
  { tabela: "perfis", rotulo: "Perfis de acesso" },
  { tabela: "perfil_permissoes", rotulo: "Permissões dos perfis" },
  { tabela: "usuario_perfis", rotulo: "Perfis por usuário" },
  { tabela: "usuarios", rotulo: "Usuários" },
  { tabela: "filiacoes", rotulo: "Filiações" },
  { tabela: "filiacao_vinculos", rotulo: "Vínculos de filiação" },
  { tabela: "dados_bancarios", rotulo: "Dados bancários" },
  { tabela: "fornecedores", rotulo: "Fornecedores" },
  { tabela: "compras_fornecedores", rotulo: "Fornecedores (compras)" },
  { tabela: "ordens_pagamento", rotulo: "Ordens de pagamento" },
  { tabela: "contratos", rotulo: "Contratos" },
  { tabela: "auth_identidades", rotulo: "Identidades de acesso" },
  { tabela: "cessao_espacos", rotulo: "Espaços" },
  { tabela: "financeiro_config", rotulo: "Configuração financeira" },
  { tabela: "caixa_contas", rotulo: "Contas de caixa" },
  { tabela: "empresa", rotulo: "Organização / empresas" },
  { tabela: "plataforma_admins", rotulo: "Super-admins" },
]

export function rotuloTabela(tabela: string): string {
  return TABELAS_AUDITADAS.find((t) => t.tabela === tabela)?.rotulo ?? tabela
}

export type LinhaAuditoria = {
  id: number
  tabela: string
  registroId: string | null
  operacao: "INSERT" | "UPDATE" | "DELETE"
  campos: string[]
  antes: Record<string, unknown> | null
  depois: Record<string, unknown> | null
  usuarioId: string | null
  usuarioNome: string | null
  papel: string | null
  momento: string
}

export type FiltrosAuditoria = {
  tabela?: string
  registro?: string
  usuarioId?: string
  de?: string
  ate?: string
}

export async function listarAuditoria(
  filtros: FiltrosAuditoria,
  pagina: number,
  porPagina: number
): Promise<{ linhas: LinhaAuditoria[]; total: number; disponivel: boolean }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  let q = admin
    .from("auditoria")
    .select("id, tabela, registro_id, operacao, campos, antes, depois, usuario_id, papel, momento", { count: "exact" })
    .eq("emp_proprietaria_id", emp)
    .order("id", { ascending: false })
  if (filtros.tabela) q = q.eq("tabela", filtros.tabela)
  if (filtros.registro) q = q.eq("registro_id", filtros.registro.trim())
  if (filtros.usuarioId) q = q.eq("usuario_id", filtros.usuarioId)
  if (filtros.de) q = q.gte("momento", `${filtros.de}T00:00:00-03:00`)
  if (filtros.ate) q = q.lte("momento", `${filtros.ate}T23:59:59-03:00`)
  const de = (pagina - 1) * porPagina
  const { data, count, error } = await q.range(de, de + porPagina - 1)
  if (error) {
    if (esquemaAusente(error)) return { linhas: [], total: 0, disponivel: false }
    throw new Error(error.message)
  }
  const ids = [...new Set((data ?? []).map((l) => l.usuario_id).filter(Boolean).map(String))]
  const nomes = await nomesDeUsuarios(ids)
  return {
    disponivel: true,
    total: count ?? 0,
    linhas: (data ?? []).map((l) => ({
      id: Number(l.id),
      tabela: String(l.tabela),
      registroId: l.registro_id ? String(l.registro_id) : null,
      operacao: l.operacao as LinhaAuditoria["operacao"],
      campos: (l.campos as string[] | null) ?? [],
      antes: (l.antes as Record<string, unknown> | null) ?? null,
      depois: (l.depois as Record<string, unknown> | null) ?? null,
      usuarioId: l.usuario_id ? String(l.usuario_id) : null,
      usuarioNome: l.usuario_id ? (nomes.get(String(l.usuario_id)) ?? null) : null,
      papel: l.papel ? String(l.papel) : null,
      momento: String(l.momento),
    })),
  }
}

async function nomesDeUsuarios(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map()
  const admin = await createAdminClient()
  const { data } = await admin.from("usuarios").select("id, nome_completo, nome_guerra, email").in("id", ids)
  return new Map(
    (data ?? []).map((u) => [
      String(u.id),
      String(u.nome_completo ?? u.nome_guerra ?? u.email ?? u.id),
    ])
  )
}

/** Usuários do painel (quem tem linha em `permissoes`) para o filtro. */
export async function usuariosDoPainel(): Promise<{ id: string; nome: string }[]> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data: perms } = await admin.from("permissoes").select("usuario_id").eq("emp_proprietaria_id", emp)
  const ids = [...new Set((perms ?? []).map((p) => p.usuario_id).filter(Boolean).map(String))]
  const nomes = await nomesDeUsuarios(ids)
  return ids
    .map((id) => ({ id, nome: nomes.get(id) ?? id }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
}
