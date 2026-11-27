import "server-only"

import { esquemaAusente, nomesDosUsuarios, texto } from "@/lib/db/comum"
import { CONTROLES_PADRAO, MODULOS_EMAIL, type ControlesEmail } from "@/lib/email-processos"
import { createServiceClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * CONTROLES DO E-MAIL (Gestão › E-mail, 26/11/2026 — fase 3). Módulos
 * desligados, teto mensal, cotas por departamento (email_config) e endereços
 * bloqueados (email_bloqueios). A decisão de barrar fica em
 * lib/email-processos.ts (motivoParaBarrar); aqui só a leitura e a gravação.
 *
 * Um lote da mala direta manda centenas de e-mails em segundos: a
 * configuração, os bloqueios e as contagens do mês ficam em memória por
 * pouco tempo (e as contagens somam os envios feitos nesse meio-tempo), para
 * não consultar o banco a cada e-mail. Usa o cliente de serviço porque roda
 * também no agendador, sempre com a entidade explícita.
 */

const TTL_MS = 60_000

type Entrada<T> = { valor: T; ate: number }
const cacheConfig = new Map<string, Entrada<{ disponivel: boolean; controles: ControlesEmail }>>()
const cacheBloqueios = new Map<string, Entrada<Set<string>>>()
const cacheContagem = new Map<string, Entrada<{ total: number; porDepto: Map<string, number> }>>()

function lerNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function lerCotas(v: unknown): Record<string, number> {
  const r: Record<string, number> = {}
  if (!v || typeof v !== "object" || Array.isArray(v)) return r
  for (const [k, n] of Object.entries(v as Record<string, unknown>)) {
    const x = lerNum(n)
    if (x !== null && x > 0) r[k] = Math.round(x)
  }
  return r
}

/** Meia-noite do dia 1 em Brasília (UTC-3). */
export function inicioDoMesEmail(agora = new Date()): Date {
  const br = new Date(agora.getTime() - 3 * 3600_000)
  return new Date(Date.UTC(br.getUTCFullYear(), br.getUTCMonth(), 1, 3, 0, 0))
}

export async function controlesEmail(emp: string, fresco = false): Promise<{ disponivel: boolean; controles: ControlesEmail }> {
  const c = cacheConfig.get(emp)
  if (!fresco && c && c.ate > Date.now()) return c.valor
  let valor: { disponivel: boolean; controles: ControlesEmail }
  try {
    const { data, error } = await createServiceClient()
      .from("email_config")
      .select("modulos_desligados, limite_mensal, bloquear_no_limite, cotas_departamento")
      .eq("emp_proprietaria_id", emp)
      .maybeSingle()
    if (error) valor = { disponivel: !esquemaAusente(error), controles: CONTROLES_PADRAO }
    else {
      const l = (data ?? null) as Record<string, unknown> | null
      const validos = new Set(MODULOS_EMAIL.map((m) => m.slug))
      valor = {
        disponivel: true,
        controles: l
          ? {
              modulosDesligados: Array.isArray(l.modulos_desligados) ? (l.modulos_desligados as string[]).filter((m) => validos.has(m)) : [],
              limiteMensal: lerNum(l.limite_mensal),
              bloquearNoLimite: l.bloquear_no_limite === true,
              cotasDepartamento: lerCotas(l.cotas_departamento),
            }
          : CONTROLES_PADRAO,
      }
    }
  } catch {
    valor = { disponivel: false, controles: CONTROLES_PADRAO }
  }
  cacheConfig.set(emp, { valor, ate: Date.now() + TTL_MS })
  return valor
}

/** Endereços bloqueados da entidade (minúsculas). */
async function bloqueados(emp: string): Promise<Set<string>> {
  const c = cacheBloqueios.get(emp)
  if (c && c.ate > Date.now()) return c.valor
  const set = new Set<string>()
  try {
    const admin = createServiceClient()
    for (let de = 0; de < 50_000; de += 1000) {
      const { data, error } = await admin.from("email_bloqueios").select("endereco").eq("emp_proprietaria_id", emp).order("endereco").range(de, de + 999)
      if (error) break
      for (const l of data ?? []) set.add(String(l.endereco))
      if ((data ?? []).length < 1000) break
    }
  } catch {
    // Sem a tabela (migração pendente): ninguém bloqueado.
  }
  cacheBloqueios.set(emp, { valor: set, ate: Date.now() + TTL_MS })
  return set
}

export async function enderecoBloqueado(emp: string, endereco: string): Promise<boolean> {
  return (await bloqueados(emp)).has(endereco.trim().toLowerCase())
}

/**
 * E-mails que saíram no mês (aceitos ou a caminho do provedor), no total e
 * por departamento de quem disparou. Só é consultado com teto ou cota.
 */
export async function enviadosNoMes(emp: string, comDepartamentos: boolean): Promise<{ total: number; porDepto: Map<string, number> }> {
  const c = cacheContagem.get(emp)
  if (c && c.ate > Date.now() && (!comDepartamentos || c.valor.porDepto.size > 0 || c.valor.total === 0)) return c.valor
  const valor = { total: 0, porDepto: new Map<string, number>() }
  try {
    const admin = createServiceClient()
    const desde = inicioDoMesEmail().toISOString()
    const { count } = await admin
      .from("email_envios")
      .select("id", { count: "exact", head: true })
      .eq("emp_proprietaria_id", emp)
      .in("situacao", ["enviado", "enviando"])
      .gte("criado_em", desde)
    valor.total = count ?? 0
    for (let de = 0; comDepartamentos && de < 200_000; de += 1000) {
      const { data, error } = await admin
        .from("email_envios")
        .select("departamento_id")
        .eq("emp_proprietaria_id", emp)
        .in("situacao", ["enviado", "enviando"])
        .gte("criado_em", desde)
        .not("departamento_id", "is", null)
        .order("id")
        .range(de, de + 999)
      if (error) break
      for (const l of data ?? []) {
        const d = String(l.departamento_id)
        valor.porDepto.set(d, (valor.porDepto.get(d) ?? 0) + 1)
      }
      if ((data ?? []).length < 1000) break
    }
  } catch {
    // Sem contagem: não barra.
  }
  cacheContagem.set(emp, { valor, ate: Date.now() + 30_000 })
  return valor
}

/** Soma um envio na contagem em memória (até o próximo recálculo). */
export function contarEnvio(emp: string, departamentoId: string | null): void {
  const c = cacheContagem.get(emp)
  if (!c || c.ate <= Date.now()) return
  c.valor.total++
  if (departamentoId) c.valor.porDepto.set(departamentoId, (c.valor.porDepto.get(departamentoId) ?? 0) + 1)
}

/** Esquece o que está em memória (depois de a Gestão salvar). */
export function esquecerControlesEmail(emp: string): void {
  cacheConfig.delete(emp)
  cacheBloqueios.delete(emp)
  cacheContagem.delete(emp)
}

// ── Leitura e gravação pela Gestão ──────────────────────────────────────────

export async function obterControlesEmail(): Promise<{ disponivel: boolean; controles: ControlesEmail }> {
  return controlesEmail(await tenantAtual(), true)
}

async function registrarEvento(emp: string, acao: string, detalhe: string | null, usuarioId: string): Promise<void> {
  await createServiceClient().from("gestao_eventos").insert({ emp_proprietaria_id: emp, usuario_id: usuarioId, area: "email", acao, detalhe })
}

export async function salvarControlesEmail(c: ControlesEmail, mudancas: string[], usuarioId: string): Promise<{ erro?: string }> {
  const emp = await tenantAtual()
  const { error } = await createServiceClient()
    .from("email_config")
    .upsert(
      {
        emp_proprietaria_id: emp,
        modulos_desligados: c.modulosDesligados,
        limite_mensal: c.limiteMensal,
        bloquear_no_limite: c.bloquearNoLimite,
        cotas_departamento: c.cotasDepartamento,
        atualizado_por: usuarioId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "emp_proprietaria_id" }
    )
  if (error) return { erro: esquemaAusente(error) ? "Falta aplicar a migração dos controles de e-mail." : `Falha ao salvar: ${error.message}` }
  esquecerControlesEmail(emp)
  if (mudancas.length) await registrarEvento(emp, "email_controles", mudancas.join("; ").slice(0, 500), usuarioId)
  return {}
}

export type BloqueioEmail = { id: string; endereco: string; motivo: string | null; origem: "rejeicao" | "manual"; criadoEm: string; criadoPor: string | null }

export async function listarBloqueios(busca: string | null, limite = 200): Promise<{ disponivel: boolean; total: number; bloqueios: BloqueioEmail[] }> {
  const emp = await tenantAtual()
  let q = createServiceClient()
    .from("email_bloqueios")
    .select("id, endereco, motivo, origem, criado_em, criado_por", { count: "exact" })
    .eq("emp_proprietaria_id", emp)
    .order("criado_em", { ascending: false })
    .limit(limite)
  const b = busca?.trim().toLowerCase().replace(/[%_,()]/g, "")
  if (b) q = q.ilike("endereco", `%${b}%`)
  const { data, error, count } = await q
  if (error) return { disponivel: !esquemaAusente(error), total: 0, bloqueios: [] }
  const linhas = (data ?? []) as Record<string, unknown>[]
  const nomes = await nomesDosUsuarios(linhas.map((l) => String(l.criado_por ?? "")).filter(Boolean))
  return {
    disponivel: true,
    total: count ?? linhas.length,
    bloqueios: linhas.map((l) => ({
      id: String(l.id),
      endereco: String(l.endereco),
      motivo: texto(l.motivo),
      origem: l.origem === "manual" ? "manual" : "rejeicao",
      criadoEm: String(l.criado_em),
      criadoPor: l.criado_por ? (nomes.get(String(l.criado_por)) ?? null) : null,
    })),
  }
}

export async function bloquearEndereco(endereco: string, motivo: string | null, usuarioId: string): Promise<{ erro?: string }> {
  const emp = await tenantAtual()
  const e = endereco.trim().toLowerCase()
  const { error } = await createServiceClient()
    .from("email_bloqueios")
    .upsert({ emp_proprietaria_id: emp, endereco: e, motivo: motivo?.slice(0, 200) || "Bloqueado à mão", origem: "manual", criado_por: usuarioId }, { onConflict: "emp_proprietaria_id,endereco", ignoreDuplicates: true })
  if (error) return { erro: `Falha ao bloquear: ${error.message}` }
  esquecerControlesEmail(emp)
  await registrarEvento(emp, "email_bloqueio", `bloqueou ${e}`, usuarioId)
  return {}
}

export async function liberarEndereco(id: string, usuarioId: string): Promise<{ erro?: string; endereco?: string }> {
  const emp = await tenantAtual()
  const { data, error } = await createServiceClient().from("email_bloqueios").delete().eq("id", id).eq("emp_proprietaria_id", emp).select("endereco").maybeSingle()
  if (error) return { erro: `Falha ao liberar: ${error.message}` }
  if (!data) return { erro: "Esse bloqueio já não existe." }
  esquecerControlesEmail(emp)
  await registrarEvento(emp, "email_liberacao", `liberou ${String(data.endereco)}`, usuarioId)
  return { endereco: String(data.endereco) }
}

/** Webhook: rejeição definitiva bloqueia o endereço (sem duplicar). */
export async function bloquearPorRejeicao(emp: string, endereco: string, motivo: string): Promise<void> {
  try {
    await createServiceClient()
      .from("email_bloqueios")
      .upsert(
        { emp_proprietaria_id: emp, endereco: endereco.trim().toLowerCase(), motivo: motivo.slice(0, 200), origem: "rejeicao" },
        { onConflict: "emp_proprietaria_id,endereco", ignoreDuplicates: true }
      )
    cacheBloqueios.delete(emp)
  } catch {
    // Acessório: o registro do envio já tem a rejeição.
  }
}
