import "server-only"

import { cache } from "react"

import { lerEmLotes, texto } from "@/lib/db/comum"
import { listarRemessasInformes } from "@/lib/db/informes"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Base da área Informes de rendimentos no padrão de 3 níveis
 * (lib/pessoal-area.ts): os informes da entidade, um por funcionário e
 * ano-base (a remessa).
 */
export type InformeArea = {
  id: string
  remessaId: string
  ano: string
  remessaFechada: boolean
  funcionarioId: string
  liberado: boolean
  arquivo: string | null
  criadoEm: string | null
}

export const carregarBaseInformes = cache(async () => {
  const remessas = await listarRemessasInformes()
  const porId = new Map(remessas.map((r) => [r.id, r]))
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const brutos = await lerEmLotes((de, ate) =>
    admin
      .from("pessoal_informes_rendimentos")
      .select("id, remessa_id, funcionario_id, liberado, arquivo_url, created_at")
      .eq("emp_proprietaria_id", emp)
      .order("id")
      .range(de, ate)
  )
  const informes: InformeArea[] = []
  for (const b of brutos) {
    const r = porId.get(String(b.remessa_id))
    const f = texto(b.funcionario_id)
    if (!r || !f) continue
    informes.push({
      id: String(b.id),
      remessaId: r.id,
      ano: r.ano_referencia_os ?? "(sem ano)",
      remessaFechada: r.fechada === true,
      funcionarioId: f,
      liberado: b.liberado === true,
      arquivo: texto(b.arquivo_url),
      criadoEm: texto(b.created_at),
    })
  }
  informes.sort((a, b) => b.ano.localeCompare(a.ano))
  return { remessas, informes }
})
