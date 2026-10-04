import "server-only"

import { serieFrota } from "@/lib/db/analitica"
import { hojeSP, texto } from "@/lib/db/comum"
import { listarSolicitacoesDiaria } from "@/lib/db/diarias"
import { listarHoteis } from "@/lib/db/hospedagem"
import { listarVeiculos } from "@/lib/db/veiculos"
import { listarViagens } from "@/lib/db/viagens"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * CUSTOS CONSOLIDADOS (onda 4, I7): o que a entidade gasta com frota (por
 * veículo e por km), hospedagem (por hotel), viagens (por pessoa e por
 * departamento) e diárias, nos últimos 12 meses. Frota vem da camada
 * analítica (fato_frota_mensal); o resto é lido na hora.
 */

export type CustoVeiculo = {
  veiculoId: string
  placa: string | null
  modelo: string | null
  abastecimento: number
  litros: number
  manutencao: number
  multas: number
  aluguel: number
  total: number
  km: number
  /** R$ por km rodado (null sem km). */
  custoKm: number | null
  kmPorLitro: number | null
}

export type CustoHotel = { hotelId: string; hotel: string; quartos: number; hospedes: number; total: number; mediaPorQuarto: number | null }
export type CustoPessoa = { chave: string; nome: string; departamento: string | null; viagens: number; valorViagens: number; diarias: number; valorDiarias: number; total: number }
export type CustoDepartamento = { departamento: string; viagens: number; valorViagens: number; diarias: number; valorDiarias: number; total: number }
export type CustoMes = { mes: string; frota: number; hospedagem: number; viagens: number; diarias: number }

export type Custos = {
  meses: string[]
  porMes: CustoMes[]
  frota: { disponivel: boolean; veiculos: CustoVeiculo[]; total: number; km: number }
  hospedagem: { hoteis: CustoHotel[]; total: number; quartos: number }
  viagens: { total: number; quantidade: number }
  diarias: { total: number; quantidade: number }
  pessoas: CustoPessoa[]
  departamentos: CustoDepartamento[]
}

function mesesAtras(n: number): string[] {
  const hoje = hojeSP()
  const [a, m] = hoje.split("-").map(Number)
  const lista: string[] = []
  for (let i = n - 1; i >= 0; i--) lista.push(new Date(Date.UTC(a, m - 1 - i, 1)).toISOString().slice(0, 7))
  return lista
}

export async function custosConsolidados(): Promise<Custos> {
  const meses = mesesAtras(12)
  const inicio = `${meses[0]}-01`
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const porMes = new Map<string, CustoMes>(meses.map((m) => [m, { mes: m, frota: 0, hospedagem: 0, viagens: 0, diarias: 0 }]))
  const soma = (mes: string | null, campo: keyof Omit<CustoMes, "mes">, valor: number) => {
    if (!mes) return
    const chave = mes.slice(0, 7)
    const linha = porMes.get(chave)
    if (linha) linha[campo] += valor
  }

  const [frotaSerie, veiculos, hoteis, servicos, viagens, diarias] = await Promise.all([
    serieFrota(12).catch(() => ({ disponivel: false, linhas: [] })),
    listarVeiculos({ situacao: "todos" }).catch(() => []),
    listarHoteis().catch(() => []),
    admin
      .from("hospedagem_servico")
      .select("id, hotel_id, checkin_date, quant_ocupantes, custo_entidade")
      .eq("emp_proprietaria_id", emp)
      .gte("checkin_date", inicio)
      .not("custo_entidade", "is", null)
      .limit(5000),
    listarViagens().catch(() => ({ disponivel: false, viagens: [] })),
    listarSolicitacoesDiaria().catch(() => ({ disponivel: false, solicitacoes: [] })),
  ])

  // ── Frota ──────────────────────────────────────────────────────────────────
  const nomeVeiculo = new Map((veiculos as { id: string; placa: string | null; marca_modelo: string | null }[]).map((v) => [v.id, v]))
  const porVeiculo = new Map<string, CustoVeiculo>()
  for (const l of frotaSerie.linhas) {
    const v = porVeiculo.get(l.veiculoId) ?? {
      veiculoId: l.veiculoId,
      placa: nomeVeiculo.get(l.veiculoId)?.placa ?? null,
      modelo: nomeVeiculo.get(l.veiculoId)?.marca_modelo ?? null,
      abastecimento: 0,
      litros: 0,
      manutencao: 0,
      multas: 0,
      aluguel: 0,
      total: 0,
      km: 0,
      custoKm: null,
      kmPorLitro: null,
    }
    v.abastecimento += l.abastecimentoValor
    v.litros += l.abastecimentoLitros
    v.manutencao += l.manutencaoValor
    v.multas += l.multasValor
    v.aluguel += l.aluguelValor
    v.km += l.kmRodados
    porVeiculo.set(l.veiculoId, v)
    soma(l.mes, "frota", l.abastecimentoValor + l.manutencaoValor + l.multasValor + l.aluguelValor)
  }
  const veiculosCusto = [...porVeiculo.values()]
    .map((v) => {
      v.total = v.abastecimento + v.manutencao + v.multas + v.aluguel
      v.custoKm = v.km > 0 ? v.total / v.km : null
      v.kmPorLitro = v.litros > 0 && v.km > 0 ? v.km / v.litros : null
      return v
    })
    .sort((a, b) => b.total - a.total)

  // ── Hospedagem ─────────────────────────────────────────────────────────────
  const nomeHotel = new Map((hoteis as { id: string; nome: string | null }[]).map((h) => [h.id, h.nome ?? "Hotel"]))
  const porHotel = new Map<string, CustoHotel>()
  for (const s of servicos.data ?? []) {
    const hotelId = String(s.hotel_id ?? "")
    const custo = Number(s.custo_entidade ?? 0)
    const h = porHotel.get(hotelId) ?? { hotelId, hotel: nomeHotel.get(hotelId) ?? "Hotel", quartos: 0, hospedes: 0, total: 0, mediaPorQuarto: null }
    h.quartos++
    h.hospedes += Number(s.quant_ocupantes ?? 0)
    h.total += custo
    porHotel.set(hotelId, h)
    soma(texto(s.checkin_date), "hospedagem", custo)
  }
  const hoteisCusto = [...porHotel.values()].map((h) => ({ ...h, mediaPorQuarto: h.quartos ? h.total / h.quartos : null })).sort((a, b) => b.total - a.total)

  // ── Viagens e diárias por pessoa e departamento ────────────────────────────
  const pessoas = new Map<string, CustoPessoa>()
  const departamentos = new Map<string, CustoDepartamento>()
  const pessoa = (chave: string, nome: string, departamento: string | null) => {
    const p = pessoas.get(chave) ?? { chave, nome, departamento, viagens: 0, valorViagens: 0, diarias: 0, valorDiarias: 0, total: 0 }
    pessoas.set(chave, p)
    return p
  }
  const depto = (nome: string | null) => {
    const chave = nome ?? "Sem departamento"
    const d = departamentos.get(chave) ?? { departamento: chave, viagens: 0, valorViagens: 0, diarias: 0, valorDiarias: 0, total: 0 }
    departamentos.set(chave, d)
    return d
  }
  let totalViagens = 0
  let qtdViagens = 0
  for (const v of viagens.viagens) {
    if (v.situacao === "cancelada" || v.situacao === "recusada") continue
    const data = v.inicio ?? v.createdAt.slice(0, 10)
    if (data < inicio) continue
    const valor = v.itens.reduce((s, i) => s + (i.valor ?? 0), 0)
    if (valor <= 0) continue
    totalViagens += valor
    qtdViagens++
    const p = pessoa(v.beneficiarioUsuarioId ?? `conv:${v.beneficiarioNome}`, v.beneficiarioNome, v.departamentoNome)
    p.viagens++
    p.valorViagens += valor
    const d = depto(v.departamentoNome)
    d.viagens++
    d.valorViagens += valor
    soma(data, "viagens", valor)
  }
  let totalDiarias = 0
  let qtdDiarias = 0
  for (const s of diarias.solicitacoes) {
    if (s.situacao !== "aprovada") continue
    const data = s.data_inicio ?? s.avaliacao_data
    if (!data || data.slice(0, 10) < inicio) continue
    const valor = (s.valor_total ?? 0) + s.valorDespesas
    if (valor <= 0) continue
    totalDiarias += valor
    qtdDiarias++
    const p = pessoa(s.funcionario_id ?? `nome:${s.funcionarioNome}`, s.funcionarioNome ?? "—", s.departamentoNome)
    p.diarias++
    p.valorDiarias += valor
    const d = depto(s.departamentoNome)
    d.diarias++
    d.valorDiarias += valor
    soma(data, "diarias", valor)
  }
  const pessoasCusto = [...pessoas.values()].map((p) => ({ ...p, total: p.valorViagens + p.valorDiarias })).sort((a, b) => b.total - a.total).slice(0, 30)
  const departamentosCusto = [...departamentos.values()].map((d) => ({ ...d, total: d.valorViagens + d.valorDiarias })).sort((a, b) => b.total - a.total)

  return {
    meses,
    porMes: meses.map((m) => porMes.get(m)!),
    frota: { disponivel: frotaSerie.disponivel, veiculos: veiculosCusto, total: veiculosCusto.reduce((s, v) => s + v.total, 0), km: veiculosCusto.reduce((s, v) => s + v.km, 0) },
    hospedagem: { hoteis: hoteisCusto, total: hoteisCusto.reduce((s, h) => s + h.total, 0), quartos: hoteisCusto.reduce((s, h) => s + h.quartos, 0) },
    viagens: { total: totalViagens, quantidade: qtdViagens },
    diarias: { total: totalDiarias, quantidade: qtdDiarias },
    pessoas: pessoasCusto,
    departamentos: departamentosCusto,
  }
}
