import "server-only"

import { getSessaoPainel } from "@/lib/auth"
import { texto } from "@/lib/db/comum"
import { podeAcessar } from "@/lib/permissoes"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Quem vê quais ofícios (decisão do Bruno, 18/09/2026): cada pessoa vê os
 * ofícios dos SEUS departamentos (Institucional › Organização › Departamentos —
 * integrante ou coordenador). A permissão `ferramentas_oficios_todos` (e o
 * administrador) vê todos, inclusive os sem departamento.
 * SQL: supabase/oficios-departamento.sql.
 */

export type DepartamentoOficio = { id: string; nome: string; legado?: boolean }

export type EscopoOficios =
  | { todos: true; departamentos: DepartamentoOficio[] }
  | { todos: false; departamentos: DepartamentoOficio[] }

/** Departamentos em que a pessoa está (integrante ou coordenador). */
export async function departamentosDoUsuario(
  usuarioId: string
): Promise<{ id: string; nome: string }[]> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const [{ data: deps }, { data: integ }] = await Promise.all([
    admin
      .from("empresa_departamentos")
      .select("id, departamento, coordenador_id")
      .eq("emp_proprietaria_id", emp)
      .order("departamento"),
    admin.from("empresa_departamentos_integrantes").select("departamento_id").eq("usuario_id", usuarioId),
  ])
  const meus = new Set((integ ?? []).map((i) => String(i.departamento_id)))
  return ((deps ?? []) as Record<string, unknown>[])
    .filter((d) => meus.has(String(d.id)) || d.coordenador_id === usuarioId)
    .map((d) => ({ id: String(d.id), nome: texto(d.departamento) ?? "(sem nome)" }))
}

/** Todos, com os legados marcados (seguem no filtro; saem da escolha no formulário). */
async function todosOsDepartamentos(): Promise<DepartamentoOficio[]> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const consulta = (colunas: string) =>
    admin.from("empresa_departamentos").select(colunas).eq("emp_proprietaria_id", emp).order("departamento")
  const comLegado = await consulta("id, departamento, legado")
  const { data } = comLegado.error ? await consulta("id, departamento") : comLegado
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((d) => ({
    id: String(d.id),
    nome: texto(d.departamento) ?? "(sem nome)",
    legado: d.legado === true,
  }))
}

/** Departamentos para ESCOLHER no ofício: sem os legados, fora o atual do ofício. */
export function departamentosParaEscolha(escopo: EscopoOficios, atual?: string | null): DepartamentoOficio[] {
  return escopo.departamentos.filter((d) => !d.legado || d.id === atual)
}

/** O escopo de quem está na sessão. Sem sessão, nada. */
export async function escopoOficios(): Promise<EscopoOficios> {
  const sessao = await getSessaoPainel()
  if (!sessao) return { todos: false, departamentos: [] }
  if (podeAcessar(sessao.permissoes, "ferramentas_oficios_todos", ["permissoes", "configuracoes"])) {
    return { todos: true, departamentos: await todosOsDepartamentos() }
  }
  return { todos: false, departamentos: await departamentosDoUsuario(String(sessao.usuario.id)) }
}

export function podeVerDepartamento(escopo: EscopoOficios, departamentoId: string | null): boolean {
  if (escopo.todos) return true
  return departamentoId !== null && escopo.departamentos.some((d) => d.id === departamentoId)
}

/** O ofício está no escopo de quem está na sessão? */
export async function podeVerOficio(oficioId: string, escopo?: EscopoOficios): Promise<boolean> {
  const e = escopo ?? (await escopoOficios())
  const admin = await createAdminClient()
  const { data } = await admin
    .from("oficios")
    .select("departamento_id")
    .eq("id", oficioId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (!data) return false
  return podeVerDepartamento(e, texto(data.departamento_id))
}

export const FORA_DO_ESCOPO = "Este ofício é de outro departamento."

/** O ofício de uma linha da lista de pessoas está no escopo? */
export async function podeVerFiliadoDoOficio(filiadoId: string, escopo?: EscopoOficios): Promise<boolean> {
  const admin = await createAdminClient()
  const { data } = await admin.from("oficios_filiados").select("oficio_id").eq("id", filiadoId).maybeSingle()
  return data ? podeVerOficio(String(data.oficio_id), escopo) : false
}

/**
 * Departamento escolhido no formulário: quem não vê todos precisa escolher um
 * dos seus; quem vê todos pode escolher qualquer um ou deixar sem.
 */
export function validarDepartamentoDoOficio(
  escopo: EscopoOficios,
  departamentoId: string | null,
  atual?: string | null
): string | null {
  if (departamentoId && !departamentosParaEscolha(escopo, atual).some((d) => d.id === departamentoId)) {
    return "Escolha um departamento da lista."
  }
  if (!escopo.todos && !departamentoId) {
    return escopo.departamentos.length
      ? "Escolha o departamento do ofício."
      : "Você não está em nenhum departamento — peça o vínculo em Institucional › Organização › Departamentos."
  }
  return null
}

/** Departamento gravado no ofício (para manter um legado ao editar). */
export async function departamentoAtualDoOficio(oficioId: string): Promise<string | null> {
  const admin = await createAdminClient()
  const { data } = await admin.from("oficios").select("departamento_id").eq("id", oficioId).maybeSingle()
  return texto(data?.departamento_id)
}
