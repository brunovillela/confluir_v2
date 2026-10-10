import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import { esquemaAusente, hojeSP, nomesDosUsuarios, texto } from "@/lib/db/comum"
import { contaDoGasto, listarContasDiaria, obterAutorizacaoDiarias, type QuadroDiaria } from "@/lib/db/diarias-config"
import { avisar, avisarQuemPode, avisarQuemPodeOuCoordena, depoisDaResposta } from "@/lib/db/avisos"
import { avaliarSolicitacaoDiaria, solicitacoesDaRemessa, type SolicitacaoDiaria } from "@/lib/db/diarias"
import { criarNotificacao } from "@/lib/db/notificacoes"
import { enviarPushTelegram } from "@/lib/db/telegram"
import { registrarEvento, SITUACAO_A_PAGAR, SITUACAO_EM_AUTORIZACAO } from "@/lib/db/ordens-ciclo"
import { inserirOrdemVerificada } from "@/lib/db/ordens-verificacao"
import { enviarEmail, type ContextoEmail } from "@/lib/email"
import { SITE_URL } from "@/lib/env"
import { formatarData, formatarMoeda } from "@/lib/formato"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * REMESSAS DE DIÁRIAS (05/10/2026). Cada diária lançada entra na remessa
 * ABERTA do beneficiário — uma por pessoa e quadro —, que vai acumulando
 * diárias e despesas. Desde 08/10 a AVALIAÇÃO É DA REMESSA: aprovada, nasce
 * UMA ordem com o valor dela (diárias líquidas das infrações + despesas),
 * rateada por centro de custo; devolvida, volta a quem lançou com o que não
 * está de acordo e é reenviada depois de corrigida.
 *
 * Mesma tabela das remessas migradas do sistema anterior
 * (pessoal_diarias_remessas); as novas não têm bubble_id e têm
 * beneficiario_tipo (supabase/diarias-remessas-autorizacao-custeio.sql).
 */

export type RemessaNova = {
  id: string
  codigo: string | null
  beneficiarioId: string | null
  beneficiarioNome: string | null
  quadro: QuadroDiaria
  departamentoId: string | null
  departamentoNome: string | null
  inicio: string | null
  termino: string | null
  valorTotal: number
  enviada: boolean
  enviadaEm: string | null
  enviadaPor: string | null
  ordemId: string | null
  ordemCodigo: string | null
  ordemSituacao: string | null
  /** Avaliação da remessa (08/10): aberta → aprovada, ou devolvida → reenviada → aprovada. */
  situacao: SituacaoRemessa
  devolucaoObservacao: string | null
  devolvidaEm: string | null
  devolvidaPor: string | null
  reenviadaEm: string | null
  /** Último lembrete de remessa em preparação (10/10). */
  lembreteEm: string | null
  historico: EventoRemessa[]
  createdAt: string | null
  /** Contagem das diárias por situação. */
  contagem: { aguardando: number; aprovada: number; reprovada: number; cancelada: number }
}

export type SituacaoRemessa = "preparacao" | "aberta" | "devolvida" | "reenviada" | "aprovada"

export type EventoRemessa = {
  em: string
  por: string | null
  porNome?: string | null
  acao: "enviada" | "devolvida" | "reenviada" | "aprovada"
  observacao?: string | null
  /** Na devolução: as diárias apontadas, com a não conformidade de cada uma. */
  pendencias?: { diariaId: string; observacao: string }[]
}

/**
 * Situação da avaliação a partir da linha crua. null = o SQL de 08/10
 * (supabase/diarias-remessa-avaliacao.sql) ainda não rodou — aí vale o
 * caminho anterior (aprovação por diária).
 */
export function situacaoDaRemessa(r: Record<string, unknown>): SituacaoRemessa | null {
  if (!("situacao" in r)) return null
  if (r.enviado === true) return "aprovada"
  const s = String(r.situacao ?? "aberta")
  return s === "preparacao" || s === "devolvida" || s === "reenviada" || s === "aprovada" ? s : "aberta"
}

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
]

/** Código no padrão das ordens (AAAA.MMDD.HHMM.SSNN, horário de SP). */
function gerarCodigo(): string {
  const partes = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date())
  const p = (tipo: string) => partes.find((x) => x.type === tipo)?.value ?? "00"
  const aleatorio = String(Math.floor(Math.random() * 100)).padStart(2, "0")
  return `${p("year")}.${p("month")}${p("day")}.${p("hour")}${p("minute")}.${p("second")}${aleatorio}`
}

/** Valor que a diária leva para a remessa: líquida das infrações, mais as despesas. */
export function valorNaRemessa(s: SolicitacaoDiaria): number {
  const liquida = (s.valor_total ?? 0) - (s.valorDescontos ?? 0)
  return Math.round((liquida + s.valorDespesas) * 100) / 100
}

/**
 * A remessa do beneficiário naquele quadro que ainda RECEBE diárias — em
 * preparação ou devolvida para correção —, ou uma nova em preparação. Remessa
 * já enviada para avaliação não recebe mais nada (10/10). null quando o SQL
 * das remessas ainda não rodou (o chamador degrada).
 */
export async function garantirRemessaAberta(
  beneficiarioId: string,
  quadro: QuadroDiaria,
  departamentoId: string | null
): Promise<string | null> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data, error } = await admin
    .from("pessoal_diarias_remessas")
    .select("id")
    .eq("emp_proprietaria_id", emp)
    .eq("beneficiario_id", beneficiarioId)
    .eq("beneficiario_tipo", quadro)
    .is("bubble_id", null)
    .not("enviado", "is", true)
    .in("situacao", ["preparacao", "devolvida"])
    .order("created_at", { ascending: true })
    .limit(1)
  if (error) {
    if (!esquemaAusente(error) && error.code !== "42703") console.error("garantirRemessaAberta:", error.message)
    return null
  }
  if (data?.[0]) return String(data[0].id)

  const agora = new Date()
  const { data: criada, error: erroIns } = await admin
    .from("pessoal_diarias_remessas")
    .insert({
      codigo: gerarCodigo(),
      beneficiario_id: beneficiarioId,
      beneficiario_tipo: quadro,
      departamento_id: departamentoId,
      ano: agora.getFullYear(),
      mes: MESES[agora.getMonth()],
      valor_total: 0,
      enviado: false,
      // Nasce em preparação: a pessoa junta as diárias e envia (10/10).
      situacao: "preparacao",
      emp_proprietaria_id: emp,
    })
    .select("id")
    .single()
  if (erroIns) {
    console.error("garantirRemessaAberta (criar):", erroIns.message)
    return null
  }
  return String(criada.id)
}

/** Recalcula total e período da remessa a partir das diárias dela. */
export async function recalcularRemessa(remessaId: string): Promise<void> {
  const solicitacoes = await solicitacoesDaRemessa(remessaId)
  // O valor da remessa é o que vai para avaliação: aguardando + aprovadas.
  const validas = solicitacoes.filter((s) => s.situacao === "aguardando" || s.situacao === "aprovada")
  const datas = validas
    .flatMap((s) => [s.data_inicio, s.data_termino])
    .filter((d): d is string => Boolean(d))
    .map((d) => d.slice(0, 10))
    .sort()
  const admin = await createAdminClient()
  await admin
    .from("pessoal_diarias_remessas")
    .update({
      valor_total: Math.round(validas.reduce((a, s) => a + valorNaRemessa(s), 0) * 100) / 100,
      inicio: datas[0] ?? null,
      termino: datas[datas.length - 1] ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", remessaId)
    .not("enviado", "is", true)
}

async function normalizar(brutas: Record<string, unknown>[]): Promise<RemessaNova[]> {
  if (brutas.length === 0) return []
  const admin = await createAdminClient()
  const ids = (campo: string) => [
    ...new Set(brutas.map((r) => texto(r[campo])).filter((v): v is string => Boolean(v))),
  ]
  const deptoIds = ids("departamento_id")
  const ordemIds = ids("ordem_pagamento_id")
  const historicos = brutas.map((r) => (Array.isArray(r.historico) ? (r.historico as EventoRemessa[]) : []))
  const [nomes, deptos, ordens, contagens] = await Promise.all([
    nomesDosUsuarios([
      ...ids("beneficiario_id"),
      ...ids("enviado_por"),
      ...ids("devolvida_por"),
      ...historicos.flat().map((h) => h.por).filter((v): v is string => Boolean(v)),
    ]),
    deptoIds.length
      ? admin.from("empresa_departamentos").select("id, departamento").in("id", deptoIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    ordemIds.length
      ? admin.from("ordens_pagamento").select("id, codigo, situacao").in("id", ordemIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    admin
      .from("pessoal_diarias_solicitacoes")
      .select("remessa_id, situacao")
      .in("remessa_id", brutas.map((r) => String(r.id))),
  ])
  const nomeDepto = new Map(
    ((deptos.data ?? []) as Record<string, unknown>[]).map((d) => [String(d.id), texto(d.departamento)])
  )
  const ordem = new Map(
    ((ordens.data ?? []) as Record<string, unknown>[]).map((o) => [
      String(o.id),
      { codigo: texto(o.codigo), situacao: texto(o.situacao) },
    ])
  )
  const contagem = new Map<string, RemessaNova["contagem"]>()
  for (const s of (contagens.data ?? []) as Record<string, unknown>[]) {
    const id = String(s.remessa_id)
    const c = contagem.get(id) ?? { aguardando: 0, aprovada: 0, reprovada: 0, cancelada: 0 }
    const sit = String(s.situacao) as keyof RemessaNova["contagem"]
    if (sit in c) c[sit]++
    contagem.set(id, c)
  }
  return brutas.map((r, i) => {
    const id = String(r.id)
    const ordemId = texto(r.ordem_pagamento_id)
    return {
      id,
      codigo: texto(r.codigo),
      beneficiarioId: texto(r.beneficiario_id),
      beneficiarioNome: texto(r.beneficiario_id) ? (nomes.get(String(r.beneficiario_id)) ?? null) : null,
      quadro: r.beneficiario_tipo === "diretor" ? "diretor" : "funcionario",
      departamentoId: texto(r.departamento_id),
      departamentoNome: texto(r.departamento_id) ? (nomeDepto.get(String(r.departamento_id)) ?? null) : null,
      inicio: texto(r.inicio),
      termino: texto(r.termino),
      valorTotal: Number(r.valor_total ?? 0) || 0,
      enviada: r.enviado === true,
      enviadaEm: texto(r.enviado_em),
      enviadaPor: texto(r.enviado_por) ? (nomes.get(String(r.enviado_por)) ?? null) : null,
      ordemId,
      ordemCodigo: ordemId ? (ordem.get(ordemId)?.codigo ?? null) : null,
      ordemSituacao: ordemId ? (ordem.get(ordemId)?.situacao ?? null) : null,
      situacao: situacaoDaRemessa(r) ?? (r.enviado === true ? "aprovada" : "aberta"),
      devolucaoObservacao: texto(r.devolucao_observacao),
      devolvidaEm: texto(r.devolvida_em),
      devolvidaPor: texto(r.devolvida_por) ? (nomes.get(String(r.devolvida_por)) ?? null) : null,
      reenviadaEm: texto(r.reenviada_em),
      lembreteEm: texto(r.lembrete_em),
      historico: historicos[i].map((h) => ({ ...h, porNome: h.por ? (nomes.get(h.por) ?? null) : null })),
      createdAt: texto(r.created_at),
      contagem: contagem.get(id) ?? { aguardando: 0, aprovada: 0, reprovada: 0, cancelada: 0 },
    }
  })
}

/** Remessas novas de um quadro (abertas primeiro), ou de uma pessoa. */
export async function listarRemessasNovas(filtro: {
  quadro?: QuadroDiaria
  beneficiarioId?: string
}): Promise<{ disponivel: boolean; remessas: RemessaNova[] }> {
  const admin = await createAdminClient()
  let q = admin
    .from("pessoal_diarias_remessas")
    .select("*")
    .eq("emp_proprietaria_id", await tenantAtual())
    .is("bubble_id", null)
  if (filtro.quadro) q = q.eq("beneficiario_tipo", filtro.quadro)
  if (filtro.beneficiarioId) q = q.eq("beneficiario_id", filtro.beneficiarioId)
  const { data, error } = await q
    .order("enviado", { ascending: true })
    .order("created_at", { ascending: false })
    .range(0, 999)
  if (error) {
    if (esquemaAusente(error) || error.code === "42703") return { disponivel: false, remessas: [] }
    throw new Error(`Falha ao listar as remessas de diárias: ${error.message}`)
  }
  return { disponivel: true, remessas: await normalizar((data ?? []) as Record<string, unknown>[]) }
}

export async function obterRemessaNova(
  id: string
): Promise<{ remessa: RemessaNova; solicitacoes: SolicitacaoDiaria[] } | null> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("pessoal_diarias_remessas")
    .select("*")
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
    .is("bubble_id", null)
    .maybeSingle()
  if (error || !data) return null
  const [[remessa], solicitacoes] = await Promise.all([
    normalizar([data as Record<string, unknown>]),
    solicitacoesDaRemessa(id),
  ])
  return { remessa, solicitacoes }
}


// ── Avaliação da remessa (08/10/2026) ──────────────────────────────────────
//
// A aprovação é da REMESSA, não de cada diária: o avaliador confere todas as
// diárias e despesas juntas e aprova (nasce a ordem com o valor da remessa,
// rateada por centro de custo) ou DEVOLVE com a observação do que não está de
// acordo — no geral e em cada diária apontada. Devolvida, quem lançou corrige
// (cancela a diária, ajusta despesas, relança) e reenvia.

type Admin = Awaited<ReturnType<typeof createAdminClient>>

function erroSql(e: { message: string; code?: string }): string {
  if (e.code === "42703" || e.code === "PGRST204" || /situacao|historico|devolu|reenviada|pendencia/i.test(e.message)) {
    return "A avaliação por remessa ainda não está no banco — rode supabase/diarias-remessa-avaliacao.sql no SQL Editor."
  }
  return e.message
}

/** Grava um passo no histórico da remessa, se ela ainda estiver numa das situações esperadas. */
async function avancarRemessa(
  admin: Admin,
  remessaId: string,
  de: SituacaoRemessa[],
  evento: EventoRemessa,
  campos: Record<string, unknown>
): Promise<{ erro?: string }> {
  const { data: atual, error: erroLer } = await admin
    .from("pessoal_diarias_remessas")
    .select("historico")
    .eq("id", remessaId)
    .maybeSingle()
  if (erroLer) return { erro: erroSql(erroLer) }
  const historico = Array.isArray(atual?.historico) ? (atual.historico as EventoRemessa[]) : []
  const { data, error } = await admin
    .from("pessoal_diarias_remessas")
    .update({ ...campos, historico: [...historico, evento], updated_at: new Date().toISOString() })
    .eq("id", remessaId)
    .in("situacao", de)
    .not("enviado", "is", true)
    .select("id")
  if (error) return { erro: erroSql(error) }
  if ((data ?? []).length === 0) return { erro: "A remessa mudou de situação enquanto você avaliava — recarregue a página." }
  return {}
}

/** Aviso direto (sino + Telegram + e-mail) a quem recebe e a quem lançou. */
async function avisarPessoas(ids: string[], mensagem: string, assunto: string, link: string): Promise<void> {
  const unicos = [...new Set(ids.filter(Boolean))]
  if (unicos.length === 0) return
  const admin = await createAdminClient()
  const { data: usuarios } = await admin
    .from("usuarios")
    .select("id, email, nome_completo, nome_guerra")
    .in("id", unicos)
  for (const u of (usuarios ?? []) as Record<string, unknown>[]) {
    const id = String(u.id)
    try {
      await criarNotificacao({ usuarioId: id, texto: mensagem })
    } catch (e) {
      console.error("Aviso da remessa de diárias:", e)
    }
    await enviarPushTelegram(id, mensagem, "diarias")
    const email = texto(u.email)
    if (!email) continue
    const nome = texto(u.nome_completo) ?? texto(u.nome_guerra)
    await enviarEmail({
      email,
      nome,
      assunto: `${assunto} — {ENTIDADE}`,
      html: `<p>Olá${nome ? `, ${nome.split(" ")[0]}` : ""}!</p><p>${mensagem.replace(/\n/g, "<br>")}</p><p>Acompanhe em <a href="${SITE_URL}${link}">${SITE_URL}${link}</a>.</p><p>Confluir — {ENTIDADE}</p>`,
    })
  }
}

/** Quem recebe e quem lançou as diárias da remessa (a secretaria pelo diretor). */
function interessados(remessa: RemessaNova, solicitacoes: SolicitacaoDiaria[]): string[] {
  return [remessa.beneficiarioId ?? "", ...solicitacoes.map((s) => s.solicitanteId ?? "")]
}

export type ResultadoAprovacao = {
  erro?: string
  ordemId?: string
  ordemCodigo?: string
  movidas?: number
  /** A ordem nasceu autorizada (A pagar) ou foi para a fila de autorização. */
  ordemAutorizada?: boolean
}

/**
 * APROVA a remessa: aprova as diárias aguardando (abatendo as infrações de
 * trânsito, como antes) e gera UMA ordem com o valor da remessa, rateada pelos
 * centros de custo do de-para (quadro × departamento × tipo de gasto).
 */
export async function aprovarRemessaDiarias(
  remessaId: string,
  avaliadorId: string,
  opcoes: {
    aplicarDescontos?: boolean
    /** Alçada financeira de quem aprova (0 = sem alçada) — vale no modo "alcada". */
    alcada?: number
  } = {}
): Promise<ResultadoAprovacao> {
  const dados = await obterRemessaNova(remessaId)
  if (!dados) return { erro: "Remessa não encontrada." }
  const { remessa, solicitacoes } = dados
  if (remessa.enviada) return { erro: "Esta remessa já foi aprovada." }
  if (remessa.situacao === "preparacao") {
    return { erro: "Esta remessa ainda está em preparação — quem lançou as diárias precisa enviá-la para avaliação." }
  }
  if (!remessa.beneficiarioId) return { erro: "Remessa sem beneficiário." }
  const aguardando = solicitacoes.filter((s) => s.situacao === "aguardando")
  const jaAprovadas = solicitacoes.filter((s) => s.situacao === "aprovada" && !s.ordem_pagamento_id)
  if (aguardando.length === 0 && jaAprovadas.length === 0) {
    return { erro: "Nenhuma diária a aprovar nesta remessa." }
  }
  const semValor = aguardando.filter((s) => s.valor_total === null && s.valorDespesas === 0)
  if (semValor.length) {
    return {
      erro: `${semValor.length} diária(s) sem valor de reembolso no tipo — defina o valor na tabela de tipos ou devolva a remessa.`,
    }
  }

  // 1. Cada diária aguardando vira aprovada (com o desconto das infrações).
  const falhas: string[] = []
  for (const s of aguardando) {
    const { erro } = await avaliarSolicitacaoDiaria(s.id, avaliadorId, true, null, opcoes.aplicarDescontos !== false, {
      viaRemessa: true,
    })
    if (erro) falhas.push(`${s.tipoNome ?? "Diária"} (${s.data_inicio ? formatarData(s.data_inicio) : "sem data"}): ${erro}`)
  }
  if (falhas.length) {
    await recalcularRemessa(remessaId)
    return {
      erro: `Não foi possível aprovar ${falhas.length} diária(s): ${falhas.join("; ")}. As demais ficaram aprovadas — tente de novo.`,
    }
  }

  // 2. A ordem com o valor da remessa e o rateio.
  return gerarOrdemDaRemessa(remessaId, avaliadorId, opcoes.alcada ?? 0)
}

/**
 * Gera a ordem da remessa (diárias aprovadas + despesas), rateada por centro
 * de custo, e fecha a remessa. Diária que entrou enquanto a remessa era
 * avaliada passa para a próxima remessa do beneficiário.
 */
async function gerarOrdemDaRemessa(
  remessaId: string,
  usuarioId: string,
  alcada: number
): Promise<ResultadoAprovacao> {
  const dados = await obterRemessaNova(remessaId)
  if (!dados) return { erro: "Remessa não encontrada." }
  const { remessa, solicitacoes } = dados
  if (remessa.enviada) return { erro: "Esta remessa já foi aprovada." }
  if (!remessa.beneficiarioId) return { erro: "Remessa sem beneficiário." }
  const aprovadas = solicitacoes.filter((s) => s.situacao === "aprovada" && !s.ordem_pagamento_id)
  const aguardando = solicitacoes.filter((s) => s.situacao === "aguardando")
  if (aprovadas.length === 0) return { erro: "Nenhuma diária aprovada nesta remessa." }

  const admin = await createAdminClient()
  const emp = await tenantAtual()
  // Trava a remessa antes de gerar a ordem: duas pessoas não aprovam a mesma.
  const { data: travada, error: erroTrava } = await admin
    .from("pessoal_diarias_remessas")
    .update({ enviado: true, enviado_em: new Date().toISOString(), enviado_por: usuarioId })
    .eq("id", remessaId)
    .not("enviado", "is", true)
    .select("id")
  if (erroTrava) return { erro: `Não foi possível aprovar: ${erroTrava.message}` }
  if ((travada ?? []).length === 0) return { erro: "Esta remessa já foi aprovada por outra pessoa." }
  const destravar = () =>
    admin
      .from("pessoal_diarias_remessas")
      .update({ enviado: false, enviado_em: null, enviado_por: null })
      .eq("id", remessaId)

  // Rateio POR CENTRO DE CUSTO: cada diária e cada despesa cai na conta do
  // de-para; o que vai para a mesma conta (e departamento) soma numa linha.
  const { contas } = await listarContasDiaria()
  const grupos = new Map<
    string,
    { centro: string | null; depto: string | null; valor: number; itens: Map<string, number> }
  >()
  const somar = (centro: string | null, depto: string | null, rotulo: string, valor: number) => {
    const chave = `${centro ?? "-"}|${depto ?? "-"}`
    const g = grupos.get(chave) ?? { centro, depto, valor: 0, itens: new Map<string, number>() }
    g.valor = Math.round((g.valor + valor) * 100) / 100
    g.itens.set(rotulo, (g.itens.get(rotulo) ?? 0) + 1)
    grupos.set(chave, g)
  }
  for (const s of aprovadas) {
    somar(
      contaDoGasto(contas, remessa.quadro, s.departamentoId, null),
      s.departamentoId,
      "diária",
      Math.round(((s.valor_total ?? 0) - (s.valorDescontos ?? 0)) * 100) / 100
    )
    for (const d of s.despesas) {
      somar(
        contaDoGasto(contas, remessa.quadro, s.departamentoId, d.tipoId),
        s.departamentoId,
        (d.tipoNome ?? "despesa").toLowerCase(),
        d.valor
      )
    }
  }
  const linhasRateio = [...grupos.values()]
    .filter((g) => g.valor !== 0)
    .sort((a, b) => b.valor - a.valor)
    .map((g) => ({
      centro: g.centro,
      depto: g.depto,
      valor: g.valor,
      descricao: [...g.itens.entries()].map(([rotulo, n]) => `${n} ${rotulo}${n > 1 ? "(s)" : ""}`).join(" + "),
    }))

  const total = Math.round(aprovadas.reduce((a, s) => a + valorNaRemessa(s), 0) * 100) / 100
  const totalDiarias = aprovadas.reduce((a, s) => a + ((s.valor_total ?? 0) - (s.valorDescontos ?? 0)), 0)
  const totalDespesas = aprovadas.reduce((a, s) => a + s.valorDespesas, 0)
  const datas = aprovadas
    .flatMap((s) => [s.data_inicio, s.data_termino])
    .filter((d): d is string => Boolean(d))
    .map((d) => d.slice(0, 10))
    .sort()
  const periodo = datas.length ? `${formatarData(datas[0])} a ${formatarData(datas[datas.length - 1])}` : null
  const codigo = gerarCodigo()
  const descricao = [
    `Remessa de diárias ${remessa.codigo ?? ""} — ${aprovadas.length} diária(s) de ${remessa.beneficiarioNome ?? "beneficiário"}`,
    remessa.quadro === "diretor" ? "(diretoria)" : null,
    periodo ? `período ${periodo}.` : ".",
    `Diárias ${formatarMoeda(totalDiarias)}${totalDespesas ? ` + despesas ${formatarMoeda(totalDespesas)}` : ""}.`,
    linhasRateio.length > 1 ? `Rateada em ${linhasRateio.length} centros de custo.` : null,
  ]
    .filter(Boolean)
    .join(" ")
    .replace(" .", ".")

  // Autorização da ordem (08/10): pela regra das diárias em financeiro_config —
  // "remessa" autoriza sempre; "alcada" só se o valor couber na alçada de quem
  // aprovou a remessa. Fora disso, a ordem vai para a fila "Em autorização".
  const { modo } = await obterAutorizacaoDiarias()
  const autoriza = modo === "remessa" || (alcada > 0 && total <= alcada)
  const autorizacao = autoriza
    ? `Autorizada na aprovação da remessa de diárias ${remessa.codigo ?? ""}${modo === "alcada" ? ` (dentro da alçada de ${formatarMoeda(alcada)})` : ""}.`
    : null
  const { data: ordem, error: erroOrdem } = await inserirOrdemVerificada(
    {
      codigo,
      tipo: "Diária",
      descricao,
      ...(autoriza
        ? {
            situacao: SITUACAO_A_PAGAR,
            autorizacao_esta_autorizado: true,
            autorizacao_autorizador_id: usuarioId,
            // Coluna DATE no legado — o dia de SP.
            autorizacao_data: hojeSP(),
            autorizacao_observacao: autorizacao,
          }
        : { situacao: SITUACAO_EM_AUTORIZACAO }),
      valor_inicial_cobranca: total,
      beneficiario_usuario_id: remessa.beneficiarioId,
      // Conta predominante na ordem; o rateio detalha todas.
      centro_custo_despesa_id: linhasRateio[0]?.centro ?? null,
      departamento_id: remessa.departamentoId ?? aprovadas[0].departamentoId,
      emp_proprietaria_id: emp,
    },
    { dataInicio: datas[0] ?? null }
  )
  if (erroOrdem || !ordem) {
    await destravar()
    return { erro: `Não foi possível gerar a ordem de pagamento: ${erroOrdem?.message}` }
  }

  if (linhasRateio.length > 1) {
    const { error: erroRateio } = await admin.from("ordens_pagamento_rateio").insert(
      linhasRateio.map((l, i) => ({
        ordem_id: ordem.id,
        centro_custo_despesa_id: l.centro,
        departamento_id: l.depto,
        descricao: l.descricao,
        valor: l.valor,
        ordem: i,
        emp_proprietaria_id: emp,
      }))
    )
    if (erroRateio && !esquemaAusente(erroRateio)) {
      console.error("Rateio da remessa de diárias:", erroRateio.message)
    }
  }

  const { error: erroLiga } = await admin
    .from("pessoal_diarias_solicitacoes")
    .update({ ordem_pagamento_id: ordem.id, updated_at: new Date().toISOString() })
    .in("id", aprovadas.map((s) => s.id))
  if (erroLiga) {
    // Sem o vínculo das diárias a ordem perde o detalhamento: desfaz tudo.
    await admin.from("ordens_pagamento").delete().eq("id", ordem.id)
    await destravar()
    return { erro: `Não foi possível vincular as diárias à ordem: ${erroLiga.message}` }
  }

  const evento: EventoRemessa = {
    em: new Date().toISOString(),
    por: usuarioId,
    acao: "aprovada",
    observacao: `Ordem ${codigo} — ${formatarMoeda(total)}${autoriza ? ", autorizada" : ", na fila de autorização (acima da alçada)"}${linhasRateio.length > 1 ? `, rateada em ${linhasRateio.length} centros de custo` : ""}.`,
  }
  const { data: atual } = await admin.from("pessoal_diarias_remessas").select("historico").eq("id", remessaId).maybeSingle()
  const historico = Array.isArray(atual?.historico) ? (atual.historico as EventoRemessa[]) : []
  const fechamento: Record<string, unknown> = {
    ordem_pagamento_id: ordem.id,
    valor_total: total,
    inicio: datas[0] ?? null,
    termino: datas[datas.length - 1] ?? null,
  }
  const { error: erroFecha } = await admin
    .from("pessoal_diarias_remessas")
    .update({ ...fechamento, situacao: "aprovada", historico: [...historico, evento] })
    .eq("id", remessaId)
  // Sem o SQL de 08/10 as colunas novas não existem: grava o essencial.
  if (erroFecha) await admin.from("pessoal_diarias_remessas").update(fechamento).eq("id", remessaId)

  // Diárias que entraram durante a avaliação seguem para a próxima remessa.
  let movidas = 0
  if (aguardando.length) {
    const nova = await garantirRemessaAberta(remessa.beneficiarioId, remessa.quadro, remessa.departamentoId)
    if (nova) {
      const { data: mv } = await admin
        .from("pessoal_diarias_solicitacoes")
        .update({ remessa_id: nova })
        .in("id", aguardando.map((s) => s.id))
        .select("id")
      movidas = (mv ?? []).length
      await recalcularRemessa(nova)
    }
  }

  await registrarEvento(
    ordem.id,
    "criada",
    usuarioId,
    `Gerada pela aprovação da remessa de diárias ${remessa.codigo ?? ""} (${aprovadas.length} diária(s)).`,
    { remessa_id: remessaId, diarias: aprovadas.map((s) => s.id) }
  )
  if (autoriza) {
    await registrarEvento(ordem.id, "autorizada", usuarioId, autorizacao, { valor: total, alcada, modo, remessa_id: remessaId })
  }
  // Avisos (sino, Telegram, e-mail) depois da resposta: a tela não espera os envios.
  depoisDaResposta(() =>
    avisarPessoas(
      interessados(remessa, aprovadas),
      `A remessa de diárias ${remessa.codigo ?? ""} de ${remessa.beneficiarioNome ?? "beneficiário"} foi APROVADA: ${aprovadas.length} diária(s), ${formatarMoeda(total)}. Ordem de pagamento ${codigo} ${autoriza ? "já autorizada — segue para pagamento no financeiro" : "na fila de autorização do financeiro"}.`,
      "Remessa de diárias aprovada",
      "/painel/perfil/diarias"
    )
  )
  return { ordemId: ordem.id, ordemCodigo: codigo, movidas, ordemAutorizada: autoriza }
}

/**
 * DEVOLVE a remessa a quem lançou, com a observação geral e, em cada diária
 * apontada, a não conformidade. As diárias continuam aguardando.
 */
export async function devolverRemessaDiarias(
  remessaId: string,
  avaliadorId: string,
  observacao: string,
  pendencias: { diariaId: string; observacao: string }[]
): Promise<{ erro?: string }> {
  const dados = await obterRemessaNova(remessaId)
  if (!dados) return { erro: "Remessa não encontrada." }
  const { remessa, solicitacoes } = dados
  if (remessa.enviada) return { erro: "Esta remessa já foi aprovada." }
  if (!observacao.trim()) return { erro: "Diga o que não está de acordo — a observação é obrigatória para devolver." }
  const aguardando = new Set(solicitacoes.filter((s) => s.situacao === "aguardando").map((s) => s.id))
  if (aguardando.size === 0) return { erro: "Não há diária aguardando avaliação nesta remessa." }
  const apontadas = pendencias
    .filter((p) => aguardando.has(p.diariaId) && p.observacao.trim())
    .map((p) => ({ diariaId: p.diariaId, observacao: p.observacao.trim() }))

  const admin = await createAdminClient()
  const agora = new Date().toISOString()
  const r = await avancarRemessa(
    admin,
    remessaId,
    ["aberta", "reenviada", "devolvida"],
    { em: agora, por: avaliadorId, acao: "devolvida", observacao, pendencias: apontadas },
    { situacao: "devolvida", devolucao_observacao: observacao, devolvida_em: agora, devolvida_por: avaliadorId }
  )
  if (r.erro) return r

  // Apontamentos por diária: limpa os da devolução anterior e grava os novos.
  await admin.from("pessoal_diarias_solicitacoes").update({ pendencia_observacao: null }).eq("remessa_id", remessaId)
  for (const p of apontadas) {
    await admin.from("pessoal_diarias_solicitacoes").update({ pendencia_observacao: p.observacao }).eq("id", p.diariaId)
  }

  const lista = apontadas
    .map((p) => {
      const s = solicitacoes.find((x) => x.id === p.diariaId)
      const quando = s?.data_inicio ? ` de ${formatarData(s.data_inicio)}` : ""
      return `• ${s?.tipoNome ?? "Diária"}${quando}: ${p.observacao}`
    })
    .join("\n")
  // Avisos (sino, Telegram, e-mail) depois da resposta: a tela não espera os envios.
  depoisDaResposta(() =>
    avisarPessoas(
      interessados(remessa, solicitacoes),
      `A remessa de diárias ${remessa.codigo ?? ""} de ${remessa.beneficiarioNome ?? "beneficiário"} foi DEVOLVIDA para correção: ${observacao}${lista ? `\n${lista}` : ""}\nCorrija e reenvie a remessa para avaliação.`,
      "Remessa de diárias devolvida",
      "/painel/perfil/diarias"
    )
  )
  return {}
}

/** Reenvia a remessa devolvida, já corrigida, para avaliação. */
export async function reenviarRemessaDiarias(
  remessaId: string,
  usuarioId: string,
  resposta: string | null
): Promise<{ erro?: string }> {
  const dados = await obterRemessaNova(remessaId)
  if (!dados) return { erro: "Remessa não encontrada." }
  const { remessa, solicitacoes } = dados
  if (remessa.situacao !== "devolvida") return { erro: "Só a remessa devolvida é reenviada." }
  if (!solicitacoes.some((s) => s.situacao === "aguardando")) {
    return { erro: "A remessa ficou sem diárias aguardando — lance a diária corrigida antes de reenviar." }
  }
  const admin = await createAdminClient()
  const r = await avancarRemessa(
    admin,
    remessaId,
    ["devolvida"],
    { em: new Date().toISOString(), por: usuarioId, acao: "reenviada", observacao: resposta },
    { situacao: "reenviada", reenviada_em: new Date().toISOString() }
  )
  if (r.erro) return r

  const nomes = await nomesDosUsuarios([usuarioId])
  const link =
    remessa.quadro === "diretor"
      ? `/painel/institucional/diretoria/diarias/remessas/${remessaId}`
      : `/painel/pessoal/diarias/remessas/${remessaId}`
  const aviso = {
    texto: `${nomes.get(usuarioId) ?? "Alguém"} corrigiu e reenviou a remessa de diárias ${remessa.codigo ?? ""} de ${remessa.beneficiarioNome ?? "beneficiário"}${resposta ? ` — ${resposta}` : ""}.`.slice(0, 300),
    evento: "pendencia_pessoal" as const,
    assunto: "Remessa de diárias reenviada",
    exceto: usuarioId,
    link,
  }
  depoisDaResposta(() =>
    remessa.quadro === "diretor"
      ? avisarQuemPode("diretoria_diarias", ["configuracoes"], aviso)
      : avisarQuemPodeOuCoordena("pessoal_gestao", ["pessoal_diarias"], remessa.beneficiarioId, aviso)
  )
  return {}
}

/**
 * Quem gere as diárias retira uma diária aguardando da remessa (cancela) —
 * a correção de uma não conformidade quando o beneficiário não tem acesso
 * (quase toda a diretoria).
 */
export async function retirarDiariaDaRemessa(
  diariaId: string,
  usuarioId: string,
  motivo: string | null
): Promise<{ erro?: string; remessaId?: string }> {
  const admin = await createAdminClient()
  const nomes = await nomesDosUsuarios([usuarioId])
  const { data, error } = await admin
    .from("pessoal_diarias_solicitacoes")
    .update({
      situacao: "cancelada",
      avaliacao_observacao: `Retirada da remessa por ${nomes.get(usuarioId) ?? "quem gere as diárias"}${motivo ? `: ${motivo}` : "."}`,
      updated_at: new Date().toISOString(),
    })
    .eq("id", diariaId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("situacao", "aguardando")
    .select("remessa_id")
  if (error) return { erro: `Não foi possível retirar: ${error.message}` }
  const remessaId = texto((data ?? [])[0]?.remessa_id)
  if (!remessaId) return { erro: "Diária não encontrada ou já avaliada." }
  await recalcularRemessa(remessaId)
  return { remessaId }
}

// ── Remessa em preparação (10/10/2026) ─────────────────────────────────────

/** Quem pode ENVIAR a remessa: o beneficiário ou quem lançou alguma diária dela. */
export function podeEnviarRemessa(usuarioId: string, remessa: RemessaNova, solicitacoes: SolicitacaoDiaria[]): boolean {
  return remessa.beneficiarioId === usuarioId || solicitacoes.some((s) => s.solicitanteId === usuarioId)
}

/**
 * ENVIA a remessa em preparação para avaliação: ela entra na fila de quem
 * avalia (avisado agora) e deixa de receber diárias — a próxima abre outra.
 */
export async function enviarRemessaParaAvaliacao(remessaId: string, usuarioId: string): Promise<{ erro?: string }> {
  const dados = await obterRemessaNova(remessaId)
  if (!dados) return { erro: "Remessa não encontrada." }
  const { remessa, solicitacoes } = dados
  if (remessa.situacao !== "preparacao") return { erro: "Esta remessa já foi enviada para avaliação." }
  if (!podeEnviarRemessa(usuarioId, remessa, solicitacoes)) {
    return { erro: "Só quem lançou as diárias envia a remessa para avaliação." }
  }
  const aguardando = solicitacoes.filter((s) => s.situacao === "aguardando")
  if (aguardando.length === 0) return { erro: "A remessa não tem diária para avaliar." }

  const admin = await createAdminClient()
  const agora = new Date().toISOString()
  const r = await avancarRemessa(
    admin,
    remessaId,
    ["preparacao"],
    { em: agora, por: usuarioId, acao: "enviada", observacao: `${aguardando.length} diária(s), ${formatarMoeda(remessa.valorTotal)}.` },
    { situacao: "aberta", enviada_avaliacao_em: agora, enviada_avaliacao_por: usuarioId }
  )
  if (r.erro) return r

  const link =
    remessa.quadro === "diretor"
      ? `/painel/institucional/diretoria/diarias/remessas/${remessaId}`
      : `/painel/pessoal/diarias/remessas/${remessaId}`
  const aviso = {
    texto: `Remessa de diárias de ${remessa.beneficiarioNome ?? "beneficiário"} enviada para avaliação: ${aguardando.length} diária(s), ${formatarMoeda(remessa.valorTotal)}.`.slice(0, 300),
    evento: "pendencia_pessoal" as const,
    assunto: "Remessa de diárias a avaliar",
    exceto: usuarioId,
    link,
  }
  depoisDaResposta(() =>
    remessa.quadro === "diretor"
      ? avisarQuemPode("diretoria_diarias", ["configuracoes"], aviso)
      : avisarQuemPodeOuCoordena("pessoal_gestao", ["pessoal_diarias"], remessa.beneficiarioId, aviso)
  )
  return {}
}

/**
 * Rotina diária (api/diarias/lembrete/tick): remessa em preparação cuja
 * primeira diária aguardando tem 7 dias ou mais lembra o beneficiário e quem
 * lançou de enviá-la. Um lembrete por semana por remessa.
 */
export async function lembrarRemessasEmPreparacao(
  tenantId: string,
  client: SupabaseClient,
  contexto: ContextoEmail
): Promise<{ remessas: number; avisos: number }> {
  const seteDias = Date.now() - 7 * 24 * 60 * 60 * 1000
  const { data: rems, error } = await client
    .from("pessoal_diarias_remessas")
    .select("id, codigo, beneficiario_id, beneficiario_tipo, valor_total, lembrete_em")
    .eq("emp_proprietaria_id", tenantId)
    .is("bubble_id", null)
    .not("enviado", "is", true)
    .eq("situacao", "preparacao")
  if (error) {
    if (!esquemaAusente(error) && error.code !== "42703") console.error("lembrarRemessasEmPreparacao:", error.message)
    return { remessas: 0, avisos: 0 }
  }
  let remessas = 0
  let avisos = 0
  for (const rem of (rems ?? []) as Record<string, unknown>[]) {
    if (rem.lembrete_em && new Date(String(rem.lembrete_em)).getTime() > seteDias) continue
    const { data: dias } = await client
      .from("pessoal_diarias_solicitacoes")
      .select("created_at, solicitante_id")
      .eq("remessa_id", String(rem.id))
      .eq("situacao", "aguardando")
      .order("created_at", { ascending: true })
    const lista = (dias ?? []) as { created_at: string; solicitante_id: string | null }[]
    if (!lista.length || new Date(lista[0].created_at).getTime() > seteDias) continue
    const ids = [...new Set([texto(rem.beneficiario_id), ...lista.map((d) => d.solicitante_id)].filter((v): v is string => Boolean(v)))]
    const { data: us } = await client.from("usuarios").select("id, email, nome_completo, nome_guerra").in("id", ids)
    const destinatarios = ((us ?? []) as Record<string, unknown>[]).map((u) => ({
      id: String(u.id),
      nome: texto(u.nome_completo) ?? texto(u.nome_guerra),
      email: texto(u.email),
      permissoes: {},
    }))
    const diretor = rem.beneficiario_tipo === "diretor"
    avisos += await avisar(
      destinatarios,
      {
        texto: `Sua remessa de diárias ${texto(rem.codigo) ?? ""} está em preparação há mais de 7 dias (${lista.length} diária(s), ${formatarMoeda(Number(rem.valor_total ?? 0))}). Quando terminar de juntar as diárias, envie para avaliação.`,
        link: diretor ? `/painel/institucional/diretoria/diarias/remessas/${rem.id}` : "/painel/perfil/diarias",
        evento: "diarias",
        assunto: "Remessa de diárias aguardando o seu envio",
        umaVezPorDia: true,
      },
      { client, tenantId, contexto }
    )
    await client.from("pessoal_diarias_remessas").update({ lembrete_em: new Date().toISOString() }).eq("id", String(rem.id))
    remessas++
  }
  return { remessas, avisos }
}
