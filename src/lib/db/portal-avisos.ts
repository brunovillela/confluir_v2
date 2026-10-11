import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import { cpfConfiavel, grafiasDoCpf } from "@/lib/cpf"
import { esquemaAusente, texto } from "@/lib/db/comum"
import { enviarEmail, type ContextoEmail } from "@/lib/email"
import { botaoEmail, escaparHtml, paragrafo, textoSuave, tituloEmail } from "@/lib/email-layout"
import {
  type EventoPortal,
  normalizarPreferenciasPortal,
  type PreferenciasPortal,
} from "@/lib/portal-avisos-eventos"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"
import { origemAtual } from "@/lib/tenant-url"

/**
 * AVISOS AO FILIADO (onda 4, F4): o sino do portal e o e-mail por
 * preferência. Mesmo desenho do `lib/db/avisos.ts` do painel, mas a pessoa
 * é identificada pelo CPF (a chave da sessão do portal) e não por
 * `usuarios`. Tabelas em supabase/portal-avisos.sql; sem elas, tudo aqui é
 * silencioso — um aviso que falha nunca derruba a ação que o gerou.
 *
 * Quem já manda e-mail transacional por conta própria (reserva confirmada
 * com QR, inscrição avaliada, aviso aos aptos) chama com `soSino: true` para
 * a pessoa não receber dois e-mails sobre a mesma coisa.
 */

export type AvisoPortal = {
  cpf: string
  evento: EventoPortal
  texto: string
  /** Caminho dentro do portal (ex.: /portal/hospedagem). */
  link: string
  assunto?: string
  html?: string
  /** Só grava no sino: o e-mail desta ação já saiu por outro caminho. */
  soSino?: boolean
  /** Não repete se já há aviso igual (mesmo texto e link) para a pessoa. */
  umaVez?: boolean
  /** Nome e e-mail já conhecidos poupam a busca do cadastro. */
  nome?: string | null
  email?: string | null
}

type Ambiente = {
  client?: SupabaseClient
  tenantId?: string
  contexto?: ContextoEmail
}

async function ambiente(a: Ambiente) {
  return {
    client: a.client ?? (await createAdminClient()),
    tenantId: a.tenantId ?? (await tenantAtual()),
    contexto: a.contexto,
  }
}

function tabelaAusente(error: { code?: string; message?: string } | null): boolean {
  return !!error && (esquemaAusente(error) || error.code === "42P01")
}

/**
 * Nome e e-mail de contato do filiado, pela mesma regra de
 * `buscarFiliadoPorCpf` (o e-mail que o portal mostra em Avisos →
 * Preferências): registros não excluídos do CPF, do mais recente para o mais
 * antigo, o pessoal antes do corporativo. O e-mail sai sem espaços nas pontas
 * (o legado tem cadastros assim, e o provedor pode recusar o endereço).
 *
 * Usa o client e o tenant RECEBIDOS, nunca `tenantAtual()`: o tick mensal das
 * cobranças percorre todas as entidades numa requisição só, e ali
 * `tenantAtual()` devolve o tenant do host (apex → tenant padrão), não o da
 * volta do laço — a busca voltava vazia e o e-mail das outras entidades não
 * saía (achado A19).
 */
export async function contatoDoFiliado(
  cpf: string,
  amb: Ambiente = {}
): Promise<{ nome: string | null; email: string | null } | null> {
  const chave = cpfConfiavel(cpf)
  if (!chave) return null
  const { client, tenantId } = await ambiente(amb)
  const { data, error } = await client
    .from("filiacoes")
    .select("nome_completo, email_pessoal, email_corporativo, updated_at")
    .in("cpf", grafiasDoCpf(chave))
    .eq("emp_proprietaria_id", tenantId)
    .not("filiacao_excluida", "is", true)
    .order("updated_at", { ascending: false, nullsFirst: false })
  if (error || !data || data.length === 0) return null
  return {
    nome: data.map((f) => texto(f.nome_completo)).find(Boolean) ?? null,
    email: data.map((f) => texto(f.email_pessoal) ?? texto(f.email_corporativo)).find(Boolean)?.trim() ?? null,
  }
}

/**
 * O que `avisarFiliado` conseguiu fazer:
 * - `false`: nada gravado (CPF inválido, aviso repetido com `umaVez`, tabela
 *   ausente ou erro);
 * - `"sino"`: gravou no sino, mas nenhum e-mail saiu por este caminho
 *   (`soSino`, preferência desligada, cadastro sem e-mail ou o provedor
 *   recusou);
 * - `"email"`: gravou no sino e o provedor aceitou o e-mail.
 * Os dois valores verdadeiros mantêm o `if (ok)` de quem lia o antigo boolean.
 */
export type ResultadoAviso = false | "sino" | "email"

/** Grava no sino do filiado e, conforme a preferência, manda o e-mail. */
export async function avisarFiliado(aviso: AvisoPortal, amb: Ambiente = {}): Promise<ResultadoAviso> {
  const cpf = cpfConfiavel(aviso.cpf)
  if (!cpf) return false
  let noSino = false
  try {
    const { client, tenantId, contexto } = await ambiente(amb)

    if (aviso.umaVez) {
      const { data } = await client
        .from("portal_avisos")
        .select("id")
        .eq("emp_proprietaria_id", tenantId)
        .eq("cpf", cpf)
        .eq("texto", aviso.texto)
        .eq("link", aviso.link)
        .limit(1)
      if (data && data.length > 0) return false
    }

    const { error } = await client.from("portal_avisos").insert({
      emp_proprietaria_id: tenantId,
      cpf,
      evento: aviso.evento,
      texto: aviso.texto,
      link: aviso.link,
    })
    if (error) {
      if (!tabelaAusente(error)) console.error("aviso ao filiado (sino):", error.message)
      return false
    }
    noSino = true

    if (aviso.soSino) return "sino"

    const prefs = await preferenciasDoFiliado(cpf, { client, tenantId })
    if (!prefs[aviso.evento]) return "sino"

    let nome = texto(aviso.nome)
    let email = texto(aviso.email)?.trim() ?? null
    if (!email) {
      // Mesmo client/tenant do sino: vale dentro e fora de requisição.
      const f = await contatoDoFiliado(cpf, { client, tenantId })
      nome = nome ?? f?.nome ?? null
      email = f?.email ?? null
    }
    if (!email) return "sino"

    const origem = contexto?.origem ?? (await origemAtual().catch(() => ""))
    const url = origem ? `${origem}${aviso.link}` : null
    const saiu = await enviarEmail({
      email,
      nome,
      assunto: aviso.assunto ?? aviso.texto.slice(0, 120),
      html:
        aviso.html ??
        tituloEmail(escaparHtml(aviso.assunto ?? "Aviso do portal")) +
          paragrafo(escaparHtml(aviso.texto)) +
          (url ? botaoEmail(url, "Abrir no portal") : "") +
          textoSuave("Você pode escolher quais avisos recebe por e-mail em Portal → Avisos → Preferências."),
      contexto,
    })
    return saiu ? "email" : "sino"
  } catch (e) {
    console.error("aviso ao filiado:", e)
    // Falhou depois de gravar o sino: a pessoa vê no portal, o e-mail não saiu.
    return noSino ? "sino" : false
  }
}

// ── Leitura ──────────────────────────────────────────────────────────────────

export type AvisoDoFiliado = {
  id: string
  evento: EventoPortal | string
  texto: string
  link: string | null
  lidaEm: string | null
  criadoEm: string
}

export async function avisosDoFiliado(cpf: string, limite = 200): Promise<AvisoDoFiliado[]> {
  const chave = cpfConfiavel(cpf)
  if (!chave) return []
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("portal_avisos")
    .select("id, evento, texto, link, lida_em, created_at")
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("cpf", chave)
    .order("created_at", { ascending: false })
    .limit(limite)
  if (error) return []
  return (data ?? []).map((a) => ({
    id: String(a.id),
    evento: String(a.evento),
    texto: String(a.texto),
    link: (a.link as string | null) ?? null,
    lidaEm: (a.lida_em as string | null) ?? null,
    criadoEm: String(a.created_at),
  }))
}

export async function contarAvisosNaoLidos(cpf: string): Promise<number> {
  const chave = cpfConfiavel(cpf)
  if (!chave) return 0
  const admin = await createAdminClient()
  const { count, error } = await admin
    .from("portal_avisos")
    .select("id", { count: "exact", head: true })
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("cpf", chave)
    .is("lida_em", null)
  return error ? 0 : (count ?? 0)
}

/** Abrir a lista marca tudo como lido: o sino do portal não pede clique por item. */
export async function marcarAvisosLidos(cpf: string): Promise<void> {
  const chave = cpfConfiavel(cpf)
  if (!chave) return
  const admin = await createAdminClient()
  await admin
    .from("portal_avisos")
    .update({ lida_em: new Date().toISOString() })
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("cpf", chave)
    .is("lida_em", null)
}

// ── Preferências ─────────────────────────────────────────────────────────────

export async function preferenciasDoFiliado(
  cpf: string,
  amb: Ambiente = {}
): Promise<PreferenciasPortal> {
  const chave = cpfConfiavel(cpf)
  if (!chave) return normalizarPreferenciasPortal(null)
  const { client, tenantId } = await ambiente(amb)
  const { data } = await client
    .from("portal_avisos_preferencias")
    .select("email_prefs")
    .eq("emp_proprietaria_id", tenantId)
    .eq("cpf", chave)
    .maybeSingle()
  return normalizarPreferenciasPortal(data?.email_prefs)
}

export async function definirPreferenciasDoFiliado(
  cpf: string,
  prefs: PreferenciasPortal
): Promise<{ erro?: string }> {
  const chave = cpfConfiavel(cpf)
  if (!chave) return { erro: "CPF inválido." }
  const admin = await createAdminClient()
  const { error } = await admin.from("portal_avisos_preferencias").upsert(
    {
      emp_proprietaria_id: await tenantAtual(),
      cpf: chave,
      email_prefs: prefs,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "emp_proprietaria_id,cpf" }
  )
  if (error) {
    if (tabelaAusente(error)) return { erro: "As preferências ainda não estão disponíveis — a entidade precisa concluir a atualização do sistema." }
    return { erro: `Não foi possível salvar: ${error.message}` }
  }
  return {}
}
