import "server-only"

import { createHash, randomBytes, timingSafeEqual } from "node:crypto"

import { escopoApiValido, type EscopoApi } from "@/lib/api-publica-catalogo"
import { esquemaAusente, texto } from "@/lib/db/comum"
import { createAdminClient, createServiceClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * API DE LEITURA (onda 5, A9): autenticação por chave. O token tem o formato
 * `cf_<prefixo 8>_<segredo 40 hex>`; só o SHA-256 fica no banco e o token é
 * mostrado uma vez na criação. A chave vale para UMA entidade e precisa ser
 * usada no endereço dela (host do tenant) — chave de outra entidade recebe
 * 403. Limite de taxa simples por chave (em memória, por instância).
 *
 * Endurecimento de 18/10/2026 (achado M6 da RIPD da base multi-entidade):
 * escopo por endpoint (CPF só com "filiados_cpf"), chave só no cabeçalho
 * (na URL ela vaza em logs e histórico) e uma linha em `api_requisicoes` por
 * requisição, inclusive as recusadas. Toda rota de /api/v1 usa `rotaApi`.
 */

const LIMITE_POR_MINUTO = 120
const usoPorChave = new Map<string, { janela: number; n: number }>()

export type ChaveApi = {
  id: string
  nome: string
  prefixo: string
  escopos: string[]
  criadaEm: string
  ultimoUsoEm: string | null
  usos: number
  revogadaEm: string | null
}

export type ChaveAutenticada = { emp: string; chave: { id: string; nome: string; prefixo: string; escopos: string[] } }

type Conferencia = ({ ok: true } & ChaveAutenticada) | { ok: false; status: number; mensagem: string; emp: string; chaveId: string | null }

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

function erro(status: number, mensagem: string): Response {
  return Response.json({ erro: mensagem }, { status, headers: { "Cache-Control": "no-store" } })
}

const FORMATO_TOKEN = /^cf_[A-Za-z0-9]{8}_[0-9a-f]{40}$/

/** Confere a chave de `Authorization: Bearer cf_…` e o escopo pedido. */
async function conferirChave(req: Request, escopo: EscopoApi | null): Promise<Conferencia> {
  const empHost = await tenantAtual()
  const recusa = (status: number, mensagem: string, chaveId: string | null = null, emp = empHost): Conferencia => ({ ok: false, status, mensagem, emp, chaveId })
  const svc = createServiceClient()

  // Chave na URL: recusada mesmo que o cabeçalho também venha. Se ela for
  // de verdade, o log aponta qual chave circulou em URLs (para revogar).
  const naUrl = (new URL(req.url).searchParams.get("chave") ?? "").trim()
  if (naUrl) {
    let chaveId: string | null = null
    let emp = empHost
    if (FORMATO_TOKEN.test(naUrl)) {
      const { data } = await svc.from("api_chaves").select("id, emp_proprietaria_id").eq("hash", hashToken(naUrl)).maybeSingle()
      if (data) {
        chaveId = String(data.id)
        emp = String(data.emp_proprietaria_id)
      }
    }
    return recusa(400, "A chave não é aceita na URL (?chave=), porque fica gravada em logs e no histórico. Envie no cabeçalho Authorization: Bearer cf_…. Se ela já circulou em URLs, revogue-a e crie outra.", chaveId, emp)
  }

  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim()
  if (!FORMATO_TOKEN.test(token)) return recusa(401, "Informe a chave em Authorization: Bearer cf_…")

  const { data, error } = await svc.from("api_chaves").select("id, emp_proprietaria_id, nome, prefixo, escopos, revogada_em").eq("hash", hashToken(token)).maybeSingle()
  if (error) return recusa(503, esquemaAusente(error) ? "API ainda não ligada nesta instalação." : "Falha ao conferir a chave.")
  if (!data) return recusa(401, "Chave desconhecida.")
  const chaveId = String(data.id)
  const empChave = String(data.emp_proprietaria_id)
  if (data.revogada_em) return recusa(401, "Chave revogada.", chaveId, empChave)
  // Defesa extra contra comparação por tempo: o hash já é opaco, mas não custa.
  const prefixo = String(data.prefixo)
  if (!timingSafeEqual(Buffer.from(prefixo.padEnd(8)), Buffer.from(token.slice(3, 11).padEnd(8)))) return recusa(401, "Chave desconhecida.")

  // A chave vale só no endereço da entidade dela (o registro vai para a dona da chave).
  if (empChave !== empHost) return recusa(403, "Esta chave é de outra entidade — use o endereço (subdomínio) da entidade da chave.", chaveId, empChave)

  // Limite de taxa.
  const agora = Date.now()
  const janela = Math.floor(agora / 60_000)
  const uso = usoPorChave.get(chaveId)
  if (uso && uso.janela === janela) {
    if (uso.n >= LIMITE_POR_MINUTO) return recusa(429, `Limite de ${LIMITE_POR_MINUTO} requisições por minuto.`, chaveId)
    uso.n++
  } else usoPorChave.set(chaveId, { janela, n: 1 })

  const escopos = ((data.escopos as string[] | null) ?? []).filter(escopoApiValido)
  if (escopo && !escopos.includes(escopo)) return recusa(403, `Esta chave não tem o escopo "${escopo}". Peça à entidade para marcá-lo em Institucional › API e webhooks.`, chaveId)

  // Último uso (melhor esforço; a contagem exata não importa para a tela).
  void svc
    .from("api_chaves")
    .update({ ultimo_uso_em: new Date().toISOString() })
    .eq("id", chaveId)
    .then(() => undefined, () => undefined)

  return { ok: true, emp: empHost, chave: { id: chaveId, nome: String(data.nome), prefixo, escopos } }
}

/** Uma linha em api_requisicoes. Falha no registro não derruba a resposta. */
async function registrarRequisicao(req: Request, r: { emp: string; chaveId: string | null; status: number; quantidade: number | null; inicio: number }): Promise<void> {
  const url = new URL(req.url)
  const parametros: Record<string, string> = {}
  for (const [k, v] of url.searchParams) if (k !== "chave") parametros[k] = v.slice(0, 200)
  try {
    const { error } = await createServiceClient()
      .from("api_requisicoes")
      .insert({
        emp_proprietaria_id: r.emp,
        chave_id: r.chaveId,
        metodo: req.method,
        rota: url.pathname,
        parametros,
        status: r.status,
        quantidade: r.quantidade,
        origem_ip: (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("x-real-ip") || null,
        duracao_ms: Date.now() - r.inicio,
      })
    if (error) console.error("Falha ao registrar requisição da API:", error.message)
  } catch (e) {
    console.error("Falha ao registrar requisição da API:", e instanceof Error ? e.message : e)
  }
}

/** O que cada rota devolve: o corpo e quantas linhas ele leva (para o log). */
export type RespostaRotaApi = { corpo: unknown; status?: number; quantidade?: number | null }

/**
 * Envolve uma rota de /api/v1: confere chave e escopo, chama a rota e
 * registra a requisição (aceita ou recusada) em api_requisicoes.
 */
export function rotaApi(escopo: EscopoApi | null, tratar: (req: Request, auth: ChaveAutenticada) => Promise<RespostaRotaApi>): (req: Request) => Promise<Response> {
  return async (req: Request) => {
    const inicio = Date.now()
    const c = await conferirChave(req, escopo)
    if (!c.ok) {
      await registrarRequisicao(req, { emp: c.emp, chaveId: c.chaveId, status: c.status, quantidade: null, inicio })
      return erro(c.status, c.mensagem)
    }
    let r: RespostaRotaApi
    try {
      r = await tratar(req, { emp: c.emp, chave: c.chave })
    } catch (e) {
      await registrarRequisicao(req, { emp: c.emp, chaveId: c.chave.id, status: 500, quantidade: null, inicio })
      throw e
    }
    const status = r.status ?? 200
    await registrarRequisicao(req, { emp: c.emp, chaveId: c.chave.id, status, quantidade: r.quantidade ?? null, inicio })
    return respostaApi(r.corpo, status)
  }
}

/** Resposta JSON padrão da API (sem cache). */
export function respostaApi(corpo: unknown, status = 200): Response {
  return Response.json(corpo, { status, headers: { "Cache-Control": "no-store", "X-Confluir-Api": "v1" } })
}

export function paginaDe(req: Request): number {
  const p = Number(new URL(req.url).searchParams.get("pagina") ?? "1")
  return Number.isFinite(p) && p >= 1 ? Math.floor(p) : 1
}

// ── Gestão das chaves (painel) ───────────────────────────────────────────────

export async function listarChavesApi(): Promise<{ disponivel: boolean; chaves: ChaveApi[] }> {
  const admin = await createAdminClient()
  const { data, error } = await admin.from("api_chaves").select("id, nome, prefixo, escopos, created_at, ultimo_uso_em, usos, revogada_em").eq("emp_proprietaria_id", await tenantAtual()).order("created_at", { ascending: false })
  if (error) return { disponivel: !esquemaAusente(error), chaves: [] }
  return {
    disponivel: true,
    chaves: (data ?? []).map((c) => ({
      id: String(c.id),
      nome: String(c.nome),
      prefixo: String(c.prefixo),
      escopos: (c.escopos as string[]) ?? [],
      criadaEm: String(c.created_at),
      ultimoUsoEm: texto(c.ultimo_uso_em),
      usos: Number(c.usos ?? 0),
      revogadaEm: texto(c.revogada_em),
    })),
  }
}

function escoposDoForm(escopos: string[]): EscopoApi[] | { erro: string } {
  const validos = [...new Set(escopos.filter(escopoApiValido))]
  if (validos.length === 0) return { erro: "Marque ao menos um recurso que a chave pode ler." }
  // CPF sem a lista de filiados não serve para nada.
  if (validos.includes("filiados_cpf") && !validos.includes("filiados")) validos.push("filiados")
  return validos
}

/** Cria a chave e devolve o token completo — a única vez em que ele existe em claro. */
export async function criarChaveApi(nome: string, usuarioId: string, escoposPedidos: string[]): Promise<{ token?: string; erro?: string; campo?: string }> {
  const n = nome.trim()
  if (n.length < 2) return { erro: "Dê um nome à chave (ex.: Contador, Power BI).", campo: "nome" }
  const escopos = escoposDoForm(escoposPedidos)
  if (!Array.isArray(escopos)) return { erro: escopos.erro }
  const prefixo = randomBytes(6).toString("base64url").replace(/[^A-Za-z0-9]/g, "x").slice(0, 8).padEnd(8, "x")
  const segredo = randomBytes(20).toString("hex")
  const token = `cf_${prefixo}_${segredo}`
  const admin = await createAdminClient()
  const { error } = await admin.from("api_chaves").insert({ emp_proprietaria_id: await tenantAtual(), nome: n.slice(0, 60), prefixo, hash: hashToken(token), escopos, criada_por: usuarioId })
  if (error) return { erro: error.message }
  return { token }
}

/** Troca os escopos de uma chave ativa (o token não muda). */
export async function atualizarEscoposChaveApi(id: string, escoposPedidos: string[]): Promise<{ erro?: string }> {
  const escopos = escoposDoForm(escoposPedidos)
  if (!Array.isArray(escopos)) return { erro: escopos.erro }
  const admin = await createAdminClient()
  const { data, error } = await admin.from("api_chaves").update({ escopos }).eq("id", id).eq("emp_proprietaria_id", await tenantAtual()).is("revogada_em", null).select("id")
  if (error) return { erro: error.message }
  return data?.length ? {} : { erro: "Chave não encontrada ou já revogada." }
}

export async function revogarChaveApi(id: string): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin.from("api_chaves").update({ revogada_em: new Date().toISOString() }).eq("id", id).eq("emp_proprietaria_id", await tenantAtual()).is("revogada_em", null)
  return error ? { erro: error.message } : {}
}

// ── Log de requisições (auditoria) ───────────────────────────────────────────

export type RequisicaoApi = {
  id: number
  chaveId: string | null
  rota: string
  parametros: Record<string, string>
  status: number
  quantidade: number | null
  origemIp: string | null
  duracaoMs: number | null
  momento: string
}

export async function listarRequisicoesApi(
  filtros: { chaveId?: string; recusadas?: boolean; de?: string; ate?: string },
  pagina: number,
  porPagina: number
): Promise<{ linhas: RequisicaoApi[]; total: number; disponivel: boolean }> {
  const admin = await createAdminClient()
  let q = admin
    .from("api_requisicoes")
    .select("id, chave_id, rota, parametros, status, quantidade, origem_ip, duracao_ms, created_at", { count: "exact" })
    .eq("emp_proprietaria_id", await tenantAtual())
    .order("id", { ascending: false })
  if (filtros.chaveId) q = q.eq("chave_id", filtros.chaveId)
  if (filtros.recusadas) q = q.gte("status", 400)
  if (filtros.de) q = q.gte("created_at", `${filtros.de}T00:00:00-03:00`)
  if (filtros.ate) q = q.lte("created_at", `${filtros.ate}T23:59:59-03:00`)
  const de = (pagina - 1) * porPagina
  const { data, count, error } = await q.range(de, de + porPagina - 1)
  if (error) {
    if (esquemaAusente(error)) return { linhas: [], total: 0, disponivel: false }
    throw new Error(error.message)
  }
  return {
    disponivel: true,
    total: count ?? 0,
    linhas: (data ?? []).map((l) => ({
      id: Number(l.id),
      chaveId: l.chave_id ? String(l.chave_id) : null,
      rota: String(l.rota),
      parametros: (l.parametros as Record<string, string> | null) ?? {},
      status: Number(l.status),
      quantidade: l.quantidade === null || l.quantidade === undefined ? null : Number(l.quantidade),
      origemIp: texto(l.origem_ip),
      duracaoMs: l.duracao_ms === null || l.duracao_ms === undefined ? null : Number(l.duracao_ms),
      momento: String(l.created_at),
    })),
  }
}
