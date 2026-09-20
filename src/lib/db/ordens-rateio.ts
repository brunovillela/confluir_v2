import "server-only"

import { esquemaAusente, texto } from "@/lib/db/comum"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Rateio de uma ordem de pagamento — a divisão entre contas contábeis quando
 * um pagamento só cobre gastos de contas diferentes (o caso da diária com
 * despesas extras). Vazio = a ordem inteira é do centro de custo dela.
 * Ver supabase/diarias-diretoria.sql.
 */

export type LinhaRateio = {
  id: string
  centroCustoId: string | null
  centroCustoNome: string | null
  departamentoNome: string | null
  descricao: string | null
  valor: number
}

export async function rateioDaOrdem(ordemId: string): Promise<LinhaRateio[]> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("ordens_pagamento_rateio")
    .select("id, centro_custo_despesa_id, departamento_id, descricao, valor, ordem")
    .eq("ordem_id", ordemId)
    .order("ordem", { ascending: true })
  if (error) {
    if (esquemaAusente(error)) return []
    throw new Error(`Falha ao ler o rateio: ${error.message}`)
  }
  const linhas = (data ?? []) as Record<string, unknown>[]
  if (linhas.length === 0) return []

  const centroIds = [
    ...new Set(linhas.map((l) => texto(l.centro_custo_despesa_id)).filter((v): v is string => Boolean(v))),
  ]
  const deptoIds = [
    ...new Set(linhas.map((l) => texto(l.departamento_id)).filter((v): v is string => Boolean(v))),
  ]
  const [centros, deptos] = await Promise.all([
    centroIds.length
      ? admin.from("centros_de_custo").select("id, nome_da_conta, classificador").in("id", centroIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    deptoIds.length
      ? admin.from("empresa_departamentos").select("id, departamento").in("id", deptoIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ])
  const nomeCentro = new Map(
    ((centros.data ?? []) as Record<string, unknown>[]).map((c) => [
      String(c.id),
      `${c.classificador ? `${c.classificador} · ` : ""}${c.nome_da_conta ?? "(sem nome)"}`,
    ])
  )
  const nomeDepto = new Map(
    ((deptos.data ?? []) as Record<string, unknown>[]).map((d) => [
      String(d.id),
      String(d.departamento ?? "(sem nome)"),
    ])
  )

  return linhas.map((l) => ({
    id: String(l.id),
    centroCustoId: texto(l.centro_custo_despesa_id),
    centroCustoNome: l.centro_custo_despesa_id
      ? (nomeCentro.get(String(l.centro_custo_despesa_id)) ?? null)
      : null,
    departamentoNome: l.departamento_id
      ? (nomeDepto.get(String(l.departamento_id)) ?? null)
      : null,
    descricao: texto(l.descricao),
    valor: Number(l.valor ?? 0),
  }))
}
