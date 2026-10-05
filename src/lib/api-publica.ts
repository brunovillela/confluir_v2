import "server-only"

import { createHash, randomBytes, timingSafeEqual } from "node:crypto"

import { esquemaAusente, texto } from "@/lib/db/comum"
import { createAdminClient, createServiceClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * API DE LEITURA (onda 5, A9): autenticação por chave. O token tem o formato
 * `cf_<prefixo 8>_<segredo 40 hex>`; só o SHA-256 fica no banco e o token é
 * mostrado uma vez na criação. A chave vale para UMA entidade e precisa ser
 * usada no endereço dela (host do tenant) — chave de outra entidade recebe
 * 403. Limite de taxa simples por chave (em memória, por instância).
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

export type AutenticacaoApi = { ok: true; emp: string; chave: { id: string; nome: string; prefixo: string; escopos: string[] } } | { ok: false; resposta: Response }

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

function erro(status: number, mensagem: string): Response {
  return Response.json({ erro: mensagem }, { status, headers: { "Cache-Control": "no-store" } })
}

/** Lê `Authorization: Bearer cf_…` (ou `?chave=` só para testes) e devolve a entidade da chave. */
export async function autenticarRequisicaoApi(req: Request): Promise<AutenticacaoApi> {
  const auth = req.headers.get("authorization") ?? ""
  const token = (auth.replace(/^Bearer\s+/i, "").trim() || new URL(req.url).searchParams.get("chave") || "").trim()
  if (!/^cf_[A-Za-z0-9]{8}_[0-9a-f]{40}$/.test(token)) return { ok: false, resposta: erro(401, "Informe a chave em Authorization: Bearer cf_…") }

  const svc = createServiceClient()
  const { data, error } = await svc.from("api_chaves").select("id, emp_proprietaria_id, nome, prefixo, escopos, revogada_em").eq("hash", hashToken(token)).maybeSingle()
  if (error) return { ok: false, resposta: erro(503, esquemaAusente(error) ? "API ainda não ligada nesta instalação (falta o SQL api-webhooks.sql)." : "Falha ao conferir a chave.") }
  if (!data) return { ok: false, resposta: erro(401, "Chave desconhecida.") }
  if (data.revogada_em) return { ok: false, resposta: erro(401, "Chave revogada.") }
  // Defesa extra contra comparação por tempo: o hash já é opaco, mas não custa.
  const prefixo = String(data.prefixo)
  if (!timingSafeEqual(Buffer.from(prefixo.padEnd(8)), Buffer.from(token.slice(3, 11).padEnd(8)))) return { ok: false, resposta: erro(401, "Chave desconhecida.") }

  // A chave vale só no endereço da entidade dela.
  const empHost = await tenantAtual()
  if (String(data.emp_proprietaria_id) !== empHost) return { ok: false, resposta: erro(403, "Esta chave é de outra entidade — use o endereço (subdomínio) da entidade da chave.") }

  // Limite de taxa.
  const agora = Date.now()
  const janela = Math.floor(agora / 60_000)
  const uso = usoPorChave.get(String(data.id))
  if (uso && uso.janela === janela) {
    if (uso.n >= LIMITE_POR_MINUTO) return { ok: false, resposta: erro(429, `Limite de ${LIMITE_POR_MINUTO} requisições por minuto.`) }
    uso.n++
  } else usoPorChave.set(String(data.id), { janela, n: 1 })

  // Último uso (melhor esforço; a contagem exata não importa para a tela).
  void svc
    .from("api_chaves")
    .update({ ultimo_uso_em: new Date().toISOString() })
    .eq("id", data.id)
    .then(() => undefined, () => undefined)

  return { ok: true, emp: empHost, chave: { id: String(data.id), nome: String(data.nome), prefixo, escopos: (data.escopos as string[]) ?? ["leitura"] } }
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

/** Cria a chave e devolve o token completo — a única vez em que ele existe em claro. */
export async function criarChaveApi(nome: string, usuarioId: string): Promise<{ token?: string; erro?: string }> {
  const n = nome.trim()
  if (n.length < 2) return { erro: "Dê um nome à chave (ex.: Contador, Power BI)." }
  const prefixo = randomBytes(6).toString("base64url").replace(/[^A-Za-z0-9]/g, "x").slice(0, 8).padEnd(8, "x")
  const segredo = randomBytes(20).toString("hex")
  const token = `cf_${prefixo}_${segredo}`
  const admin = await createAdminClient()
  const { error } = await admin.from("api_chaves").insert({ emp_proprietaria_id: await tenantAtual(), nome: n.slice(0, 60), prefixo, hash: hashToken(token), escopos: ["leitura"], criada_por: usuarioId })
  if (error) return { erro: esquemaAusente(error) ? "Falta rodar o SQL supabase/api-webhooks.sql." : error.message }
  return { token }
}

export async function revogarChaveApi(id: string): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin.from("api_chaves").update({ revogada_em: new Date().toISOString() }).eq("id", id).eq("emp_proprietaria_id", await tenantAtual()).is("revogada_em", null)
  return error ? { erro: error.message } : {}
}
