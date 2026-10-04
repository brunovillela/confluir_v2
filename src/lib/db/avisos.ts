import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"
import { after } from "next/server"

import { texto } from "@/lib/db/comum"
import { enviarPushWeb } from "@/lib/db/push"
import { enviarPushTelegram } from "@/lib/db/telegram"
import { enviarEmail, type ContextoEmail } from "@/lib/email"
import { botaoEmail, escaparHtml, paragrafo, textoSuave } from "@/lib/email-layout"
import { formatarMoeda } from "@/lib/formato"
import { PERMISSOES_USUARIO_FK, podeAcessar, type Permissoes } from "@/lib/permissoes"
import { resolverPermissoes } from "@/lib/permissoes-resolver"
import { createAdminClient } from "@/lib/supabase/admin"
import { type EventoTelegram, normalizarPreferencias, type PreferenciasTelegram } from "@/lib/telegram-eventos"
import { tenantAtual } from "@/lib/tenant"
import { origemAtual } from "@/lib/tenant-url"

/**
 * AVISO A QUEM PRECISA AGIR (onda 2, U2/U3). Um ponto só para "entrou
 * pendência para você": toda esteira chama `avisarQuemPode` (ou
 * `avisarOrdensEmAutorizacao`) e o aviso sai pelos três canais —
 *
 *   • sino (tabela `notificacoes`), sempre;
 *   • e-mail, se a pessoa não desligou aquele tipo em
 *     `usuarios.notif_email_prefs` (supabase/avisos-preferencias.sql);
 *   • Telegram, se vinculado e não desligado em `telegram_notif_prefs`.
 *
 * As preferências são opt-out por EVENTO (lib/telegram-eventos.ts) e valem
 * para os dois canais, lado a lado, em Meu perfil → Avisos.
 *
 * Quem recebe é decidido pela permissão EFETIVA (perfis + linha `permissoes`)
 * no tenant, com cadastro ativo — nunca por lista fixa. Tudo aqui é melhor
 * esforço: um aviso que falha não derruba a ação que o gerou.
 *
 * Fora de requisição (cron), o chamador passa `client` (service role),
 * `tenantId` e o `contexto` do e-mail; dentro, tudo sai da requisição.
 */

export type Destinatario = {
  id: string
  nome: string | null
  email: string | null
  permissoes: Permissoes
}

type Ambiente = {
  /** Service role fora de requisição; dentro, o cliente do tenant. */
  client?: SupabaseClient
  tenantId?: string
  contexto?: ContextoEmail
}

/**
 * Agenda o aviso para DEPOIS da resposta (`after` do Next): quem gravou não
 * espera e-mail nem Telegram. Fora de uma requisição (script, teste), roda na
 * hora. Em qualquer caso o erro vai para o log, nunca para quem gravou.
 */
export function depoisDaResposta(tarefa: () => Promise<unknown>): void {
  const segura = () => tarefa().catch((e) => console.error("aviso:", e))
  try {
    after(segura)
  } catch {
    void segura()
  }
}

async function ambiente(a: Ambiente): Promise<{ client: SupabaseClient; tenantId: string; contexto?: ContextoEmail }> {
  return {
    client: a.client ?? (await createAdminClient()),
    tenantId: a.tenantId ?? (await tenantAtual()),
    contexto: a.contexto,
  }
}

// ── Quem recebe ──────────────────────────────────────────────────────────────

/**
 * Usuários ATIVOS do tenant com a permissão efetiva (ou uma das alternativas).
 * Com `chave` null, todos os usuários ativos com acesso ao painel.
 */
export async function usuariosComPermissao(
  chave: string | null,
  alternativas: string[] = [],
  amb: Ambiente = {}
): Promise<Destinatario[]> {
  const { client, tenantId } = await ambiente(amb)
  const { data: acessos } = await client
    .from("permissoes")
    .select("*")
    .eq("emp_proprietaria_id", tenantId)
    .not(PERMISSOES_USUARIO_FK, "is", null)
  const porUsuario = new Map<string, Permissoes>()
  for (const a of acessos ?? []) porUsuario.set(String(a[PERMISSOES_USUARIO_FK]), a as Permissoes)
  if (porUsuario.size === 0) return []

  const { data: usuarios } = await client
    .from("usuarios")
    .select("id, nome_completo, nome_guerra, email")
    .in("id", [...porUsuario.keys()])
    .eq("emp_proprietaria_id", tenantId)
    .not("inativo", "is", true)
    .not("deletado", "is", true)

  const lista: Destinatario[] = []
  for (const u of usuarios ?? []) {
    const id = String(u.id)
    const base = porUsuario.get(id)
    if (!base) continue
    const efetivas = await resolverPermissoes(client, id, base)
    if (!podeAcessar(efetivas, chave, alternativas)) continue
    lista.push({
      id,
      nome: texto(u.nome_completo) ?? texto(u.nome_guerra),
      email: texto(u.email),
      permissoes: efetivas,
    })
  }
  return lista
}

/** Alçada de aprovação efetiva (mesma leitura de compras.ts, sem importá-lo: evita ciclo). */
export function alcadaDe(permissoes: Permissoes): number {
  const bruta = (permissoes as Record<string, unknown>)["alcada_aprovacao"]
  const n = typeof bruta === "string" ? Number(bruta) : Number(bruta ?? 0)
  return Number.isFinite(n) && n > 0 ? n : 0
}

// ── Entrega ──────────────────────────────────────────────────────────────────

export type Aviso = {
  /** Texto do sino e do Telegram; também o corpo do e-mail quando não há `html`. */
  texto: string
  /** Caminho no painel (ex.: /painel/pessoal/ferias). Vira link no e-mail e no Telegram. */
  link: string
  /** Tipo do aviso — a chave de preferência (lib/telegram-eventos.ts). */
  evento: EventoTelegram
  /** Assunto do e-mail; sem ele, o próprio texto. */
  assunto?: string
  /** Miolo HTML do e-mail; sem ele, o texto em parágrafo + botão. */
  html?: string
  /** Quem originou a pendência não precisa ser avisado dela. */
  exceto?: string | null
  /** Não repete para quem já tem notificação com o mesmo texto no dia. */
  umaVezPorDia?: boolean
  /** Com `umaVezPorDia`: compara só o começo do texto (resumos cujo conteúdo varia). */
  prefixoDoDia?: string
}

function hojeSP(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date())
}

/** Entrega um aviso aos destinatários pelos três canais, conforme preferência. */
export async function avisar(
  destinatarios: Destinatario[],
  aviso: Aviso,
  amb: Ambiente = {}
): Promise<number> {
  const alvos = destinatarios.filter((d) => d.id !== aviso.exceto)
  if (alvos.length === 0) return 0
  const { client, contexto } = await ambiente(amb)
  const hoje = hojeSP()

  let jaAvisados = new Set<string>()
  if (aviso.umaVezPorDia) {
    let q = client
      .from("notificacoes")
      .select("usuario_id")
      .in("usuario_id", alvos.map((d) => d.id))
      .eq("notificacao_data", hoje)
    q = aviso.prefixoDoDia ? q.like("notificacao", `${aviso.prefixoDoDia.replace(/[%_]/g, "\\$&")}%`) : q.eq("notificacao", aviso.texto)
    const { data } = await q
    jaAvisados = new Set((data ?? []).map((n) => String(n.usuario_id)))
  }

  // Preferências de e-mail de todos de uma vez (coluna pode não existir ainda).
  const prefsEmail = new Map<string, PreferenciasTelegram>()
  {
    const { data, error } = await client
      .from("usuarios")
      .select("id, notif_email_prefs")
      .in("id", alvos.map((d) => d.id))
    if (!error) for (const u of data ?? []) prefsEmail.set(String(u.id), normalizarPreferencias(u.notif_email_prefs))
  }

  const origem = contexto?.origem ?? (await origemAtual().catch(() => ""))
  const url = origem ? `${origem}${aviso.link}` : null

  let entregues = 0
  for (const d of alvos) {
    if (jaAvisados.has(d.id)) continue
    try {
      const { error } = await client.from("notificacoes").insert({
        usuario_id: d.id,
        notificacao: aviso.texto,
        notificado: false,
        notificacao_data: hoje,
        link: aviso.link,
      })
      if (error?.code === "PGRST204") {
        // Sem a coluna `link` (supabase/ordens-estorno.sql): grava sem ela.
        await client.from("notificacoes").insert({ usuario_id: d.id, notificacao: aviso.texto, notificado: false, notificacao_data: hoje })
      }
    } catch (e) {
      console.error("aviso (sino):", e)
    }
    entregues++

    if (d.email && (prefsEmail.get(d.id) ?? normalizarPreferencias(null))[aviso.evento]) {
      try {
        await enviarEmail({
          email: d.email,
          nome: d.nome,
          assunto: aviso.assunto ?? aviso.texto.slice(0, 120),
          html:
            aviso.html ??
            paragrafo(escaparHtml(aviso.texto)) +
              (url ? botaoEmail(url, "Abrir no Confluir") : "") +
              textoSuave("Você recebe este aviso porque tem permissão para tratar o assunto. Para mudar, abra Meu perfil → Avisos."),
          contexto,
        })
      } catch (e) {
        console.error("aviso (e-mail):", e)
      }
    }

    await enviarPushTelegram(d.id, url ? `${aviso.texto}\n${url}` : aviso.texto, aviso.evento, amb.client)
    // Web Push segue o sino: quem ligou "Receber no celular" recebe tudo que entra nele.
    await enviarPushWeb(d.id, { titulo: aviso.assunto ?? "Confluir", corpo: aviso.texto, url: aviso.link }, amb.client)
  }
  return entregues
}

/** Atalho: avisa quem tem a permissão (ou uma das alternativas) no tenant. */
export async function avisarQuemPode(
  chave: string,
  alternativas: string[],
  aviso: Aviso,
  amb: Ambiente = {}
): Promise<number> {
  try {
    const quem = await usuariosComPermissao(chave, alternativas, amb)
    return await avisar(quem, aviso, amb)
  } catch (e) {
    console.error("avisarQuemPode:", e)
    return 0
  }
}

/**
 * Ordens que ENTRARAM em "Em autorização": avisa cada avaliador cuja alçada
 * cobre o valor. Mais de uma ordem para a mesma pessoa vira um aviso só.
 */
export async function avisarOrdensEmAutorizacao(ordemIds: string[], amb: Ambiente = {}): Promise<void> {
  if (ordemIds.length === 0) return
  try {
    const { client } = await ambiente(amb)
    const { data } = await client
      .from("ordens_pagamento")
      .select("id, codigo, tipo, descricao, valor_inicial_cobranca")
      .in("id", ordemIds)
    const ordens = (data ?? []).map((o) => ({
      id: String(o.id),
      codigo: texto(o.codigo) ?? "",
      tipo: texto(o.tipo) ?? "Ordem",
      descricao: texto(o.descricao) ?? "",
      valor: Number(o.valor_inicial_cobranca ?? 0),
    }))
    if (ordens.length === 0) return

    const avaliadores = await usuariosComPermissao("aquisicoes_avaliacoes", ["financeiro_pagamento"], amb)
    for (const a of avaliadores) {
      const alcada = alcadaDe(a.permissoes)
      if (alcada <= 0) continue
      const minhas = ordens.filter((o) => o.valor <= alcada)
      if (minhas.length === 0) continue
      const total = minhas.reduce((s, o) => s + o.valor, 0)
      const textoAviso =
        minhas.length === 1
          ? `Ordem ${minhas[0].codigo} (${minhas[0].tipo}, ${formatarMoeda(minhas[0].valor)}) aguarda sua autorização: ${minhas[0].descricao.slice(0, 160)}`
          : `${minhas.length} ordens de pagamento (${minhas[0].tipo}, total ${formatarMoeda(total)}) aguardam sua autorização.`
      await avisar([a], { texto: textoAviso, link: "/painel/compras/avaliacoes", evento: "pendencia_aprovacao", assunto: "Ordem de pagamento aguardando sua autorização" }, amb)
    }
  } catch (e) {
    console.error("avisarOrdensEmAutorizacao:", e)
  }
}

// ── Preferências (Meu perfil → Avisos) ───────────────────────────────────────

export type PreferenciasAviso = { email: PreferenciasTelegram; telegram: PreferenciasTelegram }

export async function preferenciasDeAviso(usuarioId: string): Promise<PreferenciasAviso> {
  const admin = await createAdminClient()
  const completo = await admin
    .from("usuarios")
    .select("notif_email_prefs, telegram_notif_prefs")
    .eq("id", usuarioId)
    .maybeSingle()
  if (!completo.error) {
    return {
      email: normalizarPreferencias(completo.data?.notif_email_prefs),
      telegram: normalizarPreferencias(completo.data?.telegram_notif_prefs),
    }
  }
  // Coluna do e-mail ainda não existe: só o Telegram.
  const { data } = await admin.from("usuarios").select("telegram_notif_prefs").eq("id", usuarioId).maybeSingle()
  return { email: normalizarPreferencias(null), telegram: normalizarPreferencias(data?.telegram_notif_prefs) }
}

export async function definirPreferenciasDeAviso(
  usuarioId: string,
  prefs: PreferenciasAviso
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { error } = await admin
    .from("usuarios")
    .update({ notif_email_prefs: prefs.email, telegram_notif_prefs: prefs.telegram })
    .eq("id", usuarioId)
    .eq("emp_proprietaria_id", emp)
  if (!error) return {}
  if (["PGRST204", "42703"].includes(error.code ?? "")) {
    // Sem a coluna do e-mail: grava o Telegram e avisa.
    const { error: e2 } = await admin
      .from("usuarios")
      .update({ telegram_notif_prefs: prefs.telegram })
      .eq("id", usuarioId)
      .eq("emp_proprietaria_id", emp)
    if (e2) return { erro: e2.message }
    return { erro: "As preferências de e-mail ainda não estão disponíveis — rode supabase/avisos-preferencias.sql. As do Telegram foram salvas." }
  }
  return { erro: error.message }
}
