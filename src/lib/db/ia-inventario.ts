import "server-only"

import { esquemaAusente } from "@/lib/db/comum"
import { montarInventario, type Inventario, type UsoInventario } from "@/lib/ia-inventario"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Leitura do inventário da IA (Gestão › Inteligência Artificial › Inventário):
 * o uso por processo no período (função ia_uso_inventario) e os minutos
 * ajustados pela Gestão (ia_config.minutos_humanos). A conta fica em
 * lib/ia-inventario.ts.
 */

function num(v: unknown): number {
  return Number(v ?? 0) || 0
}

/** Minutos por operação ajustados pela Gestão (processo → minutos). */
export async function minutosAjustadosIA(): Promise<Record<string, number>> {
  try {
    const admin = await createAdminClient()
    const { data, error } = await admin.from("ia_config").select("minutos_humanos").eq("emp_proprietaria_id", await tenantAtual()).maybeSingle()
    if (error || !data) return {}
    const bruto = (data as { minutos_humanos?: unknown }).minutos_humanos
    const r: Record<string, number> = {}
    if (bruto && typeof bruto === "object" && !Array.isArray(bruto)) {
      for (const [k, v] of Object.entries(bruto as Record<string, unknown>)) {
        const n = Number(v)
        if (Number.isFinite(n) && n >= 0) r[k] = n
      }
    }
    return r
  } catch {
    return {}
  }
}

export async function obterInventarioIA(
  de: Date,
  ate: Date
): Promise<{ disponivel: boolean; inventario: Inventario; ajustes: Record<string, number> }> {
  const admin = await createAdminClient()
  const [{ data, error }, ajustes] = await Promise.all([
    admin.rpc("ia_uso_inventario", { p_emp: await tenantAtual(), p_de: de.toISOString(), p_ate: ate.toISOString() }),
    minutosAjustadosIA(),
  ])
  const usos: UsoInventario[] = ((error ? [] : data) as Record<string, unknown>[] | null ?? []).map((l) => ({
    processo: String(l.processo ?? ""),
    chamadas: num(l.chamadas),
    sucessos: num(l.sucessos),
    falhas: num(l.falhas),
    bloqueadas: num(l.bloqueadas),
    comCusto: num(l.com_custo),
    custo: l.custo === null || l.custo === undefined ? null : Number(l.custo),
    tokensEntrada: num(l.tokens_entrada),
    tokensSaida: num(l.tokens_saida),
    duracaoMediaMs: l.duracao_media_ms === null || l.duracao_media_ms === undefined ? null : Number(l.duracao_media_ms),
    modelos: Array.isArray(l.modelos) ? (l.modelos as unknown[]).map(String).filter(Boolean) : [],
    ultima: l.ultima ? String(l.ultima) : null,
  }))
  return { disponivel: !error || !esquemaAusente(error), inventario: montarInventario(usos, ajustes), ajustes }
}
