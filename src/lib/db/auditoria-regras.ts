import "server-only"

import {
  parametrosPadrao,
  regrasDaOrigem,
  severidadePadrao,
  type OrigemOrdem,
  type RegraCatalogo,
  type Severidade,
} from "@/lib/auditoria-regras-catalogo"
import { esquemaAusente } from "@/lib/db/comum"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Configuração das regras de verificação por tenant e origem
 * (supabase/ordens-regras.sql). Sem linha gravada, vale o padrão do catálogo;
 * sem a tabela, tudo segue o padrão (nada quebra antes do SQL).
 */

export type RegraConfigurada = {
  regra: RegraCatalogo
  severidade: Severidade
  parametros: Record<string, number | string | boolean>
  /** Configurada pelo tenant (false = padrão do sistema). */
  personalizada: boolean
}

export async function regrasConfiguradas(origem: OrigemOrdem): Promise<RegraConfigurada[]> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("auditoria_regras")
    .select("codigo, severidade, parametros")
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("origem", origem)
  const gravadas = new Map(
    (error ? [] : (data ?? [])).map((l) => [String(l.codigo), l as { severidade: Severidade; parametros: Record<string, unknown> | null }])
  )
  return regrasDaOrigem(origem).map((regra) => {
    const g = gravadas.get(regra.codigo)
    return {
      regra,
      severidade: g?.severidade ?? severidadePadrao(regra, origem),
      parametros: { ...parametrosPadrao(regra), ...((g?.parametros ?? {}) as Record<string, number | string | boolean>) },
      personalizada: Boolean(g),
    }
  })
}

export async function salvarRegras(
  origem: OrigemOrdem,
  regras: { codigo: string; severidade: Severidade; parametros: Record<string, number | string | boolean> }[],
  usuarioId: string
): Promise<{ erro?: string }> {
  const validas = new Set(regrasDaOrigem(origem).map((r) => r.codigo))
  const linhas = regras
    .filter((r) => validas.has(r.codigo))
    .map((r) => ({
      emp_proprietaria_id: undefined as unknown as string,
      origem,
      codigo: r.codigo,
      severidade: r.severidade,
      parametros: r.parametros,
      atualizado_por: usuarioId,
      updated_at: new Date().toISOString(),
    }))
  const emp = await tenantAtual()
  for (const l of linhas) l.emp_proprietaria_id = emp
  const admin = await createAdminClient()
  const { error } = await admin
    .from("auditoria_regras")
    .upsert(linhas, { onConflict: "emp_proprietaria_id,origem,codigo" })
  if (error) {
    if (esquemaAusente(error)) return { erro: "Rode supabase/ordens-regras.sql antes de configurar." }
    return { erro: `Não foi possível salvar: ${error.message}` }
  }
  return {}
}
