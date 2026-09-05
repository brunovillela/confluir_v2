import "server-only"

import { esquemaAusente, nomesDosUsuarios } from "@/lib/db/comum"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Veículos › Manutenções — prontuário e preventivas programadas.
 *
 * Duas coisas distintas: `veiculos_manutencoes` é o que ACONTECEU (o
 * prontuário), `veiculos_manutencao_planos` é o que DEVE acontecer.
 *
 * O plano vence por DATA e/ou por KM, o que ocorrer primeiro — é como o manual
 * do fabricante fala. Por isso o alerta calcula os dois e usa o mais próximo.
 *
 * SQL: supabase/veiculos-manutencoes.sql
 */

export type TipoManutencao = "preventiva" | "corretiva"

export const TIPOS: { valor: TipoManutencao; rotulo: string }[] = [
  { valor: "preventiva", rotulo: "Preventiva" },
  { valor: "corretiva", rotulo: "Corretiva" },
]

export type Manutencao = {
  id: string
  veiculo_id: string
  veiculoRotulo: string | null
  tipo: TipoManutencao | null
  descricao: string | null
  realizada_em: string | null
  hodometro: number | null
  local_id: string | null
  local_nome: string | null
  valor: number | null
  compra_id: string | null
  compraCodigo: string | null
  nota_fiscal_numero: string | null
  nota_fiscal_url: string | null
  garantia_meses: number | null
  garantia_km: number | null
  garantia_ate: string | null
  garantia_hodometro: number | null
  plano_id: string | null
  planoDescricao: string | null
  observacoes: string | null
  registradaPorNome: string | null
  created_at: string
}

export type PlanoManutencao = {
  id: string
  veiculo_id: string
  descricao: string
  intervalo_dias: number | null
  intervalo_km: number | null
  base_data: string | null
  base_hodometro: number | null
  alerta_dias: number
  alerta_km: number
  ativo: boolean
}

/**
 * Quanto falta para uma preventiva vencer. `null` em `dias`/`km` significa que
 * aquele critério não se aplica (o plano não tem aquele intervalo, ou falta o
 * hodômetro atual). Negativo = já passou.
 */
export type SituacaoPlano = {
  plano: PlanoManutencao
  veiculoRotulo: string
  ultimaEm: string | null
  ultimoHodometro: number | null
  proximaData: string | null
  proximoHodometro: number | null
  diasRestantes: number | null
  kmRestantes: number | null
  vencido: boolean
  proximo: boolean
  /** Por qual critério está vencendo — para o texto do alerta. */
  motivo: "data" | "km" | null
}

// ── Hodômetro atual ──────────────────────────────────────────────────────────

/**
 * O hodômetro do veículo NÃO tem uma casa só: ele aparece nos abastecimentos,
 * nos checklists, nas devoluções e nas próprias manutenções. O valor corrente é
 * o MAIOR entre todas essas fontes — usar só uma delas subestima a rodagem e
 * faz o alerta de quilometragem disparar tarde.
 */
export async function hodometroAtual(
  veiculoId: string
): Promise<number | null> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()

  const consultas: PromiseLike<{ data: unknown[] | null }>[] = [
    admin
      .from("veiculos_abastecimentos")
      .select("hodometro")
      .eq("emp_proprietaria_id", emp)
      .eq("veiculo_id", veiculoId)
      .order("hodometro", { ascending: false })
      .limit(1),
    admin
      .from("veiculos_checklists")
      .select("hodometro")
      .eq("emp_proprietaria_id", emp)
      .eq("veiculo_id", veiculoId)
      .order("hodometro", { ascending: false })
      .limit(1),
    admin
      .from("veiculos_disponibilidade")
      .select("hodometro_devolucao")
      .eq("emp_proprietaria_id", emp)
      .eq("veiculo_id", veiculoId)
      .order("hodometro_devolucao", { ascending: false })
      .limit(1),
    admin
      .from("veiculos_manutencoes")
      .select("hodometro")
      .eq("emp_proprietaria_id", emp)
      .eq("veiculo_id", veiculoId)
      .order("hodometro", { ascending: false })
      .limit(1),
  ]

  // Tabela ausente (SQL não rodado) não pode derrubar a leitura das outras.
  const resultados = await Promise.all(
    consultas.map((c) => Promise.resolve(c).catch(() => ({ data: null })))
  )

  let maior: number | null = null
  for (const r of resultados) {
    for (const linha of (r.data ?? []) as Record<string, unknown>[]) {
      const v = Number(linha.hodometro ?? linha.hodometro_devolucao ?? NaN)
      if (Number.isFinite(v) && (maior === null || v > maior)) maior = v
    }
  }
  return maior
}

/** Hodômetro atual de VÁRIOS veículos — uma consulta por fonte, não por carro. */
async function hodometrosDaFrota(): Promise<Map<string, number>> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const mapa = new Map<string, number>()

  const guardar = (id: unknown, valor: unknown) => {
    const vid = typeof id === "string" ? id : null
    const v = Number(valor ?? NaN)
    if (!vid || !Number.isFinite(v)) return
    const atual = mapa.get(vid)
    if (atual === undefined || v > atual) mapa.set(vid, v)
  }

  // Escritas uma a uma (e não num laço com `select` montado por template):
  // o tipador do supabase-js precisa da string literal para analisar a consulta.
  const abastecimentos = await admin
    .from("veiculos_abastecimentos")
    .select("veiculo_id, hodometro")
    .eq("emp_proprietaria_id", emp)
  for (const l of abastecimentos.data ?? []) guardar(l.veiculo_id, l.hodometro)

  const checklists = await admin
    .from("veiculos_checklists")
    .select("veiculo_id, hodometro")
    .eq("emp_proprietaria_id", emp)
  for (const l of checklists.data ?? []) guardar(l.veiculo_id, l.hodometro)

  const devolucoes = await admin
    .from("veiculos_disponibilidade")
    .select("veiculo_id, hodometro_devolucao")
    .eq("emp_proprietaria_id", emp)
  for (const l of devolucoes.data ?? []) {
    guardar(l.veiculo_id, l.hodometro_devolucao)
  }

  const manutencoes = await admin
    .from("veiculos_manutencoes")
    .select("veiculo_id, hodometro")
    .eq("emp_proprietaria_id", emp)
  for (const l of manutencoes.data ?? []) guardar(l.veiculo_id, l.hodometro)

  return mapa
}

// ── Planos ───────────────────────────────────────────────────────────────────

const DIA_MS = 86_400_000

function mapPlano(p: Record<string, unknown>): PlanoManutencao {
  return {
    id: p.id as string,
    veiculo_id: p.veiculo_id as string,
    descricao: (p.descricao as string | null) ?? "",
    intervalo_dias: (p.intervalo_dias as number | null) ?? null,
    intervalo_km: (p.intervalo_km as number | null) ?? null,
    base_data: (p.base_data as string | null) ?? null,
    base_hodometro:
      p.base_hodometro === null ? null : Number(p.base_hodometro ?? 0),
    alerta_dias: Number(p.alerta_dias ?? 15),
    alerta_km: Number(p.alerta_km ?? 500),
    ativo: p.ativo !== false,
  }
}

export async function listarPlanos(
  veiculoId?: string
): Promise<{ ativo: boolean; planos: PlanoManutencao[] }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  let q = admin
    .from("veiculos_manutencao_planos")
    .select(
      "id, veiculo_id, descricao, intervalo_dias, intervalo_km, base_data, base_hodometro, alerta_dias, alerta_km, ativo"
    )
    .eq("emp_proprietaria_id", emp)
  if (veiculoId) q = q.eq("veiculo_id", veiculoId)

  const { data, error } = await q.order("descricao")
  if (error) {
    if (esquemaAusente(error)) return { ativo: false, planos: [] }
    throw new Error(`Falha ao listar os planos: ${error.message}`)
  }
  return { ativo: true, planos: (data ?? []).map(mapPlano) }
}

/**
 * Calcula o vencimento de um plano. A regra é "o que ocorrer primeiro": se o
 * plano tem os dois intervalos, vale o critério que estiver mais perto.
 */
function situacaoDoPlano(
  plano: PlanoManutencao,
  veiculoRotulo: string,
  ultima: { realizada_em: string | null; hodometro: number | null } | null,
  hodometroCorrente: number | null
): SituacaoPlano {
  const baseData = ultima?.realizada_em ?? plano.base_data
  const baseKm = ultima?.hodometro ?? plano.base_hodometro

  let proximaData: string | null = null
  let diasRestantes: number | null = null
  if (plano.intervalo_dias && baseData) {
    const d = new Date(`${baseData}T12:00:00`)
    d.setDate(d.getDate() + plano.intervalo_dias)
    proximaData = d.toISOString().slice(0, 10)
    diasRestantes = Math.floor((d.getTime() - Date.now()) / DIA_MS)
  }

  let proximoHodometro: number | null = null
  let kmRestantes: number | null = null
  if (plano.intervalo_km && baseKm !== null && baseKm !== undefined) {
    proximoHodometro = Number(baseKm) + plano.intervalo_km
    if (hodometroCorrente !== null) {
      kmRestantes = proximoHodometro - hodometroCorrente
    }
  }

  const vencidoData = diasRestantes !== null && diasRestantes < 0
  const vencidoKm = kmRestantes !== null && kmRestantes < 0
  const proximoData =
    diasRestantes !== null &&
    diasRestantes >= 0 &&
    diasRestantes <= plano.alerta_dias
  const proximoKm =
    kmRestantes !== null && kmRestantes >= 0 && kmRestantes <= plano.alerta_km

  // Qual critério está mandando: o vencido tem prioridade; entre dois
  // vencidos, o que passou há mais tempo/quilometragem.
  let motivo: "data" | "km" | null = null
  if (vencidoData || vencidoKm) {
    motivo = vencidoData && vencidoKm ? "data" : vencidoData ? "data" : "km"
  } else if (proximoData || proximoKm) {
    motivo = proximoData && proximoKm ? "data" : proximoData ? "data" : "km"
  }

  return {
    plano,
    veiculoRotulo,
    ultimaEm: ultima?.realizada_em ?? null,
    ultimoHodometro: ultima?.hodometro ?? null,
    proximaData,
    proximoHodometro,
    diasRestantes,
    kmRestantes,
    vencido: vencidoData || vencidoKm,
    proximo: !vencidoData && !vencidoKm && (proximoData || proximoKm),
    motivo,
  }
}

async function rotulosDosVeiculos(): Promise<Map<string, string>> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data } = await admin
    .from("veiculos")
    .select("id, codigo, placa, marca_modelo")
    .eq("emp_proprietaria_id", emp)
  return new Map(
    (data ?? []).map((v) => [
      v.id as string,
      [v.codigo, v.placa, v.marca_modelo].filter(Boolean).join(" · ") ||
        "(sem identificação)",
    ])
  )
}

/** Última execução de cada plano (a que define o próximo vencimento). */
async function ultimasPorPlano(): Promise<
  Map<string, { realizada_em: string | null; hodometro: number | null }>
> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data } = await admin
    .from("veiculos_manutencoes")
    .select("plano_id, realizada_em, hodometro")
    .eq("emp_proprietaria_id", emp)
    .not("plano_id", "is", null)
    .order("realizada_em", { ascending: false })

  const mapa = new Map<
    string,
    { realizada_em: string | null; hodometro: number | null }
  >()
  for (const m of (data ?? []) as Record<string, unknown>[]) {
    const pid = m.plano_id as string
    if (!pid || mapa.has(pid)) continue // a consulta já veio ordenada
    mapa.set(pid, {
      realizada_em: (m.realizada_em as string | null) ?? null,
      hodometro: m.hodometro === null ? null : Number(m.hodometro),
    })
  }
  return mapa
}

/** Situação de todas as preventivas programadas da frota. */
export async function situacaoDosPlanos(veiculoId?: string): Promise<{
  ativo: boolean
  linhas: SituacaoPlano[]
}> {
  const { ativo, planos } = await listarPlanos(veiculoId)
  if (!ativo) return { ativo: false, linhas: [] }

  const [rotulos, ultimas, hodometros] = await Promise.all([
    rotulosDosVeiculos(),
    ultimasPorPlano(),
    hodometrosDaFrota(),
  ])

  const linhas = planos
    .filter((p) => p.ativo)
    .map((p) =>
      situacaoDoPlano(
        p,
        rotulos.get(p.veiculo_id) ?? "(veículo removido)",
        ultimas.get(p.id) ?? null,
        hodometros.get(p.veiculo_id) ?? null
      )
    )

  // vencidos primeiro; depois os mais próximos
  linhas.sort((a, b) => {
    const peso = (s: SituacaoPlano) =>
      s.vencido ? 0 : s.proximo ? 1 : 2
    if (peso(a) !== peso(b)) return peso(a) - peso(b)
    const da = a.diasRestantes ?? 99999
    const db = b.diasRestantes ?? 99999
    return da - db
  })
  return { ativo: true, linhas }
}

/** Quantas preventivas estão vencidas (indicador do hub). */
export async function totalPreventivasVencidas(): Promise<number> {
  const { ativo, linhas } = await situacaoDosPlanos()
  if (!ativo) return 0
  return linhas.filter((l) => l.vencido).length
}

// ── Prontuário ───────────────────────────────────────────────────────────────

const CAMPOS =
  "id, veiculo_id, tipo, descricao, realizada_em, hodometro, local_id, local_nome, valor, compra_id, nota_fiscal_numero, nota_fiscal_url, garantia_meses, garantia_km, garantia_ate, garantia_hodometro, plano_id, observacoes, registrada_por, created_at"

export async function listarManutencoes(filtros: {
  veiculoId?: string
  limite?: number
}): Promise<{ ativo: boolean; linhas: Manutencao[] }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  let q = admin
    .from("veiculos_manutencoes")
    .select(CAMPOS)
    .eq("emp_proprietaria_id", emp)
  if (filtros.veiculoId) q = q.eq("veiculo_id", filtros.veiculoId)

  const { data, error } = await q
    .order("realizada_em", { ascending: false, nullsFirst: false })
    .limit(filtros.limite ?? 100)
  if (error) {
    if (esquemaAusente(error)) return { ativo: false, linhas: [] }
    throw new Error(`Falha ao listar as manutenções: ${error.message}`)
  }
  const linhas = data ?? []

  const [nomes, rotulos, codigos, planos] = await Promise.all([
    nomesDosUsuarios(
      linhas.map((m) => m.registrada_por).filter((v): v is string => !!v)
    ),
    rotulosDosVeiculos(),
    codigosDasCompras(
      linhas.map((m) => m.compra_id).filter((v): v is string => !!v)
    ),
    listarPlanos(),
  ])
  const descPlano = new Map(planos.planos.map((p) => [p.id, p.descricao]))

  return {
    ativo: true,
    linhas: linhas.map((m) => ({
      id: m.id as string,
      veiculo_id: m.veiculo_id as string,
      veiculoRotulo: rotulos.get(m.veiculo_id as string) ?? null,
      tipo: (m.tipo as TipoManutencao | null) ?? null,
      descricao: (m.descricao as string | null) ?? null,
      realizada_em: (m.realizada_em as string | null) ?? null,
      hodometro: m.hodometro === null ? null : Number(m.hodometro),
      local_id: (m.local_id as string | null) ?? null,
      local_nome: (m.local_nome as string | null) ?? null,
      valor: m.valor === null ? null : Number(m.valor),
      compra_id: (m.compra_id as string | null) ?? null,
      compraCodigo: m.compra_id
        ? (codigos.get(m.compra_id as string) ?? null)
        : null,
      nota_fiscal_numero: (m.nota_fiscal_numero as string | null) ?? null,
      nota_fiscal_url: (m.nota_fiscal_url as string | null) ?? null,
      garantia_meses: (m.garantia_meses as number | null) ?? null,
      garantia_km: (m.garantia_km as number | null) ?? null,
      garantia_ate: (m.garantia_ate as string | null) ?? null,
      garantia_hodometro:
        m.garantia_hodometro === null ? null : Number(m.garantia_hodometro),
      plano_id: (m.plano_id as string | null) ?? null,
      planoDescricao: m.plano_id
        ? (descPlano.get(m.plano_id as string) ?? null)
        : null,
      observacoes: (m.observacoes as string | null) ?? null,
      registradaPorNome: m.registrada_por
        ? (nomes.get(m.registrada_por as string) ?? null)
        : null,
      created_at: m.created_at as string,
    })),
  }
}

/**
 * Compras candidatas ao vínculo: as já COMPRADAS, mais recentes primeiro. Não
 * filtro por "serviço de oficina" porque o sistema não classifica compras por
 * natureza — quem registra sabe qual é a dele, e a lista curta basta.
 */
export async function comprasParaVinculo(
  limite = 60
): Promise<{ id: string; rotulo: string }[]> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data, error } = await admin
    .from("compras_solicitacoes")
    .select("id, codigo, compra_valor, compra_data, solicitacao_produto")
    .eq("emp_proprietaria_id", emp)
    .not("compra_data", "is", null)
    .order("compra_data", { ascending: false })
    .limit(limite)
  if (error) return []

  return (data ?? []).map((c) => {
    const valor = Number(c.compra_valor ?? 0)
    const partes = [
      c.codigo as string | null,
      (c.solicitacao_produto as string | null)?.slice(0, 40),
      valor > 0
        ? valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
        : null,
    ].filter(Boolean)
    return { id: c.id as string, rotulo: partes.join(" · ") || "(sem código)" }
  })
}

async function codigosDasCompras(ids: string[]): Promise<Map<string, string>> {
  const unicos = [...new Set(ids)]
  if (unicos.length === 0) return new Map()
  const admin = await createAdminClient()
  const { data } = await admin
    .from("compras_solicitacoes")
    .select("id, codigo")
    .in("id", unicos)
  return new Map(
    (data ?? []).map((c) => [c.id as string, (c.codigo as string) ?? ""])
  )
}

export async function obterManutencao(id: string): Promise<Manutencao | null> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data } = await admin
    .from("veiculos_manutencoes")
    .select(CAMPOS)
    .eq("emp_proprietaria_id", emp)
    .eq("id", id)
    .maybeSingle()
  if (!data) return null

  const [nomes, rotulos, codigos, planos] = await Promise.all([
    nomesDosUsuarios(data.registrada_por ? [data.registrada_por as string] : []),
    rotulosDosVeiculos(),
    codigosDasCompras(data.compra_id ? [data.compra_id as string] : []),
    listarPlanos(),
  ])
  const descPlano = new Map(planos.planos.map((p) => [p.id, p.descricao]))

  return {
    id: data.id as string,
    veiculo_id: data.veiculo_id as string,
    veiculoRotulo: rotulos.get(data.veiculo_id as string) ?? null,
    tipo: (data.tipo as TipoManutencao | null) ?? null,
    descricao: (data.descricao as string | null) ?? null,
    realizada_em: (data.realizada_em as string | null) ?? null,
    hodometro: data.hodometro === null ? null : Number(data.hodometro),
    local_id: (data.local_id as string | null) ?? null,
    local_nome: (data.local_nome as string | null) ?? null,
    valor: data.valor === null ? null : Number(data.valor),
    compra_id: (data.compra_id as string | null) ?? null,
    compraCodigo: data.compra_id
      ? (codigos.get(data.compra_id as string) ?? null)
      : null,
    nota_fiscal_numero: (data.nota_fiscal_numero as string | null) ?? null,
    nota_fiscal_url: (data.nota_fiscal_url as string | null) ?? null,
    garantia_meses: (data.garantia_meses as number | null) ?? null,
    garantia_km: (data.garantia_km as number | null) ?? null,
    garantia_ate: (data.garantia_ate as string | null) ?? null,
    garantia_hodometro:
      data.garantia_hodometro === null
        ? null
        : Number(data.garantia_hodometro),
    plano_id: (data.plano_id as string | null) ?? null,
    planoDescricao: data.plano_id
      ? (descPlano.get(data.plano_id as string) ?? null)
      : null,
    observacoes: (data.observacoes as string | null) ?? null,
    registradaPorNome: data.registrada_por
      ? (nomes.get(data.registrada_por as string) ?? null)
      : null,
    created_at: data.created_at as string,
  }
}

/**
 * Manutenções ainda EM GARANTIA de um veículo. Serve para a pergunta que o
 * prontuário existe para responder: "esse conserto já não foi feito?".
 */
export async function emGarantia(
  veiculoId: string
): Promise<Manutencao[]> {
  const { linhas } = await listarManutencoes({ veiculoId, limite: 200 })
  const hoje = new Date().toISOString().slice(0, 10)
  const km = await hodometroAtual(veiculoId)
  return linhas.filter((m) => {
    const porData = m.garantia_ate !== null && m.garantia_ate >= hoje
    const porKm =
      m.garantia_hodometro !== null && km !== null && km <= m.garantia_hodometro
    return porData || porKm
  })
}
