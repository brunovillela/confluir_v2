import "server-only"

import { esquemaAusente, nomesDosUsuarios, texto } from "@/lib/db/comum"
import { processoIA, tituloModuloIA } from "@/lib/ia-processos"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Leitura do uso da IA (tabela ia_uso) para a Gestão: o resumo agregado no
 * banco (função ia_uso_resumo) e o histórico das chamadas, com filtros.
 */

export type Dimensao = "usuario" | "processo" | "departamento" | "modulo" | "modelo" | "origem" | "dia"

export type LinhaUso = {
  chave: string
  rotulo: string
  detalhe: string | null
  chamadas: number
  falhas: number
  bloqueadas: number
  tokensEntrada: number
  tokensEntradaCache: number
  tokensSaida: number
  tokensRaciocinio: number
  custo: number | null
  ultima: string | null
}

export type ResumoUso = {
  disponivel: boolean
  total: LinhaUso | null
  por: Record<Dimensao, LinhaUso[]>
}

const ROTULO_ORIGEM: Record<string, string> = {
  entidade: "Chave da entidade",
  plataforma: "Chave da plataforma",
  bloqueada: "Barrada pela Gestão (desligada ou teto)",
}

export function rotuloOrigem(o: string): string {
  return ROTULO_ORIGEM[o] ?? o
}

function linhaCrua(r: Record<string, unknown>): Omit<LinhaUso, "rotulo" | "detalhe"> {
  const n = (v: unknown) => Number(v ?? 0) || 0
  return {
    chave: String(r.chave ?? ""),
    chamadas: n(r.chamadas),
    falhas: n(r.falhas),
    bloqueadas: n(r.bloqueadas),
    tokensEntrada: n(r.tokens_entrada),
    tokensEntradaCache: n(r.tokens_entrada_cache),
    tokensSaida: n(r.tokens_saida),
    tokensRaciocinio: n(r.tokens_raciocinio),
    custo: r.custo === null || r.custo === undefined ? null : Number(r.custo),
    ultima: texto(r.ultima),
  }
}

export async function nomesDosDepartamentos(ids: string[]): Promise<Map<string, string>> {
  const unicos = [...new Set(ids.filter(Boolean))]
  if (unicos.length === 0) return new Map()
  const admin = await createAdminClient()
  const { data } = await admin.from("empresa_departamentos").select("id, departamento").in("id", unicos)
  return new Map(((data ?? []) as Record<string, unknown>[]).map((d) => [String(d.id), texto(d.departamento) ?? "(sem nome)"]))
}

const VAZIO: Record<Dimensao, LinhaUso[]> = {
  usuario: [],
  processo: [],
  departamento: [],
  modulo: [],
  modelo: [],
  origem: [],
  dia: [],
}

export async function resumoUsoIA(de: Date, ate: Date): Promise<ResumoUso> {
  const admin = await createAdminClient()
  const { data, error } = await admin.rpc("ia_uso_resumo", {
    p_emp: await tenantAtual(),
    p_de: de.toISOString(),
    p_ate: ate.toISOString(),
  })
  if (error) return { disponivel: false, total: null, por: { ...VAZIO } }
  const bruto = (data ?? {}) as Record<string, Record<string, unknown>[]>
  const cru = (d: string) => (bruto[d] ?? []).map(linhaCrua)

  const usuarios = cru("usuario")
  const departamentos = cru("departamento")
  const [nomes, deps] = await Promise.all([
    nomesDosUsuarios(usuarios.map((u) => u.chave).filter(Boolean)),
    nomesDosDepartamentos(departamentos.map((d) => d.chave).filter(Boolean)),
  ])

  const por: Record<Dimensao, LinhaUso[]> = {
    usuario: usuarios.map((l) => ({
      ...l,
      rotulo: l.chave ? (nomes.get(l.chave) ?? "Pessoa sem nome") : "Sem pessoa (bot, tarefa agendada)",
      detalhe: null,
    })),
    processo: cru("processo").map((l) => {
      const p = processoIA(l.chave)
      return { ...l, rotulo: p.titulo, detalhe: tituloModuloIA(p.modulo) }
    }),
    departamento: departamentos.map((l) => ({
      ...l,
      rotulo: l.chave ? (deps.get(l.chave) ?? "Departamento removido") : "Sem departamento",
      detalhe: null,
    })),
    modulo: cru("modulo").map((l) => ({ ...l, rotulo: tituloModuloIA(l.chave), detalhe: null })),
    modelo: cru("modelo").map((l) => ({ ...l, rotulo: l.chave, detalhe: null })),
    origem: cru("origem").map((l) => ({ ...l, rotulo: rotuloOrigem(l.chave), detalhe: null })),
    dia: cru("dia")
      .map((l) => ({ ...l, rotulo: l.chave.split("-").reverse().join("/"), detalhe: null }))
      .sort((a, b) => a.chave.localeCompare(b.chave)),
  }
  const total = cru("total")[0]
  return {
    disponivel: true,
    total: total ? { ...total, rotulo: "Total", detalhe: null } : null,
    por,
  }
}

export type ChamadaIA = {
  id: string
  criadoEm: string
  pessoa: string | null
  departamento: string | null
  processo: string
  modulo: string
  modelo: string
  origem: string
  tokensEntrada: number
  tokensEntradaCache: number
  tokensSaida: number
  custo: number | null
  duracaoMs: number | null
  sucesso: boolean
  erro: string | null
}

export type FiltroChamadas = {
  de: Date
  ate: Date
  usuarioId?: string | null
  processo?: string | null
  modulo?: string | null
  departamentoId?: string | null
  soFalhas?: boolean
}

/** Histórico das chamadas (as mais recentes primeiro), `limite` a partir de `deslocamento` (até 1.000 por vez). */
export async function listarChamadasIA(
  f: FiltroChamadas,
  limite = 100,
  deslocamento = 0
): Promise<{ disponivel: boolean; chamadas: ChamadaIA[] }> {
  const admin = await createAdminClient()
  let q = admin
    .from("ia_uso")
    .select("id, criado_em, usuario_id, departamento_id, processo, modulo, modelo, origem_chave, tokens_entrada, tokens_entrada_cache, tokens_saida, custo_estimado_usd, duracao_ms, sucesso, erro")
    .eq("emp_proprietaria_id", await tenantAtual())
    .gte("criado_em", f.de.toISOString())
    .lt("criado_em", f.ate.toISOString())
    .order("criado_em", { ascending: false })
    .order("id", { ascending: false })
    .range(deslocamento, deslocamento + Math.min(limite, 1000) - 1)
  if (f.usuarioId === "") q = q.is("usuario_id", null)
  else if (f.usuarioId) q = q.eq("usuario_id", f.usuarioId)
  if (f.departamentoId === "") q = q.is("departamento_id", null)
  else if (f.departamentoId) q = q.eq("departamento_id", f.departamentoId)
  if (f.processo) q = q.eq("processo", f.processo)
  if (f.modulo) q = q.eq("modulo", f.modulo)
  if (f.soFalhas) q = q.eq("sucesso", false)
  const { data, error } = await q
  if (error) return { disponivel: !esquemaAusente(error), chamadas: [] }
  const linhas = (data ?? []) as Record<string, unknown>[]
  const [nomes, deps] = await Promise.all([
    nomesDosUsuarios(linhas.map((l) => String(l.usuario_id ?? "")).filter(Boolean)),
    nomesDosDepartamentos(linhas.map((l) => String(l.departamento_id ?? "")).filter(Boolean)),
  ])
  return {
    disponivel: true,
    chamadas: linhas.map((l) => ({
      id: String(l.id),
      criadoEm: String(l.criado_em),
      pessoa: l.usuario_id ? (nomes.get(String(l.usuario_id)) ?? "Pessoa sem nome") : null,
      departamento: l.departamento_id ? (deps.get(String(l.departamento_id)) ?? null) : null,
      processo: String(l.processo),
      modulo: String(l.modulo),
      modelo: String(l.modelo),
      origem: String(l.origem_chave),
      tokensEntrada: Number(l.tokens_entrada ?? 0),
      tokensEntradaCache: Number(l.tokens_entrada_cache ?? 0),
      tokensSaida: Number(l.tokens_saida ?? 0),
      custo: l.custo_estimado_usd === null ? null : Number(l.custo_estimado_usd),
      duracaoMs: l.duracao_ms === null ? null : Number(l.duracao_ms),
      sucesso: l.sucesso !== false,
      erro: texto(l.erro),
    })),
  }
}

export type EventoGestao = { id: string; criadoEm: string; pessoa: string | null; area: string; acao: string; detalhe: string | null }

const ROTULO_ACAO: Record<string, string> = {
  chave_cadastrada: "Cadastrou a chave de IA",
  chave_removida: "Removeu a chave de IA",
  chave_testada: "Testou a chave de IA",
  chave_recifrada: "Regravou a chave com a cifra atual",
  departamento_principal: "Alterou o departamento principal",
  preferencias: "Alterou a configuração da IA",
  modelos_processo: "Alterou o modelo por processo",
  cotas_departamento: "Alterou as cotas por departamento",
  minutos_humanos: "Ajustou o tempo humano do inventário",
}

export function rotuloAcaoGestao(acao: string): string {
  return ROTULO_ACAO[acao] ?? acao
}

export async function listarEventosGestao(area: string | null, limite = 20): Promise<EventoGestao[]> {
  const admin = await createAdminClient()
  let q = admin
    .from("gestao_eventos")
    .select("id, criado_em, usuario_id, area, acao, detalhe")
    .eq("emp_proprietaria_id", await tenantAtual())
    .order("criado_em", { ascending: false })
    .limit(limite)
  if (area) q = q.eq("area", area)
  const { data, error } = await q
  if (error) return []
  const linhas = (data ?? []) as Record<string, unknown>[]
  const nomes = await nomesDosUsuarios(linhas.map((l) => String(l.usuario_id ?? "")).filter(Boolean))
  return linhas.map((l) => ({
    id: String(l.id),
    criadoEm: String(l.criado_em),
    pessoa: l.usuario_id ? (nomes.get(String(l.usuario_id)) ?? null) : null,
    area: String(l.area),
    acao: String(l.acao),
    detalhe: texto(l.detalhe),
  }))
}
