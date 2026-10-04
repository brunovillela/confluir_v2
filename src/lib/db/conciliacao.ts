import "server-only"

import { createHash } from "node:crypto"

import { esquemaAusente, hojeSP, texto } from "@/lib/db/comum"
import { registrarEvento } from "@/lib/db/ordens-ciclo"
import { listarFontesPagadoras } from "@/lib/db/fontes"
import { listarRemessas } from "@/lib/db/receitas"
import { lerExtratoCsv } from "@/lib/extrato-csv"
import { lerOfx, type ExtratoLido } from "@/lib/ofx"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * CONCILIAÇÃO BANCÁRIA POR ARQUIVO (onda 5, A1). O extrato (OFX/CSV) entra
 * em `banco_extratos` + `banco_lancamentos`; cada lançamento é casado com
 * uma ordem PAGA (débito: mesmo valor, pagamento até 3 dias de distância)
 * ou com um depósito de fonte (`filiacao_recebe_comprovacao`, crédito: mesmo
 * valor, até 5 dias). Um único candidato = casa sozinho; vários ou nenhum =
 * fica pendente para a tela decidir. Conciliar nunca altera a ordem nem a
 * comprovação: o vínculo mora no lançamento (e vira evento na ordem).
 * Tabelas em supabase/banco-conciliacao.sql; sem elas, `disponivel: false`.
 */

const TOLERANCIA_ORDEM_DIAS = 3
const TOLERANCIA_DEPOSITO_DIAS = 5
const MAX_LINHAS = 20_000

export type Lancamento = {
  id: string
  extratoId: string
  data: string
  valor: number
  descricao: string | null
  documento: string | null
  tipo: string | null
  situacao: "pendente" | "conciliado" | "ignorado"
  ordemId: string | null
  comprovacaoId: string | null
  automatico: boolean
  observacao: string | null
  conciliadoEm: string | null
}

export type Extrato = {
  id: string
  nomeArquivo: string | null
  origem: string
  contaRotulo: string | null
  banco: string | null
  agencia: string | null
  conta: string | null
  periodoDe: string | null
  periodoAte: string | null
  saldoFinal: number | null
  totalLancamentos: number
  novosLancamentos: number
  criadoEm: string
}

export type CandidataOrdem = { id: string; codigo: string | null; descricao: string | null; favorecido: string | null; valorPago: number; dataPagamento: string | null; forma: string | null }
export type CandidataComprovacao = { id: string; remessaRotulo: string; fonte: string; data: string | null; valor: number }

export type LancamentoComCandidatas = Lancamento & {
  ordens: CandidataOrdem[]
  comprovacoes: CandidataComprovacao[]
  /** Nome do que já foi conciliado (ordem ou comprovação). */
  vinculo: string | null
}

export type ResumoConciliacao = {
  disponivel: boolean
  pendentes: number
  pendentesCreditos: number
  pendentesDebitos: number
  conciliados: number
  ignorados: number
  ultimoExtrato: Extrato | null
  /** Ordens pagas nos últimos 90 dias sem lançamento no extrato. */
  ordensSemExtrato: number
}

function montarLancamento(l: Record<string, unknown>): Lancamento {
  return {
    id: String(l.id),
    extratoId: String(l.extrato_id),
    data: String(l.data).slice(0, 10),
    valor: Number(l.valor),
    descricao: texto(l.descricao),
    documento: texto(l.documento),
    tipo: texto(l.tipo),
    situacao: (l.situacao as Lancamento["situacao"]) ?? "pendente",
    ordemId: texto(l.ordem_id),
    comprovacaoId: texto(l.comprovacao_id),
    automatico: l.automatico === true,
    observacao: texto(l.observacao),
    conciliadoEm: texto(l.conciliado_em),
  }
}

function montarExtrato(e: Record<string, unknown>): Extrato {
  return {
    id: String(e.id),
    nomeArquivo: texto(e.nome_arquivo),
    origem: String(e.origem),
    contaRotulo: texto(e.conta_rotulo),
    banco: texto(e.banco),
    agencia: texto(e.agencia),
    conta: texto(e.conta),
    periodoDe: texto(e.periodo_de)?.slice(0, 10) ?? null,
    periodoAte: texto(e.periodo_ate)?.slice(0, 10) ?? null,
    saldoFinal: e.saldo_final === null || e.saldo_final === undefined ? null : Number(e.saldo_final),
    totalLancamentos: Number(e.total_lancamentos ?? 0),
    novosLancamentos: Number(e.novos_lancamentos ?? 0),
    criadoEm: String(e.created_at),
  }
}

function somarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

function chaveDe(l: { data: string; valor: number; descricao: string | null; documento: string | null }, conta: string | null): string {
  if (l.documento) return `doc:${conta ?? ""}:${l.documento}`
  return "h:" + createHash("sha256").update(`${conta ?? ""}|${l.data}|${l.valor.toFixed(2)}|${(l.descricao ?? "").trim().toLowerCase()}`).digest("hex").slice(0, 32)
}

// ── Importação ───────────────────────────────────────────────────────────────

export async function importarExtrato(p: {
  arquivo: File
  contaRotulo: string | null
  usuarioId: string
}): Promise<{ extratoId?: string; novos?: number; repetidos?: number; conciliados?: number; erro?: string }> {
  if (p.arquivo.size === 0) return { erro: "Escolha o arquivo do extrato." }
  if (p.arquivo.size > 8 * 1024 * 1024) return { erro: "O extrato deve ter no máximo 8 MB." }
  const bytes = new Uint8Array(await p.arquivo.arrayBuffer())
  const nome = p.arquivo.name
  const ext = nome.toLowerCase().split(".").pop() ?? ""
  const comeco = new TextDecoder("utf-8", { fatal: false }).decode(bytes.slice(0, 600)).toUpperCase()
  let lido: ExtratoLido
  let origem: "ofx" | "csv"
  if (ext === "ofx" || comeco.includes("OFXHEADER") || comeco.includes("<OFX>")) {
    lido = lerOfx(bytes)
    origem = "ofx"
  } else if (ext === "csv" || ext === "txt") {
    lido = lerExtratoCsv(bytes)
    origem = "csv"
  } else {
    return { erro: "Formato não reconhecido. Exporte o extrato em OFX (preferido) ou CSV." }
  }
  if (lido.lancamentos.length === 0) return { erro: "Nenhum lançamento encontrado no arquivo. Confira se é um extrato e se tem data e valor por linha." }
  if (lido.lancamentos.length > MAX_LINHAS) return { erro: `O arquivo tem mais de ${MAX_LINHAS.toLocaleString("pt-BR")} lançamentos; divida por período.` }

  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const conta = lido.conta ?? p.contaRotulo
  const { data: extrato, error } = await admin
    .from("banco_extratos")
    .insert({
      emp_proprietaria_id: emp,
      nome_arquivo: nome.slice(0, 160),
      origem,
      conta_rotulo: p.contaRotulo,
      banco: lido.banco,
      agencia: lido.agencia,
      conta: lido.conta,
      periodo_de: lido.periodoDe,
      periodo_ate: lido.periodoAte,
      saldo_final: lido.saldoFinal,
      total_lancamentos: lido.lancamentos.length,
      importado_por: p.usuarioId,
    })
    .select("id")
    .single()
  if (error || !extrato) {
    if (error && esquemaAusente(error)) return { erro: "Falta rodar o SQL supabase/banco-conciliacao.sql." }
    return { erro: `Não foi possível registrar o extrato: ${error?.message ?? "?"}` }
  }
  const extratoId = String(extrato.id)

  // Linhas novas (a chave única barra as repetidas de um extrato já importado).
  const linhas = lido.lancamentos.map((l) => ({
    emp_proprietaria_id: emp,
    extrato_id: extratoId,
    data: l.data,
    valor: l.valor,
    descricao: l.descricao?.slice(0, 300) ?? null,
    documento: l.documento?.slice(0, 120) ?? null,
    tipo: l.tipo?.slice(0, 40) ?? null,
    chave: chaveDe(l, conta),
  }))
  const chaves = linhas.map((l) => l.chave)
  const existentes = new Set<string>()
  for (let i = 0; i < chaves.length; i += 500) {
    const { data } = await admin.from("banco_lancamentos").select("chave").eq("emp_proprietaria_id", emp).in("chave", chaves.slice(i, i + 500))
    for (const d of data ?? []) existentes.add(String(d.chave))
  }
  const novas = linhas.filter((l, i) => !existentes.has(l.chave) && chaves.indexOf(l.chave) === i)
  for (let i = 0; i < novas.length; i += 500) {
    const { error: e } = await admin.from("banco_lancamentos").insert(novas.slice(i, i + 500))
    if (e) return { erro: `Falha ao gravar os lançamentos: ${e.message}` }
  }
  await admin.from("banco_extratos").update({ novos_lancamentos: novas.length }).eq("id", extratoId)

  const conciliados = await casarAutomaticamente(extratoId, p.usuarioId)
  return { extratoId, novos: novas.length, repetidos: linhas.length - novas.length, conciliados }
}

// ── Candidatas ───────────────────────────────────────────────────────────────

async function ordensCandidatas(lancs: Lancamento[]): Promise<Map<string, CandidataOrdem[]>> {
  const saida = new Map<string, CandidataOrdem[]>()
  const debitos = lancs.filter((l) => l.valor < 0)
  if (debitos.length === 0) return saida
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const datas = debitos.map((l) => l.data).sort()
  const de = somarDias(datas[0], -TOLERANCIA_ORDEM_DIAS)
  const ate = somarDias(datas[datas.length - 1], TOLERANCIA_ORDEM_DIAS)
  const { data: ordens } = await admin
    .from("ordens_pagamento")
    .select("id, codigo, descricao, valor_pago, valor_inicial_cobranca, data_pagamento, forma_pagamento, fornecedor_id, beneficiario_fornecedor_id, beneficiario_usuario_id, beneficiario_nome_avulso")
    .eq("emp_proprietaria_id", emp)
    .eq("situacao", "Paga")
    .not("excluido", "is", true)
    .gte("data_pagamento", de)
    .lte("data_pagamento", ate)
    .limit(5000)
  const lista = ordens ?? []
  if (lista.length === 0) return saida
  // Ordens já conciliadas ficam fora.
  const { data: usadas } = await admin.from("banco_lancamentos").select("ordem_id").eq("emp_proprietaria_id", emp).in("ordem_id", lista.map((o) => o.id)).eq("situacao", "conciliado")
  const jaUsadas = new Set((usadas ?? []).map((u) => String(u.ordem_id)))
  // Nomes dos favorecidos.
  const empIds = [...new Set(lista.flatMap((o) => [o.fornecedor_id, o.beneficiario_fornecedor_id]).filter((v): v is string => !!v))]
  const usuIds = [...new Set(lista.map((o) => o.beneficiario_usuario_id).filter((v): v is string => !!v))]
  const nomes = new Map<string, string>()
  if (empIds.length) {
    const { data } = await admin.from("empresa").select("id, empresa, nome_fantasia, nome_razao").in("id", empIds)
    for (const e of data ?? []) nomes.set(String(e.id), texto(e.empresa) ?? texto(e.nome_fantasia) ?? texto(e.nome_razao) ?? "")
  }
  if (usuIds.length) {
    const { data } = await admin.from("usuarios").select("id, nome_completo, nome_guerra").in("id", usuIds)
    for (const u of data ?? []) nomes.set(String(u.id), texto(u.nome_completo) ?? texto(u.nome_guerra) ?? "")
  }
  const candidatas: CandidataOrdem[] = lista
    .filter((o) => !jaUsadas.has(String(o.id)))
    .map((o) => ({
      id: String(o.id),
      codigo: texto(o.codigo),
      descricao: texto(o.descricao),
      favorecido:
        (o.beneficiario_fornecedor_id && nomes.get(String(o.beneficiario_fornecedor_id))) ||
        (o.fornecedor_id && nomes.get(String(o.fornecedor_id))) ||
        (o.beneficiario_usuario_id && nomes.get(String(o.beneficiario_usuario_id))) ||
        texto(o.beneficiario_nome_avulso),
      valorPago: Number(o.valor_pago ?? o.valor_inicial_cobranca ?? 0),
      dataPagamento: texto(o.data_pagamento)?.slice(0, 10) ?? null,
      forma: texto(o.forma_pagamento),
    }))
  for (const l of debitos) {
    const alvo = Math.abs(l.valor)
    const minimo = somarDias(l.data, -TOLERANCIA_ORDEM_DIAS)
    const maximo = somarDias(l.data, TOLERANCIA_ORDEM_DIAS)
    const porCodigo = l.documento || l.descricao ? candidatas.filter((c) => c.codigo && ((l.documento ?? "").includes(c.codigo) || (l.descricao ?? "").includes(c.codigo))) : []
    const porValor = candidatas.filter((c) => Math.abs(c.valorPago - alvo) < 0.005 && c.dataPagamento && c.dataPagamento >= minimo && c.dataPagamento <= maximo)
    const lista2 = [...porCodigo, ...porValor.filter((c) => !porCodigo.includes(c))]
    if (lista2.length) saida.set(l.id, lista2.slice(0, 6))
  }
  return saida
}

async function comprovacoesCandidatas(lancs: Lancamento[]): Promise<Map<string, CandidataComprovacao[]>> {
  const saida = new Map<string, CandidataComprovacao[]>()
  const creditos = lancs.filter((l) => l.valor > 0)
  if (creditos.length === 0) return saida
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const datas = creditos.map((l) => l.data).sort()
  const { data: comps } = await admin
    .from("filiacao_recebe_comprovacao")
    .select("id, remessa_id, fonte_pg_id, data, valor")
    .eq("emp_proprietaria_id", emp)
    .gte("data", somarDias(datas[0], -TOLERANCIA_DEPOSITO_DIAS))
    .lte("data", somarDias(datas[datas.length - 1], TOLERANCIA_DEPOSITO_DIAS))
    .limit(5000)
  const lista = comps ?? []
  if (lista.length === 0) return saida
  const { data: usadas } = await admin.from("banco_lancamentos").select("comprovacao_id").eq("emp_proprietaria_id", emp).in("comprovacao_id", lista.map((c) => c.id)).eq("situacao", "conciliado")
  const jaUsadas = new Set((usadas ?? []).map((u) => String(u.comprovacao_id)))
  const [remessas, fontes] = await Promise.all([listarRemessas().catch(() => []), listarFontesPagadoras().catch(() => [])])
  const rotuloRemessa = new Map(remessas.map((r) => [r.id, `${r.tipo ?? "Remessa"} ${r.rotulo}`]))
  const nomeFonte = new Map(fontes.map((f) => [f.id, f.nome_fantasia ?? f.nome_razao ?? "(fonte)"]))
  const candidatas: CandidataComprovacao[] = lista
    .filter((c) => !jaUsadas.has(String(c.id)))
    .map((c) => ({
      id: String(c.id),
      remessaRotulo: rotuloRemessa.get(String(c.remessa_id)) ?? "Remessa",
      fonte: nomeFonte.get(String(c.fonte_pg_id)) ?? "(fonte)",
      data: texto(c.data)?.slice(0, 10) ?? null,
      valor: Number(c.valor ?? 0),
    }))
  for (const l of creditos) {
    const minimo = somarDias(l.data, -TOLERANCIA_DEPOSITO_DIAS)
    const maximo = somarDias(l.data, TOLERANCIA_DEPOSITO_DIAS)
    const lista2 = candidatas.filter((c) => Math.abs(c.valor - l.valor) < 0.005 && c.data && c.data >= minimo && c.data <= maximo)
    if (lista2.length) saida.set(l.id, lista2.slice(0, 6))
  }
  return saida
}

/** Casa sozinho o que tem exatamente um candidato. Devolve quantos casou. */
async function casarAutomaticamente(extratoId: string, usuarioId: string): Promise<number> {
  const admin = await createAdminClient()
  const { data } = await admin.from("banco_lancamentos").select("*").eq("extrato_id", extratoId).eq("situacao", "pendente").limit(MAX_LINHAS)
  const lancs = (data ?? []).map((l) => montarLancamento(l as Record<string, unknown>))
  if (lancs.length === 0) return 0
  const [ordens, comps] = await Promise.all([ordensCandidatas(lancs), comprovacoesCandidatas(lancs)])
  // Uma ordem não pode casar com dois lançamentos no mesmo lote.
  const ordensUsadas = new Set<string>()
  const compsUsadas = new Set<string>()
  let n = 0
  for (const l of lancs) {
    const o = ordens.get(l.id)
    const c = comps.get(l.id)
    if (o && o.length === 1 && !ordensUsadas.has(o[0].id)) {
      ordensUsadas.add(o[0].id)
      const r = await conciliarComOrdem(l.id, o[0].id, usuarioId, true)
      if (!r.erro) n++
    } else if (c && c.length === 1 && !compsUsadas.has(c[0].id)) {
      compsUsadas.add(c[0].id)
      const r = await conciliarComComprovacao(l.id, c[0].id, usuarioId, true)
      if (!r.erro) n++
    }
  }
  return n
}

// ── Leitura ──────────────────────────────────────────────────────────────────

export async function resumoConciliacao(): Promise<ResumoConciliacao> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const vazio: ResumoConciliacao = { disponivel: false, pendentes: 0, pendentesCreditos: 0, pendentesDebitos: 0, conciliados: 0, ignorados: 0, ultimoExtrato: null, ordensSemExtrato: 0 }
  const { data: pend, error } = await admin.from("banco_lancamentos").select("valor").eq("emp_proprietaria_id", emp).eq("situacao", "pendente").limit(MAX_LINHAS)
  if (error) return esquemaAusente(error) ? vazio : { ...vazio, disponivel: true }
  const contar = async (situacao: string) => {
    const { count } = await admin.from("banco_lancamentos").select("id", { count: "exact", head: true }).eq("emp_proprietaria_id", emp).eq("situacao", situacao)
    return count ?? 0
  }
  const [conciliados, ignorados, ultimo] = await Promise.all([
    contar("conciliado"),
    contar("ignorado"),
    admin.from("banco_extratos").select("*").eq("emp_proprietaria_id", emp).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ])
  // Ordens pagas nos últimos 90 dias que nenhum lançamento aponta.
  const { data: pagas } = await admin
    .from("ordens_pagamento")
    .select("id")
    .eq("emp_proprietaria_id", emp)
    .eq("situacao", "Paga")
    .not("excluido", "is", true)
    .gte("data_pagamento", somarDias(hojeSP(), -90))
    .limit(5000)
  let semExtrato = 0
  if (pagas?.length) {
    const ids = pagas.map((p) => String(p.id))
    const { data: usadas } = await admin.from("banco_lancamentos").select("ordem_id").eq("emp_proprietaria_id", emp).eq("situacao", "conciliado").in("ordem_id", ids)
    const set = new Set((usadas ?? []).map((u) => String(u.ordem_id)))
    semExtrato = ids.filter((id) => !set.has(id)).length
  }
  const pendentes = pend ?? []
  return {
    disponivel: true,
    pendentes: pendentes.length,
    pendentesCreditos: pendentes.filter((p) => Number(p.valor) > 0).reduce((s, p) => s + Number(p.valor), 0),
    pendentesDebitos: pendentes.filter((p) => Number(p.valor) < 0).reduce((s, p) => s + Math.abs(Number(p.valor)), 0),
    conciliados,
    ignorados,
    ultimoExtrato: ultimo.data ? montarExtrato(ultimo.data as Record<string, unknown>) : null,
    ordensSemExtrato: semExtrato,
  }
}

export async function listarExtratos(limite = 20): Promise<Extrato[]> {
  const admin = await createAdminClient()
  const { data, error } = await admin.from("banco_extratos").select("*").eq("emp_proprietaria_id", await tenantAtual()).order("created_at", { ascending: false }).limit(limite)
  if (error) return []
  return (data ?? []).map((e) => montarExtrato(e as Record<string, unknown>))
}

export async function listarLancamentos(filtro: { situacao: Lancamento["situacao"]; extratoId?: string; limite?: number }): Promise<LancamentoComCandidatas[]> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  let q = admin.from("banco_lancamentos").select("*").eq("emp_proprietaria_id", emp).eq("situacao", filtro.situacao)
  if (filtro.extratoId) q = q.eq("extrato_id", filtro.extratoId)
  const { data, error } = await q.order("data", { ascending: false }).order("created_at", { ascending: false }).limit(filtro.limite ?? 300)
  if (error) return []
  const lancs = (data ?? []).map((l) => montarLancamento(l as Record<string, unknown>))
  if (lancs.length === 0) return []

  if (filtro.situacao !== "pendente") {
    // Só o nome do vínculo.
    const ordemIds = lancs.map((l) => l.ordemId).filter((v): v is string => !!v)
    const compIds = lancs.map((l) => l.comprovacaoId).filter((v): v is string => !!v)
    const nomes = new Map<string, string>()
    if (ordemIds.length) {
      const { data: os } = await admin.from("ordens_pagamento").select("id, codigo, descricao").in("id", ordemIds)
      for (const o of os ?? []) nomes.set(String(o.id), `Ordem ${texto(o.codigo) ?? ""} — ${(texto(o.descricao) ?? "").slice(0, 80)}`)
    }
    if (compIds.length) {
      const { data: cs } = await admin.from("filiacao_recebe_comprovacao").select("id, remessa_id, fonte_pg_id").in("id", compIds)
      const [remessas, fontes] = await Promise.all([listarRemessas().catch(() => []), listarFontesPagadoras().catch(() => [])])
      const rr = new Map(remessas.map((r) => [r.id, `${r.tipo ?? "Remessa"} ${r.rotulo}`]))
      const ff = new Map(fontes.map((f) => [f.id, f.nome_fantasia ?? f.nome_razao ?? "(fonte)"]))
      for (const c of cs ?? []) nomes.set(String(c.id), `Depósito ${rr.get(String(c.remessa_id)) ?? ""} — ${ff.get(String(c.fonte_pg_id)) ?? ""}`)
    }
    return lancs.map((l) => ({ ...l, ordens: [], comprovacoes: [], vinculo: (l.ordemId && nomes.get(l.ordemId)) || (l.comprovacaoId && nomes.get(l.comprovacaoId)) || null }))
  }
  const [ordens, comps] = await Promise.all([ordensCandidatas(lancs), comprovacoesCandidatas(lancs)])
  return lancs.map((l) => ({ ...l, ordens: ordens.get(l.id) ?? [], comprovacoes: comps.get(l.id) ?? [], vinculo: null }))
}

/** Remessas e fontes para criar uma comprovação de depósito a partir do extrato. */
export async function opcoesParaComprovacao(): Promise<{ remessas: { id: string; rotulo: string }[]; fontes: { id: string; nome: string }[] }> {
  const [remessas, fontes] = await Promise.all([listarRemessas().catch(() => []), listarFontesPagadoras().catch(() => [])])
  return {
    remessas: remessas.slice(0, 36).map((r) => ({ id: r.id, rotulo: `${r.tipo ?? "Remessa"} ${r.rotulo}` })),
    fontes: fontes.filter((f) => f.inativa !== true).map((f) => ({ id: f.id, nome: f.nome_fantasia ?? f.nome_razao ?? "(fonte)" })),
  }
}

// ── Escrita ──────────────────────────────────────────────────────────────────

async function lancamentoPendente(id: string): Promise<Lancamento | null> {
  const admin = await createAdminClient()
  const { data } = await admin.from("banco_lancamentos").select("*").eq("id", id).eq("emp_proprietaria_id", await tenantAtual()).maybeSingle()
  return data ? montarLancamento(data as Record<string, unknown>) : null
}

export async function conciliarComOrdem(lancamentoId: string, ordemId: string, usuarioId: string, automatico = false): Promise<{ erro?: string }> {
  const l = await lancamentoPendente(lancamentoId)
  if (!l) return { erro: "Lançamento não encontrado." }
  if (l.situacao !== "pendente") return { erro: "Este lançamento já foi tratado." }
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data: ordem } = await admin.from("ordens_pagamento").select("id, situacao, valor_pago, valor_inicial_cobranca").eq("id", ordemId).eq("emp_proprietaria_id", emp).maybeSingle()
  if (!ordem) return { erro: "Ordem não encontrada." }
  if (ordem.situacao !== "Paga") return { erro: "Só uma ordem PAGA pode ser conciliada com o extrato." }
  const { data: usada } = await admin.from("banco_lancamentos").select("id").eq("ordem_id", ordemId).eq("situacao", "conciliado").limit(1)
  if (usada?.length) return { erro: "Esta ordem já está conciliada com outro lançamento." }
  const valorOrdem = Number(ordem.valor_pago ?? ordem.valor_inicial_cobranca ?? 0)
  const diferenca = Math.abs(Math.abs(l.valor) - valorOrdem)
  const { error } = await admin
    .from("banco_lancamentos")
    .update({
      situacao: "conciliado",
      ordem_id: ordemId,
      comprovacao_id: null,
      automatico,
      conciliado_em: new Date().toISOString(),
      conciliado_por: usuarioId,
      observacao: diferenca >= 0.005 ? `Valor do extrato difere da ordem em ${diferenca.toFixed(2)}.` : null,
    })
    .eq("id", lancamentoId)
    .eq("situacao", "pendente")
  if (error) return { erro: error.message }
  await registrarEvento(ordemId, "conciliada", automatico ? null : usuarioId, `Conciliada com o extrato bancário (${l.data}, ${l.valor.toFixed(2)}${automatico ? ", automático" : ""}).`, { lancamento_id: lancamentoId, automatico }).catch(() => undefined)
  return {}
}

export async function conciliarComComprovacao(lancamentoId: string, comprovacaoId: string, usuarioId: string, automatico = false): Promise<{ erro?: string }> {
  const l = await lancamentoPendente(lancamentoId)
  if (!l) return { erro: "Lançamento não encontrado." }
  if (l.situacao !== "pendente") return { erro: "Este lançamento já foi tratado." }
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data: comp } = await admin.from("filiacao_recebe_comprovacao").select("id").eq("id", comprovacaoId).eq("emp_proprietaria_id", emp).maybeSingle()
  if (!comp) return { erro: "Comprovação não encontrada." }
  const { data: usada } = await admin.from("banco_lancamentos").select("id").eq("comprovacao_id", comprovacaoId).eq("situacao", "conciliado").limit(1)
  if (usada?.length) return { erro: "Esta comprovação já está conciliada com outro lançamento." }
  const { error } = await admin
    .from("banco_lancamentos")
    .update({ situacao: "conciliado", comprovacao_id: comprovacaoId, ordem_id: null, automatico, conciliado_em: new Date().toISOString(), conciliado_por: usuarioId })
    .eq("id", lancamentoId)
    .eq("situacao", "pendente")
  return error ? { erro: error.message } : {}
}

/** Crédito do extrato que ainda não tem comprovação: cria o depósito da fonte e concilia. */
export async function criarComprovacaoEConciliar(lancamentoId: string, remessaId: string, fonteId: string, usuarioId: string): Promise<{ erro?: string }> {
  const l = await lancamentoPendente(lancamentoId)
  if (!l) return { erro: "Lançamento não encontrado." }
  if (l.situacao !== "pendente") return { erro: "Este lançamento já foi tratado." }
  if (l.valor <= 0) return { erro: "Só um crédito vira depósito de fonte pagadora." }
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data: existente } = await admin.from("filiacao_recebe_comprovacao").select("id").eq("remessa_id", remessaId).eq("fonte_pg_id", fonteId).eq("emp_proprietaria_id", emp).limit(1).maybeSingle()
  if (existente) return { erro: "Esta fonte já tem comprovação nesta remessa — concilie com ela em vez de criar outra." }
  const { data: criada, error } = await admin
    .from("filiacao_recebe_comprovacao")
    .insert({ emp_proprietaria_id: emp, remessa_id: remessaId, fonte_pg_id: fonteId, data: l.data, valor: l.valor })
    .select("id")
    .single()
  if (error || !criada) return { erro: `Não foi possível criar a comprovação: ${error?.message ?? "?"}` }
  return conciliarComComprovacao(lancamentoId, String(criada.id), usuarioId)
}

export async function ignorarLancamento(lancamentoId: string, usuarioId: string, motivo: string | null): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin
    .from("banco_lancamentos")
    .update({ situacao: "ignorado", observacao: motivo, conciliado_em: new Date().toISOString(), conciliado_por: usuarioId })
    .eq("id", lancamentoId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("situacao", "pendente")
  return error ? { erro: error.message } : {}
}

export async function desfazerConciliacao(lancamentoId: string): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin
    .from("banco_lancamentos")
    .update({ situacao: "pendente", ordem_id: null, comprovacao_id: null, automatico: false, observacao: null, conciliado_em: null, conciliado_por: null })
    .eq("id", lancamentoId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .neq("situacao", "pendente")
  return error ? { erro: error.message } : {}
}

export async function excluirExtrato(extratoId: string): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { count } = await admin.from("banco_lancamentos").select("id", { count: "exact", head: true }).eq("extrato_id", extratoId).eq("situacao", "conciliado").eq("automatico", false)
  if ((count ?? 0) > 0) return { erro: "Este extrato tem lançamentos conciliados à mão — desfaça-os antes de excluir." }
  const { error } = await admin.from("banco_extratos").delete().eq("id", extratoId).eq("emp_proprietaria_id", emp)
  return error ? { erro: error.message } : {}
}
