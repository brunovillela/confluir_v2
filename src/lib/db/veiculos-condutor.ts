import "server-only"

import { hojeSP, texto } from "@/lib/db/comum"
import {
  buscarCondutorDoUsuario,
  KM_MAX_POR_USO,
  montarAbastecimentos,
  montarAgendamentos,
  montarInfracoes,
  montarMovimentacoes,
  type Abastecimento,
  type Agendamento,
  type Condutor,
  type Infracao,
  type Movimentacao,
} from "@/lib/db/veiculos"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"
import type { SituacaoAgendamento, SituacaoCobranca } from "@/lib/veiculos-constantes"

/**
 * Página do condutor: indicadores e o histórico dele em cada área do módulo
 * (movimentações, reservas, abastecimentos, infrações e checklists feitos).
 * O condutor é o USUÁRIO — é por usuarios.id que as tabelas o referenciam,
 * inclusive o legado do Bubble, que não tem cadastro em veiculos_condutores.
 *
 * As listas paginam, ordenam e filtram NO BANCO (o condutor mais ativo do
 * Sindipetro-NF tem ~750 movimentações; o PostgREST corta em 1.000 linhas).
 */

type Admin = Awaited<ReturnType<typeof createAdminClient>>

/** Lê todas as linhas em lotes de 1.000 (teto do PostgREST sem .range). */
async function todasAsLinhas(
  consulta: (de: number, ate: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>
): Promise<Record<string, unknown>[]> {
  const saida: Record<string, unknown>[] = []
  for (let de = 0; de < 50_000; de += 1000) {
    const { data, error } = await consulta(de, de + 999)
    if (error) throw new Error(error.message)
    saida.push(...((data ?? []) as Record<string, unknown>[]))
    if ((data ?? []).length < 1000) break
  }
  return saida
}

function numero(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN
  return Number.isFinite(n) ? n : null
}

function diasEntre(inicio: string, fim: string): number {
  const ms = Date.parse(fim.slice(0, 10)) - Date.parse(inicio.slice(0, 10))
  if (!Number.isFinite(ms) || ms < 0) return 1
  return Math.floor(ms / 86_400_000) + 1
}

// ── Cabeçalho ────────────────────────────────────────────────────────────────

export type PerfilCondutor = {
  usuarioId: string
  nome: string
  email: string | null
  /** Cadastro de CNH/autorização; null = nunca cadastrado (ex.: legado do Bubble). */
  cadastro: Condutor | null
}

export async function perfilDoCondutor(usuarioId: string): Promise<PerfilCondutor | null> {
  const admin = await createAdminClient()
  const { data: u } = await admin
    .from("usuarios")
    .select("id, nome_completo, nome_guerra, email")
    .eq("id", usuarioId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (!u) return null
  return {
    usuarioId,
    nome: texto(u.nome_completo) ?? texto(u.nome_guerra) ?? "(sem nome)",
    email: texto(u.email),
    cadastro: await buscarCondutorDoUsuario(usuarioId),
  }
}

// ── Indicadores ──────────────────────────────────────────────────────────────

export type VeiculoDoCondutor = { id: string; rotulo: string; usos: number; km: number; dias: number }

export type IndicadoresCondutor = {
  usos: number
  /** Saída do fluxo novo ainda sem devolução — está com o veículo agora. */
  emUso: number
  kmTotal: number
  km12Meses: number
  diasComVeiculo: number
  mediaKmPorUso: number | null
  ultimoUsoEm: string | null
  /** Devoluções com km fora do normal confirmadas pela recepção. */
  kmAnormal: number
  /** Devolvidas depois da previsão de retorno informada na saída. */
  devolucoesAtrasadas: number
  devolucoesComPrevisao: number
  abastecimentos: number
  litros: number
  valorAbastecido: number
  valorAbastecido12Meses: number
  infracoes: number
  valorInfracoes: number
  cobrancasPendentes: number
  infracoesSindicais: number
  reservas: number
  reservasNegadas: number
  reservasCanceladas: number
  checklists: number
  checklistsComPendencia: number
  /** Veículos que o condutor já usou (mais usados primeiro) — também alimenta os filtros. */
  veiculos: VeiculoDoCondutor[]
  combustiveis: string[]
}

export async function indicadoresDoCondutor(usuarioId: string): Promise<IndicadoresCondutor> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()

  const [movs, abast, infr, reservas, checklists] = await Promise.all([
    todasAsLinhas((de, ate) =>
      admin
        .from("veiculos_disponibilidade")
        .select("veiculo_id, km_rodado, data_retirada, data_devolucao, devolucao_em, previsao_retorno, registrado_por_id, observacao_retorno")
        .eq("emp_proprietaria_id", emp)
        .eq("condutor_id", usuarioId)
        .order("id")
        .range(de, ate)
    ),
    todasAsLinhas((de, ate) =>
      admin
        .from("veiculos_abastecimentos")
        .select("veiculo_id, volume_abastecido, valor_abastecimento, data_hora_abastecimento, combustivel")
        .eq("emp_proprietaria_id", emp)
        .eq("usuario_id", usuarioId)
        .order("id")
        .range(de, ate)
    ),
    // Infrações não têm coluna de tenant: a RLS isola pelo veículo.
    todasAsLinhas((de, ate) =>
      admin
        .from("veiculos_infracoes")
        .select("infracao_custo, cobranca_situacao, justificativa_sindical")
        .eq("condutor_infrator_id", usuarioId)
        .order("id")
        .range(de, ate)
    ),
    todasAsLinhas((de, ate) =>
      admin
        .from("veiculos_agendamentos")
        .select("situacao, atendido, bubble_id")
        .eq("emp_proprietaria_id", emp)
        .eq("condutor_id", usuarioId)
        .order("id")
        .range(de, ate)
    ),
    todasAsLinhas((de, ate) =>
      admin
        .from("veiculos_checklists")
        .select("pendencias")
        .eq("emp_proprietaria_id", emp)
        .eq("inspetor_id", usuarioId)
        .order("id")
        .range(de, ate)
    ).catch(() => [] as Record<string, unknown>[]),
  ])

  const hoje = hojeSP()
  const ha12Meses = new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10)
  const porVeiculo = new Map<string, VeiculoDoCondutor>()
  const r: IndicadoresCondutor = {
    usos: movs.length,
    emUso: 0,
    kmTotal: 0,
    km12Meses: 0,
    diasComVeiculo: 0,
    mediaKmPorUso: null,
    ultimoUsoEm: null,
    kmAnormal: 0,
    devolucoesAtrasadas: 0,
    devolucoesComPrevisao: 0,
    abastecimentos: abast.length,
    litros: 0,
    valorAbastecido: 0,
    valorAbastecido12Meses: 0,
    infracoes: infr.length,
    valorInfracoes: 0,
    cobrancasPendentes: 0,
    infracoesSindicais: 0,
    reservas: reservas.length,
    reservasNegadas: 0,
    reservasCanceladas: 0,
    checklists: checklists.length,
    checklistsComPendencia: checklists.filter((c) => (numero(c.pendencias) ?? 0) > 0).length,
    veiculos: [],
    combustiveis: [],
  }

  let usosComKm = 0
  for (const m of movs) {
    const retirada = texto(m.data_retirada)
    const devolucao = texto(m.data_devolucao)
    const fluxoNovo = Boolean(m.registrado_por_id)
    if (!devolucao && fluxoNovo) r.emUso++
    if (retirada && (!r.ultimoUsoEm || retirada > r.ultimoUsoEm)) r.ultimoUsoEm = retirada
    // Mesma regra dos indicadores do veículo: aberta LEGADA conta só o dia da saída.
    const dias = retirada ? (!devolucao && !fluxoNovo ? 1 : diasEntre(retirada, devolucao ?? hoje)) : 0
    r.diasComVeiculo += dias
    const km = numero(m.km_rodado)
    const kmValido = km !== null && km > 0 && km <= KM_MAX_POR_USO ? km : 0
    if (kmValido) {
      r.kmTotal += kmValido
      usosComKm++
      if (retirada && retirada >= ha12Meses) r.km12Meses += kmValido
    }
    if (String(m.observacao_retorno ?? "").includes("Km fora do normal")) r.kmAnormal++
    const previsao = texto(m.previsao_retorno)
    const devolvidaEm = texto(m.devolucao_em) ?? devolucao
    if (previsao && devolvidaEm) {
      r.devolucoesComPrevisao++
      // Previsão só com data: atraso é devolver em dia posterior.
      const atrasou = previsao.length <= 10 ? devolvidaEm.slice(0, 10) > previsao : Date.parse(devolvidaEm) > Date.parse(previsao)
      if (atrasou) r.devolucoesAtrasadas++
    }
    const vid = texto(m.veiculo_id)
    if (vid) {
      const v = porVeiculo.get(vid) ?? { id: vid, rotulo: "", usos: 0, km: 0, dias: 0 }
      v.usos++
      v.km += kmValido
      v.dias += dias
      porVeiculo.set(vid, v)
    }
  }
  r.mediaKmPorUso = usosComKm ? Math.round(r.kmTotal / usosComKm) : null

  const combustiveis = new Set<string>()
  for (const a of abast) {
    r.litros += numero(a.volume_abastecido) ?? 0
    const valor = numero(a.valor_abastecimento) ?? 0
    r.valorAbastecido += valor
    if (String(a.data_hora_abastecimento ?? "").slice(0, 10) >= ha12Meses) r.valorAbastecido12Meses += valor
    const c = texto(a.combustivel)
    if (c) combustiveis.add(c)
    const vid = texto(a.veiculo_id)
    if (vid && !porVeiculo.has(vid)) porVeiculo.set(vid, { id: vid, rotulo: "", usos: 0, km: 0, dias: 0 })
  }
  r.combustiveis = [...combustiveis].sort((a, b) => a.localeCompare(b, "pt-BR"))

  for (const i of infr) {
    r.valorInfracoes += numero(i.infracao_custo) ?? 0
    if (i.cobranca_situacao === "pendente") r.cobrancasPendentes++
    if (i.justificativa_sindical === true) r.infracoesSindicais++
  }
  for (const a of reservas) {
    if (a.situacao === "negada") r.reservasNegadas++
    if (a.situacao === "cancelada") r.reservasCanceladas++
  }

  const rotulos = await rotulosDeVeiculos(admin, [...porVeiculo.keys()])
  r.veiculos = [...porVeiculo.values()]
    .map((v) => ({ ...v, rotulo: rotulos.get(v.id) ?? "(veículo removido)" }))
    .sort((a, b) => b.usos - a.usos || b.km - a.km)
  return r
}

async function rotulosDeVeiculos(admin: Admin, ids: string[]): Promise<Map<string, string>> {
  const m = new Map<string, string>()
  if (!ids.length) return m
  const { data } = await admin.from("veiculos").select("id, placa, marca_modelo").in("id", ids)
  for (const v of data ?? []) {
    m.set(String(v.id), [texto(v.placa), texto(v.marca_modelo)].filter(Boolean).join(" · ") || "(sem placa)")
  }
  return m
}

// ── Listas paginadas ─────────────────────────────────────────────────────────

export type Pagina<T> = { linhas: T[]; total: number; pagina: number; totalPaginas: number; porPagina: number }

export type OrdemLista = { coluna: string; asc: boolean }

type FiltroBase = {
  pagina: number
  porPagina: number
  ordem: OrdemLista
  veiculoId?: string | null
  de?: string | null
  ate?: string | null
}

function pagina<T>(linhas: T[], total: number, f: FiltroBase): Pagina<T> {
  return {
    linhas,
    total,
    pagina: f.pagina,
    totalPaginas: Math.max(1, Math.ceil(total / f.porPagina)),
    porPagina: f.porPagina,
  }
}

const faixa = (f: FiltroBase) => [(f.pagina - 1) * f.porPagina, f.pagina * f.porPagina - 1] as const

/** Colunas ordenáveis por lista: chave da URL → coluna no banco. */
export const ORDENS_CONDUTOR = {
  movimentacoes: { saida: "data_retirada", devolucao: "data_devolucao", km: "km_rodado", destino: "destino" },
  reservas: { retirada: "data_retirada", pedido: "created_at", situacao: "situacao", destino: "destino" },
  abastecimentos: { data: "data_hora_abastecimento", valor: "valor_abastecimento", litros: "volume_abastecido", hodometro: "hodometro", posto: "posto" },
  infracoes: { data: "infracao_data", valor: "infracao_custo", tipo: "infracao_tipo", cobranca: "cobranca_situacao" },
  checklists: { data: "realizado_em", pendencias: "pendencias", hodometro: "hodometro" },
} as const

export async function movimentacoesDoCondutor(
  usuarioId: string,
  f: FiltroBase & { situacao?: "abertas" | "devolvidas" | null; kmAnormal?: boolean }
): Promise<Pagina<Movimentacao>> {
  const admin = await createAdminClient()
  let q = admin
    .from("veiculos_disponibilidade")
    .select("*", { count: "exact" })
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("condutor_id", usuarioId)
  if (f.veiculoId) q = q.eq("veiculo_id", f.veiculoId)
  if (f.de) q = q.gte("data_retirada", f.de)
  if (f.ate) q = q.lte("data_retirada", f.ate)
  if (f.situacao === "abertas") q = q.is("data_devolucao", null)
  if (f.situacao === "devolvidas") q = q.not("data_devolucao", "is", null)
  if (f.kmAnormal) q = q.ilike("observacao_retorno", "%Km fora do normal%")
  const [de, ate] = faixa(f)
  const { data, count, error } = await q
    .order(f.ordem.coluna, { ascending: f.ordem.asc, nullsFirst: false })
    .order("retirada_em", { ascending: f.ordem.asc, nullsFirst: false })
    .order("id")
    .range(de, ate)
  if (error) throw new Error(`Falha ao listar movimentações: ${error.message}`)
  return pagina(await montarMovimentacoes((data ?? []) as Record<string, unknown>[]), count ?? 0, f)
}

export async function reservasDoCondutor(
  usuarioId: string,
  f: FiltroBase & { situacao?: SituacaoAgendamento | null }
): Promise<Pagina<Agendamento>> {
  const admin = await createAdminClient()
  let q = admin
    .from("veiculos_agendamentos")
    .select("*", { count: "exact" })
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("condutor_id", usuarioId)
  if (f.veiculoId) q = q.eq("veiculo_id", f.veiculoId)
  if (f.de) q = q.gte("data_retirada", f.de)
  if (f.ate) q = q.lte("data_retirada", `${f.ate}T23:59:59`)
  if (f.situacao) q = q.eq("situacao", f.situacao)
  const [de, ate] = faixa(f)
  const { data, count, error } = await q
    .order(f.ordem.coluna, { ascending: f.ordem.asc, nullsFirst: false })
    .order("id")
    .range(de, ate)
  if (error) throw new Error(`Falha ao listar reservas: ${error.message}`)
  return pagina(await montarAgendamentos((data ?? []) as Record<string, unknown>[]), count ?? 0, f)
}

export async function abastecimentosDoCondutor(
  usuarioId: string,
  f: FiltroBase & { combustivel?: string | null; busca?: string | null }
): Promise<Pagina<Abastecimento>> {
  const admin = await createAdminClient()
  let q = admin
    .from("veiculos_abastecimentos")
    .select("*", { count: "exact" })
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("usuario_id", usuarioId)
  if (f.veiculoId) q = q.eq("veiculo_id", f.veiculoId)
  if (f.de) q = q.gte("data_hora_abastecimento", `${f.de}T00:00:00-03:00`)
  if (f.ate) q = q.lte("data_hora_abastecimento", `${f.ate}T23:59:59-03:00`)
  if (f.combustivel) q = q.eq("combustivel", f.combustivel)
  const busca = (f.busca ?? "").replace(/[,()%]/g, " ").trim()
  if (busca) q = q.or(`posto.ilike.%${busca}%,cidade.ilike.%${busca}%`)
  const [de, ate] = faixa(f)
  const { data, count, error } = await q
    .order(f.ordem.coluna, { ascending: f.ordem.asc, nullsFirst: false })
    .order("id")
    .range(de, ate)
  if (error) throw new Error(`Falha ao listar abastecimentos: ${error.message}`)
  return pagina(await montarAbastecimentos((data ?? []) as Record<string, unknown>[]), count ?? 0, f)
}

export async function infracoesDoCondutor(
  usuarioId: string,
  f: FiltroBase & { cobranca?: SituacaoCobranca | "sem" | null; tipo?: string | null }
): Promise<Pagina<Infracao>> {
  const admin = await createAdminClient()
  let q = admin.from("veiculos_infracoes").select("*", { count: "exact" }).eq("condutor_infrator_id", usuarioId)
  if (f.veiculoId) q = q.eq("veiculo_id", f.veiculoId)
  if (f.de) q = q.gte("infracao_data", f.de)
  if (f.ate) q = q.lte("infracao_data", `${f.ate}T23:59:59`)
  if (f.cobranca === "sem") q = q.is("cobranca_situacao", null)
  else if (f.cobranca) q = q.eq("cobranca_situacao", f.cobranca)
  if (f.tipo) q = q.eq("infracao_tipo", f.tipo)
  const [de, ate] = faixa(f)
  const { data, count, error } = await q
    .order(f.ordem.coluna, { ascending: f.ordem.asc, nullsFirst: false })
    .order("id")
    .range(de, ate)
  if (error) throw new Error(`Falha ao listar infrações: ${error.message}`)
  return pagina(await montarInfracoes((data ?? []) as Record<string, unknown>[]), count ?? 0, f)
}

export type ChecklistDoCondutor = {
  id: string
  veiculoId: string
  veiculoRotulo: string
  realizadoEm: string
  hodometro: number | null
  pendencias: number
  observacoes: string | null
}

export async function checklistsDoCondutor(
  usuarioId: string,
  f: FiltroBase & { comPendencia?: boolean }
): Promise<Pagina<ChecklistDoCondutor>> {
  const admin = await createAdminClient()
  let q = admin
    .from("veiculos_checklists")
    .select("id, veiculo_id, realizado_em, hodometro, pendencias, observacoes", { count: "exact" })
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("inspetor_id", usuarioId)
  if (f.veiculoId) q = q.eq("veiculo_id", f.veiculoId)
  if (f.de) q = q.gte("realizado_em", `${f.de}T00:00:00-03:00`)
  if (f.ate) q = q.lte("realizado_em", `${f.ate}T23:59:59-03:00`)
  if (f.comPendencia) q = q.gt("pendencias", 0)
  const [de, ate] = faixa(f)
  const { data, count, error } = await q
    .order(f.ordem.coluna, { ascending: f.ordem.asc, nullsFirst: false })
    .order("id")
    .range(de, ate)
  if (error) return pagina([], 0, f) // checklist ainda não configurado no tenant
  const rotulos = await rotulosDeVeiculos(admin, (data ?? []).map((c) => String(c.veiculo_id)))
  return pagina(
    (data ?? []).map((c) => ({
      id: String(c.id),
      veiculoId: String(c.veiculo_id),
      veiculoRotulo: rotulos.get(String(c.veiculo_id)) ?? "(veículo removido)",
      realizadoEm: String(c.realizado_em),
      hodometro: numero(c.hodometro),
      pendencias: numero(c.pendencias) ?? 0,
      observacoes: texto(c.observacoes),
    })),
    count ?? 0,
    f
  )
}

