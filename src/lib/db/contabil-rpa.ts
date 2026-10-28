import "server-only"

import { lerEmLotes, texto } from "@/lib/db/comum"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * RELATÓRIO MENSAL DOS RPAs PARA A CONTABILIDADE (28/10/2026) — aba "RPAs"
 * da Exportação contábil. A aba Despesas traz a ordem do RPA pelo LÍQUIDO
 * pago; a contabilidade precisa do resto para lançar a despesa e as
 * obrigações: o bruto, cada retenção (INSS, IRRF, ISS — a recolher), o INSS
 * patronal (20% sobre o bruto, encargo da entidade) e o custo total. Mesmo
 * recorte da exportação: RPAs cuja ordem foi PAGA no período, pela data do
 * pagamento — que é também a competência das guias em Tributos.
 */

export type LinhaRpaContabil = {
  rpaId: string
  numero: number | null
  dataPagamento: string
  competencia: string
  prestador: string | null
  cpf: string | null
  servico: string | null
  origem: string
  ordemCodigo: string | null
  centroCusto: string | null
  classificador: string | null
  departamento: string | null
  bruto: number
  inss: number
  irrf: number
  iss: number
  liquido: number
  valorPago: number
  inssPatronal: number
  custoTotal: number
  assinado: boolean
}

export type TotaisRpa = {
  quantidade: number
  bruto: number
  inss: number
  irrf: number
  iss: number
  liquido: number
  inssPatronal: number
  custoTotal: number
}

const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v) || 0)
const arred = (v: number) => Math.round(v * 100) / 100

export function totalizarRpas(linhas: LinhaRpaContabil[]): TotaisRpa {
  const soma = (k: keyof LinhaRpaContabil) => arred(linhas.reduce((s, l) => s + num(l[k]), 0))
  return {
    quantidade: linhas.length,
    bruto: soma("bruto"),
    inss: soma("inss"),
    irrf: soma("irrf"),
    iss: soma("iss"),
    liquido: soma("liquido"),
    inssPatronal: soma("inssPatronal"),
    custoTotal: soma("custoTotal"),
  }
}

export async function rpasPagosNoPeriodo(de: string, ate: string): Promise<LinhaRpaContabil[]> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const brutas = await lerEmLotes<Record<string, unknown>>((ini, fim) =>
    admin
      .from("compras_rpa")
      .select(
        "id, numero, descricao_servico, valor_bruto, inss, irrf, iss, valor_liquido, arquivo_assinado, " +
          "fornecedor:fornecedor_id (nome_fantasia, nome_razao, cnpj_cpf), " +
          "contrato:contrato_id (codigo), compra:processo_compra_id (codigo), " +
          "ordem:ordem_pagamento_id!inner (codigo, situacao, data_pagamento, valor_pago, centro_custo_despesa_id, departamento_id)"
      )
      .eq("emp_proprietaria_id", emp)
      .eq("ordem.situacao", "Paga")
      .gte("ordem.data_pagamento", de)
      .lte("ordem.data_pagamento", ate)
      .order("numero", { ascending: true })
      .order("id", { ascending: true })
      .range(ini, fim)
  ).catch((e) => {
    console.error("RPAs do período:", e)
    return [] as Record<string, unknown>[]
  })
  if (!brutas.length) return []

  type Ordem = { codigo?: string | null; data_pagamento?: string | null; valor_pago?: number | null; centro_custo_despesa_id?: string | null; departamento_id?: string | null }
  const ordem = (r: Record<string, unknown>) => (r.ordem ?? {}) as Ordem
  const centroIds = [...new Set(brutas.map((r) => texto(ordem(r).centro_custo_despesa_id)).filter((v): v is string => !!v))]
  const deptoIds = [...new Set(brutas.map((r) => texto(ordem(r).departamento_id)).filter((v): v is string => !!v))]
  const rpaIds = brutas.map((r) => String(r.id))

  const [centros, deptos, patronais, cfg] = await Promise.all([
    centroIds.length
      ? admin.from("centros_de_custo").select("id, nome_da_conta, classificador").in("id", centroIds)
      : Promise.resolve({ data: [] }),
    deptoIds.length
      ? admin.from("empresa_departamentos").select("id, departamento").in("id", deptoIds)
      : Promise.resolve({ data: [] }),
    // A cota patronal registrada em Tributos (a do pagamento); sem ela, a da configuração.
    admin.from("financeiro_tributos_retencoes").select("rpa_id, valor").eq("tipo", "inss_patronal").in("rpa_id", rpaIds),
    admin.from("compras_rpa_config").select("inss_patronal_aliquota").eq("emp_proprietaria_id", emp).maybeSingle(),
  ])
  const centroDe = new Map(((centros.data ?? []) as Record<string, unknown>[]).map((c) => [String(c.id), c]))
  const deptoDe = new Map(((deptos.data ?? []) as Record<string, unknown>[]).map((d) => [String(d.id), texto(d.departamento)]))
  const patronalDe = new Map(((patronais.data ?? []) as Record<string, unknown>[]).map((p) => [String(p.rpa_id), num(p.valor)]))
  const aliquotaPatronal = cfg.error ? 20 : num(cfg.data?.inss_patronal_aliquota ?? 20)

  return brutas.map((r) => {
    const o = ordem(r)
    const f = (r.fornecedor ?? null) as { nome_fantasia?: string | null; nome_razao?: string | null; cnpj_cpf?: string | null } | null
    const contrato = texto((r.contrato as { codigo?: string | null } | null)?.codigo)
    const compra = texto((r.compra as { codigo?: string | null } | null)?.codigo)
    const centro = centroDe.get(texto(o.centro_custo_despesa_id) ?? "")
    const bruto = num(r.valor_bruto)
    const patronal = patronalDe.get(String(r.id)) ?? arred((bruto * aliquotaPatronal) / 100)
    const pago = String(o.data_pagamento).slice(0, 10)
    return {
      rpaId: String(r.id),
      numero: r.numero == null ? null : Number(r.numero),
      dataPagamento: pago,
      competencia: pago.slice(0, 7),
      prestador: texto(f?.nome_razao) ?? texto(f?.nome_fantasia),
      cpf: texto(f?.cnpj_cpf),
      servico: texto(r.descricao_servico),
      origem: contrato ? `Contrato ${contrato}` : compra ? `Compra ${compra}` : "Avulso",
      ordemCodigo: texto(o.codigo),
      centroCusto: texto(centro?.nome_da_conta),
      classificador: texto(centro?.classificador),
      departamento: deptoDe.get(texto(o.departamento_id) ?? "") ?? null,
      bruto,
      inss: num(r.inss),
      irrf: num(r.irrf),
      iss: num(r.iss),
      liquido: num(r.valor_liquido),
      valorPago: num(o.valor_pago ?? r.valor_liquido),
      inssPatronal: patronal,
      custoTotal: arred(bruto + patronal),
      assinado: Boolean(texto(r.arquivo_assinado)),
    }
  })
}
