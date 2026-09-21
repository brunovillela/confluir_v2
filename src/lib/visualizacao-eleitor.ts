import "server-only"

import { createHmac } from "node:crypto"

import { cache } from "react"
import { cookies } from "next/headers"

import { getSessaoPainel } from "@/lib/auth"
import { podeAcessar } from "@/lib/permissoes"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * "Ver como eleitor" — quem cuida das assembleias abre a área de votação de um
 * apto em modo SOMENTE LEITURA, para orientar ao telefone.
 *
 * A segurança é ESTRUTURAL, igual ao "Ver como filiado" e ao "Ver como o
 * hotel": o voto (votarPublico) e o primeiro acesso (informarDadosEleitor)
 * leem a identidade da SESSÃO real — o CPF ou o e-mail do OTP de quem está
 * logado —, nunca este cookie. A gestão não vota nem informa dados pelo apto
 * nem burlando o `disabled`. Este módulo cobre só a EXIBIÇÃO.
 *
 * O cookie guarda só UUIDs (aptoId + gestorId), assinado (HMAC), com validade
 * curta; a permissão é RE-CHECADA a cada request.
 */

export const COOKIE_VISUALIZACAO_ELEITOR = "confluir_ver_eleitor"
const TTL_SEGUNDOS = 60 * 30 // 30 min

function assinar(corpo: string): string {
  return createHmac("sha256", process.env.SUPABASE_JWT_SECRET!).update(corpo).digest("base64url")
}

export function gerarTokenVisualizacaoEleitor(aptoId: string, gestorId: string): string {
  const corpo = Buffer.from(
    JSON.stringify({ a: aptoId, g: gestorId, exp: Math.floor(Date.now() / 1000) + TTL_SEGUNDOS })
  ).toString("base64url")
  return `${corpo}.${assinar(corpo)}`
}

export const MAX_IDADE_VISUALIZACAO_ELEITOR = TTL_SEGUNDOS

type Payload = { a: string; g: string; exp: number }

function lerToken(token: string | undefined): Payload | null {
  if (!token) return null
  const [corpo, sig] = token.split(".")
  if (!corpo || !sig || assinar(corpo) !== sig) return null
  try {
    const o = JSON.parse(Buffer.from(corpo, "base64url").toString()) as Payload
    if (typeof o.a !== "string" || typeof o.g !== "string") return null
    if (typeof o.exp !== "number" || o.exp < Math.floor(Date.now() / 1000)) return null
    return o
  } catch {
    return null
  }
}

export type AptoVisualizado = {
  id: string
  nome: string | null
  cpf: string | null
  email: string | null
  assembleiaId: string | null
  rodadaId: string | null
  gestorNome: string | null
}

/** O apto em visualização (ou null quando não há cookie válido/permissão). */
export const getVisualizacaoEleitor = cache(async (): Promise<AptoVisualizado | null> => {
  const jar = await cookies()
  const dados = lerToken(jar.get(COOKIE_VISUALIZACAO_ELEITOR)?.value)
  if (!dados) return null

  const painel = await getSessaoPainel()
  if (!painel || painel.usuario.id !== dados.g || !podeAcessar(painel.permissoes, "assembleias")) {
    return null
  }

  const admin = await createAdminClient()
  const { data } = await admin
    .from("voto_assembleias_aptos")
    .select("id, nome_completo, cpf, email_corporativo, assembleia_id, rod_assembleia_id")
    .eq("id", dados.a)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (!data) return null
  return {
    id: String(data.id),
    nome: (data.nome_completo as string | null) ?? null,
    cpf: (data.cpf as string | null) ?? null,
    email: (data.email_corporativo as string | null) ?? null,
    assembleiaId: (data.assembleia_id as string | null) ?? null,
    rodadaId: (data.rod_assembleia_id as string | null) ?? null,
    gestorNome: painel.usuario.nome_guerra ?? painel.usuario.nome_completo,
  }
})

/** Rodada do apto em visualização (para voltar à lista de aptos ao encerrar). */
export async function alvoDaVisualizacaoEleitor(): Promise<string | null> {
  const jar = await cookies()
  const dados = lerToken(jar.get(COOKIE_VISUALIZACAO_ELEITOR)?.value)
  if (!dados) return null
  const admin = await createAdminClient()
  const { data } = await admin
    .from("voto_assembleias_aptos")
    .select("rod_assembleia_id")
    .eq("id", dados.a)
    .maybeSingle()
  return (data?.rod_assembleia_id as string | null) ?? null
}
