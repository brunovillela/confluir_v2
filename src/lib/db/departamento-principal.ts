import "server-only"

import { listarDepartamentosCompletos } from "@/lib/db/departamentos"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * DEPARTAMENTO PRINCIPAL (Gestão, 22/11/2026). Quem está em mais de um
 * departamento contava, na IA e na revisão de acessos, pelo primeiro que o
 * banco devolvia. A Gestão marca o principal
 * (empresa_departamentos_integrantes.principal): é por ele que conta o uso da
 * IA (cota e relatório) e quem revisa o acesso. Sem marca, vale a regra antiga
 * (o que a pessoa coordena; senão, o primeiro).
 */

export type PessoaVariosDepartamentos = {
  usuarioId: string
  nome: string
  departamentos: { id: string; nome: string }[]
  principalId: string | null
}

/** Departamento principal marcado de cada pessoa (só departamentos ativos da entidade). */
export async function principaisDoTenant(): Promise<Map<string, string>> {
  const deptos = (await listarDepartamentosCompletos()).filter((d) => !d.legado)
  const ids = deptos.map((d) => d.id)
  const mapa = new Map<string, string>()
  if (!ids.length) return mapa
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("empresa_departamentos_integrantes")
    .select("usuario_id, departamento_id")
    .in("departamento_id", ids)
    .eq("principal", true)
  if (error) return mapa
  for (const l of data ?? []) mapa.set(String(l.usuario_id), String(l.departamento_id))
  return mapa
}

export async function pessoasEmVariosDepartamentos(): Promise<PessoaVariosDepartamentos[]> {
  const [deptos, principais] = await Promise.all([listarDepartamentosCompletos(), principaisDoTenant()])
  const porPessoa = new Map<string, PessoaVariosDepartamentos>()
  for (const d of deptos.filter((x) => !x.legado)) {
    for (const i of d.integrantes) {
      const p = porPessoa.get(i.usuarioId) ?? { usuarioId: i.usuarioId, nome: i.nome, departamentos: [], principalId: principais.get(i.usuarioId) ?? null }
      p.departamentos.push({ id: d.id, nome: d.nome })
      porPessoa.set(i.usuarioId, p)
    }
  }
  return [...porPessoa.values()]
    .filter((p) => p.departamentos.length > 1)
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
}

/**
 * Marca o principal de cada pessoa (null = desmarca). Só aceita departamentos
 * ativos da entidade de que a pessoa já faz parte.
 */
export async function definirPrincipais(escolhas: Map<string, string | null>): Promise<{ erro?: string; alterados: number }> {
  const pessoas = await pessoasEmVariosDepartamentos()
  const admin = await createAdminClient()
  let alterados = 0
  for (const p of pessoas) {
    if (!escolhas.has(p.usuarioId)) continue
    const nova = escolhas.get(p.usuarioId) ?? null
    if (nova && !p.departamentos.some((d) => d.id === nova)) continue
    if (nova === p.principalId) continue
    const ids = p.departamentos.map((d) => d.id)
    const { error: e1 } = await admin
      .from("empresa_departamentos_integrantes")
      .update({ principal: false })
      .eq("usuario_id", p.usuarioId)
      .in("departamento_id", ids)
    if (e1) return { erro: `Falha ao salvar: ${e1.message}`, alterados }
    if (nova) {
      const { error: e2 } = await admin
        .from("empresa_departamentos_integrantes")
        .update({ principal: true })
        .eq("usuario_id", p.usuarioId)
        .eq("departamento_id", nova)
      if (e2) return { erro: `Falha ao salvar: ${e2.message}`, alterados }
    }
    alterados++
  }
  return { alterados }
}
