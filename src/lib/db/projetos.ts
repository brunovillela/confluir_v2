import "server-only"
import { esquemaAusente, hojeSP, lerEmLotesPorIds, texto } from "@/lib/db/comum"
import { situacaoDoProjeto, type NivelProjeto } from "@/lib/projetos-constantes"
import { tenantAtual } from "@/lib/tenant"

import { derivarSituacao } from "@/lib/db/compras"
import { ROTULOS_SITUACAO_PROCESSO } from "@/lib/compras-constantes"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Projetos — tabela `projeto` (101 registros migrados do Bubble). É a dimensão
 * orçamentária que amarra Compras (`compras_solicitacoes.solicitacao_projeto_id`),
 * ordens de pagamento (`ordens_pagamento.projeto_id`) e reembolsos
 * (`filiacao_reembolsos.projeto_id`). O gasto exibido vem das ordens — ver
 * gastosDosProjetos (`ordens_pagamento_raw` do legado veio vazio e não é usado).
 *
 * Convenções da tabela:
 * • `descricao_sumaria` = título do projeto (o campo `descricao` veio sempre nulo).
 * • `detalhamento` = texto longo.
 * • `tipo` ∈ TIPOS_PROJETO (sempre preenchido).
 * • `finalizado` deriva a situação; `estrategico` existe mas nunca foi usado.
 * • `departamentos_assoc_raw` = array de bubble_ids de `empresa_departamentos`.
 */

function numero(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null
}

/** JSONB que pode ter vindo como string serializada na migração (padrão Bubble). */
function listaJsonb(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String)
  if (typeof v === "string" && v.trim().startsWith("[")) {
    try {
      const arr = JSON.parse(v)
      return Array.isArray(arr) ? arr.map(String) : []
    } catch {
      return []
    }
  }
  return []
}

// ── Gasto por projeto (compras, custeios, ordens e reembolsos) ───────────────

/**
 * GASTO REAL DO PROJETO (25/11/2026). Antes, só a soma das compras: as ordens
 * de pagamento e os reembolsos ligados ao projeto (60 e 44 desde a virada)
 * não apareciam, e a compra cancelada contava. Agora o gasto são as ORDENS:
 * a da compra do projeto, a do custeio do projeto (26/11), a lançada direto
 * no projeto e a de um reembolso do projeto — cada uma uma vez só. A compra e
 * o custeio mandam: as ordens deles são do projeto deles (no banco, os
 * gatilhos das migrações 20261126021530 e 20261126023552 copiam o projeto
 * para as ordens). Cancelada, estornada ou excluída não conta. A compra, o
 * custeio ou o reembolso do projeto ainda sem ordem entra como comprometido.
 */
export type GastoProjeto = {
  /** Ordens pagas. */
  pago: number
  /** Ordens ainda não pagas (em autorização, a pagar, aguardando documento…). */
  aPagar: number
  /** Compras, custeios e reembolsos do projeto que ainda não viraram ordem. */
  comprometido: number
  /** pago + aPagar + comprometido. */
  total: number
  ordens: number
  /** Reembolsos a filiados: só a soma (o detalhe fica em Reembolsos). */
  reembolsos: { quantidade: number; total: number }
  solicitacoes: number
  custeios: number
  /** Viagens do projeto (passagens e hospedagens) e o que elas custam. */
  viagens: { quantidade: number; total: number }
  /** Diárias do projeto (com as despesas): só a soma, como os reembolsos. */
  diarias: { quantidade: number; total: number }
}

export type ViagemDoProjeto = {
  id: string
  numero: number | null
  situacao: string
  /** "2 passagens, 1 hospedagem" — sem o nome de quem viaja. */
  resumo: string
  evento: string | null
  /** Faturado (com a parte da taxa) ou, antes da fatura, o valor reservado. */
  valor: number
  pago: number
  faturado: number
}

export type OrdemDoProjeto = {
  id: string
  codigo: string | null
  descricao: string | null
  situacao: string | null
  valor: number
  data: string | null
  /** A compra do projeto de onde a ordem veio (a ordem vai junto com ela). */
  compraId: string | null
  /** O custeio do projeto de onde a ordem veio (idem). */
  custeioId: string | null
}

export type CusteioDoProjeto = {
  id: string
  codigo: string | null
  finalidade: string | null
  situacao: string
  /** Valor previsto: a parcela vezes o número de parcelas. */
  valor: number
  parcelas: number
}

const SITUACOES_FORA_DO_GASTO = new Set(["Cancelada", "Estornado"])
/** Custeio que ainda vai gerar despesa (sem ordem, entra como comprometido). */
const CUSTEIO_COMPROMETE = new Set(["aguardando_autorizacao", "autorizado"])

function gastoVazio(): GastoProjeto {
  return {
    pago: 0,
    aPagar: 0,
    comprometido: 0,
    total: 0,
    ordens: 0,
    reembolsos: { quantidade: 0, total: 0 },
    solicitacoes: 0,
    custeios: 0,
    viagens: { quantidade: 0, total: 0 },
    diarias: { quantidade: 0, total: 0 },
  }
}

function valorDaOrdem(o: Record<string, unknown>): number {
  return Number(o.valor_pago ?? o.valor_inicial_cobranca ?? o.valor ?? 0) || 0
}

function contaNoGasto(o: Record<string, unknown>): boolean {
  return o.excluido !== true && !SITUACOES_FORA_DO_GASTO.has(String(o.situacao ?? ""))
}

/** Custeios dos projetos. Sem a coluna (antes da migração 20261126023552), nenhum. */
async function custeiosDosProjetos(ids: string[]): Promise<Record<string, unknown>[]> {
  if (!ids.length) return []
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("institucional_custeios")
    .select("id, codigo, projeto_id, situacao, valor_parcela, num_parcelas, finalidade_id")
    .eq("emp_proprietaria_id", await tenantAtual())
    .in("projeto_id", ids)
    .not("excluido", "is", true)
    .order("created_at", { ascending: false })
  if (error) {
    if (esquemaAusente(error)) return []
    throw new Error(`Falha ao ler os custeios do projeto: ${error.message}`)
  }
  return (data ?? []) as Record<string, unknown>[]
}

async function gastosDosProjetos(projetoIds: string[]): Promise<{
  gastos: Map<string, GastoProjeto>
  ordens: Map<string, OrdemDoProjeto[]>
  custeios: Map<string, CusteioDoProjeto[]>
  viagens: Map<string, ViagemDoProjeto[]>
}> {
  const gastos = new Map<string, GastoProjeto>()
  const ordensPorProjeto = new Map<string, OrdemDoProjeto[]>()
  const custeiosPorProjeto = new Map<string, CusteioDoProjeto[]>()
  const ids = [...new Set(projetoIds.filter(Boolean))]
  if (ids.length === 0) return { gastos, ordens: ordensPorProjeto, custeios: custeiosPorProjeto, viagens: new Map() }

  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const COLUNAS_ORDEM =
    "id, codigo, descricao, situacao, excluido, tipo, valor, valor_pago, valor_inicial_cobranca, vencimento, data_pagamento, projeto_id, processo_compra_id, custeio_id"

  const [compras, reembolsos, ordensDiretas, custeios] = await Promise.all([
    lerEmLotesPorIds(ids, (fatia, de, ate) =>
      admin
        .from("compras_solicitacoes")
        .select("id, solicitacao_projeto_id, compra_valor, cancelado")
        .eq("emp_proprietaria_id", emp)
        .in("solicitacao_projeto_id", fatia)
        .order("id")
        .range(de, ate)
    ),
    lerEmLotesPorIds(ids, (fatia, de, ate) =>
      admin
        .from("filiacao_reembolsos")
        .select("id, projeto_id, ordem_pagamento_id, valor")
        .eq("emp_proprietaria_id", emp)
        .in("projeto_id", fatia)
        .order("id")
        .range(de, ate)
    ),
    lerEmLotesPorIds(ids, (fatia, de, ate) =>
      admin
        .from("ordens_pagamento")
        .select(COLUNAS_ORDEM)
        .eq("emp_proprietaria_id", emp)
        .in("projeto_id", fatia)
        .order("id")
        .range(de, ate)
    ),
    custeiosDosProjetos(ids),
  ])

  const projetoDaCompra = new Map(compras.map((c) => [String(c.id), String(c.solicitacao_projeto_id)]))
  const projetoDoCusteio = new Map(custeios.map((c) => [String(c.id), String(c.projeto_id)]))
  const ordens = new Map<string, Record<string, unknown>>(ordensDiretas.map((o) => [String(o.id), o]))
  const [dasCompras, dosCusteios] = await Promise.all([
    lerEmLotesPorIds([...projetoDaCompra.keys()], (fatia, de, ate) =>
      admin
        .from("ordens_pagamento")
        .select(COLUNAS_ORDEM)
        .eq("emp_proprietaria_id", emp)
        .in("processo_compra_id", fatia)
        .order("id")
        .range(de, ate)
    ),
    lerEmLotesPorIds([...projetoDoCusteio.keys()], (fatia, de, ate) =>
      admin
        .from("ordens_pagamento")
        .select(COLUNAS_ORDEM)
        .eq("emp_proprietaria_id", emp)
        .in("custeio_id", fatia)
        .order("id")
        .range(de, ate)
    ),
  ])
  for (const o of [...dasCompras, ...dosCusteios]) ordens.set(String(o.id), o)
  const faltam = reembolsos.map((r) => texto(r.ordem_pagamento_id)).filter((v): v is string => !!v && !ordens.has(v))
  const dosReembolsos = await lerEmLotesPorIds(faltam, (fatia, de, ate) =>
    admin.from("ordens_pagamento").select(COLUNAS_ORDEM).eq("emp_proprietaria_id", emp).in("id", fatia).order("id").range(de, ate)
  )
  for (const o of dosReembolsos) ordens.set(String(o.id), o)

  const projetoDoReembolsoPorOrdem = new Map<string, string>()
  for (const r of reembolsos) {
    const oid = texto(r.ordem_pagamento_id)
    if (oid) projetoDoReembolsoPorOrdem.set(oid, String(r.projeto_id))
  }
  const doProjeto = (pid: string) => {
    let g = gastos.get(pid)
    if (!g) gastos.set(pid, (g = gastoVazio()))
    return g
  }

  // Ordens: a compra manda, depois o custeio; senão, o projeto da própria
  // ordem ou o do reembolso.
  const comprasComOrdem = new Set<string>()
  const custeiosComOrdem = new Set<string>()
  for (const o of ordens.values()) {
    const id = String(o.id)
    const compra = texto(o.processo_compra_id)
    const custeio = texto(o.custeio_id)
    const daCompra = compra ? projetoDaCompra.get(compra) : undefined
    const doCusteio = custeio ? projetoDoCusteio.get(custeio) : undefined
    const pid = daCompra ?? doCusteio ?? texto(o.projeto_id) ?? projetoDoReembolsoPorOrdem.get(id)
    // A compra (ou o custeio) que já teve ordem sai do comprometido, mesmo com
    // a ordem cancelada — refeita, ganha outra ordem; não conta duas vezes.
    if (compra) comprasComOrdem.add(compra)
    if (custeio) custeiosComOrdem.add(custeio)
    if (!pid || !ids.includes(pid)) continue
    if (!contaNoGasto(o)) continue
    const g = doProjeto(pid)
    const valor = valorDaOrdem(o)
    if (o.situacao === "Paga") g.pago += valor
    else g.aPagar += valor
    g.ordens += 1
    const ehReembolso = !daCompra && !doCusteio && (projetoDoReembolsoPorOrdem.has(id) || o.tipo === "Reembolso")
    if (ehReembolso) {
      g.reembolsos.quantidade += 1
      g.reembolsos.total += valor
      continue
    }
    const lista = ordensPorProjeto.get(pid) ?? []
    lista.push({
      id,
      codigo: texto(o.codigo),
      descricao: texto(o.descricao),
      situacao: texto(o.situacao),
      valor,
      data: texto(o.data_pagamento) ?? texto(o.vencimento),
      compraId: daCompra ? compra : null,
      custeioId: !daCompra && doCusteio ? custeio : null,
    })
    ordensPorProjeto.set(pid, lista)
  }

  // Compras, custeios e reembolsos sem nenhuma ordem: comprometido.
  for (const c of compras) {
    const g = doProjeto(String(c.solicitacao_projeto_id))
    g.solicitacoes += 1
    if (c.cancelado === true || comprasComOrdem.has(String(c.id))) continue
    g.comprometido += numero(c.compra_valor) ?? 0
  }
  const finalidades = new Map<string, string>()
  const idsFinalidade = [...new Set(custeios.map((c) => texto(c.finalidade_id)).filter((v): v is string => !!v))]
  if (idsFinalidade.length) {
    const { data } = await admin.from("institucional_custeio_finalidades").select("id, nome").in("id", idsFinalidade)
    for (const f of data ?? []) finalidades.set(String(f.id), texto(f.nome) ?? "")
  }
  for (const c of custeios) {
    const pid = String(c.projeto_id)
    const g = doProjeto(pid)
    g.custeios += 1
    const parcelas = Number(c.num_parcelas ?? 1) || 1
    const valor = Math.round((Number(c.valor_parcela ?? 0) || 0) * parcelas * 100) / 100
    if (CUSTEIO_COMPROMETE.has(String(c.situacao)) && !custeiosComOrdem.has(String(c.id))) g.comprometido += valor
    const lista = custeiosPorProjeto.get(pid) ?? []
    lista.push({
      id: String(c.id),
      codigo: texto(c.codigo),
      finalidade: texto(c.finalidade_id) ? (finalidades.get(String(c.finalidade_id)) ?? null) : null,
      situacao: String(c.situacao ?? ""),
      valor,
      parcelas,
    })
    custeiosPorProjeto.set(pid, lista)
  }
  for (const r of reembolsos) {
    if (texto(r.ordem_pagamento_id)) continue
    const g = doProjeto(String(r.projeto_id))
    const valor = Number(r.valor ?? 0) || 0
    g.comprometido += valor
    g.reembolsos.quantidade += 1
    g.reembolsos.total += valor
  }

  // Viagens e diárias (26/11): o projeto fica no pedido, não na ordem (a
  // fatura e a remessa juntam pedidos de projetos diferentes numa ordem só).
  // A ordem que já entrou acima por outro caminho não conta de novo.
  const jaContadas = new Set(ordens.keys())
  const viagensPorProjeto = await viagensEDiariasDosProjetos(ids, jaContadas, doProjeto)

  for (const g of gastos.values()) {
    g.pago = Math.round(g.pago * 100) / 100
    g.aPagar = Math.round(g.aPagar * 100) / 100
    g.comprometido = Math.round(g.comprometido * 100) / 100
    g.reembolsos.total = Math.round(g.reembolsos.total * 100) / 100
    g.viagens.total = Math.round(g.viagens.total * 100) / 100
    g.diarias.total = Math.round(g.diarias.total * 100) / 100
    g.total = Math.round((g.pago + g.aPagar + g.comprometido) * 100) / 100
  }
  for (const lista of ordensPorProjeto.values()) lista.sort((a, b) => (b.data ?? "").localeCompare(a.data ?? ""))
  return { gastos, ordens: ordensPorProjeto, custeios: custeiosPorProjeto, viagens: viagensPorProjeto }
}

/** Viagem cancelada ou recusada: só conta o que já foi faturado. */
const VIAGEM_ENCERRADA_SEM_CUSTO = new Set(["cancelada", "recusada"])
/** Diária que ainda vai ser paga (sem ordem, entra como comprometido). */
const DIARIA_COMPROMETE = new Set(["aguardando", "aprovada"])

async function lerPorProjeto(
  tabela: string,
  colunas: string,
  ids: string[],
  emp: string
): Promise<Record<string, unknown>[]> {
  const admin = await createAdminClient()
  try {
    return await lerEmLotesPorIds<Record<string, unknown>>(ids, (fatia, de, ate) =>
      admin.from(tabela).select(colunas).eq("emp_proprietaria_id", emp).in("projeto_id", fatia).order("id").range(de, ate)
    )
  } catch (e) {
    // Antes da migração 20261126171742 a coluna não existe: nenhum.
    if (esquemaAusente(e as { code?: string })) return []
    throw e
  }
}

/**
 * Soma as viagens (passagens e hospedagens) e as diárias dos projetos no
 * gasto. O item de viagem vale o que a fatura cobrou dele (com a parte da
 * taxa da agência); a diária vale o valor dela mais as despesas. Pago ou a
 * pagar pela situação da ordem que pagou; sem ordem ainda, comprometido.
 */
async function viagensEDiariasDosProjetos(
  ids: string[],
  jaContadas: Set<string>,
  doProjeto: (pid: string) => GastoProjeto
): Promise<Map<string, ViagemDoProjeto[]>> {
  const porProjeto = new Map<string, ViagemDoProjeto[]>()
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const [viagens, diarias] = await Promise.all([
    lerPorProjeto(
      "viagens_solicitacoes",
      "id, numero, projeto_id, situacao, evento_externo, eventos(titulo), viagens_itens(tipo, valor, fatura_id)",
      ids,
      emp
    ),
    lerPorProjeto("pessoal_diarias_solicitacoes", "id, projeto_id, situacao, valor_total, ordem_pagamento_id", ids, emp),
  ])
  if (!viagens.length && !diarias.length) return porProjeto

  type ItemBruto = { tipo?: string; valor?: unknown; fatura_id?: unknown }
  const faturaIds = [
    ...new Set(
      viagens.flatMap((v) => ((v.viagens_itens ?? []) as ItemBruto[]).map((i) => texto(i.fatura_id))).filter((v): v is string => !!v)
    ),
  ]
  const [faturas, despesas] = await Promise.all([
    lerEmLotesPorIds<Record<string, unknown>>(faturaIds, (fatia, de, ate) =>
      admin
        .from("viagens_faturas")
        .select("id, valor_itens, valor_total, ordem_pagamento_id")
        .eq("emp_proprietaria_id", emp)
        .in("id", fatia)
        .order("id")
        .range(de, ate)
    ),
    lerEmLotesPorIds<Record<string, unknown>>(
      diarias.map((d) => String(d.id)),
      (fatia, de, ate) =>
        admin.from("pessoal_diarias_solicitacao_despesas").select("id, solicitacao_id, valor").in("solicitacao_id", fatia).order("id").range(de, ate)
    ).catch(() => [] as Record<string, unknown>[]),
  ])
  const fatura = new Map(faturas.map((f) => [String(f.id), f]))
  const ordemIds = [
    ...new Set(
      [...faturas.map((f) => texto(f.ordem_pagamento_id)), ...diarias.map((d) => texto(d.ordem_pagamento_id))].filter(
        (v): v is string => !!v
      )
    ),
  ]
  const ordens = new Map(
    (
      await lerEmLotesPorIds<Record<string, unknown>>(ordemIds, (fatia, de, ate) =>
        admin.from("ordens_pagamento").select("id, situacao, excluido").eq("emp_proprietaria_id", emp).in("id", fatia).order("id").range(de, ate)
      )
    ).map((o) => [String(o.id), o])
  )
  const despesasDe = new Map<string, number>()
  for (const d of despesas) {
    const sid = String(d.solicitacao_id)
    despesasDe.set(sid, (despesasDe.get(sid) ?? 0) + (Number(d.valor ?? 0) || 0))
  }

  /** Lança o valor no gasto pela ordem; devolve a situação para a tela. */
  const lancar = (g: GastoProjeto, valor: number, ordemId: string | null, semOrdemConta: boolean): SituacaoCusto => {
    const o = ordemId ? ordens.get(ordemId) : undefined
    if (ordemId && jaContadas.has(ordemId)) return "ja_contado"
    if (o && contaNoGasto(o)) {
      if (o.situacao === "Paga") {
        g.pago += valor
        return "pago"
      }
      g.aPagar += valor
      return "a_pagar"
    }
    if (!semOrdemConta) return "sem_custo"
    g.comprometido += valor
    return "comprometido"
  }

  for (const v of viagens) {
    const pid = String(v.projeto_id)
    const g = doProjeto(pid)
    const encerrada = VIAGEM_ENCERRADA_SEM_CUSTO.has(String(v.situacao))
    const itens = (v.viagens_itens ?? []) as ItemBruto[]
    let valorViagem = 0
    let pago = 0
    let faturado = 0
    for (const i of itens) {
      const bruto = Number(i.valor ?? 0) || 0
      if (bruto <= 0) continue
      const f = texto(i.fatura_id) ? fatura.get(String(i.fatura_id)) : undefined
      const itensF = Number(f?.valor_itens ?? 0) || 0
      const valor = f && itensF > 0 ? Math.round(((bruto * (Number(f.valor_total ?? 0) || 0)) / itensF) * 100) / 100 : bruto
      // Sem fatura, o item reservado é custo a vir — salvo viagem cancelada.
      const situacao = lancar(g, valor, f ? texto(f.ordem_pagamento_id) : null, !encerrada)
      if (situacao === "sem_custo" || situacao === "ja_contado") continue
      valorViagem += valor
      if (situacao === "pago") pago += valor
      if (f) faturado += valor
    }
    g.viagens.quantidade += 1
    g.viagens.total += valorViagem
    const passagens = itens.filter((i) => i.tipo === "passagem").length
    const hospedagens = itens.filter((i) => i.tipo === "hospedagem").length
    const evento = v.eventos as { titulo?: string } | null
    const lista = porProjeto.get(pid) ?? []
    lista.push({
      id: String(v.id),
      numero: v.numero == null ? null : Number(v.numero),
      situacao: String(v.situacao ?? ""),
      resumo: [
        passagens ? `${passagens} passage${passagens === 1 ? "m" : "ns"}` : null,
        hospedagens ? `${hospedagens} hospedage${hospedagens === 1 ? "m" : "ns"}` : null,
      ]
        .filter(Boolean)
        .join(", "),
      evento: texto(evento?.titulo) ?? texto(v.evento_externo),
      valor: Math.round(valorViagem * 100) / 100,
      pago: Math.round(pago * 100) / 100,
      faturado: Math.round(faturado * 100) / 100,
    })
    porProjeto.set(pid, lista)
  }

  for (const d of diarias) {
    const g = doProjeto(String(d.projeto_id))
    const valor = Math.round(((Number(d.valor_total ?? 0) || 0) + (despesasDe.get(String(d.id)) ?? 0)) * 100) / 100
    if (valor <= 0) continue
    const situacao = lancar(g, valor, texto(d.ordem_pagamento_id), DIARIA_COMPROMETE.has(String(d.situacao)))
    if (situacao === "sem_custo" || situacao === "ja_contado") continue
    g.diarias.quantidade += 1
    g.diarias.total += valor
  }
  for (const lista of porProjeto.values()) lista.sort((a, b) => (b.numero ?? 0) - (a.numero ?? 0))
  return porProjeto
}

type SituacaoCusto = "pago" | "a_pagar" | "comprometido" | "sem_custo" | "ja_contado"

// ── Marcos e tarefas por projeto (carteira) ──────────────────────────────────

export type MarcoProjeto = {
  id: string
  titulo: string
  dataPrevista: string
  concluidoEm: string | null
}

function paraMarco(m: Record<string, unknown>): MarcoProjeto {
  return {
    id: String(m.id),
    titulo: texto(m.titulo) ?? "(sem título)",
    dataPrevista: String(m.data_prevista),
    concluidoEm: texto(m.concluido_em),
  }
}

/** Marcos de vários projetos, por data. Sem a tabela (antes da migração), nenhum. */
async function marcosPorProjeto(projetoIds: string[]): Promise<Map<string, MarcoProjeto[]>> {
  const mapa = new Map<string, MarcoProjeto[]>()
  if (projetoIds.length === 0) return mapa
  const admin = await createAdminClient()
  try {
    const linhas = await lerEmLotesPorIds(projetoIds, (fatia, de, ate) =>
      admin
        .from("projeto_marcos")
        .select("id, projeto_id, titulo, data_prevista, concluido_em")
        .in("projeto_id", fatia)
        .order("data_prevista")
        .order("id")
        .range(de, ate)
    )
    for (const m of linhas) {
      const pid = String(m.projeto_id)
      mapa.set(pid, [...(mapa.get(pid) ?? []), paraMarco(m)])
    }
  } catch (e) {
    if (!esquemaAusente(e as { code?: string })) throw e
  }
  return mapa
}

export type TarefasDoProjeto = { total: number; concluidas: number; atrasadas: number }

/**
 * Tarefas de cada projeto: as que têm o projeto e as que entraram direto na
 * demanda do projeto (o mesmo critério da página do projeto), sem repetir.
 */
async function tarefasPorProjeto(projetoIds: string[]): Promise<Map<string, TarefasDoProjeto>> {
  const mapa = new Map<string, TarefasDoProjeto>()
  if (projetoIds.length === 0) return mapa
  const admin = await createAdminClient()
  const hoje = hojeSP()
  try {
    const demandas = await lerEmLotesPorIds(projetoIds, (fatia, de, ate) =>
      admin.from("demandas").select("id, projeto_id").in("projeto_id", fatia).order("id").range(de, ate)
    )
    const projetoDaDemanda = new Map(demandas.map((d) => [String(d.id), String(d.projeto_id)]))
    const colunas = "id, projeto_id, demanda_id, concluido, data_prazo_entrega"
    const [doProjeto, daDemanda] = await Promise.all([
      lerEmLotesPorIds(projetoIds, (fatia, de, ate) =>
        admin.from("demandas_check_tarefas").select(colunas).in("projeto_id", fatia).order("id").range(de, ate)
      ),
      lerEmLotesPorIds([...projetoDaDemanda.keys()], (fatia, de, ate) =>
        admin.from("demandas_check_tarefas").select(colunas).in("demanda_id", fatia).order("id").range(de, ate)
      ),
    ])
    const vistas = new Set<string>()
    for (const t of [...doProjeto, ...daDemanda]) {
      const id = String(t.id)
      if (vistas.has(id)) continue
      vistas.add(id)
      const pid = texto(t.projeto_id) ?? projetoDaDemanda.get(String(t.demanda_id))
      if (!pid) continue
      const atual = mapa.get(pid) ?? { total: 0, concluidas: 0, atrasadas: 0 }
      atual.total += 1
      if (t.concluido === true) atual.concluidas += 1
      else if (texto(t.data_prazo_entrega) && String(t.data_prazo_entrega) < hoje) atual.atrasadas += 1
      mapa.set(pid, atual)
    }
  } catch (e) {
    if (!esquemaAusente(e as { code?: string })) throw e
  }
  return mapa
}

/** Os marcos de um projeto, por data (página do projeto). */
export async function listarMarcos(projetoId: string): Promise<MarcoProjeto[]> {
  return (await marcosPorProjeto([projetoId])).get(projetoId) ?? []
}

async function marcoDoTenant(id: string) {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("projeto_marcos")
    .select("id, projeto_id")
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  return data ? { admin, projetoId: String(data.projeto_id) } : null
}

export async function criarMarco(
  projetoId: string,
  dados: { titulo: string; dataPrevista: string }
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data: projeto } = await admin.from("projeto").select("id").eq("id", projetoId).eq("emp_proprietaria_id", emp).maybeSingle()
  if (!projeto) return { erro: "Projeto não encontrado." }
  const { error } = await admin.from("projeto_marcos").insert({
    emp_proprietaria_id: emp,
    projeto_id: projetoId,
    titulo: dados.titulo,
    data_prevista: dados.dataPrevista,
  })
  if (error) return { erro: `Falha ao criar o marco: ${error.message}` }
  return {}
}

export async function editarMarco(
  id: string,
  dados: { titulo: string; dataPrevista: string }
): Promise<{ erro?: string; projetoId?: string }> {
  const m = await marcoDoTenant(id)
  if (!m) return { erro: "Marco não encontrado." }
  const { error } = await m.admin
    .from("projeto_marcos")
    .update({ titulo: dados.titulo, data_prevista: dados.dataPrevista, updated_at: new Date().toISOString() })
    .eq("id", id)
  if (error) return { erro: `Falha ao salvar o marco: ${error.message}` }
  return { projetoId: m.projetoId }
}

/** Dá o marco por cumprido (hoje) ou o reabre. */
export async function definirMarcoConcluido(id: string, concluido: boolean): Promise<{ erro?: string; projetoId?: string }> {
  const m = await marcoDoTenant(id)
  if (!m) return { erro: "Marco não encontrado." }
  const { error } = await m.admin
    .from("projeto_marcos")
    .update({ concluido_em: concluido ? hojeSP() : null, updated_at: new Date().toISOString() })
    .eq("id", id)
  if (error) return { erro: `Falha ao atualizar o marco: ${error.message}` }
  return { projetoId: m.projetoId }
}

export async function excluirMarco(id: string): Promise<{ erro?: string; projetoId?: string }> {
  const m = await marcoDoTenant(id)
  if (!m) return { erro: "Marco não encontrado." }
  const { error } = await m.admin.from("projeto_marcos").delete().eq("id", id)
  if (error) return { erro: `Falha ao excluir o marco: ${error.message}` }
  return { projetoId: m.projetoId }
}

// ── Listagem ────────────────────────────────────────────────────────────────

export type ProjetoLinha = {
  id: string
  titulo: string | null
  tipo: string | null
  orcamento: number | null
  inicio: string | null
  termino_previsao: string | null
  finalizado: boolean | null
  estrategico: boolean | null
  gasto: GastoProjeto
  tarefas: TarefasDoProjeto
  /** O próximo marco em aberto (o de data mais próxima, mesmo vencido). */
  proximoMarco: MarcoProjeto | null
  marcos: { total: number; concluidos: number }
  situacao: { nivel: NivelProjeto; motivos: string[] }
}

export type FiltroProjetos = {
  busca?: string
  tipo?: string
  situacao?: "andamento" | "finalizados" | "todos"
}

export async function listarProjetos(
  filtro: FiltroProjetos = {}
): Promise<ProjetoLinha[]> {
  const admin = await createAdminClient()
  let query = admin
    .from("projeto")
    .select(
      "id, descricao_sumaria, tipo, orcamento, inicio, termino_previsao, finalizado, estrategico"
    )
    .eq("emp_proprietaria_id", await tenantAtual())

  const busca = (filtro.busca ?? "").trim()
  if (busca) query = query.ilike("descricao_sumaria", `%${busca}%`)
  if (filtro.tipo) query = query.eq("tipo", filtro.tipo)
  if (filtro.situacao === "andamento") query = query.not("finalizado", "is", true)
  else if (filtro.situacao === "finalizados") query = query.eq("finalizado", true)

  const { data, error } = await query
    .order("inicio", { ascending: false, nullsFirst: false })
    .order("descricao_sumaria", { ascending: true })
  if (error) throw new Error(`Falha ao listar projetos: ${error.message}`)

  const linhas = data ?? []
  const ids = linhas.map((p) => p.id as string)
  const [{ gastos }, marcos, tarefas] = await Promise.all([gastosDosProjetos(ids), marcosPorProjeto(ids), tarefasPorProjeto(ids)])
  const hoje = hojeSP()

  return linhas.map((p) => {
    const g = gastos.get(p.id) ?? gastoVazio()
    const ms = marcos.get(p.id) ?? []
    const ts = tarefas.get(p.id) ?? { total: 0, concluidas: 0, atrasadas: 0 }
    const orcamento = numero(p.orcamento)
    const gasto = g.total
    return {
      id: p.id,
      titulo: texto(p.descricao_sumaria),
      tipo: texto(p.tipo),
      orcamento: numero(p.orcamento),
      inicio: texto(p.inicio),
      termino_previsao: texto(p.termino_previsao),
      finalizado: p.finalizado as boolean | null,
      estrategico: p.estrategico as boolean | null,
      gasto: g,
      tarefas: ts,
      proximoMarco: ms.find((m) => !m.concluidoEm) ?? null,
      marcos: { total: ms.length, concluidos: ms.filter((m) => m.concluidoEm).length },
      situacao: situacaoDoProjeto(
        {
          finalizado: p.finalizado === true,
          terminoPrevisao: texto(p.termino_previsao),
          marcos: ms.map((m) => ({ titulo: m.titulo, dataPrevista: m.dataPrevista, concluido: Boolean(m.concluidoEm) })),
          tarefasAtrasadas: ts.atrasadas,
          saldo: orcamento != null ? orcamento - gasto : null,
        },
        hoje
      ),
    }
  })
}

// ── Resumo (cards) ──────────────────────────────────────────────────────────

export type ResumoProjetos = {
  total: number
  emAndamento: number
  finalizados: number
  orcamentoAndamento: number
  /** Gasto (pago, a pagar e comprometido) dos projetos em andamento. */
  gastoAndamento: number
}

export async function resumoProjetos(): Promise<ResumoProjetos> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("projeto")
    .select("id, orcamento, finalizado")
    .eq("emp_proprietaria_id", await tenantAtual())

  const linhas = data ?? []
  const emAndamento = linhas.filter((p) => p.finalizado !== true)
  const { gastos } = await gastosDosProjetos(emAndamento.map((p) => p.id))
  let gastoAndamento = 0
  for (const g of gastos.values()) gastoAndamento += g.total

  return {
    total: linhas.length,
    emAndamento: emAndamento.length,
    finalizados: linhas.filter((p) => p.finalizado === true).length,
    orcamentoAndamento: emAndamento.reduce(
      (s, p) => s + (numero(p.orcamento) ?? 0),
      0
    ),
    gastoAndamento: Math.round(gastoAndamento * 100) / 100,
  }
}

// ── Detalhe ─────────────────────────────────────────────────────────────────

export type SolicitacaoDoProjeto = {
  id: string
  codigo: string | null
  descricao: string | null
  situacao: string | null
  valor: number | null
}

export type DetalheProjeto = {
  id: string
  titulo: string | null
  tipo: string | null
  detalhamento: string | null
  orcamento: number | null
  inicio: string | null
  termino_previsao: string | null
  finalizado: boolean | null
  estrategico: boolean | null
  autorizado: boolean | null
  autorizacaoQuando: string | null
  centroCustoId: string | null
  centroCustoNome: string | null
  departamentos: string[]
  gasto: GastoProjeto
  /** Ordens de pagamento do projeto (sem as de reembolso, que entram só somadas). */
  ordens: OrdemDoProjeto[]
  solicitacoes: SolicitacaoDoProjeto[]
  custeios: CusteioDoProjeto[]
  viagens: ViagemDoProjeto[]
}

export async function obterProjeto(id: string): Promise<DetalheProjeto | null> {
  const admin = await createAdminClient()
  const { data: p } = await admin
    .from("projeto")
    .select("*")
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (!p) return null

  // Centro de custo
  let centroCustoNome: string | null = null
  const centroCustoId = texto(p.centro_custo_id)
  if (centroCustoId) {
    const { data: cc } = await admin
      .from("centros_de_custo")
      .select("nome_da_conta")
      .eq("id", centroCustoId)
      .maybeSingle()
    centroCustoNome = texto(cc?.nome_da_conta)
  }

  // Departamentos (bubble_ids → nome)
  const deptBubbleIds = listaJsonb(p.departamentos_assoc_raw)
  const departamentos: string[] = []
  if (deptBubbleIds.length > 0) {
    const { data: depts } = await admin
      .from("empresa_departamentos")
      .select("departamento, bubble_id")
      .in("bubble_id", deptBubbleIds)
    for (const d of depts ?? []) {
      const nome = texto(d.departamento)
      if (nome) departamentos.push(nome)
    }
  }

  // Solicitações de compra vinculadas (situação derivada das flags, como em Aquisição)
  const { data: sols } = await admin
    .from("compras_solicitacoes")
    .select(
      "id, codigo, descricao_objetivo, solicitacao_produto, compra_valor, cancelado, recebido, comprado, em_cotacao, cotacao_termino"
    )
    .eq("solicitacao_projeto_id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
    .order("compra_valor", { ascending: false, nullsFirst: false })
  const solicitacoes: SolicitacaoDoProjeto[] = (sols ?? []).map((s) => ({
    id: s.id as string,
    codigo: texto(s.codigo),
    descricao: texto(s.descricao_objetivo) ?? texto(s.solicitacao_produto),
    situacao: ROTULOS_SITUACAO_PROCESSO[derivarSituacao(s)],
    valor: numero(s.compra_valor),
  }))
  const { gastos, ordens, custeios, viagens } = await gastosDosProjetos([id])

  return {
    id: p.id as string,
    titulo: texto(p.descricao_sumaria),
    tipo: texto(p.tipo),
    detalhamento: texto(p.detalhamento),
    orcamento: numero(p.orcamento),
    inicio: texto(p.inicio),
    termino_previsao: texto(p.termino_previsao),
    finalizado: p.finalizado as boolean | null,
    estrategico: p.estrategico as boolean | null,
    autorizado: p.autorizacao_autorizado as boolean | null,
    autorizacaoQuando: texto(p.autorizacao_quando),
    centroCustoId,
    centroCustoNome,
    departamentos,
    gasto: gastos.get(id) ?? gastoVazio(),
    ordens: ordens.get(id) ?? [],
    custeios: custeios.get(id) ?? [],
    viagens: viagens.get(id) ?? [],
    solicitacoes,
  }
}

// ── Escrita ─────────────────────────────────────────────────────────────────

export type DadosProjeto = {
  titulo: string
  tipo: string | null
  detalhamento: string | null
  orcamento: number | null
  inicio: string | null
  termino_previsao: string | null
  centro_custo_id: string | null
  estrategico: boolean
}

/** Mapeia os dados do formulário para as colunas reais da tabela `projeto`. */
function paraColunas(dados: DadosProjeto) {
  return {
    descricao_sumaria: dados.titulo,
    tipo: dados.tipo,
    detalhamento: dados.detalhamento,
    orcamento: dados.orcamento,
    inicio: dados.inicio,
    termino_previsao: dados.termino_previsao,
    centro_custo_id: dados.centro_custo_id,
    estrategico: dados.estrategico,
  }
}

export async function criarProjeto(
  dados: DadosProjeto
): Promise<{ id?: string; erro?: string }> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("projeto")
    .insert({
      ...paraColunas(dados),
      finalizado: false,
      emp_proprietaria_id: await tenantAtual(),
    })
    .select("id")
    .single()
  if (error) return { erro: `Falha ao criar projeto: ${error.message}` }
  return { id: data.id as string }
}

export async function atualizarProjeto(
  id: string,
  dados: DadosProjeto
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin
    .from("projeto")
    .update({ ...paraColunas(dados), updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: `Falha ao salvar projeto: ${error.message}` }
  return {}
}

export async function definirFinalizado(
  id: string,
  finalizado: boolean
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin
    .from("projeto")
    .update({ finalizado, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: `Falha ao atualizar situação: ${error.message}` }
  return {}
}

/** Marcos com data prevista no período (calendário de prazos), com o projeto. */
export async function marcosNoPeriodo(
  de: string,
  ate: string
): Promise<(MarcoProjeto & { projetoId: string; projetoTitulo: string | null; projetoFinalizado: boolean })[]> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("projeto_marcos")
    .select("id, projeto_id, titulo, data_prevista, concluido_em, projeto:projeto_id (descricao_sumaria, finalizado)")
    .eq("emp_proprietaria_id", await tenantAtual())
    .gte("data_prevista", de)
    .lte("data_prevista", ate)
    .order("data_prevista")
    .limit(1000)
  if (error) {
    if (esquemaAusente(error)) return []
    throw new Error(`Falha ao ler os marcos: ${error.message}`)
  }
  return (data ?? []).map((m) => {
    const p = (Array.isArray(m.projeto) ? m.projeto[0] : m.projeto) as { descricao_sumaria?: string | null; finalizado?: boolean | null } | null
    return {
      ...paraMarco(m as Record<string, unknown>),
      projetoId: String(m.projeto_id),
      projetoTitulo: texto(p?.descricao_sumaria),
      projetoFinalizado: p?.finalizado === true,
    }
  })
}

// ── Transferência de despesa entre projetos ─────────────────────────────────

/**
 * TRANSFERÊNCIA DE DESPESA (25/11/2026). A despesa lançada no projeto errado
 * passa para outro projeto em andamento: a COMPRA ou o CUSTEIO (26/11), cada
 * um com TODAS as suas ordens, a VIAGEM (com as passagens e hospedagens) ou
 * a ORDEM lançada direto no projeto. Os dois projetos precisam estar abertos e
 * o motivo é obrigatório. O centro de custo não muda (reclassificar é do
 * Financeiro). Fica no livro `financeiro_transferencias_projeto` e na trilha
 * de cada ordem movida. Reembolso a filiado não se transfere por aqui: ele é
 * mostrado só somado, sem os nomes.
 */
export type TipoTransferencia = "compra" | "custeio" | "viagem" | "ordem"

export type TransferenciaProjeto = {
  id: string
  sentido: "saiu" | "entrou"
  outroProjetoId: string
  outroProjeto: string
  tipo: TipoTransferencia
  descricao: string | null
  valor: number
  motivo: string
  quem: string | null
  quando: string
}

/** Projetos em andamento para onde a despesa pode ir (menos o próprio). */
export async function projetosAbertosParaTransferencia(excetoId?: string): Promise<{ id: string; titulo: string }[]> {
  const admin = await createAdminClient()
  let q = admin
    .from("projeto")
    .select("id, descricao_sumaria")
    .eq("emp_proprietaria_id", await tenantAtual())
    .not("finalizado", "is", true)
  if (excetoId) q = q.neq("id", excetoId)
  const { data } = await q.order("descricao_sumaria")
  return (data ?? []).map((p) => ({ id: String(p.id), titulo: texto(p.descricao_sumaria) ?? "(sem título)" }))
}

export async function transferirDespesa(params: {
  origemId: string
  destinoId: string
  tipo: TipoTransferencia
  itemId: string
  motivo: string
  usuarioId: string
}): Promise<{ erro?: string; ok?: string }> {
  const { origemId, destinoId, tipo, itemId, usuarioId } = params
  const motivo = params.motivo.trim()
  if (!destinoId) return { erro: "Escolha o projeto para onde vai a despesa." }
  if (destinoId === origemId) return { erro: "Escolha outro projeto." }
  if (motivo.length < 3) return { erro: "Escreva o motivo da transferência." }
  if (motivo.length > 500) return { erro: "O motivo passa de 500 caracteres." }

  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data: projs } = await admin
    .from("projeto")
    .select("id, descricao_sumaria, finalizado")
    .eq("emp_proprietaria_id", emp)
    .in("id", [origemId, destinoId])
  const origem = (projs ?? []).find((p) => p.id === origemId)
  const destino = (projs ?? []).find((p) => p.id === destinoId)
  if (!origem || !destino) return { erro: "Projeto não encontrado." }
  if (origem.finalizado === true || destino.finalizado === true) {
    return { erro: "Os dois projetos precisam estar em andamento: reabra o finalizado para transferir." }
  }
  const nomeOrigem = texto(origem.descricao_sumaria) ?? "(sem título)"
  const nomeDestino = texto(destino.descricao_sumaria) ?? "(sem título)"

  const COLUNAS =
    "id, codigo, descricao, situacao, excluido, tipo, valor, valor_pago, valor_inicial_cobranca, projeto_id, processo_compra_id, custeio_id"
  let descricao: string | null = null
  let ordensMovidas: Record<string, unknown>[] = []
  let valor = 0
  let compraId: string | null = null
  let custeioId: string | null = null
  let viagemId: string | null = null
  let ordemId: string | null = null
  const somaDasOrdens = (os: Record<string, unknown>[]) => os.filter(contaNoGasto).reduce((s, o) => s + valorDaOrdem(o), 0)

  if (tipo === "compra") {
    const { data: c } = await admin
      .from("compras_solicitacoes")
      .select("id, codigo, descricao_objetivo, solicitacao_produto, compra_valor, cancelado, solicitacao_projeto_id")
      .eq("emp_proprietaria_id", emp)
      .eq("id", itemId)
      .maybeSingle()
    if (!c || c.solicitacao_projeto_id !== origemId) {
      return { erro: "Esta compra não está mais neste projeto — recarregue a página." }
    }
    compraId = String(c.id)
    descricao = [texto(c.codigo), texto(c.descricao_objetivo) ?? texto(c.solicitacao_produto)].filter(Boolean).join(" — ") || null
    const { data: ords } = await admin.from("ordens_pagamento").select(COLUNAS).eq("emp_proprietaria_id", emp).eq("processo_compra_id", compraId)
    // A compra leva TODAS as ordens dela (regra de 26/11/2026).
    ordensMovidas = (ords ?? []) as Record<string, unknown>[]
    valor = ordensMovidas.length ? somaDasOrdens(ordensMovidas) : c.cancelado === true ? 0 : (numero(c.compra_valor) ?? 0)
  } else if (tipo === "custeio") {
    const { data: c, error: erroC } = await admin
      .from("institucional_custeios")
      .select("id, codigo, situacao, valor_parcela, num_parcelas, projeto_id")
      .eq("emp_proprietaria_id", emp)
      .eq("id", itemId)
      .maybeSingle()
    if (erroC && esquemaAusente(erroC)) return { erro: "Os custeios ainda não têm projeto: falta aplicar a migração 20261126023552." }
    if (!c || c.projeto_id !== origemId) return { erro: "Este custeio não está mais neste projeto — recarregue a página." }
    custeioId = String(c.id)
    descricao = texto(c.codigo) ? `Custeio ${c.codigo}` : "Custeio"
    const { data: ords } = await admin.from("ordens_pagamento").select(COLUNAS).eq("emp_proprietaria_id", emp).eq("custeio_id", custeioId)
    ordensMovidas = (ords ?? []) as Record<string, unknown>[]
    valor = ordensMovidas.length
      ? somaDasOrdens(ordensMovidas)
      : CUSTEIO_COMPROMETE.has(String(c.situacao))
        ? (Number(c.valor_parcela ?? 0) || 0) * (Number(c.num_parcelas ?? 1) || 1)
        : 0
  } else if (tipo === "viagem") {
    const { data: v, error: erroV } = await admin
      .from("viagens_solicitacoes")
      .select("id, numero, situacao, projeto_id, viagens_itens(valor, fatura:viagens_faturas(valor_itens, valor_total))")
      .eq("emp_proprietaria_id", emp)
      .eq("id", itemId)
      .maybeSingle()
    if (erroV && esquemaAusente(erroV)) return { erro: "As viagens ainda não têm projeto: falta aplicar a migração 20261126171742." }
    if (!v || v.projeto_id !== origemId) return { erro: "Esta viagem não está mais neste projeto — recarregue a página." }
    viagemId = String(v.id)
    descricao = v.numero != null ? `Viagem nº ${v.numero}` : "Viagem"
    // As passagens e hospedagens vão junto; a ordem da fatura (de várias
    // viagens) não muda — o projeto fica na viagem.
    // O mesmo valor do gasto: o item faturado leva a parte da taxa da agência.
    type ItemT = { valor?: unknown; fatura?: { valor_itens?: unknown; valor_total?: unknown } | null }
    valor = ((v.viagens_itens ?? []) as ItemT[]).reduce((s, i) => {
      const bruto = Number(i.valor ?? 0) || 0
      const itens = Number(i.fatura?.valor_itens ?? 0) || 0
      return s + (itens > 0 ? Math.round(((bruto * (Number(i.fatura?.valor_total ?? 0) || 0)) / itens) * 100) / 100 : bruto)
    }, 0)
  } else {
    const { data: o } = await admin.from("ordens_pagamento").select(COLUNAS).eq("emp_proprietaria_id", emp).eq("id", itemId).maybeSingle()
    if (!o || o.projeto_id !== origemId) return { erro: "Esta ordem não está mais neste projeto — recarregue a página." }
    if (o.tipo === "Reembolso") return { erro: "Ordem de reembolso a filiado não se transfere por aqui." }
    if (texto(o.processo_compra_id)) {
      const { data: c } = await admin
        .from("compras_solicitacoes")
        .select("codigo")
        .eq("emp_proprietaria_id", emp)
        .eq("id", String(o.processo_compra_id))
        .maybeSingle()
      const codigo = texto(c?.codigo)
      return { erro: `Esta ordem é da compra ${codigo ? `${codigo} ` : ""}: transfira a compra, que leva todas as ordens dela.` }
    }
    if (texto(o.custeio_id)) return { erro: "Esta ordem é de um custeio: transfira o custeio, que leva todas as ordens dele." }
    const linha = o as Record<string, unknown>
    ordemId = String(o.id)
    descricao = [texto(o.codigo), texto(o.descricao)].filter(Boolean).join(" — ") || null
    ordensMovidas = [linha]
    valor = contaNoGasto(linha) ? valorDaOrdem(linha) : 0
  }
  valor = Math.round(valor * 100) / 100

  // Livro primeiro: sem ele (tabela ausente), nada muda.
  const { data: livro, error: erroLivro } = await admin
    .from("financeiro_transferencias_projeto")
    .insert({
      emp_proprietaria_id: emp,
      origem_id: origemId,
      destino_id: destinoId,
      tipo,
      compra_id: compraId,
      ordem_id: ordemId,
      ...(custeioId ? { custeio_id: custeioId } : {}),
      ...(viagemId ? { viagem_id: viagemId } : {}),
      descricao: descricao?.slice(0, 500) ?? null,
      valor,
      ordens: ordensMovidas.length,
      motivo,
      usuario_id: usuarioId,
    })
    .select("id")
    .single()
  if (erroLivro || !livro) {
    return { erro: `Não foi possível registrar a transferência: ${erroLivro?.message ?? "sem resposta"}` }
  }
  const desfazerLivro = () => admin.from("financeiro_transferencias_projeto").delete().eq("id", livro.id)

  // A compra ou o custeio muda de projeto (o gatilho do banco leva as ordens;
  // a atualização das ordens abaixo garante o mesmo sem ele).
  const pai = compraId
    ? { tabela: "compras_solicitacoes", coluna: "solicitacao_projeto_id", id: compraId, nome: "A compra" }
    : custeioId
      ? { tabela: "institucional_custeios", coluna: "projeto_id", id: custeioId, nome: "O custeio" }
      : viagemId
        ? { tabela: "viagens_solicitacoes", coluna: "projeto_id", id: viagemId, nome: "A viagem" }
        : null
  if (pai) {
    const { data: movido, error } = await admin
      .from(pai.tabela)
      .update({ [pai.coluna]: destinoId })
      .eq("emp_proprietaria_id", emp)
      .eq("id", pai.id)
      .eq(pai.coluna, origemId)
      .select("id")
    if (error || !movido?.length) {
      await desfazerLivro()
      return {
        erro: error ? `Não foi possível transferir: ${error.message}` : `${pai.nome} mudou enquanto você transferia — recarregue a página.`,
      }
    }
  }
  const idsOrdens = ordensMovidas.map((o) => String(o.id))
  if (idsOrdens.length) {
    const { error } = await admin
      .from("ordens_pagamento")
      .update({ projeto_id: destinoId })
      .eq("emp_proprietaria_id", emp)
      .in("id", idsOrdens)
    if (error) {
      if (pai) await admin.from(pai.tabela).update({ [pai.coluna]: origemId }).eq("emp_proprietaria_id", emp).eq("id", pai.id)
      await desfazerLivro()
      return { erro: `Não foi possível transferir: ${error.message}` }
    }
    const { registrarEvento } = await import("@/lib/db/ordens-ciclo")
    await registrarEvento(
      idsOrdens,
      "projeto_transferido",
      usuarioId,
      `Do projeto "${nomeOrigem}" para "${nomeDestino}". Motivo: ${motivo}`,
      { de: origemId, para: destinoId, motivo, transferencia_id: livro.id }
    )
  }
  const oQue = tipo === "compra" ? "A compra" : tipo === "custeio" ? "O custeio" : tipo === "viagem" ? "A viagem" : "A ordem"
  const dela = tipo === "custeio" ? "dele" : "dela"
  const junto =
    tipo !== "ordem" && tipo !== "viagem" && idsOrdens.length
      ? ` (com ${idsOrdens.length === 1 ? `a ordem ${dela}` : `as ${idsOrdens.length} ordens ${dela}`})`
      : ""
  return { ok: `${oQue}${junto} foi para o projeto "${nomeDestino}".` }
}

/**
 * Liga ao projeto o custeio que ainda não tem projeto (o já autorizado, que
 * não se edita mais). As ordens dele vão junto (gatilho do banco e a
 * atualização abaixo). Trocar de projeto é transferência, com motivo.
 */
export async function vincularCusteioAoProjeto(custeioId: string, projetoId: string): Promise<{ erro?: string; ok?: string }> {
  if (!projetoId) return { erro: "Escolha o projeto." }
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const [{ data: c, error }, { data: p }] = await Promise.all([
    admin.from("institucional_custeios").select("id, situacao, projeto_id").eq("emp_proprietaria_id", emp).eq("id", custeioId).maybeSingle(),
    admin.from("projeto").select("id, descricao_sumaria, finalizado").eq("emp_proprietaria_id", emp).eq("id", projetoId).maybeSingle(),
  ])
  if (error && esquemaAusente(error)) return { erro: "Os custeios ainda não têm projeto: falta aplicar a migração 20261126023552." }
  if (!c) return { erro: "Custeio não encontrado." }
  if (!p) return { erro: "Projeto não encontrado." }
  if (p.finalizado === true) return { erro: "O projeto está finalizado: reabra-o para vincular o custeio." }
  if (c.situacao === "cancelado") return { erro: "Custeio cancelado não se vincula a projeto." }
  if (texto(c.projeto_id)) return { erro: "O custeio já tem projeto: para trocar, transfira-o na página do projeto." }
  const { data: feito, error: erroU } = await admin
    .from("institucional_custeios")
    .update({ projeto_id: projetoId })
    .eq("emp_proprietaria_id", emp)
    .eq("id", custeioId)
    .is("projeto_id", null)
    .select("id")
  if (erroU) return { erro: `Não foi possível vincular: ${erroU.message}` }
  if (!feito?.length) return { erro: "O custeio mudou enquanto você vinculava — recarregue a página." }
  await admin.from("ordens_pagamento").update({ projeto_id: projetoId }).eq("emp_proprietaria_id", emp).eq("custeio_id", custeioId)
  return { ok: `Custeio vinculado ao projeto "${texto(p.descricao_sumaria) ?? "(sem título)"}".` }
}

/**
 * Lê o projeto escolhido num formulário (campo `projeto_id`) e confere que
 * ele existe e está em andamento. Vazio = sem projeto.
 */
export async function lerProjetoDoForm(formData: FormData): Promise<{ projetoId: string | null } | { erro: string }> {
  const id = String(formData.get("projeto_id") ?? "").trim()
  if (!id) return { projetoId: null }
  const admin = await createAdminClient()
  const { data: p } = await admin
    .from("projeto")
    .select("id, finalizado")
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("id", id)
    .maybeSingle()
  if (!p) return { erro: "Projeto não encontrado." }
  if (p.finalizado === true) return { erro: "O projeto escolhido está finalizado." }
  return { projetoId: id }
}

/**
 * Liga ao projeto a viagem que ainda não tem projeto (na página da viagem).
 * Trocar de projeto é transferência, com motivo, na página do projeto.
 */
export async function vincularViagemAoProjeto(viagemId: string, projetoId: string): Promise<{ erro?: string; ok?: string }> {
  if (!projetoId) return { erro: "Escolha o projeto." }
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const [{ data: v, error }, { data: p }] = await Promise.all([
    admin.from("viagens_solicitacoes").select("id, projeto_id").eq("emp_proprietaria_id", emp).eq("id", viagemId).maybeSingle(),
    admin.from("projeto").select("id, descricao_sumaria, finalizado").eq("emp_proprietaria_id", emp).eq("id", projetoId).maybeSingle(),
  ])
  if (error && esquemaAusente(error)) return { erro: "As viagens ainda não têm projeto: falta aplicar a migração 20261126171742." }
  if (!v) return { erro: "Viagem não encontrada." }
  if (!p) return { erro: "Projeto não encontrado." }
  if (p.finalizado === true) return { erro: "O projeto está finalizado: reabra-o para vincular a viagem." }
  if (texto(v.projeto_id)) return { erro: "A viagem já tem projeto: para trocar, transfira-a na página do projeto." }
  const { data: feito, error: erroU } = await admin
    .from("viagens_solicitacoes")
    .update({ projeto_id: projetoId })
    .eq("emp_proprietaria_id", emp)
    .eq("id", viagemId)
    .is("projeto_id", null)
    .select("id")
  if (erroU) return { erro: `Não foi possível vincular: ${erroU.message}` }
  if (!feito?.length) return { erro: "A viagem mudou enquanto você vinculava — recarregue a página." }
  return { ok: `Viagem vinculada ao projeto "${texto(p.descricao_sumaria) ?? "(sem título)"}".` }
}

/** O livro de transferências do projeto: o que saiu e o que entrou. */
export async function listarTransferencias(projetoId: string): Promise<TransferenciaProjeto[]> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data, error } = await admin
    .from("financeiro_transferencias_projeto")
    .select("id, origem_id, destino_id, tipo, descricao, valor, motivo, usuario_id, created_at")
    .eq("emp_proprietaria_id", emp)
    .or(`origem_id.eq.${projetoId},destino_id.eq.${projetoId}`)
    .order("created_at", { ascending: false })
    .limit(200)
  if (error) {
    if (esquemaAusente(error)) return []
    throw new Error(`Falha ao ler as transferências: ${error.message}`)
  }
  const linhas = data ?? []
  if (!linhas.length) return []
  const outros = [...new Set(linhas.map((l) => String(l.origem_id === projetoId ? l.destino_id : l.origem_id)))]
  const pessoas = [...new Set(linhas.map((l) => texto(l.usuario_id)).filter((v): v is string => !!v))]
  const [{ data: ps }, { data: us }] = await Promise.all([
    admin.from("projeto").select("id, descricao_sumaria").eq("emp_proprietaria_id", emp).in("id", outros),
    pessoas.length
      ? admin.from("usuarios").select("id, nome_guerra, nome_completo").in("id", pessoas)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ])
  const nomeProjeto = new Map((ps ?? []).map((p) => [String(p.id), texto(p.descricao_sumaria) ?? "(sem título)"]))
  const nomePessoa = new Map(
    ((us ?? []) as Record<string, unknown>[]).map((u) => [String(u.id), texto(u.nome_guerra) ?? texto(u.nome_completo)])
  )
  return linhas.map((l) => {
    const saiu = l.origem_id === projetoId
    const outro = String(saiu ? l.destino_id : l.origem_id)
    return {
      id: String(l.id),
      sentido: saiu ? "saiu" : "entrou",
      outroProjetoId: outro,
      outroProjeto: nomeProjeto.get(outro) ?? "(projeto)",
      tipo: l.tipo === "ordem" ? "ordem" : l.tipo === "custeio" ? "custeio" : l.tipo === "viagem" ? "viagem" : "compra",
      descricao: texto(l.descricao),
      valor: Number(l.valor ?? 0) || 0,
      motivo: String(l.motivo ?? ""),
      quem: texto(l.usuario_id) ? (nomePessoa.get(String(l.usuario_id)) ?? null) : null,
      quando: String(l.created_at),
    }
  })
}

/** O título do projeto (para mostrar o vínculo em outras telas). */
export async function tituloDoProjeto(id: string): Promise<string | null> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("projeto")
    .select("descricao_sumaria")
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("id", id)
    .maybeSingle()
  return data ? (texto(data.descricao_sumaria) ?? "(sem título)") : null
}
