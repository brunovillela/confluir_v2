import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import { texto } from "@/lib/db/comum"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * RETENÇÕES DO RPA → GUIAS DE TRIBUTOS (28/10/2026, migração
 * 20261028231154_tributos_retencoes_rpa). Decisões do usuário:
 *
 * - competência = mês do PAGAMENTO da ordem do RPA;
 * - além do INSS retido (11%), entra o INSS PATRONAL (20% sobre o bruto);
 * - o sistema cria os tributos que recebem as retenções (um por tipo:
 *   INSS, IRRF, ISS — `financeiro_tributos.retencao_rpa`).
 *
 * Quando a ordem do RPA é paga, cada retenção vira uma linha em
 * financeiro_tributos_retencoes, e a guia PREVISTA do tributo naquela
 * competência passa a esperar a soma (criada se não existir). Pagamento
 * removido, estornado ou ordem cancelada tiram as linhas e refazem a soma.
 * A guia já lançada não muda: a diferença aparece na conferência da área.
 */

export type RetencaoRpa = "inss" | "irrf" | "iss"
export type TipoRetencao = "inss_retido" | "inss_patronal" | "irrf" | "iss"

const SITUACAO_PAGA = "Paga"
/** CNPJ da Receita Federal (o órgão de DARF/DCTFWeb já cadastrado na fase 1 dos tributos). */
const CNPJ_RECEITA = "00394460005887"

/** Os tributos criados pelo sistema, um por retenção. */
const MODELOS: Record<RetencaoRpa, {
  nome: string
  abreviacao: string
  esfera: "federal" | "municipal" | "trabalhista"
  dia: number
  receita: boolean
  observacoes: string
}> = {
  inss: {
    nome: "INSS sobre RPA (11% retido do autônomo + 20% patronal)",
    abreviacao: "INSS RPA",
    esfera: "trabalhista",
    dia: 20,
    receita: true,
    observacoes:
      "Criado pelo sistema: soma o INSS retido dos RPAs pagos no mês e a cota patronal de 20% sobre o bruto. Recolhimento pela DCTFWeb (eSocial S-1200 do contribuinte individual).",
  },
  irrf: {
    nome: "IRRF sobre RPA (DARF 0588)",
    abreviacao: "IRRF RPA",
    esfera: "federal",
    dia: 20,
    receita: true,
    observacoes: "Criado pelo sistema: soma o IRRF retido dos RPAs pagos no mês (código de receita 0588).",
  },
  iss: {
    nome: "ISS retido sobre RPA",
    abreviacao: "ISS RPA",
    esfera: "municipal",
    dia: 10,
    receita: false,
    observacoes:
      "Criado pelo sistema: soma o ISS retido dos RPAs pagos no mês. Confira o dia de vencimento e informe a prefeitura como órgão beneficiário antes de lançar a guia.",
  },
}

const TRIBUTO_DO_TIPO: Record<TipoRetencao, RetencaoRpa> = {
  inss_retido: "inss",
  inss_patronal: "inss",
  irrf: "irrf",
  iss: "iss",
}

type Ambiente = { admin: SupabaseClient; emp: string }

async function ambiente(a?: Ambiente): Promise<Ambiente> {
  return a ?? { admin: await createAdminClient(), emp: await tenantAtual() }
}

const arred = (v: number) => Math.round(v * 100) / 100

function somarMeses(iso: string, delta: number): { ano: number; mes: number } {
  const t = Number(iso.slice(0, 4)) * 12 + (Number(iso.slice(5, 7)) - 1) + delta
  return { ano: Math.floor(t / 12), mes: (t % 12) + 1 }
}
function dataDoDia(ano: number, mes: number, dia: number): string {
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate()
  return `${ano}-${String(mes).padStart(2, "0")}-${String(Math.min(dia, ultimo)).padStart(2, "0")}`
}

/**
 * Garante os tributos que recebem as retenções do RPA (INSS, IRRF, ISS).
 * Devolve o id de cada um. Sem a migração aplicada, devolve vazio.
 */
export async function garantirTributosRpa(a?: Ambiente): Promise<Partial<Record<RetencaoRpa, string>>> {
  const { admin, emp } = await ambiente(a)
  const { data, error } = await admin
    .from("financeiro_tributos")
    .select("id, retencao_rpa")
    .eq("emp_proprietaria_id", emp)
    .not("retencao_rpa", "is", null)
  if (error) return {}
  const ids: Partial<Record<RetencaoRpa, string>> = {}
  for (const t of data ?? []) ids[t.retencao_rpa as RetencaoRpa] = String(t.id)
  const faltam = (Object.keys(MODELOS) as RetencaoRpa[]).filter((r) => !ids[r])
  if (!faltam.length) return ids

  const { data: receita } = await admin
    .from("empresa")
    .select("id, cnpj_cpf")
    .eq("emp_proprietaria_id", emp)
    .not("inativa", "is", true)
    .ilike("cnpj_cpf", "%0394460005887%")
    .limit(5)
  const receitaId = (receita ?? []).find((e) => (texto(e.cnpj_cpf) ?? "").replace(/\D/g, "") === CNPJ_RECEITA)?.id ?? null

  for (const r of faltam) {
    const m = MODELOS[r]
    const { data: novo, error: e } = await admin
      .from("financeiro_tributos")
      .insert({
        emp_proprietaria_id: emp,
        nome: m.nome,
        abreviacao: m.abreviacao,
        esfera: m.esfera,
        beneficiario_empresa_id: m.receita ? receitaId : null,
        periodicidade: "mensal",
        dia_vencimento: m.dia,
        forma_pagamento: "Boleto",
        retencao_rpa: r,
        observacoes: m.observacoes,
      })
      .select("id")
      .single()
    if (novo) ids[r] = String(novo.id)
    else if (e) {
      // Corrida com outra requisição: o índice único segura; relê.
      const { data: existente } = await admin
        .from("financeiro_tributos")
        .select("id")
        .eq("emp_proprietaria_id", emp)
        .eq("retencao_rpa", r)
        .maybeSingle()
      if (existente) ids[r] = String(existente.id)
      else console.error("garantirTributosRpa:", e.message)
    }
  }
  return ids
}

/**
 * A guia da competência espera a soma das retenções: a prevista é criada (ou
 * atualizada) com esse valor; a já lançada não muda.
 */
async function alinharGuia(tributoId: string, competencia: string, a: Ambiente) {
  const { admin, emp } = a
  const { data: rets } = await admin
    .from("financeiro_tributos_retencoes")
    .select("valor")
    .eq("tributo_id", tributoId)
    .eq("competencia", competencia)
  const soma = arred((rets ?? []).reduce((s, r) => s + Number(r.valor ?? 0), 0))
  const { data: guias } = await admin
    .from("financeiro_tributos_lancamentos")
    .select("id, situacao")
    .eq("tributo_id", tributoId)
    .eq("competencia_inicio", competencia)
    .neq("situacao", "cancelado")
  const prevista = (guias ?? []).find((g) => g.situacao === "aguardando_guia")
  const lancada = (guias ?? []).some((g) => g.situacao === "lancado")
  if (prevista) {
    if (soma > 0) {
      await admin.from("financeiro_tributos_lancamentos").update({ valor: soma, updated_at: new Date().toISOString() }).eq("id", prevista.id)
    } else {
      // Sem retenção na competência (pagamento desfeito): a prevista sai.
      await admin.from("financeiro_tributos_lancamentos").update({ situacao: "cancelado", updated_at: new Date().toISOString() }).eq("id", prevista.id)
    }
    return
  }
  if (lancada || soma <= 0) return
  const { data: t } = await admin.from("financeiro_tributos").select("dia_vencimento").eq("id", tributoId).maybeSingle()
  const prox = somarMeses(competencia, 1)
  const fim = somarMeses(competencia, 0)
  await admin.from("financeiro_tributos_lancamentos").insert({
    emp_proprietaria_id: emp,
    tributo_id: tributoId,
    competencia_inicio: competencia,
    competencia_fim: dataDoDia(fim.ano, fim.mes, 31),
    vencimento: dataDoDia(prox.ano, prox.mes, Number(t?.dia_vencimento ?? 20)),
    valor: soma,
    situacao: "aguardando_guia",
  })
}

/**
 * Sincroniza as retenções dos RPAs destas ordens com a situação delas: paga →
 * linhas na competência do pagamento; qualquer outra → sem linhas. Chamado
 * pela trilha da ordem (pagamento registrado/removido, estorno, cancelamento).
 */
export async function sincronizarRetencoesDasOrdens(ordemIds: string[], a?: Ambiente): Promise<void> {
  if (!ordemIds.length) return
  const amb = await ambiente(a)
  const { admin, emp } = amb
  const { data: rpas, error } = await admin
    .from("compras_rpa")
    .select("id, valor_bruto, inss, irrf, iss, iss_aliquota, ordem_pagamento_id")
    .eq("emp_proprietaria_id", emp)
    .in("ordem_pagamento_id", ordemIds)
  if (error || !rpas?.length) return
  const { data: ordens } = await admin
    .from("ordens_pagamento")
    .select("id, situacao, data_pagamento")
    .in("id", rpas.map((r) => String(r.ordem_pagamento_id)))
  const ordemDe = new Map((ordens ?? []).map((o) => [String(o.id), o]))

  // Retenções de antes, para refazer as guias das competências que mudarem.
  const { data: antes, error: erroTabela } = await admin
    .from("financeiro_tributos_retencoes")
    .select("tributo_id, competencia")
    .in("rpa_id", rpas.map((r) => String(r.id)))
  if (erroTabela) return // migração ainda não aplicada
  const tocadas = new Set((antes ?? []).map((r) => `${r.tributo_id}|${r.competencia}`))

  const pagos = rpas.filter((r) => {
    const o = ordemDe.get(String(r.ordem_pagamento_id))
    return o?.situacao === SITUACAO_PAGA && texto(o.data_pagamento)
  })
  const naoPagos = rpas.filter((r) => !pagos.includes(r)).map((r) => String(r.id))
  if (naoPagos.length) await admin.from("financeiro_tributos_retencoes").delete().in("rpa_id", naoPagos)

  if (pagos.length) {
    const tributos = await garantirTributosRpa(amb)
    const { data: cfg } = await admin
      .from("compras_rpa_config")
      .select("inss_aliquota, inss_patronal_aliquota")
      .eq("emp_proprietaria_id", emp)
      .maybeSingle()
    const patronal = Number(cfg?.inss_patronal_aliquota ?? 20)
    const linhas: Record<string, unknown>[] = []
    for (const r of pagos) {
      const o = ordemDe.get(String(r.ordem_pagamento_id))!
      const competencia = `${String(o.data_pagamento).slice(0, 7)}-01`
      const bruto = Number(r.valor_bruto ?? 0)
      const valores: [TipoRetencao, number, number | null][] = [
        ["inss_retido", Number(r.inss ?? 0), null],
        ["inss_patronal", arred((bruto * patronal) / 100), patronal],
        ["irrf", Number(r.irrf ?? 0), null],
        ["iss", Number(r.iss ?? 0), r.iss_aliquota == null ? null : Number(r.iss_aliquota)],
      ]
      for (const [tipo, valor, aliquota] of valores) {
        const tributoId = tributos[TRIBUTO_DO_TIPO[tipo]]
        if (!tributoId) continue
        if (!(valor > 0)) {
          await admin.from("financeiro_tributos_retencoes").delete().eq("rpa_id", r.id).eq("tipo", tipo)
          continue
        }
        linhas.push({
          emp_proprietaria_id: emp,
          tributo_id: tributoId,
          rpa_id: r.id,
          ordem_pagamento_id: o.id,
          tipo,
          competencia,
          base: bruto,
          aliquota,
          valor: arred(valor),
          updated_at: new Date().toISOString(),
        })
        tocadas.add(`${tributoId}|${competencia}`)
      }
    }
    if (linhas.length) {
      const { error: e } = await admin.from("financeiro_tributos_retencoes").upsert(linhas, { onConflict: "rpa_id,tipo" })
      if (e) console.error("retenções do RPA:", e.message)
    }
  }

  for (const chave of tocadas) {
    const [tributoId, competencia] = chave.split("|")
    await alinharGuia(tributoId, competencia, amb)
  }
}

export type RetencaoDaCompetencia = {
  id: string
  tipo: TipoRetencao
  competencia: string
  valor: number
  base: number | null
  aliquota: number | null
  rpaId: string
  rpaNumero: number | null
  prestador: string | null
  ordemId: string | null
}

/** Retenções de um tributo (para a página dele), da mais recente para a mais antiga. */
export async function retencoesDoTributo(tributoId: string): Promise<RetencaoDaCompetencia[]> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("financeiro_tributos_retencoes")
    .select(
      "id, tipo, competencia, valor, base, aliquota, rpa_id, ordem_pagamento_id, rpa:rpa_id (numero, fornecedor:fornecedor_id (nome_fantasia, nome_razao))"
    )
    .eq("tributo_id", tributoId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .order("competencia", { ascending: false })
    .limit(1000)
  if (error) return []
  return ((data ?? []) as Record<string, unknown>[]).map((r) => {
    const rpa = r.rpa as { numero?: number | null; fornecedor?: { nome_fantasia?: string | null; nome_razao?: string | null } | null } | null
    return {
      id: String(r.id),
      tipo: r.tipo as TipoRetencao,
      competencia: String(r.competencia),
      valor: Number(r.valor ?? 0),
      base: r.base == null ? null : Number(r.base),
      aliquota: r.aliquota == null ? null : Number(r.aliquota),
      rpaId: String(r.rpa_id),
      rpaNumero: rpa?.numero ?? null,
      prestador: texto(rpa?.fornecedor?.nome_fantasia) ?? texto(rpa?.fornecedor?.nome_razao),
      ordemId: texto(r.ordem_pagamento_id),
    }
  })
}

/** Soma das retenções de um tributo numa competência ("AAAA-MM-01"). */
export async function somaRetencoes(tributoId: string, competencia: string): Promise<number> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("financeiro_tributos_retencoes")
    .select("valor")
    .eq("tributo_id", tributoId)
    .eq("competencia", competencia)
  return arred((data ?? []).reduce((s, r) => s + Number(r.valor ?? 0), 0))
}

/**
 * Carga inicial: RPAs cujas ordens foram pagas desde a virada (01/10/2026)
 * entram nas competências delas. Idempotente (upsert por RPA e tipo).
 */
export async function carregarRetencoesPendentes(a?: Ambiente): Promise<void> {
  const amb = await ambiente(a)
  const { data } = await amb.admin
    .from("compras_rpa")
    .select("ordem_pagamento_id, ordem:ordem_pagamento_id (situacao, data_pagamento)")
    .eq("emp_proprietaria_id", amb.emp)
    .not("ordem_pagamento_id", "is", null)
  const ids = ((data ?? []) as Record<string, unknown>[])
    .filter((r) => {
      const o = r.ordem as { situacao?: string; data_pagamento?: string | null } | null
      return o?.situacao === SITUACAO_PAGA && (o.data_pagamento ?? "") >= "2026-10-01"
    })
    .map((r) => String(r.ordem_pagamento_id))
  await sincronizarRetencoesDasOrdens(ids, amb)
}

/** Cota patronal do INSS (%) — null antes da migração (o campo fica oculto). */
export async function aliquotaPatronalRpa(): Promise<number | null> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("compras_rpa_config")
    .select("inss_patronal_aliquota")
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (error) return null
  return Number(data?.inss_patronal_aliquota ?? 20)
}
