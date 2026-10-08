import "server-only"

import { esquemaAusente, nomesDosUsuarios } from "@/lib/db/comum"
import { empresasPorId } from "@/lib/db/compras"
import { filtroDoEscopo, type EscopoCompras } from "@/lib/db/compras-acesso"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Indicadores analíticos de Aquisição (página principal): o que foi comprado
 * no período, por fornecedor, tipo, modalidade, comprador, departamento e
 * mês. Só compras efetivadas e não canceladas, dentro do escopo da pessoa
 * (os departamentos que ela alcança + as que ela registrou) — cada um vê os
 * números do que pode ver.
 *
 * Compra via Aquisição pode ter vários fornecimentos (fornecedores e
 * compradores diferentes): aí o rateio é pelo fornecimento; sem eles (compra
 * direta, legado), vale o processo.
 */

export const PERIODOS_INDICADORES = {
  "12m": "Últimos 12 meses",
  ano: "Este ano",
  anterior: "Ano passado",
} as const
export type PeriodoIndicadores = keyof typeof PERIODOS_INDICADORES

export type Fatia = { chave: string; nome: string; valor: number; quantidade: number }

export type IndicadoresCompras = {
  periodo: PeriodoIndicadores
  de: string
  ate: string
  total: number
  quantidade: number
  ticketMedio: number
  modalidade: { direta: Fatia; via: Fatia; semDado: Fatia }
  tipo: { produto: Fatia; servico: Fatia; semDado: Fatia }
  /** Um ponto por mês do período ("AAAA-MM-01"). */
  porMes: { mes: string; valor: number; quantidade: number }[]
  fornecedores: Fatia[]
  compradores: Fatia[]
  departamentos: Fatia[]
  /** Quantos fornecedores distintos (o ranking mostra só os maiores). */
  totalFornecedores: number
}

const LOTE = 1000
const TOPO = 8

function hojeSPISO(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date())
}

function intervalo(periodo: PeriodoIndicadores): { de: string; ate: string } {
  const hoje = hojeSPISO()
  const [a, m] = hoje.split("-").map(Number)
  if (periodo === "ano") return { de: `${a}-01-01`, ate: hoje }
  if (periodo === "anterior") return { de: `${a - 1}-01-01`, ate: `${a - 1}-12-31` }
  // 12 meses fechando no mês atual: do dia 1º do mesmo mês do ano passado + 1.
  const inicio = new Date(Date.UTC(a, m - 1 - 11, 1))
  return { de: inicio.toISOString().slice(0, 10), ate: hoje }
}

function mesesEntre(de: string, ate: string): string[] {
  const [a0, m0] = de.split("-").map(Number)
  const [a1, m1] = ate.split("-").map(Number)
  const meses: string[] = []
  for (let a = a0, m = m0; a < a1 || (a === a1 && m <= m1); m === 12 ? (a++, (m = 1)) : m++) {
    meses.push(`${a}-${String(m).padStart(2, "0")}-01`)
  }
  return meses
}

/** Soma por chave e devolve o ranking com o resto em "Outros". */
function ranking(mapa: Map<string, Fatia>, topo = TOPO): Fatia[] {
  const ordenado = [...mapa.values()].sort((x, y) => y.valor - x.valor)
  if (ordenado.length <= topo) return ordenado
  const resto = ordenado.slice(topo - 1)
  return [
    ...ordenado.slice(0, topo - 1),
    {
      chave: "outros",
      nome: `Outros (${resto.length})`,
      valor: resto.reduce((s, f) => s + f.valor, 0),
      quantidade: resto.reduce((s, f) => s + f.quantidade, 0),
    },
  ]
}

function somar(mapa: Map<string, Fatia>, chave: string, valor: number, quantidade = 1) {
  const f = mapa.get(chave) ?? { chave, nome: chave, valor: 0, quantidade: 0 }
  f.valor += valor
  f.quantidade += quantidade
  mapa.set(chave, f)
}

const fatia = (chave: string, nome: string): Fatia => ({ chave, nome, valor: 0, quantidade: 0 })

export async function indicadoresCompras(
  escopo: EscopoCompras,
  periodo: PeriodoIndicadores = "12m"
): Promise<IndicadoresCompras | null> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { de, ate } = intervalo(periodo)
  const filtro = filtroDoEscopo(escopo)

  // Em lotes: o PostgREST corta em 1.000 linhas.
  const processos: Record<string, unknown>[] = []
  for (let i = 0; i < 50; i++) {
    let q = admin
      .from("compras_solicitacoes")
      .select(
        "id, compra_valor, compra_data, compra_fornecedor_id, comprado_por_id, solicitacao_e_produto, aquisicao_direta, solicitacao_departamento_id"
      )
      .eq("emp_proprietaria_id", emp)
      .eq("comprado", true)
      .eq("cancelado", false)
      .gte("compra_data", de)
      .lte("compra_data", ate)
    if (filtro) q = q.or(filtro)
    const { data, error } = await q.order("id").range(i * LOTE, i * LOTE + LOTE - 1)
    if (error) {
      if (esquemaAusente(error)) return null
      throw new Error(`Falha ao ler as compras: ${error.message}`)
    }
    processos.push(...(data ?? []))
    if ((data ?? []).length < LOTE) break
  }

  // Fornecimentos das compras via Aquisição (rateio por fornecedor/comprador).
  const fornecimentosPorProcesso = new Map<string, Record<string, unknown>[]>()
  // A tabela é pequena perto dos processos: lê a do tenant em lotes e filtra
  // aqui, em vez de um .in() por fatia de milhares de ids.
  const ids = new Set(processos.map((p) => String(p.id)))
  for (let i = 0; i < 50 && ids.size > 0; i++) {
    const { data, error } = await admin
      .from("compras_fornecimentos")
      .select("processo_id, fornecedor_id, comprador_id, valor")
      .eq("emp_proprietaria_id", emp)
      .order("id")
      .range(i * LOTE, i * LOTE + LOTE - 1)
    if (error) break
    for (const f of data ?? []) {
      if (!ids.has(String(f.processo_id))) continue
      const lista = fornecimentosPorProcesso.get(String(f.processo_id)) ?? []
      lista.push(f)
      fornecimentosPorProcesso.set(String(f.processo_id), lista)
    }
    if ((data ?? []).length < LOTE) break
  }

  const meses = mesesEntre(de, ate)
  const porMes = new Map(meses.map((m) => [m, { mes: m, valor: 0, quantidade: 0 }]))
  const fornecedores = new Map<string, Fatia>()
  const compradores = new Map<string, Fatia>()
  const departamentos = new Map<string, Fatia>()
  const modalidade = { direta: fatia("direta", "Aquisição direta"), via: fatia("via", "Via Aquisição"), semDado: fatia("sem", "Sem o dado (legado)") }
  const tipo = { produto: fatia("produto", "Bem / produto"), servico: fatia("servico", "Prestação de serviço"), semDado: fatia("sem", "Sem o dado") }
  let total = 0

  for (const p of processos) {
    const valor = Number(p.compra_valor ?? 0)
    total += valor
    const mes = `${String(p.compra_data).slice(0, 7)}-01`
    const pm = porMes.get(mes)
    if (pm) {
      pm.valor += valor
      pm.quantidade += 1
    }
    const mod = p.aquisicao_direta === true ? modalidade.direta : p.aquisicao_direta === false ? modalidade.via : modalidade.semDado
    mod.valor += valor
    mod.quantidade += 1
    const tp = p.solicitacao_e_produto === true ? tipo.produto : p.solicitacao_e_produto === false ? tipo.servico : tipo.semDado
    tp.valor += valor
    tp.quantidade += 1
    somar(departamentos, String(p.solicitacao_departamento_id ?? "sem"), valor)

    const fs = fornecimentosPorProcesso.get(String(p.id))
    if (fs && fs.length > 0) {
      for (const f of fs) {
        const v = Number(f.valor ?? 0)
        somar(fornecedores, String(f.fornecedor_id ?? "sem"), v)
        somar(compradores, String(f.comprador_id ?? p.comprado_por_id ?? "sem"), v)
      }
    } else {
      somar(fornecedores, String(p.compra_fornecedor_id ?? "sem"), valor)
      somar(compradores, String(p.comprado_por_id ?? "sem"), valor)
    }
  }

  // Nomes só do que entra nos rankings.
  const topo = (m: Map<string, Fatia>) =>
    [...m.values()].sort((x, y) => y.valor - x.valor).slice(0, TOPO).map((f) => f.chave).filter((k) => k !== "sem")
  const [nomesEmpresas, nomesUsuarios, nomesDeptos] = await Promise.all([
    empresasPorId(topo(fornecedores)),
    nomesDosUsuarios(topo(compradores)),
    (async () => {
      const chaves = topo(departamentos)
      if (!chaves.length) return new Map<string, string>()
      const { data } = await admin.from("empresa_departamentos").select("id, departamento").in("id", chaves)
      return new Map((data ?? []).map((d) => [String(d.id), String(d.departamento ?? "(sem nome)")]))
    })(),
  ])
  const nomear = (m: Map<string, Fatia>, nomes: (k: string) => string | undefined, semNome: string) => {
    for (const f of m.values()) f.nome = f.chave === "sem" ? semNome : (nomes(f.chave) ?? "(sem nome)")
  }
  nomear(fornecedores, (k) => nomesEmpresas.get(k)?.nome, "Sem fornecedor informado")
  nomear(compradores, (k) => nomesUsuarios.get(k), "Sem comprador informado")
  nomear(departamentos, (k) => nomesDeptos.get(k), "Sem departamento")

  const quantidade = processos.length
  return {
    periodo,
    de,
    ate,
    total,
    quantidade,
    ticketMedio: quantidade ? total / quantidade : 0,
    modalidade,
    tipo,
    porMes: [...porMes.values()],
    fornecedores: ranking(fornecedores),
    compradores: ranking(compradores),
    departamentos: ranking(departamentos),
    totalFornecedores: [...fornecedores.keys()].filter((k) => k !== "sem").length,
  }
}
