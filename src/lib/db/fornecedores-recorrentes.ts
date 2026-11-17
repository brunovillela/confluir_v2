import "server-only"

import { regrasConfiguradas } from "@/lib/db/auditoria-regras"
import { esquemaAusente, hojeSP, lerEmLotes, lerEmLotesPorIds } from "@/lib/db/comum"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * FORNECEDORES RECORRENTES SEM CONTRATO (17/11/2026). Compra repetida no
 * mesmo fornecedor (lanche semanal, hotel, gráfica) feita como compra avulsa:
 * a lista mostra onde vale firmar um contrato ou uma tabela de preços.
 *
 * Entram as compras não canceladas dos últimos N meses (direta ou via
 * Aquisição). Ficam de fora os marketplaces (cada compra é de um vendedor) e
 * quem já tem contrato em uso — não vencido, ativo, fora as ajudas
 * institucionais, como na Saúde dos contratos.
 */

type Linha = Record<string, unknown>
const t = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null)

export const PERIODOS_RECORRENTES = [3, 6, 12] as const
export type PeriodoRecorrentes = (typeof PERIODOS_RECORRENTES)[number]
/** A partir de quantas compras no período o fornecedor é "recorrente". */
export const MINIMO_COMPRAS_RECORRENTE = 3
/** Sem a regra configurada, o mesmo padrão da "Aquisição direta acima do limite". */
const LIMITE_PADRAO = 10000

export type FornecedorRecorrente = {
  fornecedorId: string
  nome: string
  compras: number
  total: number
  /** Meses distintos com compra (constância). */
  meses: number
  departamentos: string[]
  primeira: string
  ultima: string
  /** As compras, da mais recente: id e código do processo. */
  processos: { id: string; codigo: string | null; data: string; valor: number }[]
}

export type RecorrentesSemContrato = {
  meses: PeriodoRecorrentes
  desde: string
  /** Total a partir do qual o fornecedor entra (o limite da aquisição direta). */
  totalMinimo: number
  linhas: FornecedorRecorrente[]
  disponivel: boolean
}

function mesesAtras(hoje: string, meses: number): string {
  const d = new Date(`${hoje}T12:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() - meses)
  return d.toISOString().slice(0, 10)
}

/** O limite da aquisição direta configurado na auditoria (R$). */
async function limiteAquisicaoDireta(): Promise<number> {
  const regra = (await regrasConfiguradas("compras")).find((r) => r.regra.codigo === "direta_limite")
  return Number(regra?.parametros.valor) || LIMITE_PADRAO
}

export async function fornecedoresRecorrentesSemContrato(
  opcoes: { meses?: number } = {}
): Promise<RecorrentesSemContrato> {
  const meses: PeriodoRecorrentes = (PERIODOS_RECORRENTES as readonly number[]).includes(opcoes.meses ?? 0)
    ? (opcoes.meses as PeriodoRecorrentes)
    : 6
  const hoje = hojeSP()
  const desde = mesesAtras(hoje, meses)
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const totalMinimo = await limiteAquisicaoDireta()
  const vazio: RecorrentesSemContrato = { meses, desde, totalMinimo, linhas: [], disponivel: false }

  let fornecimentos: Linha[]
  let contratos: Linha[]
  try {
    ;[fornecimentos, contratos] = await Promise.all([
      lerEmLotes<Linha>((de, ate) =>
        admin
          .from("compras_fornecimentos")
          .select("id, processo_id, fornecedor_id, valor, data_compra, cancelamento_desfecho, cancelamento_parcial")
          .eq("emp_proprietaria_id", emp)
          .gte("data_compra", desde)
          .not("fornecedor_id", "is", null)
          .order("id")
          .range(de, ate)
      ),
      lerEmLotes<Linha>((de, ate) =>
        admin
          .from("contratos")
          .select("id, fornecedor_id, ativo, vigencia_termino, apoio_institucional")
          .eq("emp_proprietaria_id", emp)
          .not("deletado", "is", true)
          .not("fornecedor_id", "is", null)
          .order("id")
          .range(de, ate)
      ),
    ])
  } catch (e) {
    if (esquemaAusente(e as { code?: string })) return vazio
    throw new Error(`Falha ao ler as compras: ${(e as Error).message}`)
  }

  const comContrato = new Set(
    contratos
      .filter(
        (c) =>
          c.apoio_institucional !== true &&
          c.ativo !== false &&
          (!t(c.vigencia_termino) || String(c.vigencia_termino).slice(0, 10) >= hoje)
      )
      .map((c) => String(c.fornecedor_id))
  )
  // Compra cancelada por inteiro não conta; a parcial, sim.
  const vivos = fornecimentos.filter(
    (f) => !comContrato.has(String(f.fornecedor_id)) && (!f.cancelamento_desfecho || f.cancelamento_parcial === true)
  )
  if (!vivos.length) return { ...vazio, disponivel: true }

  const [processos, empresas] = await Promise.all([
    lerEmLotesPorIds<Linha>(
      vivos.map((f) => String(f.processo_id)),
      (fatia, de, ate) =>
        admin
          .from("compras_solicitacoes")
          .select("id, codigo, cancelado, solicitacao_departamento_id")
          .in("id", fatia)
          .order("id")
          .range(de, ate)
    ),
    lerEmLotesPorIds<Linha>(
      vivos.map((f) => String(f.fornecedor_id)),
      (fatia, de, ate) =>
        admin
          .from("empresa")
          .select("id, nome_fantasia, nome_razao, marketplace")
          .in("id", fatia)
          .order("id")
          .range(de, ate)
    ),
  ])
  const procPorId = new Map(processos.map((p) => [String(p.id), p]))
  const empPorId = new Map(empresas.map((e) => [String(e.id), e]))

  type Acumulado = { processos: Map<string, { codigo: string | null; data: string; valor: number }>; deps: Set<string> }
  const grupos = new Map<string, Acumulado>()
  for (const f of vivos) {
    const p = procPorId.get(String(f.processo_id))
    const e = empPorId.get(String(f.fornecedor_id))
    if (!p || p.cancelado === true || !e || e.marketplace === true) continue
    const g = grupos.get(String(f.fornecedor_id)) ?? { processos: new Map(), deps: new Set<string>() }
    // Vários fornecimentos do mesmo processo contam como uma compra.
    const id = String(p.id)
    const atual = g.processos.get(id)
    const data = String(f.data_compra).slice(0, 10)
    g.processos.set(id, {
      codigo: t(p.codigo),
      data: atual && atual.data > data ? atual.data : data,
      valor: (atual?.valor ?? 0) + (Number(f.valor) || 0),
    })
    if (t(p.solicitacao_departamento_id)) g.deps.add(String(p.solicitacao_departamento_id))
    grupos.set(String(f.fornecedor_id), g)
  }

  const candidatos = [...grupos].filter(([, g]) => g.processos.size >= MINIMO_COMPRAS_RECORRENTE)
  const depIds = [...new Set(candidatos.flatMap(([, g]) => [...g.deps]))]
  const { data: deps } = depIds.length
    ? await admin.from("empresa_departamentos").select("id, departamento").in("id", depIds)
    : { data: [] as Linha[] }
  const nomeDep = new Map(((deps ?? []) as Linha[]).map((d) => [String(d.id), t(d.departamento) ?? "(sem nome)"]))

  const linhas = candidatos
    .map(([fornecedorId, g]): FornecedorRecorrente => {
      const lista = [...g.processos].map(([id, x]) => ({ id, ...x })).sort((a, b) => b.data.localeCompare(a.data))
      const e = empPorId.get(fornecedorId)!
      return {
        fornecedorId,
        nome: t(e.nome_fantasia) ?? t(e.nome_razao) ?? "(sem nome)",
        compras: lista.length,
        total: Math.round(lista.reduce((s, x) => s + x.valor, 0) * 100) / 100,
        meses: new Set(lista.map((x) => x.data.slice(0, 7))).size,
        departamentos: [...g.deps].map((d) => nomeDep.get(d) ?? "(sem nome)").sort((a, b) => a.localeCompare(b, "pt-BR")),
        primeira: lista[lista.length - 1].data,
        ultima: lista[0].data,
        processos: lista,
      }
    })
    .filter((l) => l.total >= totalMinimo)
    .sort((a, b) => b.total - a.total)

  return { meses, desde, totalMinimo, linhas, disponivel: true }
}
