import "server-only"

import { cache } from "react"

import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * QUEM É APTO numa assembleia. Regra de 2026-07-19: aptos e voto único são
 * por RODADA. A lista que a gestão sobe fica na rodada (`rod_assembleia_id`,
 * sem `assembleia_id`) — é assim com os 60 mil aptos do tenant real. Quando o
 * apto foi amarrado a uma assembleia específica (turno, urna), vale essa
 * amarração.
 *
 *   apto da assembleia A  =  assembleia_id = A
 *                         ou (assembleia_id nulo e rod_assembleia_id = rodada de A)
 *
 * Todas as consultas de apto da votação (online, urna, portal) passam por
 * aqui, para as duas portas enxergarem a mesma pessoa e a trava de voto único
 * valer igual em todas.
 */

/** Grupos de condições (E dentro do grupo, OU entre grupos) no formato PostgREST. */
export type EscopoAptos = string[][]

/** A rodada de uma assembleia (uma consulta por request). */
export const rodadaDaAssembleia = cache(async (assembleiaId: string): Promise<string | null> => {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("voto_assembleias")
    .select("rod_assembleia_id")
    .eq("id", assembleiaId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  return (data?.rod_assembleia_id as string | null) ?? null
})

export async function escopoAptos(assembleiaId: string): Promise<EscopoAptos> {
  const rodada = await rodadaDaAssembleia(assembleiaId)
  const grupos: EscopoAptos = [[`assembleia_id.eq.${assembleiaId}`]]
  if (rodada) grupos.push(["assembleia_id.is.null", `rod_assembleia_id.eq.${rodada}`])
  return grupos
}

/**
 * Monta o filtro para `.or(...)`. Com `alternativas` (ex.: cpf OU e-mail, ou
 * os termos de uma busca), cada grupo do escopo é combinado com cada uma —
 * duas chamadas de `.or` no mesmo pedido seriam ambíguas.
 */
export function filtroAptos(escopo: EscopoAptos, alternativas: string[] = []): string {
  const grupos = alternativas.length
    ? escopo.flatMap((g) => alternativas.map((a) => [...g, a]))
    : escopo
  return grupos.map((g) => (g.length === 1 ? g[0] : `and(${g.join(",")})`)).join(",")
}

/** Filtro de escopo para VÁRIAS assembleias de uma vez (contagens de painel). */
export function filtroAptosDeVarias(assembleiaIds: string[], rodadaIds: string[]): string {
  const partes = [`assembleia_id.in.(${assembleiaIds.join(",")})`]
  if (rodadaIds.length) {
    partes.push(`and(assembleia_id.is.null,rod_assembleia_id.in.(${rodadaIds.join(",")}))`)
  }
  return partes.join(",")
}

/**
 * Para aptos que estão só na rodada: em qual assembleia "mostrar" a pessoa
 * (histórico de votação, visualização). A online primeiro, senão a primeira.
 */
export async function assembleiaPrincipalDasRodadas(
  rodadaIds: string[]
): Promise<Map<string, string>> {
  const mapa = new Map<string, string>()
  if (rodadaIds.length === 0) return mapa
  const admin = await createAdminClient()
  const { data } = await admin
    .from("voto_assembleias")
    .select("id, rod_assembleia_id, online, created_at")
    .eq("emp_proprietaria_id", await tenantAtual())
    .in("rod_assembleia_id", rodadaIds)
    .order("online", { ascending: false })
    .order("created_at", { ascending: true })
  for (const a of data ?? []) {
    const r = String(a.rod_assembleia_id)
    if (!mapa.has(r)) mapa.set(r, String(a.id))
  }
  return mapa
}
