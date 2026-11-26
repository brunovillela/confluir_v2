import "server-only"

import { hojeSP } from "@/lib/db/comum"
import { ordensParecidas } from "@/lib/db/ordens-duplicidade"
import { favorecidosDasOrdens } from "@/lib/db/ordens-favorecido"
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

/** Uma ponta do par de possível duplicidade. */
export type OrdemDoPar = {
  id: string
  codigo: string | null
  descricao: string | null
  situacao: string | null
  vencimento: string | null
  dataPagamento: string | null
  valor: number | null
}

/** "A ordem X parece a mesma cobrança da ordem Y" — o par, não as ordens soltas. */
export type ParDuplicidade = {
  favorecido: string | null
  /** A ordem a pagar (A pagar ou Processando). */
  a: OrdemDoPar
  /** A outra: também a pagar ou já paga/em outra situação. */
  b: OrdemDoPar
}

/**
 * Os pares por trás de "possíveis duplicadas a pagar" (26/11/2026): a lista
 * mostrava as ordens soltas, sem dizer qual repetia qual. Cada par aparece uma
 * vez; a ponta "a" é sempre uma ordem a pagar.
 */
export async function paresDuplicadasAPagar(): Promise<ParDuplicidade[]> {
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
  ).catch(() => new Map<string, { id: string }[]>())

  const pares = new Map<string, [string, string]>()
  for (const [id, outras] of parecidas) {
    for (const o of outras) {
      const k = [id, o.id].sort().join("|")
      if (!pares.has(k)) pares.set(k, [id, o.id])
    }
  }
  if (pares.size === 0) return []

  const ids = [...new Set([...pares.values()].flat())]
  const { data: det } = await admin
    .from("ordens_pagamento")
    .select("id, codigo, descricao, situacao, vencimento, data_pagamento, valor_inicial_cobranca, beneficiario_fornecedor_id, fornecedor_id, beneficiario_usuario_id, beneficiario_nome_avulso, beneficiario_doc_avulso, custeio_id")
    .in("id", ids)
  const porId = new Map(((det ?? []) as Record<string, unknown>[]).map((o) => [String(o.id), o]))
  const favorecidos = await favorecidosDasOrdens([...porId.values()].map((o) => ({ ...o, id: o.id })))
  const ponta = (o: Record<string, unknown>): OrdemDoPar => ({
    id: String(o.id),
    codigo: (o.codigo as string | null) ?? null,
    descricao: (o.descricao as string | null) ?? null,
    situacao: (o.situacao as string | null) ?? null,
    vencimento: (o.vencimento as string | null) ?? null,
    dataPagamento: (o.data_pagamento as string | null) ?? null,
    valor: o.valor_inicial_cobranca === null || o.valor_inicial_cobranca === undefined ? null : Number(o.valor_inicial_cobranca),
  })
  const saida: ParDuplicidade[] = []
  for (const [x, y] of pares.values()) {
    const ox = porId.get(x)
    const oy = porId.get(y)
    if (!ox || !oy) continue
    // A ponta "a" é a pagar; se as duas são, a de vencimento mais cedo.
    const xPaga = ABERTAS_PAGAVEIS.includes(String(ox.situacao))
    const yPaga = ABERTAS_PAGAVEIS.includes(String(oy.situacao))
    const trocar = (!xPaga && yPaga) || (xPaga && yPaga && String(oy.vencimento ?? "") < String(ox.vencimento ?? ""))
    const [a, b] = trocar ? [oy, ox] : [ox, oy]
    saida.push({ favorecido: favorecidos.get(String(a.id))?.nome ?? null, a: ponta(a), b: ponta(b) })
  }
  return saida.sort((p, q) => String(p.a.vencimento ?? "").localeCompare(String(q.a.vencimento ?? "")))
}
