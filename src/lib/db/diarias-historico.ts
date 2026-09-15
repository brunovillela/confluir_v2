import "server-only"
import { esquemaAusente, nomesDosUsuarios, texto } from "@/lib/db/comum"
import { urlArquivoPessoal } from "@/lib/db/pessoal"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Histórico das diárias do Bubble (supabase/historicos-oficios-diarias.sql +
 * scripts/migrar-historicos-bubble.mjs). Lá a diária era LANÇADA dia a dia e
 * os lançamentos se agrupavam numa REMESSA do beneficiário — enviada, avaliada
 * e paga por ordem de pagamento. Aqui é só leitura: o módulo novo é por
 * solicitação (lib/db/diarias.ts). Degrada com `disponivel: false` até o SQL.
 */

export type RemessaDiaria = {
  id: string
  codigo: string | null
  beneficiarioId: string | null
  beneficiarioNome: string | null
  departamentoNome: string | null
  inicio: string | null
  termino: string | null
  ano: number | null
  mes: string | null
  valorTotal: number | null
  enviado: boolean
  avaliacaoAprovado: boolean | null
  avaliacaoData: string | null
  avaliacaoObservacao: string | null
  avaliadorNome: string | null
  formaPagamento: string | null
  ordemId: string | null
  ordemCodigo: string | null
  ordemSituacao: string | null
  pagamentoPago: boolean
}

export type LancamentoDiaria = {
  id: string
  data: string | null
  tipoNome: string | null
  atividade: string | null
  local: string | null
  valorDiaria: number | null
  valorDespesas: number | null
  valorTotal: number | null
  despesas: {
    id: string
    tipo: string | null
    custo: number | null
    comprovanteUrl: string | null
  }[]
}

const num = (v: unknown): number | null =>
  v === null || v === undefined || v === "" ? null : Number(v)

async function normalizarRemessas(
  brutas: Record<string, unknown>[]
): Promise<RemessaDiaria[]> {
  const admin = await createAdminClient()
  const ids = (campo: string) => [
    ...new Set(brutas.map((r) => texto(r[campo])).filter((v): v is string => Boolean(v))),
  ]
  const deptoIds = ids("departamento_id")
  const ordemIds = ids("ordem_pagamento_id")
  const [nomes, deptos, ordens] = await Promise.all([
    nomesDosUsuarios([...ids("beneficiario_id"), ...ids("avaliador_id")]),
    deptoIds.length
      ? admin.from("empresa_departamentos").select("id, departamento").in("id", deptoIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    ordemIds.length
      ? admin.from("ordens_pagamento").select("id, codigo, situacao").in("id", ordemIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ])
  const nomeDepto = new Map(
    ((deptos.data ?? []) as Record<string, unknown>[]).map((d) => [String(d.id), texto(d.departamento)])
  )
  const ordem = new Map(
    ((ordens.data ?? []) as Record<string, unknown>[]).map((o) => [
      String(o.id),
      { codigo: texto(o.codigo), situacao: texto(o.situacao) },
    ])
  )
  const nome = (v: unknown) => (texto(v) ? (nomes.get(String(v)) ?? null) : null)

  return brutas.map((r) => {
    const ordemId = texto(r.ordem_pagamento_id)
    return {
      id: String(r.id),
      codigo: texto(r.codigo),
      beneficiarioId: texto(r.beneficiario_id),
      beneficiarioNome: nome(r.beneficiario_id),
      departamentoNome: texto(r.departamento_id) ? (nomeDepto.get(String(r.departamento_id)) ?? null) : null,
      inicio: texto(r.inicio),
      termino: texto(r.termino),
      ano: num(r.ano),
      mes: texto(r.mes),
      valorTotal: num(r.valor_total),
      enviado: r.enviado === true,
      avaliacaoAprovado: typeof r.avaliacao_aprovado === "boolean" ? r.avaliacao_aprovado : null,
      avaliacaoData: texto(r.avaliacao_data),
      avaliacaoObservacao: texto(r.avaliacao_observacao),
      avaliadorNome: nome(r.avaliador_id),
      formaPagamento: texto(r.forma_pagamento),
      ordemId,
      ordemCodigo: ordemId ? (ordem.get(ordemId)?.codigo ?? null) : null,
      ordemSituacao: ordemId ? (ordem.get(ordemId)?.situacao ?? null) : null,
      pagamentoPago: r.pagamento_pago === true,
    }
  })
}

/** Remessas do histórico, mais recentes primeiro (todas, ou só de um beneficiário). */
export async function listarRemessasDiaria(filtro: {
  beneficiarioId?: string
  ano?: number
} = {}): Promise<{ disponivel: boolean; remessas: RemessaDiaria[]; anos: number[] }> {
  const admin = await createAdminClient()
  let query = admin.from("pessoal_diarias_remessas").select("*")
  if (filtro.beneficiarioId) query = query.eq("beneficiario_id", filtro.beneficiarioId)
  const { data, error } = await query
    .order("inicio", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .range(0, 4999)
  if (error) {
    if (esquemaAusente(error)) return { disponivel: false, remessas: [], anos: [] }
    throw new Error(`Falha ao listar o histórico de diárias: ${error.message}`)
  }
  const brutas = (data ?? []) as Record<string, unknown>[]
  const anoDe = (r: Record<string, unknown>) =>
    num(r.ano) ?? (texto(r.inicio) ? Number(String(r.inicio).slice(0, 4)) : null)
  const anos = [...new Set(brutas.map(anoDe).filter((a): a is number => a !== null))].sort((a, b) => b - a)
  const doAno = filtro.ano ? brutas.filter((r) => anoDe(r) === filtro.ano) : brutas
  return { disponivel: true, remessas: await normalizarRemessas(doAno), anos }
}

/** Quantas remessas antigas a pessoa tem — decide se o atalho aparece no perfil. */
export async function contarRemessasDiaria(beneficiarioId: string): Promise<number> {
  const admin = await createAdminClient()
  const { count, error } = await admin
    .from("pessoal_diarias_remessas")
    .select("id", { count: "exact", head: true })
    .eq("beneficiario_id", beneficiarioId)
  return error ? 0 : (count ?? 0)
}

/** Remessa com os lançamentos e as despesas (comprovantes com URL assinada). */
export async function obterRemessaDiaria(
  id: string,
  opcoes: { beneficiarioId?: string } = {}
): Promise<{ remessa: RemessaDiaria; lancamentos: LancamentoDiaria[] } | null> {
  const admin = await createAdminClient()
  let query = admin.from("pessoal_diarias_remessas").select("*").eq("id", id)
  if (opcoes.beneficiarioId) query = query.eq("beneficiario_id", opcoes.beneficiarioId)
  const { data, error } = await query.maybeSingle()
  if (error) {
    if (esquemaAusente(error)) return null
    throw new Error(`Falha ao abrir a remessa: ${error.message}`)
  }
  if (!data) return null

  const [[remessa], lancamentos] = await Promise.all([
    normalizarRemessas([data as Record<string, unknown>]),
    lancamentosDasRemessas([id]),
  ])
  return { remessa, lancamentos: lancamentos.get(id) ?? [] }
}

/** Lançamentos (com despesas) agrupados por remessa. */
export async function lancamentosDasRemessas(
  remessaIds: string[]
): Promise<Map<string, LancamentoDiaria[]>> {
  const porRemessa = new Map<string, LancamentoDiaria[]>()
  if (remessaIds.length === 0) return porRemessa
  const admin = await createAdminClient()
  const { data: lancs } = await admin
    .from("pessoal_diarias_lancamentos")
    .select("id, remessa_id, tipo_id, data, atividade, local, valor_diaria, valor_despesas, valor_total")
    .in("remessa_id", remessaIds)
    .order("data", { ascending: true, nullsFirst: false })
    .range(0, 4999)
  const linhas = (lancs ?? []) as Record<string, unknown>[]
  if (linhas.length === 0) return porRemessa

  const tipoIds = [...new Set(linhas.map((l) => texto(l.tipo_id)).filter((v): v is string => Boolean(v)))]
  const [tipos, despesas] = await Promise.all([
    tipoIds.length
      ? admin.from("financeiro_diarias").select("*").in("id", tipoIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    admin
      .from("pessoal_diarias_despesas")
      .select("id, lancamento_id, tipo_despesa, custo, comprovante")
      .in("lancamento_id", linhas.map((l) => String(l.id))),
  ])
  const nomeTipo = new Map(
    ((tipos.data ?? []) as Record<string, unknown>[]).map((t) => [
      String(t.id),
      String(t.nome ?? t.diaria ?? "(sem nome)"),
    ])
  )
  const despesasPorLanc = new Map<string, LancamentoDiaria["despesas"]>()
  for (const d of (despesas.data ?? []) as Record<string, unknown>[]) {
    const lista = despesasPorLanc.get(String(d.lancamento_id)) ?? []
    lista.push({
      id: String(d.id),
      tipo: texto(d.tipo_despesa),
      custo: num(d.custo),
      comprovanteUrl: await urlArquivoPessoal(texto(d.comprovante)),
    })
    despesasPorLanc.set(String(d.lancamento_id), lista)
  }

  for (const l of linhas) {
    const remessaId = String(l.remessa_id)
    const lista = porRemessa.get(remessaId) ?? []
    lista.push({
      id: String(l.id),
      data: texto(l.data),
      tipoNome: texto(l.tipo_id) ? (nomeTipo.get(String(l.tipo_id)) ?? null) : null,
      atividade: texto(l.atividade),
      local: texto(l.local),
      valorDiaria: num(l.valor_diaria),
      valorDespesas: num(l.valor_despesas),
      valorTotal: num(l.valor_total),
      despesas: despesasPorLanc.get(String(l.id)) ?? [],
    })
    porRemessa.set(remessaId, lista)
  }
  return porRemessa
}
