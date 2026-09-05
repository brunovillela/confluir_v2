import "server-only"

import { esquemaAusente, nomesDosUsuarios } from "@/lib/db/comum"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Veículos › Checklist — verificação periódica da frota.
 *
 * O catálogo de itens é uma TABELA por tenant, não colunas fixas: a lista muda
 * com a frota (caminhão precisa do que carro não precisa). A tabela legada
 * `veiculos_verificacao`, herdada do Bubble, tinha um par de colunas por item
 * e por isso não foi reaproveitada — está vazia e segue intocada.
 *
 * O prazo de cada veículo sai de `veiculos.checklist_recorrencia_dias` quando
 * preenchido, senão da recorrência do tenant. Isso permite exigir verificação
 * semanal da van que roda todo dia e mensal do carro que sai uma vez por mês.
 *
 * SQL: supabase/veiculos-checklist.sql
 */

export type SituacaoItem = "conforme" | "nao_conforme" | "nao_aplica"

export const SITUACOES: { valor: SituacaoItem; rotulo: string }[] = [
  { valor: "conforme", rotulo: "Conforme" },
  { valor: "nao_conforme", rotulo: "Não conforme" },
  { valor: "nao_aplica", rotulo: "Não se aplica" },
]

export type ItemChecklist = {
  id: string
  categoria: string
  itens_verificar: string | null
  proposito: string | null
  ordem: number
  ativo: boolean
}

export type ConfigChecklist = {
  recorrencia_dias: number
  alerta_antecedencia_dias: number
  ativo: boolean
}

const CONFIG_PADRAO: ConfigChecklist = {
  recorrencia_dias: 30,
  alerta_antecedencia_dias: 3,
  ativo: true,
}

export type Checklist = {
  id: string
  veiculo_id: string
  veiculoRotulo: string | null
  realizado_em: string
  hodometro: number | null
  inspetorNome: string | null
  observacoes: string | null
  pendencias: number
}

export type RespostaChecklist = {
  id: string
  item_id: string | null
  categoria: string | null
  situacao: SituacaoItem | null
  observacao: string | null
}

/**
 * Estado do checklist de UM veículo. `diasRestantes` negativo = vencido.
 * `nunca` distingue "nunca foi feito" de "foi feito e venceu" — na tela as
 * duas coisas pedem textos diferentes.
 */
export type SituacaoChecklist = {
  ativo: boolean
  nunca: boolean
  ultimoEm: string | null
  ultimoId: string | null
  pendencias: number
  /** Prazo efetivo em uso (o do veículo, se houver; senão o da frota). */
  recorrenciaDias: number
  /** Prazo PRÓPRIO do veículo — null quando ele segue o padrão da frota. */
  recorrenciaPropria: number | null
  venceEm: string | null
  diasRestantes: number | null
  vencido: boolean
  proximoDoVencimento: boolean
}

// ── Configuração e catálogo ──────────────────────────────────────────────────

export async function obterConfig(): Promise<{
  ativo: boolean
  config: ConfigChecklist
}> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data, error } = await admin
    .from("veiculos_checklist_config")
    .select("recorrencia_dias, alerta_antecedencia_dias, ativo")
    .eq("emp_proprietaria_id", emp)
    .maybeSingle()
  if (error) {
    if (esquemaAusente(error)) return { ativo: false, config: CONFIG_PADRAO }
    throw new Error(`Falha ao ler a configuração: ${error.message}`)
  }
  if (!data) return { ativo: true, config: CONFIG_PADRAO }
  return {
    ativo: true,
    config: {
      recorrencia_dias: Number(data.recorrencia_dias ?? 30) || 30,
      alerta_antecedencia_dias: Number(data.alerta_antecedencia_dias ?? 3) || 0,
      ativo: data.ativo !== false,
    },
  }
}

export async function listarItens(apenasAtivos = false): Promise<ItemChecklist[]> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  let q = admin
    .from("veiculos_checklist_itens")
    .select("id, categoria, itens_verificar, proposito, ordem, ativo")
    .eq("emp_proprietaria_id", emp)
  if (apenasAtivos) q = q.eq("ativo", true)
  const { data, error } = await q.order("ordem").order("categoria")
  if (error) {
    if (esquemaAusente(error)) return []
    throw new Error(`Falha ao listar os itens: ${error.message}`)
  }
  return (data ?? []).map((i) => ({
    id: i.id as string,
    categoria: i.categoria as string,
    itens_verificar: (i.itens_verificar as string | null) ?? null,
    proposito: (i.proposito as string | null) ?? null,
    ordem: Number(i.ordem ?? 0),
    ativo: i.ativo !== false,
  }))
}

// ── Cálculo do prazo ─────────────────────────────────────────────────────────

const DIA_MS = 86_400_000

/** Dias inteiros entre hoje e uma data (negativo = já passou). */
function diasAte(iso: string): number {
  return Math.floor((new Date(iso).getTime() - Date.now()) / DIA_MS)
}

function montarSituacao(
  ultimo: { id: string; realizado_em: string; pendencias: number } | null,
  recorrenciaDias: number,
  antecedencia: number,
  recorrenciaPropria: number | null = null
): SituacaoChecklist {
  if (!ultimo) {
    return {
      ativo: true,
      nunca: true,
      ultimoEm: null,
      ultimoId: null,
      pendencias: 0,
      recorrenciaDias,
      recorrenciaPropria,
      venceEm: null,
      diasRestantes: null,
      vencido: true, // nunca verificado conta como pendente
      proximoDoVencimento: false,
    }
  }
  const vence = new Date(
    new Date(ultimo.realizado_em).getTime() + recorrenciaDias * DIA_MS
  ).toISOString()
  const restantes = diasAte(vence)
  return {
    ativo: true,
    nunca: false,
    ultimoEm: ultimo.realizado_em,
    ultimoId: ultimo.id,
    pendencias: ultimo.pendencias,
    recorrenciaDias,
    recorrenciaPropria,
    venceEm: vence,
    diasRestantes: restantes,
    vencido: restantes < 0,
    proximoDoVencimento: restantes >= 0 && restantes <= antecedencia,
  }
}

/** Estado do checklist de um veículo — usado no alerta da página dele. */
export async function situacaoDoVeiculo(
  veiculoId: string
): Promise<SituacaoChecklist> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { config, ativo } = await obterConfig()
  if (!ativo || !config.ativo) {
    return {
      ativo: false,
      nunca: true,
      ultimoEm: null,
      ultimoId: null,
      pendencias: 0,
      recorrenciaDias: config.recorrencia_dias,
      recorrenciaPropria: null,
      venceEm: null,
      diasRestantes: null,
      vencido: false,
      proximoDoVencimento: false,
    }
  }

  const { data: veic } = await admin
    .from("veiculos")
    .select("checklist_recorrencia_dias")
    .eq("id", veiculoId)
    .eq("emp_proprietaria_id", emp)
    .maybeSingle()
  const propria = Number(veic?.checklist_recorrencia_dias ?? 0) || null
  const recorrencia = propria ?? config.recorrencia_dias

  const { data: ultimo } = await admin
    .from("veiculos_checklists")
    .select("id, realizado_em, pendencias")
    .eq("emp_proprietaria_id", emp)
    .eq("veiculo_id", veiculoId)
    .order("realizado_em", { ascending: false })
    .limit(1)
    .maybeSingle()

  return montarSituacao(
    ultimo
      ? {
          id: ultimo.id as string,
          realizado_em: ultimo.realizado_em as string,
          pendencias: Number(ultimo.pendencias ?? 0),
        }
      : null,
    recorrencia,
    config.alerta_antecedencia_dias,
    propria
  )
}

export type VeiculoComSituacao = {
  id: string
  rotulo: string
  situacao: SituacaoChecklist
}

/**
 * Situação de TODA a frota ativa — para o painel do checklist e o indicador do
 * hub. Duas consultas no total (veículos + último checklist de cada um), sem
 * uma ida ao banco por veículo.
 */
export async function situacaoDaFrota(): Promise<{
  ativo: boolean
  linhas: VeiculoComSituacao[]
}> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { config, ativo } = await obterConfig()
  if (!ativo) return { ativo: false, linhas: [] }

  const { data: veiculos, error } = await admin
    .from("veiculos")
    .select("id, codigo, placa, marca_modelo, checklist_recorrencia_dias")
    .eq("emp_proprietaria_id", emp)
    .not("inativo", "is", true)
  if (error) {
    if (esquemaAusente(error)) return { ativo: false, linhas: [] }
    throw new Error(`Falha ao listar a frota: ${error.message}`)
  }

  const { data: checklists } = await admin
    .from("veiculos_checklists")
    .select("id, veiculo_id, realizado_em, pendencias")
    .eq("emp_proprietaria_id", emp)
    .order("realizado_em", { ascending: false })

  // primeiro de cada veículo = o mais recente (a consulta já veio ordenada)
  const ultimoPorVeiculo = new Map<
    string,
    { id: string; realizado_em: string; pendencias: number }
  >()
  for (const c of checklists ?? []) {
    const vid = c.veiculo_id as string
    if (!vid || ultimoPorVeiculo.has(vid)) continue
    ultimoPorVeiculo.set(vid, {
      id: c.id as string,
      realizado_em: c.realizado_em as string,
      pendencias: Number(c.pendencias ?? 0),
    })
  }

  const linhas = (veiculos ?? []).map((v) => {
    const recorrencia =
      Number(v.checklist_recorrencia_dias ?? 0) || config.recorrencia_dias
    return {
      id: v.id as string,
      rotulo:
        [v.codigo, v.placa, v.marca_modelo].filter(Boolean).join(" · ") ||
        "(sem identificação)",
      situacao: montarSituacao(
        ultimoPorVeiculo.get(v.id as string) ?? null,
        recorrencia,
        config.alerta_antecedencia_dias
      ),
    }
  })

  // vencidos primeiro, depois os que vencem antes
  linhas.sort((a, b) => {
    const da = a.situacao.diasRestantes ?? -99999
    const db = b.situacao.diasRestantes ?? -99999
    return da - db
  })
  return { ativo: true, linhas }
}

/** Quantos veículos estão com o checklist vencido (indicador do hub). */
export async function totalVencidos(): Promise<number> {
  const { ativo, linhas } = await situacaoDaFrota()
  if (!ativo) return 0
  return linhas.filter((l) => l.situacao.vencido).length
}

// ── Histórico ────────────────────────────────────────────────────────────────

export async function listarChecklists(filtros: {
  veiculoId?: string
  limite?: number
}): Promise<{ ativo: boolean; linhas: Checklist[] }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  let q = admin
    .from("veiculos_checklists")
    .select(
      "id, veiculo_id, realizado_em, hodometro, inspetor_id, observacoes, pendencias"
    )
    .eq("emp_proprietaria_id", emp)
  if (filtros.veiculoId) q = q.eq("veiculo_id", filtros.veiculoId)

  const { data, error } = await q
    .order("realizado_em", { ascending: false })
    .limit(filtros.limite ?? 100)
  if (error) {
    if (esquemaAusente(error)) return { ativo: false, linhas: [] }
    throw new Error(`Falha ao listar os checklists: ${error.message}`)
  }
  const linhas = data ?? []

  const nomes = await nomesDosUsuarios(
    linhas.map((c) => c.inspetor_id).filter((v): v is string => !!v)
  )
  const rotulos = await rotulosDosVeiculos(
    linhas.map((c) => c.veiculo_id).filter((v): v is string => !!v)
  )

  return {
    ativo: true,
    linhas: linhas.map((c) => ({
      id: c.id as string,
      veiculo_id: c.veiculo_id as string,
      veiculoRotulo: rotulos.get(c.veiculo_id as string) ?? null,
      realizado_em: c.realizado_em as string,
      hodometro: c.hodometro === null ? null : Number(c.hodometro),
      inspetorNome: c.inspetor_id
        ? (nomes.get(c.inspetor_id as string) ?? null)
        : null,
      observacoes: (c.observacoes as string | null) ?? null,
      pendencias: Number(c.pendencias ?? 0),
    })),
  }
}

async function rotulosDosVeiculos(
  ids: string[]
): Promise<Map<string, string>> {
  const unicos = [...new Set(ids)]
  if (unicos.length === 0) return new Map()
  const admin = await createAdminClient()
  const { data } = await admin
    .from("veiculos")
    .select("id, codigo, placa, marca_modelo")
    .in("id", unicos)
  return new Map(
    (data ?? []).map((v) => [
      v.id as string,
      [v.codigo, v.placa, v.marca_modelo].filter(Boolean).join(" · ") ||
        "(sem identificação)",
    ])
  )
}

export async function obterChecklist(id: string): Promise<{
  checklist: Checklist
  respostas: RespostaChecklist[]
} | null> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data } = await admin
    .from("veiculos_checklists")
    .select(
      "id, veiculo_id, realizado_em, hodometro, inspetor_id, observacoes, pendencias"
    )
    .eq("emp_proprietaria_id", emp)
    .eq("id", id)
    .maybeSingle()
  if (!data) return null

  const [nomes, rotulos, { data: respostas }] = await Promise.all([
    nomesDosUsuarios(data.inspetor_id ? [data.inspetor_id as string] : []),
    rotulosDosVeiculos([data.veiculo_id as string]),
    admin
      .from("veiculos_checklist_respostas")
      .select("id, item_id, categoria, situacao, observacao")
      .eq("emp_proprietaria_id", emp)
      .eq("checklist_id", id),
  ])

  return {
    checklist: {
      id: data.id as string,
      veiculo_id: data.veiculo_id as string,
      veiculoRotulo: rotulos.get(data.veiculo_id as string) ?? null,
      realizado_em: data.realizado_em as string,
      hodometro: data.hodometro === null ? null : Number(data.hodometro),
      inspetorNome: data.inspetor_id
        ? (nomes.get(data.inspetor_id as string) ?? null)
        : null,
      observacoes: (data.observacoes as string | null) ?? null,
      pendencias: Number(data.pendencias ?? 0),
    },
    respostas: (respostas ?? []).map((r) => ({
      id: r.id as string,
      item_id: (r.item_id as string | null) ?? null,
      categoria: (r.categoria as string | null) ?? null,
      situacao: (r.situacao as SituacaoItem | null) ?? null,
      observacao: (r.observacao as string | null) ?? null,
    })),
  }
}
