import "server-only"

import {
  temaClausula,
  temaDaCategoria,
  type CategoriaClausula,
  type TemaClausula,
} from "@/lib/acordos-constantes"
import { contemTermo } from "@/lib/acordos-tema"
import { texto } from "@/lib/db/comum"
import { podeAcessar, type Permissoes } from "@/lib/permissoes"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * "Mesmo tema entre empresas" — os acordos que podem entrar e as cláusulas de
 * cada um no tema/palavra escolhidos. Pauta e propostas de negociação só para
 * quem negocia (como no comparador).
 */

export type AcordoParaTema = {
  id: string
  titulo: string
  situacao: string
  vigenciaFim: string | null
  empresas: string[]
  clausulas: number
  sigiloso: boolean
}

export async function acordosParaTema(permissoes: Permissoes | null): Promise<AcordoParaTema[]> {
  const admin = await createAdminClient()
  const empId = await tenantAtual()
  let q = admin
    .from("acordo_coletivo")
    .select("id, titulo, situacao, vigencia_fim, negociacao_id")
    .eq("emp_proprietaria_id", empId)
  if (!podeAcessar(permissoes, "negociacoes")) q = q.is("negociacao_id", null)
  const { data: acordos } = await q.order("vigencia_fim", { ascending: false, nullsFirst: false }).limit(500)
  const ids = (acordos ?? []).map((a) => String(a.id))
  if (!ids.length) return []

  const [fontes, contagem] = await Promise.all([
    admin
      .from("acordo_fontes")
      .select("acordo_id, empresa:empresa_id(nome_fantasia, nome_razao)")
      .in("acordo_id", ids)
      .eq("emp_proprietaria_id", empId),
    Promise.all(
      ids.map(async (id) => {
        const { count } = await admin
          .from("acordo_clausulas")
          .select("id", { count: "exact", head: true })
          .eq("acordo_id", id)
          .eq("emp_proprietaria_id", empId)
        return [id, count ?? 0] as const
      })
    ),
  ])
  const empresas = new Map<string, string[]>()
  for (const f of fontes.data ?? []) {
    const e = (Array.isArray(f.empresa) ? f.empresa[0] : f.empresa) as Record<string, unknown> | null
    const nome = texto(e?.nome_fantasia) ?? texto(e?.nome_razao)
    if (!nome) continue
    empresas.set(String(f.acordo_id), [...(empresas.get(String(f.acordo_id)) ?? []), nome])
  }
  const n = new Map(contagem)
  return (acordos ?? [])
    .map((a) => ({
      id: String(a.id),
      titulo: String(a.titulo ?? "(sem título)"),
      situacao: String(a.situacao ?? ""),
      vigenciaFim: texto(a.vigencia_fim),
      empresas: empresas.get(String(a.id)) ?? [],
      clausulas: n.get(String(a.id)) ?? 0,
      sigiloso: Boolean(a.negociacao_id),
    }))
    .filter((a) => a.clausulas > 0)
}

export type ClausulaTema = {
  id: string
  numero: string | null
  titulo: string | null
  texto: string | null
  tema: TemaClausula
}

/** Cláusulas de cada acordo no tema (e/ou com as palavras), na ordem do acordo. */
export async function clausulasDoTema(
  acordoIds: string[],
  filtro: { tema: TemaClausula | null; termo: string }
): Promise<Map<string, ClausulaTema[]>> {
  const admin = await createAdminClient()
  const empId = await tenantAtual()
  const saida = new Map<string, ClausulaTema[]>()
  await Promise.all(
    acordoIds.map(async (id) => {
      const { data } = await admin
        .from("acordo_clausulas")
        .select("id, numero, titulo, texto, tema, categoria, ordem")
        .eq("acordo_id", id)
        .eq("emp_proprietaria_id", empId)
        .order("ordem", { ascending: true })
      const lista = (data ?? [])
        .map((c) => ({
          id: String(c.id),
          numero: texto(c.numero),
          titulo: texto(c.titulo),
          texto: texto(c.texto),
          // Cláusula digitada antes dos temas cai no tema da categoria antiga.
          tema: temaClausula(c.tema) ?? temaDaCategoria((c.categoria ?? "outro") as CategoriaClausula),
        }))
        .filter((c) => (!filtro.tema || c.tema === filtro.tema) && contemTermo(c, filtro.termo))
      saida.set(id, lista)
    })
  )
  return saida
}
