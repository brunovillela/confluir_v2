import "server-only"
import { tenantAtual } from "@/lib/tenant"

import { gerarJsonIA } from "@/lib/ia"
import {
  createAdminClient,
  createServiceClient,
} from "@/lib/supabase/admin"

/**
 * Módulo Comunicação — Resumo de notícias por IA. A IA lê sites indicados
 * (`comunicacao_fontes`), numa recorrência configurada
 * (`comunicacao_resumo_config`), e gera um resumo com título chamativo exibido
 * no painel; o histórico fica em `comunicacao_resumos`. Tudo por tenant.
 *
 * A geração roda tanto pelo botão "Gerar agora" (com o tenant da sessão) quanto
 * pelo tick do agendador (que percorre TODOS os tenants) — por isso
 * `gerarResumo` recebe o `tenantId` EXPLÍCITO e usa service role.
 */

export type Frequencia = "diaria" | "dias_uteis" | "semanal" | "horas"

export const TAMANHOS = [1000, 2000, 3000] as const

export const PROMPT_PADRAO = `Você é o editor de comunicação de um sindicato. A partir do conteúdo dos sites indicados, produza um resumo jornalístico das notícias mais relevantes para a categoria (setor de petróleo e energia, trabalho, direitos trabalhistas e sindicais, além de economia e política que afetem os trabalhadores). Priorize fatos recentes e concretos; ignore menus, anúncios, rodapés e conteúdo repetido dos sites. Não invente informações que não estejam nas fontes.`

function texto(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null
}

// ── Configuração ─────────────────────────────────────────────────────────────

export type ResumoConfig = {
  ativo: boolean
  frequencia: Frequencia
  hora: string | null
  diaSemana: number | null
  intervaloHoras: number | null
  tamanho: number
  prompt: string
  ultimaGeracao: string | null
}

const CONFIG_PADRAO: ResumoConfig = {
  ativo: false,
  frequencia: "diaria",
  hora: "07:00",
  diaSemana: 1,
  intervaloHoras: 6,
  tamanho: 2000,
  prompt: PROMPT_PADRAO,
  ultimaGeracao: null,
}

function mapConfig(d: Record<string, unknown> | null): ResumoConfig {
  if (!d) return { ...CONFIG_PADRAO }
  return {
    ativo: d.ativo === true,
    frequencia: (texto(d.frequencia) as Frequencia) ?? "diaria",
    hora: texto(d.hora) ? String(d.hora).slice(0, 5) : CONFIG_PADRAO.hora,
    diaSemana:
      typeof d.dia_semana === "number" ? d.dia_semana : CONFIG_PADRAO.diaSemana,
    intervaloHoras:
      typeof d.intervalo_horas === "number"
        ? d.intervalo_horas
        : CONFIG_PADRAO.intervaloHoras,
    tamanho: typeof d.tamanho === "number" ? d.tamanho : 2000,
    prompt: texto(d.prompt) ?? PROMPT_PADRAO,
    ultimaGeracao: texto(d.ultima_geracao),
  }
}

export async function obterConfig(): Promise<ResumoConfig> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("comunicacao_resumo_config")
    .select("*")
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  return mapConfig(data as Record<string, unknown> | null)
}

export type DadosConfig = {
  ativo: boolean
  frequencia: Frequencia
  hora: string | null
  diaSemana: number | null
  intervaloHoras: number | null
  tamanho: number
  prompt: string
}

export async function salvarConfig(
  dados: DadosConfig
): Promise<{ erro?: string }> {
  const empId = await tenantAtual()
  const admin = await createAdminClient()
  const { error } = await admin
    .from("comunicacao_resumo_config")
    .upsert(
      {
        emp_proprietaria_id: empId,
        ativo: dados.ativo,
        frequencia: dados.frequencia,
        hora: dados.hora,
        dia_semana: dados.diaSemana,
        intervalo_horas: dados.intervaloHoras,
        tamanho: dados.tamanho,
        prompt: dados.prompt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "emp_proprietaria_id" }
    )
  if (error) return { erro: `Não foi possível salvar: ${error.message}` }
  return {}
}

// ── Fontes ───────────────────────────────────────────────────────────────────

export type Fonte = {
  id: string
  url: string
  nome: string | null
  ativo: boolean
}

export async function listarFontes(): Promise<Fonte[]> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("comunicacao_fontes")
    .select("id, url, nome, ativo")
    .eq("emp_proprietaria_id", await tenantAtual())
    .order("created_at", { ascending: true, nullsFirst: false })
  return (data ?? []).map((f) => ({
    id: String(f.id),
    url: String(f.url),
    nome: texto(f.nome),
    ativo: f.ativo !== false,
  }))
}

export async function adicionarFonte(
  url: string,
  nome: string | null
): Promise<{ erro?: string }> {
  const u = url.trim()
  if (!/^https?:\/\/.+/i.test(u)) {
    return { erro: "Informe uma URL válida (começando com http:// ou https://)." }
  }
  const admin = await createAdminClient()
  const { error } = await admin.from("comunicacao_fontes").insert({
    url: u,
    nome: nome?.trim() || null,
    ativo: true,
    emp_proprietaria_id: await tenantAtual(),
  })
  if (error) return { erro: `Não foi possível adicionar: ${error.message}` }
  return {}
}

export async function removerFonte(id: string): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin
    .from("comunicacao_fontes")
    .delete()
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: `Não foi possível remover: ${error.message}` }
  return {}
}

// ── Resumos (histórico + leitura) ────────────────────────────────────────────

export type Resumo = {
  id: string
  titulo: string | null
  resumo: string | null
  tamanho: number | null
  origem: string | null
  fontes_url: string[]
  created_at: string | null
}

function mapResumo(r: Record<string, unknown>): Resumo {
  return {
    id: String(r.id),
    titulo: texto(r.titulo),
    resumo: texto(r.resumo),
    tamanho: typeof r.tamanho === "number" ? r.tamanho : null,
    origem: texto(r.origem),
    fontes_url: Array.isArray(r.fontes_url) ? (r.fontes_url as string[]) : [],
    created_at: texto(r.created_at),
  }
}

export async function listarResumos(limite = 20): Promise<Resumo[]> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("comunicacao_resumos")
    .select("*")
    .eq("emp_proprietaria_id", await tenantAtual())
    .order("created_at", { ascending: false, nullsFirst: false })
    .limit(limite)
  return (data ?? []).map((r) => mapResumo(r as Record<string, unknown>))
}

export async function ultimoResumo(): Promise<Resumo | null> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("comunicacao_resumos")
    .select("*")
    .eq("emp_proprietaria_id", await tenantAtual())
    .order("created_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle()
  return data ? mapResumo(data as Record<string, unknown>) : null
}

// ── Leitura de sites ─────────────────────────────────────────────────────────

const MAX_POR_FONTE = 8000

function decodificarEntidades(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
}

/** HTML bruto → texto legível (sem script/style/tags), cortado. */
function extrairTextoDeHtml(html: string): string {
  const semScript = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
  const semTags = semScript.replace(/<[^>]+>/g, " ")
  const texto = decodificarEntidades(semTags).replace(/\s+/g, " ").trim()
  return texto.slice(0, MAX_POR_FONTE)
}

async function lerFonte(
  url: string
): Promise<{ url: string; texto: string } | null> {
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ConfluirComunicacao/1.0)" },
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    })
    if (!r.ok) return null
    const texto = extrairTextoDeHtml(await r.text())
    return texto.length > 40 ? { url, texto } : null
  } catch {
    return null
  }
}

// ── Geração (IA) — tenant EXPLÍCITO, service role ────────────────────────────

/** Config de um tenant lida por service role (para o tick do agendador). */
async function configDoTenant(
  service: ReturnType<typeof createServiceClient>,
  tenantId: string
): Promise<{ cfg: ResumoConfig; fontes: string[] } | null> {
  const { data } = await service
    .from("comunicacao_resumo_config")
    .select("*")
    .eq("emp_proprietaria_id", tenantId)
    .maybeSingle()
  const cfg = mapConfig(data as Record<string, unknown> | null)
  const { data: fontes } = await service
    .from("comunicacao_fontes")
    .select("url")
    .eq("emp_proprietaria_id", tenantId)
    .eq("ativo", true)
  return { cfg, fontes: (fontes ?? []).map((f) => String(f.url)) }
}

export async function gerarResumo(
  tenantId: string,
  origem: "manual" | "agendador"
): Promise<{ erro?: string; id?: string }> {
  const service = createServiceClient()
  const dados = await configDoTenant(service, tenantId)
  if (!dados || dados.fontes.length === 0) {
    return { erro: "Nenhum site cadastrado para o resumo." }
  }
  const { cfg, fontes } = dados

  const lidas = (await Promise.all(fontes.map(lerFonte))).filter(
    (v): v is { url: string; texto: string } => v !== null
  )
  if (lidas.length === 0) {
    return { erro: "Não foi possível ler nenhum dos sites indicados agora." }
  }

  const system = `${cfg.prompt || PROMPT_PADRAO}

Responda SOMENTE com um objeto JSON no formato {"titulo": "...", "resumo": "..."}.
- "titulo": uma manchete curta e chamativa (sem aspas internas).
- "resumo": texto corrido em português do Brasil, com aproximadamente ${cfg.tamanho} caracteres, factual, baseado apenas no conteúdo das fontes. Não invente fatos.`

  const prompt = lidas
    .map((f, i) => `FONTE ${i + 1} (${f.url}):\n${f.texto}`)
    .join("\n\n---\n\n")

  const { dados: json, erro } = await gerarJsonIA({ system, prompt })
  if (erro) return { erro }
  const titulo = texto(json?.titulo)
  const resumo = texto(json?.resumo)
  if (!resumo) return { erro: "A IA não retornou um resumo válido." }

  const { data: criado, error } = await service
    .from("comunicacao_resumos")
    .insert({
      emp_proprietaria_id: tenantId,
      titulo,
      resumo,
      tamanho: cfg.tamanho,
      origem,
      fontes_url: lidas.map((f) => f.url),
    })
    .select("id")
    .single()
  if (error || !criado) {
    return { erro: `Falha ao salvar o resumo: ${error?.message ?? "?"}` }
  }

  await service
    .from("comunicacao_resumo_config")
    .update({ ultima_geracao: new Date().toISOString() })
    .eq("emp_proprietaria_id", tenantId)

  return { id: String(criado.id) }
}

// ── Agendamento ──────────────────────────────────────────────────────────────

const TZ = "America/Sao_Paulo"
const fmtData = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
})
const fmtHora = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
})

export type AgendaConfig = {
  frequencia: string
  hora: string | null
  diaSemana: number | null
  intervaloHoras: number | null
  ultimaGeracao: string | null
}

/** Decide, para o `agora` informado, se a config está na hora de gerar. */
export function estaNaHoraDeGerar(cfg: AgendaConfig, agora: Date): boolean {
  const dataSP = fmtData.format(agora)
  const horaSP = fmtHora.format(agora)
  const diaSemanaSP = new Date(`${dataSP}T12:00:00Z`).getUTCDay()
  const horaAlvo = (cfg.hora ?? "00:00").slice(0, 5)
  const ultimaData = cfg.ultimaGeracao
    ? fmtData.format(new Date(cfg.ultimaGeracao))
    : null
  const jaGerouHoje = ultimaData === dataSP

  switch (cfg.frequencia) {
    case "horas": {
      if (!cfg.ultimaGeracao) return true
      const h =
        cfg.intervaloHoras && cfg.intervaloHoras > 0 ? cfg.intervaloHoras : 24
      return (
        agora.getTime() - new Date(cfg.ultimaGeracao).getTime() >=
        h * 3_600_000
      )
    }
    case "dias_uteis":
      if (diaSemanaSP === 0 || diaSemanaSP === 6) return false
      return !jaGerouHoje && horaSP >= horaAlvo
    case "semanal":
      return (
        diaSemanaSP === (cfg.diaSemana ?? 1) && !jaGerouHoje && horaSP >= horaAlvo
      )
    case "diaria":
    default:
      return !jaGerouHoje && horaSP >= horaAlvo
  }
}

/** Configs ativas de TODOS os tenants (para o tick). Service role. */
export async function configsAtivasParaTick(): Promise<
  (AgendaConfig & { tenantId: string })[]
> {
  const service = createServiceClient()
  const { data } = await service
    .from("comunicacao_resumo_config")
    .select(
      "emp_proprietaria_id, frequencia, hora, dia_semana, intervalo_horas, ultima_geracao"
    )
    .eq("ativo", true)
  return (data ?? [])
    .filter((c) => c.emp_proprietaria_id)
    .map((c) => ({
      tenantId: String(c.emp_proprietaria_id),
      frequencia: String(c.frequencia ?? "diaria"),
      hora: texto(c.hora) ? String(c.hora).slice(0, 5) : null,
      diaSemana: typeof c.dia_semana === "number" ? c.dia_semana : null,
      intervaloHoras:
        typeof c.intervalo_horas === "number" ? c.intervalo_horas : null,
      ultimaGeracao: texto(c.ultima_geracao),
    }))
}
