import "server-only"

import { serieArrecadacao } from "@/lib/db/analitica"
import { lerEmLotes, texto } from "@/lib/db/comum"
import { favorecidosDasOrdens } from "@/lib/db/ordens-favorecido"
import type { OrdemFavorecido } from "@/lib/favorecido"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * EXPORTAÇÃO CONTÁBIL (onda 4, I4): os lançamentos de um período para a
 * contabilidade — despesas (ordens PAGAS, pela data do pagamento, com centro
 * de custo, departamento, favorecido e CNPJ/CPF) e receitas (arrecadação por
 * mês, tipo e fonte pagadora, da camada analítica). Vai em XLSX com duas
 * abas; a contabilidade importa ou confere. Ordem com rateio sai numa linha
 * por conta (o valor pago dividido na proporção do rateio).
 */

export type LancamentoDespesa = {
  id: string
  dataPagamento: string | null
  vencimento: string | null
  codigo: string | null
  tipo: string | null
  descricao: string | null
  favorecido: string | null
  documento: string | null
  centroCusto: string | null
  classificador: string | null
  departamento: string | null
  formaPagamento: string | null
  valorPago: number
  valorCobrado: number | null
  notaFiscal: boolean
}

export type LancamentoReceita = { mes: string; tipo: string; fonte: string | null; valor: number; lancamentos: number; pagantes: number }

export type Lancamentos = {
  de: string
  ate: string
  despesas: LancamentoDespesa[]
  receitas: LancamentoReceita[]
  totalDespesas: number
  totalReceitas: number
  receitasDisponiveis: boolean
}

function mesesEntre(de: string, ate: string): number {
  const [a1, m1] = de.split("-").map(Number)
  const [a2, m2] = ate.split("-").map(Number)
  return (a2 - a1) * 12 + (m2 - m1) + 1
}

export async function lancamentosContabeis(de: string, ate: string): Promise<Lancamentos> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()

  const brutas = await lerEmLotes<Record<string, unknown>>((ini, fim) =>
    admin
      .from("ordens_pagamento")
      .select(
        "id, codigo, descricao, tipo, forma_pagamento, valor_inicial_cobranca, valor_pago, vencimento, data_pagamento, fornecedor_id, beneficiario_fornecedor_id, beneficiario_usuario_id, beneficiario_nome_avulso, beneficiario_doc_avulso, custeio_id, centro_custo_despesa_id, departamento_id, nota_fiscal"
      )
      .eq("emp_proprietaria_id", emp)
      .eq("situacao", "Paga")
      .not("excluido", "is", true)
      .gte("data_pagamento", de)
      .lte("data_pagamento", ate)
      .order("data_pagamento", { ascending: true })
      .order("id", { ascending: true })
      .range(ini, fim)
  ).catch(async () => {
    // Sem a coluna nota_fiscal/departamento (SQLs antigos não rodados): tenta sem elas.
    return lerEmLotes<Record<string, unknown>>((ini, fim) =>
      admin
        .from("ordens_pagamento")
        .select(
          "id, codigo, descricao, tipo, forma_pagamento, valor_inicial_cobranca, valor_pago, vencimento, data_pagamento, fornecedor_id, beneficiario_fornecedor_id, beneficiario_usuario_id, beneficiario_nome_avulso, beneficiario_doc_avulso, custeio_id, centro_custo_despesa_id"
        )
        .eq("emp_proprietaria_id", emp)
        .eq("situacao", "Paga")
        .not("excluido", "is", true)
        .gte("data_pagamento", de)
        .lte("data_pagamento", ate)
        .order("data_pagamento", { ascending: true })
        .order("id", { ascending: true })
        .range(ini, fim)
    )
  })

  const ids = (campo: string) => [...new Set(brutas.map((o) => texto(o[campo])).filter((v): v is string => !!v))]
  const lote = async <T,>(tabela: string, colunas: string, lista: string[], chave = "id"): Promise<T[]> => {
    const saida: T[] = []
    for (let i = 0; i < lista.length; i += 200) {
      const { data } = await admin.from(tabela).select(colunas).in(chave, lista.slice(i, i + 200))
      saida.push(...((data ?? []) as T[]))
    }
    return saida
  }
  type LinhaRateio = { ordem_id: string; centro_custo_despesa_id: string | null; departamento_id: string | null; descricao: string | null; valor: number; ordem: number }
  const rateios = await lote<LinhaRateio>(
    "ordens_pagamento_rateio",
    "ordem_id, centro_custo_despesa_id, departamento_id, descricao, valor, ordem",
    brutas.map((o) => String(o.id)),
    "ordem_id"
  )
  const rateioPorOrdem = new Map<string, LinhaRateio[]>()
  for (const r of rateios) rateioPorOrdem.set(r.ordem_id, [...(rateioPorOrdem.get(r.ordem_id) ?? []), r])
  for (const linhas of rateioPorOrdem.values()) linhas.sort((a, b) => a.ordem - b.ordem)
  const centroIds = [...new Set([...ids("centro_custo_despesa_id"), ...rateios.map((r) => r.centro_custo_despesa_id).filter((v): v is string => !!v)])]
  const deptoIds = [...new Set([...ids("departamento_id"), ...rateios.map((r) => r.departamento_id).filter((v): v is string => !!v)])]
  // Quem recebe (nome e CPF/CNPJ): regra única, inclui o filiado do reembolso.
  const [favorecidos, centros, departamentos] = await Promise.all([
    favorecidosDasOrdens(brutas as OrdemFavorecido[]),
    lote<{ id: string; nome_da_conta: string | null; classificador: string | null }>("centros_de_custo", "id, nome_da_conta, classificador", centroIds),
    lote<{ id: string; departamento: string | null }>("empresa_departamentos", "id, departamento", deptoIds),
  ])
  const centroPorId = new Map(centros.map((c) => [c.id, c]))
  const deptoPorId = new Map(departamentos.map((d) => [d.id, d]))

  const despesas: LancamentoDespesa[] = brutas.flatMap((o) => {
    const favorecido = favorecidos.get(String(o.id))
    const centro = centroPorId.get(texto(o.centro_custo_despesa_id) ?? "")
    const base = {
      id: String(o.id),
      dataPagamento: texto(o.data_pagamento),
      vencimento: texto(o.vencimento),
      codigo: texto(o.codigo),
      tipo: texto(o.tipo),
      descricao: texto(o.descricao),
      favorecido: favorecido?.nome ?? null,
      documento: favorecido?.documento ?? null,
      centroCusto: texto(centro?.nome_da_conta),
      classificador: texto(centro?.classificador),
      departamento: texto(deptoPorId.get(texto(o.departamento_id) ?? "")?.departamento),
      formaPagamento: texto(o.forma_pagamento),
      valorPago: Number(o.valor_pago ?? o.valor_inicial_cobranca ?? 0),
      valorCobrado: o.valor_inicial_cobranca === null || o.valor_inicial_cobranca === undefined ? null : Number(o.valor_inicial_cobranca),
      notaFiscal: Boolean(texto(o.nota_fiscal)),
    }
    const rateio = rateioPorOrdem.get(String(o.id)) ?? []
    if (rateio.length < 2) return [base]
    // Uma linha por conta; o valor pago (que pode ter juros/desconto) segue a
    // proporção do rateio, e a última linha absorve o arredondamento.
    const totalRateio = rateio.reduce((s, r) => s + Number(r.valor), 0) || 1
    let distribuido = 0
    return rateio.map((r, i) => {
      const c = centroPorId.get(r.centro_custo_despesa_id ?? "")
      const pago =
        i === rateio.length - 1
          ? Math.round((base.valorPago - distribuido) * 100) / 100
          : Math.round(((base.valorPago * Number(r.valor)) / totalRateio) * 100) / 100
      distribuido += pago
      return {
        ...base,
        id: `${base.id}:${i + 1}`,
        descricao: [base.descricao, `rateio ${i + 1}/${rateio.length}${r.descricao ? ` — ${r.descricao}` : ""}`].filter(Boolean).join(" · "),
        centroCusto: texto(c?.nome_da_conta),
        classificador: texto(c?.classificador),
        departamento: texto(deptoPorId.get(r.departamento_id ?? "")?.departamento),
        valorPago: pago,
        valorCobrado: Number(r.valor),
      }
    })
  })

  // Receitas: a arrecadação mensal (fato_arrecadacao_mensal) recortada no período.
  const meses = Math.min(60, Math.max(1, mesesEntre(de.slice(0, 7), ate.slice(0, 7)) + 1))
  const arrecadacao = await serieArrecadacao(meses).catch(() => ({ disponivel: false, linhas: [] }))
  const fontesIds = [...new Set(arrecadacao.linhas.map((l) => l.fonteId).filter((v): v is string => !!v))]
  const fontes = await lote<{ id: string; nome_fantasia: string | null; nome_razao: string | null }>("empresa", "id, nome_fantasia, nome_razao", fontesIds)
  const fontePorId = new Map(fontes.map((f) => [f.id, texto(f.nome_fantasia) ?? texto(f.nome_razao) ?? null]))
  const receitas: LancamentoReceita[] = arrecadacao.linhas
    .filter((l) => l.mes.slice(0, 7) >= de.slice(0, 7) && l.mes.slice(0, 7) <= ate.slice(0, 7))
    .map((l) => ({ mes: l.mes.slice(0, 7), tipo: l.tipo, fonte: l.fonteId ? (fontePorId.get(l.fonteId) ?? null) : null, valor: l.valor, lancamentos: l.lancamentos, pagantes: l.pagantes }))
    .sort((a, b) => a.mes.localeCompare(b.mes) || a.tipo.localeCompare(b.tipo) || (a.fonte ?? "").localeCompare(b.fonte ?? ""))

  return {
    de,
    ate,
    despesas,
    receitas,
    totalDespesas: despesas.reduce((s, d) => s + d.valorPago, 0),
    totalReceitas: receitas.reduce((s, r) => s + r.valor, 0),
    receitasDisponiveis: arrecadacao.disponivel,
  }
}
