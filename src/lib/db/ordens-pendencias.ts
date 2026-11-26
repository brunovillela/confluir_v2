import "server-only"

import { hojeSP } from "@/lib/db/comum"
import { ordensParecidas } from "@/lib/db/ordens-duplicidade"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * PENDÊNCIAS QUE NÃO CABEM NUM FILTRO SIMPLES (09/11/2026). "O que fazer hoje"
 * e o fechamento do mês contam essas ordens; a lista de ordens filtra por elas.
 * A conta e a lista usam a mesma função, para o número clicado ser o número de
 * linhas que aparece.
 */

export const ABERTAS_PAGAVEIS = ["A pagar", "Processando"]

function somarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

/** A pagar ou Processando que parecem a mesma cobrança de outra ordem. */
export async function idsDuplicadasAPagar(): Promise<string[]> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data } = await admin
    .from("ordens_pagamento")
    .select("id, valor_inicial_cobranca, vencimento, beneficiario_fornecedor_id, fornecedor_id, beneficiario_usuario_id")
    .eq("emp_proprietaria_id", emp)
    .not("excluido", "is", true)
    .in("situacao", ABERTAS_PAGAVEIS)
    .limit(1000)
  const parecidas = await ordensParecidas(
    (data ?? []).map((o) => ({
      id: String(o.id),
      valor_inicial_cobranca: o.valor_inicial_cobranca as number | null,
      vencimento: o.vencimento as string | null,
      beneficiario_fornecedor_id: o.beneficiario_fornecedor_id as string | null,
      fornecedor_id: o.fornecedor_id as string | null,
      beneficiario_usuario_id: o.beneficiario_usuario_id as string | null,
    }))
  ).catch(() => new Map())
  return [...parecidas.keys()]
}

/*
 * PROCESSANDO É AGENDADO (26/11/2026). "Processando há 5 dias" acusava como
 * parado o boleto agendado no banco: as 69 ordens em Processando tinham
 * vencimento futuro. Processando só pede ação depois do vencimento (o débito
 * saiu e o pagamento não foi registrado) — a fila "processando_parado" conta
 * isso pela própria data (ver filasDoFinanceiro e a lista de ordens).
 */

export const DIAS_AGUARDANDO_PARADO = 15

/**
 * "Aguardando informações" há DIAS_AGUARDANDO_PARADO dias ou mais (17/11/2026:
 * a medição achou 15 paradas, metade há mais de 43 dias, a mais antiga de
 * junho). Conta da última devolução na trilha; sem ela (ordens do Bubble), da
 * data da avaliação ou da criação.
 */
export async function idsAguardandoParado(): Promise<string[]> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data } = await admin
    .from("ordens_pagamento")
    .select("id, autorizacao_data, created_at")
    .eq("emp_proprietaria_id", emp)
    .not("excluido", "is", true)
    .eq("situacao", "Aguardando informações")
    .limit(1000)
  const linhas = data ?? []
  const limite = somarDias(hojeSP(), -DIAS_AGUARDANDO_PARADO)
  const ultima = new Map<string, string>()
  const ids = linhas.map((o) => String(o.id))
  for (let i = 0; i < ids.length; i += 200) {
    const { data: evs } = await admin
      .from("ordens_pagamento_eventos")
      .select("ordem_id, created_at")
      .in("ordem_id", ids.slice(i, i + 200))
      .eq("tipo", "devolvida")
      .order("created_at", { ascending: false })
    for (const e of evs ?? []) if (!ultima.has(String(e.ordem_id))) ultima.set(String(e.ordem_id), String(e.created_at).slice(0, 10))
  }
  return linhas
    .filter((o) => {
      const desde = ultima.get(String(o.id)) ?? (o.autorizacao_data ? String(o.autorizacao_data).slice(0, 10) : String(o.created_at).slice(0, 10))
      return desde <= limite
    })
    .map((o) => String(o.id))
}

/**
 * Pagas sem centro de custo que têm rateio — e por isso não são pendência: a
 * lista "sem centro" as tira com um NOT IN (são poucas).
 */
export async function idsSemCentroComRateio(): Promise<string[]> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data } = await admin
    .from("ordens_pagamento_rateio")
    .select("ordem_id, ordens_pagamento!inner(emp_proprietaria_id, centro_custo_despesa_id)")
    .eq("ordens_pagamento.emp_proprietaria_id", emp)
    .is("ordens_pagamento.centro_custo_despesa_id", null)
    .limit(5000)
  return [...new Set((data ?? []).map((r) => String(r.ordem_id)))]
}
