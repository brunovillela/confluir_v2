import "server-only"

import { createHash, createHmac, timingSafeEqual } from "node:crypto"

import type { SupabaseClient } from "@supabase/supabase-js"

import { cpfConfiavel, grafiasDoCpf } from "@/lib/cpf"
import { esquemaAusente, texto } from "@/lib/db/comum"
import { createServiceClient } from "@/lib/supabase/admin"

/**
 * Descadastro da mala direta: quem não quer mais receber comunicados.
 *
 * A marca fica no cadastro (filiacoes.comunicados_optout_em/origem), em todos
 * os registros do CPF. Vale só para a mala direta — o parabéns de aniversário
 * e os avisos do serviço (votação, reservas, senha) continuam saindo.
 *
 * O link do e-mail leva um token assinado com o tenant e o CPF (nada é gravado
 * para gerá-lo): quem tem o e-mail na mão pode descadastrar aquele endereço,
 * e só isso. Origens: "link" (e-mail), "portal" (o próprio filiado) e
 * "secretaria" (marcado na ficha pelo painel).
 */

export type OrigemDescadastro = "link" | "portal" | "secretaria"

export const ROTULO_ORIGEM_DESCADASTRO: Record<OrigemDescadastro, string> = {
  link: "pelo link do e-mail",
  portal: "pelo portal do filiado",
  secretaria: "pela secretaria",
}

type Db = SupabaseClient

/**
 * Chave do descadastro: derivada do segredo do projeto por finalidade. Assim
 * a mesma variável não assina JWT de tenant, link de voto E descadastro com a
 * chave idêntica (achado S12), sem precisar de uma variável nova.
 */
function segredo(): Buffer {
  const s = process.env.SUPABASE_JWT_SECRET
  if (!s) throw new Error("SUPABASE_JWT_SECRET ausente — link de descadastro indisponível")
  return createHash("sha256").update(`descadastro:${s}`).digest()
}

function assinar(corpo: string): string {
  // Prefixo próprio: um token de outra finalidade nunca vale aqui.
  return createHmac("sha256", segredo()).update(`comunicados:${corpo}`).digest("base64url")
}

/** Quem é a pessoa: o CPF ou, sem CPF confiável, o id do cadastro ("id:<uuid>"). */
export type Titular = { emp: string; cpf: string }

/**
 * O token do link leva o ID DO CADASTRO, nunca o CPF: o token aparece na URL
 * e no header List-Unsubscribe, e o CPF ficava legível em base64url (S12).
 * Links gerados antes de 03/10/2026 deixam de valer — cada envio da mala
 * direta gera o seu.
 */
export function tokenDescadastro(emp: string, filiacaoId: string): string {
  const corpo = Buffer.from(JSON.stringify({ e: emp, i: filiacaoId })).toString("base64url")
  return `${corpo}.${assinar(corpo)}`
}

export function lerTokenDescadastro(token: string | null | undefined): Titular | null {
  if (!token) return null
  const [corpo, sig] = token.split(".")
  if (!corpo || !sig) return null
  const esperado = Buffer.from(assinar(corpo))
  const veio = Buffer.from(sig)
  if (esperado.length !== veio.length || !timingSafeEqual(esperado, veio)) return null
  try {
    const o = JSON.parse(Buffer.from(corpo, "base64url").toString()) as { e?: unknown; i?: unknown }
    return typeof o.e === "string" && typeof o.i === "string" ? { emp: o.e, cpf: `id:${o.i}` } : null
  } catch {
    return null
  }
}

/**
 * Ids dos cadastros da pessoa no tenant. A partir de um id ("id:<uuid>"),
 * expande para todos os registros do mesmo CPF confiável — o descadastro vale
 * para a pessoa, não para um registro só.
 */
async function idsDoTitular(db: Db, t: Titular): Promise<string[]> {
  let cpf: string | null = null
  if (t.cpf.startsWith("id:")) {
    const { data } = await db
      .from("filiacoes")
      .select("id, cpf")
      .eq("emp_proprietaria_id", t.emp)
      .eq("id", t.cpf.slice(3))
      .maybeSingle()
    if (!data) return []
    cpf = cpfConfiavel(typeof data.cpf === "string" ? data.cpf : null)
    if (!cpf) return [String(data.id)]
  } else {
    cpf = cpfConfiavel(t.cpf)
    if (!cpf) return []
  }
  const { data } = await db.from("filiacoes").select("id").eq("emp_proprietaria_id", t.emp).in("cpf", grafiasDoCpf(cpf))
  return (data ?? []).map((r) => String(r.id))
}

export type SituacaoComunicados = {
  disponivel: boolean
  descadastradoEm: string | null
  origem: OrigemDescadastro | null
}

export async function situacaoComunicados(t: Titular, db: Db = createServiceClient()): Promise<SituacaoComunicados> {
  const ids = await idsDoTitular(db, t)
  if (!ids.length) return { disponivel: true, descadastradoEm: null, origem: null }
  const { data, error } = await db
    .from("filiacoes")
    .select("comunicados_optout_em, comunicados_optout_origem")
    .in("id", ids)
    .not("comunicados_optout_em", "is", null)
    .order("comunicados_optout_em", { ascending: false })
    .limit(1)
  if (error) return { disponivel: !esquemaAusente(error), descadastradoEm: null, origem: null }
  const r = data?.[0]
  const origem = texto(r?.comunicados_optout_origem)
  return {
    disponivel: true,
    descadastradoEm: texto(r?.comunicados_optout_em),
    origem: origem === "link" || origem === "portal" || origem === "secretaria" ? origem : null,
  }
}

/** Liga (`receber: false`) ou desliga o descadastro em todos os cadastros da pessoa. */
export async function definirComunicados(
  t: Titular,
  receber: boolean,
  origem: OrigemDescadastro,
  db: Db = createServiceClient()
): Promise<{ erro?: string }> {
  const ids = await idsDoTitular(db, t)
  if (!ids.length) return { erro: "Cadastro não encontrado." }
  const { error } = await db
    .from("filiacoes")
    .update(
      receber
        ? { comunicados_optout_em: null, comunicados_optout_origem: null }
        : { comunicados_optout_em: new Date().toISOString(), comunicados_optout_origem: origem }
    )
    .eq("emp_proprietaria_id", t.emp)
    .in("id", ids)
  if (error) return { erro: `Não foi possível salvar: ${error.message}` }
  return {}
}

/** Chaves (CPF ou "id:<uuid>") de quem pediu para não receber a mala direta. */
export async function descadastradosDoTenant(emp: string, db: Db): Promise<Set<string>> {
  const chaves = new Set<string>()
  for (let de = 0; ; de += 1000) {
    const { data, error } = await db
      .from("filiacoes")
      .select("id, cpf")
      .eq("emp_proprietaria_id", emp)
      .not("comunicados_optout_em", "is", null)
      .order("id")
      .range(de, de + 999)
    if (error) {
      if (esquemaAusente(error)) return chaves
      throw new Error(`Falha ao ler os descadastros: ${error.message}`)
    }
    for (const r of data ?? []) {
      chaves.add(cpfConfiavel(texto(r.cpf)) ?? `id:${r.id}`)
      chaves.add(`id:${r.id}`)
    }
    if ((data ?? []).length < 1000) break
  }
  return chaves
}
