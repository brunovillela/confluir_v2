import "server-only"

import {
  EM_ANDAMENTO_FILIACAO,
  EM_ANDAMENTO_DESFILIACAO,
  type FiliacaoCondicao,
} from "@/lib/filiacao"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

export type FiliadoNaEtapa = {
  id: string
  nome_completo: string | null
  cpf: string | null
  matricula_sindical: string | null
  /** Desde quando está nesta condição (tempo parado na etapa). */
  condicao_desde: string | null
}

export type EtapaAcompanhamento = {
  condicao: FiliacaoCondicao
  total: number
  filiados: FiliadoNaEtapa[]
}

export type Acompanhamento = {
  filiacao: EtapaAcompanhamento[]
  desfiliacao: EtapaAcompanhamento[]
}

const SELECT_FILIADO =
  "id, nome_completo, cpf, matricula_sindical, condicao_desde"

/** Uma etapa: total na condição + os primeiros N (mais antigos primeiro). */
async function carregarEtapa(
  condicao: FiliacaoCondicao,
  limite: number
): Promise<EtapaAcompanhamento> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()

  const { data, count } = await admin
    .from("filiacoes")
    .select(SELECT_FILIADO, { count: "exact" })
    .eq("emp_proprietaria_id", emp)
    .eq("filiacao_condicao", condicao)
    // Mais tempo parado primeiro; sem carimbo (legado) vai ao fim.
    .order("condicao_desde", { ascending: true, nullsFirst: false })
    .limit(limite)

  return {
    condicao,
    total: count ?? 0,
    filiados: (data ?? []) as FiliadoNaEtapa[],
  }
}

/**
 * Monta o acompanhamento: para cada condição em andamento (3 de filiação, 2 de
 * desfiliação), o total e uma amostra dos filiados parados ali.
 */
export async function carregarAcompanhamento(
  limitePorEtapa = 8
): Promise<Acompanhamento> {
  const [filiacao, desfiliacao] = await Promise.all([
    Promise.all(
      EM_ANDAMENTO_FILIACAO.map((c) => carregarEtapa(c, limitePorEtapa))
    ),
    Promise.all(
      EM_ANDAMENTO_DESFILIACAO.map((c) => carregarEtapa(c, limitePorEtapa))
    ),
  ])
  return { filiacao, desfiliacao }
}
