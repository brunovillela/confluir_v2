import "server-only"

import { createHash, randomBytes, randomInt } from "node:crypto"

import { CODIGO_VALE_MS, FORMATO_TOKEN_AGENTE, ONLINE_ATE_MS, VERIFICACOES, type Conector, type IdVerificacao } from "@/lib/acesso-agente-constantes"
import { esquemaAusente, texto } from "@/lib/db/comum"
import { createAdminClient, createServiceClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * AGENTE DO CONTROLE DE ACESSO (proposta do autoatendimento de visitantes).
 *
 * Um agente roda no computador da recepção de cada sede e faz a ponte entre o
 * Confluir e o sistema de catracas (Control iD com servidor local). Ele só
 * abre conexões de saída: pareia uma vez com um código de 6 dígitos mostrado
 * no painel, recebe um token (`ca_…`, só o hash fica no banco, como em
 * api_chaves) e daí em diante faz contato a cada poucos segundos, buscando
 * comandos e devolvendo resultados.
 *
 * Duas metades: o PAINEL (createAdminClient, RLS da entidade) cadastra,
 * gera código, pede verificação e desliga; as ROTAS DO AGENTE
 * (src/app/api/acesso/agente/*) usam o cliente de serviço, porque quem chama
 * não tem sessão, e sempre filtram pela entidade do endereço (host).
 */

export type ResultadoVerificacao = { id: IdVerificacao; ok: boolean; detalhe?: string | null }

export type AgenteAcesso = {
  id: string
  nome: string
  sedeId: string | null
  sedeNome: string | null
  conector: Conector
  pareadoEm: string | null
  ultimoContatoEm: string | null
  versao: string | null
  maquina: string | null
  diagnostico: ResultadoVerificacao[] | null
  diagnosticoEm: string | null
  codigoExpiraEm: string | null
  verificacaoPendente: boolean
  revogadoEm: string | null
}

export type ItemVerificacao = { id: IdVerificacao; rotulo: string; confere: string; situacao: "ok" | "falha" | "aguardando"; mensagem: string | null }

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex")
}

/** O código só vale na entidade que o gerou: o hash leva a entidade junto. */
function hashCodigo(emp: string, codigo: string): string {
  return sha256(`${emp}:${codigo}`)
}

function online(ultimoContatoEm: string | null, agora = Date.now()): boolean {
  return !!ultimoContatoEm && agora - new Date(ultimoContatoEm).getTime() < ONLINE_ATE_MS
}

function lerDiagnostico(v: unknown): ResultadoVerificacao[] | null {
  if (!Array.isArray(v)) return null
  const ids = new Set(VERIFICACOES.map((x) => x.id))
  return v
    .filter((x): x is { id: IdVerificacao; ok: unknown; detalhe?: unknown } => !!x && typeof x === "object" && ids.has((x as { id: IdVerificacao }).id))
    .map((x) => ({ id: x.id, ok: x.ok === true, detalhe: typeof x.detalhe === "string" ? x.detalhe.slice(0, 500) : null }))
}

/**
 * A lista de verificação da tela: as duas primeiras o Confluir confere; as
 * outras vêm do último diagnóstico do agente. Uma falha para a lista — o que
 * vem depois fica "aguardando".
 */
export function montarVerificacoes(a: AgenteAcesso, agora = Date.now()): ItemVerificacao[] {
  const doAgente = new Map((a.diagnostico ?? []).map((d) => [d.id, d]))
  let parou = false
  return VERIFICACOES.map((v) => {
    const base = { id: v.id, rotulo: v.rotulo, confere: v.confere }
    if (parou) return { ...base, situacao: "aguardando" as const, mensagem: null }
    let ok: boolean | null
    let detalhe: string | null = null
    if (v.id === "pareado") ok = !!a.pareadoEm
    else if (v.id === "online") ok = online(a.ultimoContatoEm, agora)
    else {
      const d = doAgente.get(v.id)
      ok = d ? d.ok : null
      detalhe = d?.detalhe ?? null
    }
    if (ok === null) {
      parou = true
      return { ...base, situacao: "aguardando" as const, mensagem: null }
    }
    if (!ok) {
      parou = true
      return { ...base, situacao: "falha" as const, mensagem: detalhe ? `${v.seFalhar} (${detalhe})` : v.seFalhar }
    }
    return { ...base, situacao: "ok" as const, mensagem: detalhe }
  })
}

// ── Painel ───────────────────────────────────────────────────────────────────

const COLUNAS = "id, nome, sede_id, conector, pareado_em, ultimo_contato_em, versao, maquina, diagnostico, diagnostico_em, codigo_expira_em, revogado_em, sede:empresa_sede(nome)"

export async function listarAgentes(): Promise<{ disponivel: boolean; agentes: AgenteAcesso[] }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data, error } = await admin.from("acesso_agentes").select(COLUNAS).eq("emp_proprietaria_id", emp).is("revogado_em", null).order("created_at", { ascending: true })
  if (error) {
    if (esquemaAusente(error)) return { disponivel: false, agentes: [] }
    throw new Error(error.message)
  }
  const ids = (data ?? []).map((a) => String(a.id))
  const pendentes = new Set<string>()
  if (ids.length) {
    const { data: cmds } = await admin.from("acesso_agente_comandos").select("agente_id").in("agente_id", ids).in("situacao", ["pendente", "entregue"])
    for (const c of cmds ?? []) pendentes.add(String(c.agente_id))
  }
  return {
    disponivel: true,
    agentes: (data ?? []).map((a) => {
      const sede = a.sede as { nome?: unknown } | { nome?: unknown }[] | null
      const sedeNome = Array.isArray(sede) ? texto(sede[0]?.nome) : texto(sede?.nome)
      return {
        id: String(a.id),
        nome: String(a.nome),
        sedeId: texto(a.sede_id),
        sedeNome,
        conector: a.conector as Conector,
        pareadoEm: texto(a.pareado_em),
        ultimoContatoEm: texto(a.ultimo_contato_em),
        versao: texto(a.versao),
        maquina: texto(a.maquina),
        diagnostico: lerDiagnostico(a.diagnostico),
        diagnosticoEm: texto(a.diagnostico_em),
        codigoExpiraEm: texto(a.codigo_expira_em),
        verificacaoPendente: pendentes.has(String(a.id)),
        revogadoEm: texto(a.revogado_em),
      }
    }),
  }
}

/** Gera um código de 6 dígitos que não colide com outro ativo da entidade. */
async function gerarCodigo(emp: string): Promise<{ codigo: string; hash: string; expira: string }> {
  const admin = await createAdminClient()
  for (let i = 0; i < 5; i++) {
    const codigo = String(randomInt(0, 1_000_000)).padStart(6, "0")
    const hash = hashCodigo(emp, codigo)
    const { data } = await admin.from("acesso_agentes").select("id").eq("codigo_hash", hash).gt("codigo_expira_em", new Date().toISOString()).limit(1)
    if (!data?.length) return { codigo, hash, expira: new Date(Date.now() + CODIGO_VALE_MS).toISOString() }
  }
  throw new Error("Não foi possível gerar um código livre. Tente de novo.")
}

export async function cadastrarAgente(d: { nome: string; sedeId: string; conector: string }, usuarioId: string): Promise<{ codigo?: string; erro?: string; campo?: string }> {
  const nome = d.nome.trim()
  if (nome.length < 2) return { erro: "Dê um nome ao computador (ex.: Recepção — Macaé).", campo: "nome" }
  if (!d.sedeId) return { erro: "Escolha a sede.", campo: "sede_id" }
  if (d.conector !== "simulado" && d.conector !== "controlid_local") return { erro: "Escolha o sistema de catracas.", campo: "conector" }
  const emp = await tenantAtual()
  const { codigo, hash, expira } = await gerarCodigo(emp)
  const admin = await createAdminClient()
  const { error } = await admin.from("acesso_agentes").insert({ emp_proprietaria_id: emp, nome: nome.slice(0, 80), sede_id: d.sedeId, conector: d.conector, codigo_hash: hash, codigo_expira_em: expira, criado_por: usuarioId })
  if (error) return { erro: error.message }
  return { codigo }
}

/** Novo código para parear (de novo) o mesmo agente; o token atual vale até o novo pareamento. */
export async function novoCodigoAgente(id: string): Promise<{ codigo?: string; erro?: string }> {
  const emp = await tenantAtual()
  const { codigo, hash, expira } = await gerarCodigo(emp)
  const admin = await createAdminClient()
  const { data, error } = await admin.from("acesso_agentes").update({ codigo_hash: hash, codigo_expira_em: expira }).eq("id", id).eq("emp_proprietaria_id", emp).is("revogado_em", null).select("id")
  if (error) return { erro: error.message }
  return data?.length ? { codigo } : { erro: "Agente não encontrado." }
}

export async function solicitarVerificacao(id: string, usuarioId: string): Promise<{ erro?: string }> {
  const emp = await tenantAtual()
  const admin = await createAdminClient()
  const { data: ag } = await admin.from("acesso_agentes").select("id, pareado_em").eq("id", id).eq("emp_proprietaria_id", emp).is("revogado_em", null).maybeSingle()
  if (!ag) return { erro: "Agente não encontrado." }
  if (!ag.pareado_em) return { erro: "O agente ainda não foi pareado." }
  // Um pedido em aberto basta: não empilha.
  const { data: aberto } = await admin.from("acesso_agente_comandos").select("id").eq("agente_id", id).eq("tipo", "verificar").in("situacao", ["pendente", "entregue"]).limit(1)
  if (aberto?.length) return {}
  const { error } = await admin.from("acesso_agente_comandos").insert({ emp_proprietaria_id: emp, agente_id: id, tipo: "verificar", solicitado_por: usuarioId })
  return error ? { erro: error.message } : {}
}

export async function desligarAgente(id: string): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin
    .from("acesso_agentes")
    .update({ revogado_em: new Date().toISOString(), token_hash: null, codigo_hash: null, codigo_expira_em: null })
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
    .is("revogado_em", null)
  return error ? { erro: error.message } : {}
}

// ── Rotas do agente ──────────────────────────────────────────────────────────

const TENTATIVAS_PAREAR = 10
const JANELA_PAREAR_MS = 10 * 60_000
const tentativasPorOrigem = new Map<string, { desde: number; n: number }>()

/** Limite simples contra varredura de códigos (em memória, por instância). */
export function podeTentarParear(origem: string, agora = Date.now()): boolean {
  const t = tentativasPorOrigem.get(origem)
  if (!t || agora - t.desde > JANELA_PAREAR_MS) {
    tentativasPorOrigem.set(origem, { desde: agora, n: 1 })
    return true
  }
  t.n++
  return t.n <= TENTATIVAS_PAREAR
}

export type AgenteAutenticado = { id: string; emp: string; nome: string; conector: Conector; sedeNome: string | null }

export async function parearAgente(codigo: string, info: { versao?: string; maquina?: string }): Promise<({ ok: true; token: string } & AgenteAutenticado) | { ok: false; status: number; mensagem: string }> {
  if (!/^\d{6}$/.test(codigo)) return { ok: false, status: 400, mensagem: "O código tem 6 dígitos." }
  const emp = await tenantAtual()
  const svc = createServiceClient()
  const { data, error } = await svc
    .from("acesso_agentes")
    .select("id, nome, conector, codigo_expira_em, sede:empresa_sede(nome)")
    .eq("emp_proprietaria_id", emp)
    .eq("codigo_hash", hashCodigo(emp, codigo))
    .is("revogado_em", null)
    .maybeSingle()
  if (error) return { ok: false, status: 503, mensagem: esquemaAusente(error) ? "Controle de acesso ainda não ligado nesta instalação." : "Falha ao conferir o código." }
  if (!data) return { ok: false, status: 401, mensagem: "Código não encontrado. Confira os 6 dígitos e o endereço do Confluir da entidade." }
  if (!data.codigo_expira_em || new Date(String(data.codigo_expira_em)).getTime() < Date.now()) return { ok: false, status: 401, mensagem: "Código vencido. Gere outro na tela de Controle de acesso." }

  const prefixo = randomBytes(6).toString("base64url").replace(/[^A-Za-z0-9]/g, "x").slice(0, 8).padEnd(8, "x")
  const token = `ca_${prefixo}_${randomBytes(20).toString("hex")}`
  const agora = new Date().toISOString()
  const { error: e2 } = await svc
    .from("acesso_agentes")
    .update({ token_hash: sha256(token), token_prefixo: prefixo, pareado_em: agora, ultimo_contato_em: agora, codigo_hash: null, codigo_expira_em: null, versao: info.versao?.slice(0, 40) ?? null, maquina: info.maquina?.slice(0, 120) ?? null, diagnostico: null, diagnostico_em: null })
    .eq("id", data.id)
  if (e2) return { ok: false, status: 500, mensagem: "Falha ao parear." }
  const sede = data.sede as { nome?: unknown } | { nome?: unknown }[] | null
  return { ok: true, token, id: String(data.id), emp, nome: String(data.nome), conector: data.conector as Conector, sedeNome: Array.isArray(sede) ? texto(sede[0]?.nome) : texto(sede?.nome) }
}

/** Confere `Authorization: Bearer ca_…` e devolve o agente (só desta entidade). */
export async function autenticarAgente(req: Request): Promise<AgenteAutenticado | null> {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim()
  if (!FORMATO_TOKEN_AGENTE.test(token)) return null
  const emp = await tenantAtual()
  const { data } = await createServiceClient()
    .from("acesso_agentes")
    .select("id, nome, conector, sede:empresa_sede(nome)")
    .eq("token_hash", sha256(token))
    .eq("emp_proprietaria_id", emp)
    .is("revogado_em", null)
    .maybeSingle()
  if (!data) return null
  const sede = data.sede as { nome?: unknown } | { nome?: unknown }[] | null
  return { id: String(data.id), emp, nome: String(data.nome), conector: data.conector as Conector, sedeNome: Array.isArray(sede) ? texto(sede[0]?.nome) : texto(sede?.nome) }
}

export type ComandoAgente = { id: string; tipo: "verificar" }

/** Contato do agente: marca o horário e entrega os comandos pendentes. */
export async function registrarContato(a: AgenteAutenticado, info: { versao?: string; maquina?: string }): Promise<ComandoAgente[]> {
  const svc = createServiceClient()
  const agora = new Date().toISOString()
  const atualizar: Record<string, string> = { ultimo_contato_em: agora }
  if (info.versao) atualizar.versao = info.versao.slice(0, 40)
  if (info.maquina) atualizar.maquina = info.maquina.slice(0, 120)
  await svc.from("acesso_agentes").update(atualizar).eq("id", a.id)
  const { data } = await svc.from("acesso_agente_comandos").select("id, tipo").eq("agente_id", a.id).eq("situacao", "pendente").order("created_at", { ascending: true }).limit(10)
  const comandos = (data ?? []).map((c) => ({ id: String(c.id), tipo: c.tipo as "verificar" }))
  if (comandos.length) await svc.from("acesso_agente_comandos").update({ situacao: "entregue", entregue_em: agora }).in("id", comandos.map((c) => c.id))
  return comandos
}

/** Resultado de uma verificação (pedida pelo painel ou feita pelo agente sozinho). */
export async function registrarDiagnostico(a: AgenteAutenticado, d: { comandoId?: string | null; verificacoes: unknown }): Promise<{ erro?: string }> {
  const lidas = lerDiagnostico(d.verificacoes)
  if (!lidas) return { erro: "verificacoes deve ser uma lista [{id, ok, detalhe}]." }
  const svc = createServiceClient()
  const agora = new Date().toISOString()
  await svc.from("acesso_agentes").update({ diagnostico: lidas, diagnostico_em: agora, ultimo_contato_em: agora }).eq("id", a.id)
  if (d.comandoId) {
    const ok = lidas.every((v) => v.ok)
    await svc.from("acesso_agente_comandos").update({ situacao: ok ? "concluido" : "falhou", resultado: lidas, concluido_em: agora }).eq("id", d.comandoId).eq("agente_id", a.id)
  }
  return {}
}
