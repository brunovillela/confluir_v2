import "server-only"

import { esquemaAusente, hojeSP, lerEmLotes, lerEmLotesPorIds } from "@/lib/db/comum"
import { listarFontesPagadoras, type FontePagadora } from "@/lib/db/fontes"
import { listarGrupos } from "@/lib/db/grupos-empresariais"
import { listarRemessas } from "@/lib/db/receitas"
import {
  competenciaAplica,
  competenciaDoDia,
  competenciaValida,
  janelaCompetencias,
  prazoDaCompetencia,
  regraEfetiva,
  situacaoEnvio,
  somarMeses,
  TIPOS_CONTRIBUICAO,
  type RegraEfetiva,
  type RegraRepasse,
  type SituacaoEnvio,
  type TipoContribuicao,
} from "@/lib/repasse"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Controle de envio das relações de desconto (08/11/2026). O dado das
 * relações e dos depósitos continua em Receitas (filiacao_recebe e
 * filiacao_recebe_comprovacao); aqui entram o prazo de cada empresa
 * (filiacao_repasse_regras), a trilha de cobranças (filiacao_repasse_eventos)
 * e as inclusões/exclusões de desconto comunicadas às empresas
 * (filiacao_desconto_comunicacoes). Migração 20261108183536.
 */

export const AVISO_SQL_REPASSE =
  "O controle de envio ainda não está no banco desta instalação (migração 20261108183536_controle_repasse_empregadores)."

type LinhaRegra = {
  id: string
  empresa_id: string | null
  tipo: string
  controla: boolean | null
  meses: number[] | null
  dia_envio: number | null
  dia_deposito: number | null
  observacao: string | null
}

const paraRegra = (l: LinhaRegra): RegraRepasse => ({
  controla: l.controla,
  meses: l.meses,
  diaEnvio: l.dia_envio,
  diaDeposito: l.dia_deposito,
  observacao: l.observacao,
})

export type RegrasRepasse = {
  disponivel: boolean
  /** Competência (AAAAMM) de início do controle; null = não ativado. */
  desde: number | null
  geral: Partial<Record<TipoContribuicao, RegraRepasse>>
  porEmpresa: Map<string, Partial<Record<TipoContribuicao, RegraRepasse>>>
}

export async function regrasRepasse(): Promise<RegrasRepasse> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const [{ data, error }, { data: org }] = await Promise.all([
    admin
      .from("filiacao_repasse_regras")
      .select("id, empresa_id, tipo, controla, meses, dia_envio, dia_deposito, observacao")
      .eq("emp_proprietaria_id", emp),
    admin.from("empresa").select("filiacao_repasse_desde").eq("id", emp).maybeSingle(),
  ])
  const vazio: RegrasRepasse = { disponivel: false, desde: null, geral: {}, porEmpresa: new Map() }
  if (error) {
    if (esquemaAusente(error)) return vazio
    throw new Error(`Falha ao ler as regras do controle de envio: ${error.message}`)
  }
  const geral: RegrasRepasse["geral"] = {}
  const porEmpresa: RegrasRepasse["porEmpresa"] = new Map()
  for (const l of (data ?? []) as LinhaRegra[]) {
    const tipo = l.tipo as TipoContribuicao
    if (!l.empresa_id) geral[tipo] = paraRegra(l)
    else porEmpresa.set(l.empresa_id, { ...(porEmpresa.get(l.empresa_id) ?? {}), [tipo]: paraRegra(l) })
  }
  const desde = (org as { filiacao_repasse_desde?: number | null } | null)?.filiacao_repasse_desde ?? null
  return { disponivel: true, desde, geral, porEmpresa }
}

/** Grava (ou apaga, com `regra` null) a regra geral ou a exceção de uma empresa. */
export async function salvarRegraRepasse(
  empresaId: string | null,
  tipo: TipoContribuicao,
  regra: RegraRepasse | null,
  usuarioNome: string | null
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  if (empresaId) {
    const { data: dono } = await admin.from("empresa").select("id").eq("id", empresaId).maybeSingle()
    if (!dono) return { erro: "Empresa não encontrada." }
  }
  let q = admin.from("filiacao_repasse_regras").select("id").eq("emp_proprietaria_id", emp).eq("tipo", tipo)
  q = empresaId ? q.eq("empresa_id", empresaId) : q.is("empresa_id", null)
  const { data: atual, error: erroLer } = await q.maybeSingle()
  if (erroLer) return { erro: esquemaAusente(erroLer) ? AVISO_SQL_REPASSE : erroLer.message }
  if (!regra) {
    if (atual) {
      const { error } = await admin.from("filiacao_repasse_regras").delete().eq("id", atual.id)
      if (error) return { erro: `Não foi possível remover a regra: ${error.message}` }
    }
    return {}
  }
  const linha = {
    controla: regra.controla,
    meses: regra.meses,
    dia_envio: regra.diaEnvio,
    dia_deposito: regra.diaDeposito,
    observacao: regra.observacao ?? null,
    atualizado_em: new Date().toISOString(),
    atualizado_por: usuarioNome,
  }
  const { error } = atual
    ? await admin.from("filiacao_repasse_regras").update(linha).eq("id", atual.id)
    : await admin
        .from("filiacao_repasse_regras")
        .insert({ ...linha, empresa_id: empresaId, tipo, emp_proprietaria_id: emp })
  if (error) return { erro: `Não foi possível salvar a regra: ${error.message}` }
  return {}
}

export async function salvarInicioControle(desde: number | null): Promise<{ erro?: string }> {
  if (desde !== null && !competenciaValida(desde)) return { erro: "Competência inválida." }
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { error } = await admin
    .from("empresa")
    .update({ filiacao_repasse_desde: desde, updated_at: new Date().toISOString() })
    .eq("id", emp)
  if (error) return { erro: esquemaAusente(error) ? AVISO_SQL_REPASSE : error.message }
  return {}
}

// ── Unidades: quem manda a relação ──────────────────────────────────────────

export type UnidadeRepasse = {
  /** A empresa que manda a relação (no grupo centralizado, a pagadora). */
  id: string
  nome: string
  /** As fontes cujos lançamentos contam para esta unidade. */
  fontes: string[]
  grupo: { id: string; nome: string } | null
  filiadosAtivos: number
}

const nomeFonte = (f: FontePagadora) => f.nome_fantasia ?? f.nome_razao ?? "(sem nome)"

/**
 * As empresas que mandam relação: fontes pagadoras ativas; as de um grupo com
 * contribuição centralizada viram uma unidade só, na empresa pagadora.
 */
async function unidadesDeRepasse(): Promise<{ unidades: UnidadeRepasse[]; unidadeDaFonte: Map<string, string> }> {
  const [fontes, { grupos }] = await Promise.all([listarFontesPagadoras(), listarGrupos()])
  const porId = new Map(fontes.map((f) => [f.id, f]))
  const unidadeDaFonte = new Map<string, string>()
  const unidades: UnidadeRepasse[] = []
  for (const g of grupos) {
    if (!g.contribuicaoCentralizada) continue
    const ids = g.membros.flatMap((m) => (m.empresaId ? [m.empresaId] : []))
    if (ids.length === 0) continue
    const pagadora = g.empresaPagadoraId && ids.includes(g.empresaPagadoraId) ? g.empresaPagadoraId : ids[0]
    if (unidadeDaFonte.has(pagadora)) continue
    for (const id of ids) unidadeDaFonte.set(id, pagadora)
    const f = porId.get(pagadora)
    unidades.push({
      id: pagadora,
      nome: f ? nomeFonte(f) : g.nome,
      fontes: ids,
      grupo: { id: g.id, nome: g.nome },
      filiadosAtivos: ids.reduce((s, id) => s + (porId.get(id)?.filiadosAtivos ?? 0), 0),
    })
  }
  for (const f of fontes) {
    if (unidadeDaFonte.has(f.id)) continue
    unidadeDaFonte.set(f.id, f.id)
    unidades.push({ id: f.id, nome: nomeFonte(f), fontes: [f.id], grupo: null, filiadosAtivos: f.filiadosAtivos })
  }
  const inativas = new Set(fontes.filter((f) => f.inativa === true).map((f) => f.id))
  return { unidades: unidades.filter((u) => !inativas.has(u.id) || u.fontes.some((id) => !inativas.has(id))), unidadeDaFonte }
}

// ── Quadro ──────────────────────────────────────────────────────────────────

export type CelulaRepasse = {
  competencia: number
  situacao: SituacaoEnvio
  lancamentos: number
  valor: number
  deposito: number | null
  prazoEnvio: string
  prazoDeposito: string
  /** Remessa da competência × tipo, se já criada (para abrir a fonte em Receitas). */
  remessaId: string | null
  ultimoEvento: { evento: string; data: string } | null
}

export type LinhaQuadro = UnidadeRepasse & {
  regra: RegraEfetiva
  celulas: CelulaRepasse[]
}

export type QuadroRepasse = {
  disponivel: boolean
  tipo: TipoContribuicao
  competencias: number[]
  desde: number | null
  hoje: string
  linhas: LinhaQuadro[]
  /** Remessas da janela (competência → id) para "criar remessa" quando faltar. */
  remessas: Map<number, string>
}

type ResumoRpc = { ordem: number; tipo: string; remessa_id: string; fonte_id: string; lancamentos: number; valor: number | string }

type EventoBruto = {
  id: string
  empresa_id: string
  competencia: number
  tipo: string
  evento: string
  meio: string | null
  data: string
  observacao: string | null
  usuario_nome: string | null
  created_at: string
}

/** A competência mais recente que já deveria estar no quadro: o mês anterior. */
export function competenciaCorrente(hoje = hojeSP()): number {
  return somarMeses(competenciaDoDia(hoje), -1)
}

export async function quadroRepasse(opcoes: {
  tipo: TipoContribuicao
  ate?: number
  meses?: number
  empresaId?: string
}): Promise<QuadroRepasse> {
  const hoje = hojeSP()
  const ate = opcoes.ate ?? competenciaCorrente(hoje)
  const competencias = janelaCompetencias(ate, opcoes.meses ?? 12)
  const de = competencias[0]
  const regras = await regrasRepasse()
  const base: QuadroRepasse = {
    disponivel: regras.disponivel,
    tipo: opcoes.tipo,
    competencias,
    desde: regras.desde,
    hoje,
    linhas: [],
    remessas: new Map(),
  }
  if (!regras.disponivel) return base

  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const [{ unidades, unidadeDaFonte }, resumo, remessasTodas, eventos] = await Promise.all([
    unidadesDeRepasse(),
    lerEmLotes<ResumoRpc>((a, b) =>
      admin
        .rpc("filiacao_repasse_resumo", { p_emp: emp, p_de: de, p_ate: ate })
        .order("ordem")
        .order("remessa_id")
        .order("fonte_id")
        .range(a, b)
    ),
    listarRemessas(),
    lerEmLotes<EventoBruto>((a, b) =>
      admin
        .from("filiacao_repasse_eventos")
        .select("id, empresa_id, competencia, tipo, evento, meio, data, observacao, usuario_nome, created_at")
        .eq("emp_proprietaria_id", emp)
        .eq("tipo", opcoes.tipo)
        .gte("competencia", de)
        .lte("competencia", ate)
        .order("created_at")
        .order("id")
        .range(a, b)
    ),
  ])

  const remessasDaJanela = remessasTodas.filter(
    (r) => (r.tipo ?? "Associativa") === opcoes.tipo && r.ordem !== null && r.ordem >= de && r.ordem <= ate
  )
  for (const r of remessasDaJanela) if (!base.remessas.has(r.ordem!)) base.remessas.set(r.ordem!, r.id)

  // Depósitos das remessas da janela, somados por remessa × fonte.
  const depositos = new Map<string, number>()
  if (remessasDaJanela.length) {
    const linhas = await lerEmLotesPorIds<{ id: string; remessa_id: string; fonte_pg_id: string | null; valor: number | null }>(
      remessasDaJanela.map((r) => r.id),
      (fatia, a, b) =>
        admin
          .from("filiacao_recebe_comprovacao")
          .select("id, remessa_id, fonte_pg_id, valor")
          .eq("emp_proprietaria_id", emp)
          .in("remessa_id", fatia)
          .order("remessa_id")
          .order("id")
          .range(a, b)
    )
    const ordemDaRemessa = new Map(remessasDaJanela.map((r) => [r.id, r.ordem!]))
    for (const c of linhas) {
      const unidade = c.fonte_pg_id ? unidadeDaFonte.get(c.fonte_pg_id) : undefined
      const ordem = ordemDaRemessa.get(c.remessa_id)
      if (!unidade || !ordem) continue
      const chave = `${unidade}|${ordem}`
      depositos.set(chave, (depositos.get(chave) ?? 0) + Number(c.valor ?? 0))
    }
  }

  const lancados = new Map<string, { lancamentos: number; valor: number }>()
  for (const r of resumo) {
    if ((r.tipo ?? "Associativa") !== opcoes.tipo) continue
    const unidade = unidadeDaFonte.get(r.fonte_id) ?? r.fonte_id
    const chave = `${unidade}|${r.ordem}`
    const atual = lancados.get(chave) ?? { lancamentos: 0, valor: 0 }
    atual.lancamentos += r.lancamentos
    atual.valor += Number(r.valor)
    lancados.set(chave, atual)
  }

  const eventosPor = new Map<string, EventoBruto[]>()
  for (const e of eventos) {
    const chave = `${e.empresa_id}|${e.competencia}`
    eventosPor.set(chave, [...(eventosPor.get(chave) ?? []), e])
  }

  const desde = regras.desde
  const linhas: LinhaQuadro[] = []
  for (const u of unidades) {
    if (opcoes.empresaId && u.id !== opcoes.empresaId) continue
    const regra = regraEfetiva(opcoes.tipo, regras.geral[opcoes.tipo], regras.porEmpresa.get(u.id)?.[opcoes.tipo])
    const temLancamento = competencias.some((c) => lancados.has(`${u.id}|${c}`) || depositos.has(`${u.id}|${c}`))
    // Sem filiados ativos e sem nada lançado na janela: não há o que cobrar.
    if (!opcoes.empresaId && !temLancamento && (u.filiadosAtivos === 0 || !regra.controla)) continue
    const celulas = competencias.map((c): CelulaRepasse => {
      const l = lancados.get(`${u.id}|${c}`)
      const evs = eventosPor.get(`${u.id}|${c}`) ?? []
      const prazoEnvio = prazoDaCompetencia(c, regra.diaEnvio)
      const prazoDeposito = prazoDaCompetencia(c, regra.diaDeposito)
      const ultimo = evs.at(-1)
      return {
        competencia: c,
        situacao: situacaoEnvio({
          aplica: competenciaAplica(regra, c),
          antesDoControle: desde === null || c < desde,
          lancamentos: l?.lancamentos ?? 0,
          valor: l?.valor ?? 0,
          deposito: depositos.has(`${u.id}|${c}`) ? depositos.get(`${u.id}|${c}`)! : null,
          recebidaFora: evs.some((e) => e.evento === "relacao_recebida"),
          semDesconto: evs.some((e) => e.evento === "sem_desconto"),
          hoje,
          prazoEnvio,
          prazoDeposito,
        }),
        lancamentos: l?.lancamentos ?? 0,
        valor: l?.valor ?? 0,
        deposito: depositos.get(`${u.id}|${c}`) ?? null,
        prazoEnvio,
        prazoDeposito,
        remessaId: base.remessas.get(c) ?? null,
        ultimoEvento: ultimo ? { evento: ultimo.evento, data: ultimo.data } : null,
      }
    })
    linhas.push({ ...u, regra, celulas })
  }
  linhas.sort((a, b) => b.filiadosAtivos - a.filiadosAtivos || a.nome.localeCompare(b.nome, "pt-BR"))
  return { ...base, linhas }
}

/** Tipos que a entidade controla (para as abas do quadro). */
export function tiposControlados(regras: RegrasRepasse): TipoContribuicao[] {
  return TIPOS_CONTRIBUICAO.filter((t) => {
    if (regraEfetiva(t, regras.geral[t]).controla) return true
    return [...regras.porEmpresa.values()].some((r) => r[t]?.controla === true)
  })
}

// ── Trilha ──────────────────────────────────────────────────────────────────

export type EventoRepasse = {
  id: string
  competencia: number
  tipo: TipoContribuicao
  evento: string
  meio: string | null
  data: string
  observacao: string | null
  usuarioNome: string | null
  criadoEm: string
}

export async function eventosDaEmpresa(empresaId: string, limite = 200): Promise<EventoRepasse[]> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("filiacao_repasse_eventos")
    .select("id, empresa_id, competencia, tipo, evento, meio, data, observacao, usuario_nome, created_at")
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("empresa_id", empresaId)
    .order("created_at", { ascending: false })
    .limit(limite)
  if (error) {
    if (esquemaAusente(error)) return []
    throw new Error(`Falha ao ler a trilha: ${error.message}`)
  }
  return ((data ?? []) as EventoBruto[]).map((e) => ({
    id: e.id,
    competencia: e.competencia,
    tipo: e.tipo as TipoContribuicao,
    evento: e.evento,
    meio: e.meio,
    data: e.data,
    observacao: e.observacao,
    usuarioNome: e.usuario_nome,
    criadoEm: e.created_at,
  }))
}

export async function registrarEventoRepasse(dados: {
  empresaId: string
  competencia: number
  tipo: TipoContribuicao
  evento: "relacao_recebida" | "sem_desconto" | "cobranca" | "contato"
  meio: string | null
  data: string
  observacao: string | null
  usuarioId: string | null
  usuarioNome: string | null
}): Promise<{ erro?: string }> {
  if (!competenciaValida(dados.competencia)) return { erro: "Competência inválida." }
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data: dono } = await admin.from("empresa").select("id").eq("id", dados.empresaId).maybeSingle()
  if (!dono) return { erro: "Empresa não encontrada." }
  const { error } = await admin.from("filiacao_repasse_eventos").insert({
    emp_proprietaria_id: emp,
    empresa_id: dados.empresaId,
    competencia: dados.competencia,
    tipo: dados.tipo,
    evento: dados.evento,
    meio: dados.meio,
    data: dados.data,
    observacao: dados.observacao,
    usuario_id: dados.usuarioId,
    usuario_nome: dados.usuarioNome,
  })
  if (error) return { erro: esquemaAusente(error) ? AVISO_SQL_REPASSE : `Não foi possível registrar: ${error.message}` }
  return {}
}

/** Desfaz um registro (ex.: "relação recebida" marcada por engano). */
export async function excluirEventoRepasse(id: string, empresaId: string): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin
    .from("filiacao_repasse_eventos")
    .delete()
    .eq("id", id)
    .eq("empresa_id", empresaId)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: `Não foi possível desfazer: ${error.message}` }
  return {}
}

// ── Contatos da folha ───────────────────────────────────────────────────────

export type ContatoFolha = {
  id: string
  nome: string
  cargo: string | null
  telefone: string | null
  email: string | null
  observacao: string | null
}

export async function contatosDaFolha(empresaId: string): Promise<ContatoFolha[]> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("empresa_contatos")
    .select("id, nome, cargo, telefone, email, observacao")
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("empresa_id", empresaId)
    .eq("contato_folha", true)
    .order("nome")
  if (error) {
    if (esquemaAusente(error)) return []
    throw new Error(`Falha ao ler os contatos da folha: ${error.message}`)
  }
  return (data ?? []) as ContatoFolha[]
}

const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function salvarContatoFolha(
  empresaId: string,
  dados: Omit<ContatoFolha, "id">,
  contatoId?: string
): Promise<{ erro?: string }> {
  if (!dados.nome.trim()) return { erro: "Informe o nome do contato." }
  if (!dados.telefone?.trim() && !dados.email?.trim()) return { erro: "Informe o telefone ou o e-mail." }
  if (dados.email && !EMAIL_VALIDO.test(dados.email.trim())) return { erro: "E-mail inválido." }
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data: dono } = await admin.from("empresa").select("id").eq("id", empresaId).maybeSingle()
  if (!dono) return { erro: "Empresa não encontrada." }
  const linha = {
    nome: dados.nome.trim(),
    cargo: dados.cargo?.trim() || null,
    telefone: dados.telefone?.trim() || null,
    email: dados.email?.trim().toLowerCase() || null,
    observacao: dados.observacao?.trim() || null,
    contato_folha: true,
    updated_at: new Date().toISOString(),
  }
  const { error } = contatoId
    ? await admin.from("empresa_contatos").update(linha).eq("id", contatoId).eq("empresa_id", empresaId)
    : await admin.from("empresa_contatos").insert({ ...linha, empresa_id: empresaId, emp_proprietaria_id: emp })
  if (error) return { erro: `Não foi possível salvar o contato: ${error.message}` }
  return {}
}

/** Tira a marca de contato da folha (o contato continua, se servir a outra coisa). */
export async function removerContatoFolha(empresaId: string, contatoId: string): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("empresa_contatos")
    .select("principal, recebe_ordem_compra")
    .eq("id", contatoId)
    .eq("empresa_id", empresaId)
    .maybeSingle()
  if (!data) return { erro: "Contato não encontrado." }
  const usadoEmOutroLugar = data.principal === true || data.recebe_ordem_compra === true
  const { error } = usadoEmOutroLugar
    ? await admin.from("empresa_contatos").update({ contato_folha: false }).eq("id", contatoId).eq("empresa_id", empresaId)
    : await admin.from("empresa_contatos").delete().eq("id", contatoId).eq("empresa_id", empresaId)
  if (error) return { erro: `Não foi possível remover: ${error.message}` }
  return {}
}

// ── Nome e situação de uma empresa ──────────────────────────────────────────

export async function unidadeRepasse(empresaId: string): Promise<UnidadeRepasse | null> {
  const { unidades, unidadeDaFonte } = await unidadesDeRepasse()
  const id = unidadeDaFonte.get(empresaId) ?? empresaId
  return unidades.find((u) => u.id === id) ?? null
}

export { unidadesDeRepasse }

// ── Avisos (pendências do painel) ───────────────────────────────────────────

/** Dias que um contato/cobrança registrado tira a empresa dos avisos. */
export const DIAS_SILENCIO_COBRANCA = 3

const cacheAvisos = new Map<string, { expira: number; valor: { atrasadas: number } }>()

/**
 * Empresas com relação ou depósito atrasado nas 3 últimas competências da
 * Associativa (e dos tipos controlados), sem cobrança/contato registrado nos
 * últimos DIAS_SILENCIO_COBRANCA dias. Cache de 10 minutos por entidade: o
 * painel chama isto a cada carga. null = controle não ativado/indisponível.
 */
export async function empresasParaCobrar(): Promise<number | null> {
  const emp = await tenantAtual()
  const c = cacheAvisos.get(emp)
  if (c && c.expira > Date.now()) return c.valor.atrasadas
  const regras = await regrasRepasse()
  if (!regras.disponivel || regras.desde === null) return null
  const limite = new Date(Date.now() - DIAS_SILENCIO_COBRANCA * 86_400_000).toISOString().slice(0, 10)
  const empresas = new Set<string>()
  for (const tipo of tiposControlados(regras)) {
    const q = await quadroRepasse({ tipo, meses: 3 })
    for (const l of q.linhas) {
      const cobrar = l.celulas.some(
        (cel) =>
          (cel.situacao === "atrasada" || cel.situacao === "falta_deposito") &&
          !(cel.ultimoEvento && (cel.ultimoEvento.evento === "cobranca" || cel.ultimoEvento.evento === "contato") && cel.ultimoEvento.data >= limite)
      )
      if (cobrar) empresas.add(l.id)
    }
  }
  cacheAvisos.set(emp, { expira: Date.now() + 10 * 60_000, valor: { atrasadas: empresas.size } })
  return empresas.size
}

export function invalidarAvisosRepasse() {
  cacheAvisos.clear()
}
