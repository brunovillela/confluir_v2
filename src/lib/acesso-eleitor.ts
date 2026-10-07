import "server-only"

import { createHmac, timingSafeEqual } from "node:crypto"

import { cache } from "react"
import { cookies } from "next/headers"

import { colunasHorario, janelaDaAssembleia } from "@/lib/db/assembleias-horarios"
import { MARCA_NAO_RECONHECE } from "@/lib/db/votacao-primeiro-acesso"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * LINK PESSOAL DE VOTO — a porta que não depende de um segundo e-mail.
 *
 * Por que existe (22/09/2026): o código de acesso saía pelo SMTP do Supabase
 * e as caixas da Microsoft (hotmail/outlook/live) engoliram 15 de 15 códigos
 * sem devolver recusa; o e-mail do próprio app, que vai pela API da Brevo,
 * chegou. Então o aviso "você está habilitado a votar" passa a levar um link
 * pessoal que abre a cédula direto.
 *
 * Segurança: o mesmo nível do código por e-mail — quem tem a caixa vota. O
 * token é um HMAC do id do apto (nada é gravado no banco), vale só para a
 * assembleia daquele link e para de servir depois que a pessoa vota. O link
 * não expira por tempo; a sessão que ele abre dura até o fim da votação. A trava de voto único continua sendo a do apto.
 */

const COOKIE = "confluir_acesso_eleitor"
/**
 * A sessão aberta pelo link vale até o FIM DA VOTAÇÃO (07/10/2026). Antes
 * eram 6 h fixas: quem abria o link, deixava a página aberta e voltava depois
 * via "Sessão de votação expirada" — e entendia que o link tinha vencido.
 */
const TTL_MINIMO = 60 * 60 // 1 h
const TTL_SEM_JANELA = 60 * 60 * 24 // assembleia sem término conhecido
const TTL_MAXIMO = 60 * 60 * 24 * 60 // teto de 60 dias

function txt(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null
}

/** Segundos até o fim da janela de votação da assembleia (com piso e teto). */
async function segundosAteFimDaVotacao(assembleiaId: string): Promise<number> {
  try {
    const admin = await createAdminClient()
    const { data } = await admin
      .from("voto_assembleias")
      .select("data_inicio, data_termino, periodo_inicio, periodo_termino, rod_assembleia_id" + (await colunasHorario()))
      .eq("id", assembleiaId)
      .eq("emp_proprietaria_id", await tenantAtual())
      .maybeSingle()
    const a = data as unknown as Record<string, unknown> | null
    if (!a) return TTL_SEM_JANELA
    let terminoRodada: string | null = null
    if (txt(a.rod_assembleia_id)) {
      const { data: rod } = await admin
        .from("voto_rod_assembleias")
        .select("termino")
        .eq("id", a.rod_assembleia_id as string)
        .maybeSingle()
      terminoRodada = txt(rod?.termino)
    }
    const fim = janelaDaAssembleia(
      {
        data_inicio: txt(a.data_inicio) ?? txt(a.periodo_inicio),
        hora_inicio: txt(a.hora_inicio),
        data_termino: txt(a.data_termino) ?? txt(a.periodo_termino),
        hora_termino: txt(a.hora_termino),
      },
      terminoRodada
    ).termino
    if (fim === null) return TTL_SEM_JANELA
    const restante = Math.ceil((fim - Date.now()) / 1000)
    return Math.min(Math.max(restante, TTL_MINIMO), TTL_MAXIMO)
  } catch {
    return TTL_SEM_JANELA
  }
}

function segredo(): string {
  const s = process.env.SUPABASE_JWT_SECRET
  if (!s) throw new Error("SUPABASE_JWT_SECRET ausente — link de voto indisponível")
  return s
}

function assinar(corpo: string): string {
  return createHmac("sha256", segredo()).update(corpo).digest("base64url")
}

function confere(corpo: string, assinatura: string): boolean {
  const esperado = Buffer.from(assinar(corpo))
  const veio = Buffer.from(assinatura)
  return esperado.length === veio.length && timingSafeEqual(esperado, veio)
}

/** Token do link do e-mail: id do apto + assembleia, assinados. Sem validade própria. */
export function gerarTokenAcesso(aptoId: string, assembleiaId: string): string {
  const corpo = Buffer.from(JSON.stringify({ a: aptoId, s: assembleiaId })).toString("base64url")
  return `${corpo}.${assinar(corpo)}`
}

type Payload = { a: string; s: string; exp?: number }

function lerToken(token: string | undefined | null): Payload | null {
  if (!token) return null
  const [corpo, sig] = token.split(".")
  if (!corpo || !sig || !confere(corpo, sig)) return null
  try {
    const o = JSON.parse(Buffer.from(corpo, "base64url").toString()) as Payload
    if (typeof o.a !== "string" || typeof o.s !== "string") return null
    if (typeof o.exp === "number" && o.exp < Math.floor(Date.now() / 1000)) return null
    return o
  } catch {
    return null
  }
}

/** Confere o token do link e devolve o apto (ou null). */
export async function aptoDoToken(
  token: string,
  assembleiaId: string
): Promise<{ id: string; nome: string | null; cpf: string | null; email: string | null } | null> {
  const dados = lerToken(token)
  if (!dados || dados.s !== assembleiaId) return null
  const admin = await createAdminClient()
  const { data } = await admin
    .from("voto_assembleias_aptos")
    .select("id, nome_completo, cpf, email_corporativo, conflito_motivo")
    .eq("id", dados.a)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (!data) return null
  // Quem avisou "não sou eu" derruba o link: ele não abre mais a cédula.
  if (data.conflito_motivo === MARCA_NAO_RECONHECE) return null
  return {
    id: String(data.id),
    nome: (data.nome_completo as string | null) ?? null,
    cpf: (data.cpf as string | null) ?? null,
    email: (data.email_corporativo as string | null) ?? null,
  }
}

/**
 * Cria a sessão de voto por link (cookie assinado, só para aquela
 * assembleia), válida até o fim da votação.
 */
export async function abrirSessaoPorLink(aptoId: string, assembleiaId: string): Promise<void> {
  const ttl = await segundosAteFimDaVotacao(assembleiaId)
  const corpo = Buffer.from(
    JSON.stringify({
      a: aptoId,
      s: assembleiaId,
      exp: Math.floor(Date.now() / 1000) + ttl,
    })
  ).toString("base64url")
  const jar = await cookies()
  jar.set(COOKIE, `${corpo}.${assinar(corpo)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: ttl,
    path: "/",
  })
}

export async function encerrarSessaoPorLink(): Promise<void> {
  const jar = await cookies()
  jar.delete(COOKIE)
}

export type EleitorPorLink = {
  aptoId: string
  assembleiaId: string
  nome: string | null
  cpf: string | null
  email: string | null
}

/**
 * O eleitor autenticado pelo link nesta assembleia (ou null). Cacheado por
 * request: a cédula, a action do voto e o primeiro acesso leem daqui.
 */
export const eleitorPorLink = cache(
  async (assembleiaId: string): Promise<EleitorPorLink | null> => {
    const jar = await cookies()
    const dados = lerToken(jar.get(COOKIE)?.value)
    if (!dados || dados.s !== assembleiaId) return null
    const admin = await createAdminClient()
    const { data } = await admin
      .from("voto_assembleias_aptos")
      .select("id, nome_completo, cpf, email_corporativo, conflito_motivo")
      .eq("id", dados.a)
      .eq("emp_proprietaria_id", await tenantAtual())
      .maybeSingle()
    if (!data) return null
    if (data.conflito_motivo === MARCA_NAO_RECONHECE) return null
    return {
      aptoId: String(data.id),
      assembleiaId,
      nome: (data.nome_completo as string | null) ?? null,
      cpf: (data.cpf as string | null) ?? null,
      email: (data.email_corporativo as string | null) ?? null,
    }
  }
)
