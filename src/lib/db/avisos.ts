import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"
import { after } from "next/server"

import { esquemaAusente, texto } from "@/lib/db/comum"
import { enviarPushWeb } from "@/lib/db/push"
import { enviarPushTelegram } from "@/lib/db/telegram"
import { enviarEmail, type ContextoEmail } from "@/lib/email"
import { botaoEmail, escaparHtml, paragrafo, textoSuave } from "@/lib/email-layout"
import { formatarMoeda } from "@/lib/formato"
import { PERMISSOES_USUARIO_FK, podeAcessar, type Permissoes } from "@/lib/permissoes"
import { resolverPermissoes } from "@/lib/permissoes-resolver"
import { createAdminClient } from "@/lib/supabase/admin"
import { entraNoSino, type EventoTelegram, normalizarPreferencias, type PreferenciasTelegram } from "@/lib/telegram-eventos"
import type { BotaoTelegram } from "@/lib/telegram"
import { tenantAtual } from "@/lib/tenant"
import { origemAtual } from "@/lib/tenant-url"

/**
 * AVISO A QUEM PRECISA AGIR (onda 2, U2/U3). Um ponto só para "entrou
 * pendência para você": toda esteira chama `avisarQuemPode` (ou
 * `avisarOrdensEmAutorizacao`) e o aviso sai pelos canais —
 *
 *   • sino (tabela `notificacoes`), SÓ para eventos do grupo "notificacao"
 *     (06/10/2026): pendência mora na caixa de entrada, que some quando é
 *     resolvida; lembretes e resumos são canal externo. Ver
 *     lib/telegram-eventos.ts (entraNoSino);
 *   • e-mail, se a pessoa ligou aquele tipo em `usuarios.notif_email_prefs`;
 *   • Telegram, se vinculado e ligado em `telegram_notif_prefs`;
 *   • celular (Web Push), se ligado em `push_notif_prefs`.
 *
 * As preferências são OPT-IN por EVENTO e por canal desde 07/10/2026
 * (lib/telegram-eventos.ts; supabase/avisos-preferencias-opt-in.sql): nascem
 * desmarcadas e a pessoa escolhe em Meu perfil → Avisos, que só oferece os
 * avisos das áreas em que ela tem permissão.
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
  /** Botões inline no Telegram (aprovar/devolver na conversa). */
  telegramBotoes?: BotaoTelegram[][]
  /**
   * Fora do sino: identifica o envio para não repetir (ex.: o texto estável da
   * preventiva). Com `umaVezPorDia`, a chave é o dia.
   */
  chaveEntrega?: string
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
  const vistos = new Set<string>()
  const alvos = destinatarios.filter((d) => d.id !== aviso.exceto && !vistos.has(d.id) && vistos.add(d.id))
  if (alvos.length === 0) return 0
  const { client, contexto, tenantId } = await ambiente(amb)
  const hoje = hojeSP()

  // Fora do sino, o "não repetir" vai para avisos_entregas. Sem a tabela
  // (SQL supabase/avisos-segregacao.sql ainda não rodado), segue como antes:
  // tudo no sino, com a conferência pelo próprio sino.
  let noSino = entraNoSino(aviso.evento)
  const chave = aviso.chaveEntrega ?? (aviso.umaVezPorDia ? `dia:${hoje}` : null)
  const repetidos = new Set<string>()
  if (!noSino && chave) {
    for (const d of alvos) {
      const r = await registrarEntrega(client, tenantId, d.id, aviso.evento, chave)
      if (r === "sem_tabela") {
        noSino = true
        repetidos.clear()
        break
      }
      if (r === "repetido") repetidos.add(d.id)
    }
  }

  let jaAvisados = new Set<string>(repetidos)
  if (noSino && (aviso.umaVezPorDia || aviso.chaveEntrega)) {
    let q = client
      .from("notificacoes")
      .select("usuario_id")
      .in("usuario_id", alvos.map((d) => d.id))
      .eq("notificacao_data", hoje)
    // Chave estável (preventiva): o mesmo texto em qualquer dia; senão, no dia.
    q =
      aviso.chaveEntrega && !aviso.umaVezPorDia
        ? client.from("notificacoes").select("usuario_id").in("usuario_id", alvos.map((d) => d.id)).eq("notificacao", aviso.texto)
        : aviso.prefixoDoDia
          ? q.like("notificacao", `${aviso.prefixoDoDia.replace(/[%_]/g, "\\$&")}%`)
          : q.eq("notificacao", aviso.texto)
    const { data } = await q
    jaAvisados = new Set((data ?? []).map((n) => String(n.usuario_id)))
  }

  // Preferências de e-mail e celular de todos de uma vez. Sem a coluna do
  // celular (antes de supabase/avisos-preferencias-opt-in.sql), o celular
  // segue recebendo tudo, como antes.
  const prefsEmail = new Map<string, PreferenciasTelegram>()
  const prefsPush = new Map<string, PreferenciasTelegram>()
  let pushSemPreferencia = false
  {
    const ids = alvos.map((d) => d.id)
    const completo = await client.from("usuarios").select("id, notif_email_prefs, push_notif_prefs").in("id", ids)
    if (!completo.error) {
      for (const u of completo.data ?? []) {
        prefsEmail.set(String(u.id), normalizarPreferencias(u.notif_email_prefs))
        prefsPush.set(String(u.id), normalizarPreferencias(u.push_notif_prefs))
      }
    } else {
      pushSemPreferencia = true
      const { data, error } = await client.from("usuarios").select("id, notif_email_prefs").in("id", ids)
      if (!error) for (const u of data ?? []) prefsEmail.set(String(u.id), normalizarPreferencias(u.notif_email_prefs))
    }
  }

  const origem = contexto?.origem ?? (await origemAtual().catch(() => ""))
  const url = origem ? `${origem}${aviso.link}` : null

  let entregues = 0
  for (const d of alvos) {
    if (jaAvisados.has(d.id)) continue
    if (noSino) {
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
              textoSuave("Você recebe este aviso porque escolheu recebê-lo por e-mail. Para mudar, abra Meu perfil → Avisos."),
          contexto,
        })
      } catch (e) {
        console.error("aviso (e-mail):", e)
      }
    }

    await enviarPushTelegram(d.id, url ? `${aviso.texto}\n${url}` : aviso.texto, aviso.evento, amb.client, aviso.telegramBotoes)
    // Celular (Web Push): o aparelho autorizado recebe os tipos ligados na
    // coluna "Celular" de Meu perfil → Avisos.
    if (pushSemPreferencia || prefsPush.get(d.id)?.[aviso.evento]) {
      await enviarPushWeb(d.id, { titulo: aviso.assunto ?? "Confluir", corpo: aviso.texto, url: aviso.link }, amb.client)
    }
  }
  return entregues
}

/** Registra um envio fora do sino; "repetido" se já houve um com a mesma chave. */
async function registrarEntrega(
  client: SupabaseClient,
  tenantId: string,
  usuarioId: string,
  evento: EventoTelegram,
  chave: string
): Promise<"novo" | "repetido" | "sem_tabela"> {
  const { error } = await client
    .from("avisos_entregas")
    .insert({ emp_proprietaria_id: tenantId, usuario_id: usuarioId, evento, chave: chave.slice(0, 500) })
  if (!error) return "novo"
  if (error.code === "23505") return "repetido"
  if (esquemaAusente(error)) return "sem_tabela"
  return "novo"
}

/**
 * A pessoa quer este tipo de aviso por e-mail? (opt-in em Meu perfil →
 * Avisos). Para os avisos que não passam por `avisar` — os resultados que
 * cada módulo manda direto.
 */
export async function querEmail(usuarioId: string, evento: EventoTelegram, client?: SupabaseClient): Promise<boolean> {
  try {
    const c = client ?? (await createAdminClient())
    const { data, error } = await c.from("usuarios").select("notif_email_prefs").eq("id", usuarioId).maybeSingle()
    if (error) return false
    return normalizarPreferencias(data?.notif_email_prefs)[evento]
  } catch {
    return false
  }
}

/**
 * Coordenadores dos departamentos (não legados) de que o funcionário é
 * integrante — quem decide os pedidos dele na aba Coordenação. Nunca ele mesmo.
 */
export async function coordenadoresDe(funcionarioId: string | null, amb: Ambiente = {}): Promise<Destinatario[]> {
  if (!funcionarioId) return []
  try {
    const { client, tenantId } = await ambiente(amb)
    const { data: integ } = await client
      .from("empresa_departamentos_integrantes")
      .select("departamento_id")
      .eq("usuario_id", funcionarioId)
    const deptos = (integ ?? []).map((i) => String(i.departamento_id))
    if (!deptos.length) return []
    const { data: d } = await client
      .from("empresa_departamentos")
      .select("coordenador_id, legado")
      .eq("emp_proprietaria_id", tenantId)
      .in("id", deptos)
    const ids = [...new Set((d ?? []).filter((x) => x.legado !== true && x.coordenador_id).map((x) => String(x.coordenador_id)))].filter(
      (id) => id !== funcionarioId
    )
    if (!ids.length) return []
    const { data: us } = await client
      .from("usuarios")
      .select("id, nome_completo, nome_guerra, email")
      .in("id", ids)
      .not("inativo", "is", true)
      .not("deletado", "is", true)
    return (us ?? []).map((u) => ({ id: String(u.id), nome: texto(u.nome_completo) ?? texto(u.nome_guerra), email: texto(u.email), permissoes: {} }))
  } catch (e) {
    console.error("coordenadoresDe:", e)
    return []
  }
}

/**
 * Pedido de funcionário: avisa quem tem a permissão da fila E os
 * coordenadores do departamento dele — num envio só (quem é as duas coisas
 * recebe uma vez).
 */
export async function avisarQuemPodeOuCoordena(
  chave: string,
  alternativas: string[],
  funcionarioId: string | null,
  aviso: Aviso,
  amb: Ambiente = {}
): Promise<number> {
  try {
    const [porPermissao, coordenadores] = await Promise.all([
      usuariosComPermissao(chave, alternativas, amb),
      coordenadoresDe(funcionarioId, amb),
    ])
    return await avisar([...porPermissao, ...coordenadores], aviso, amb)
  } catch (e) {
    console.error("avisarQuemPodeOuCoordena:", e)
    return 0
  }
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
      // Uma ordem só: dá para decidir na própria conversa do Telegram (D3).
      const telegramBotoes: BotaoTelegram[][] | undefined =
        minhas.length === 1
          ? [[{ texto: "✅ Aprovar", dado: `ord:a:${minhas[0].id}` }, { texto: "↩️ Devolver", dado: `ord:d:${minhas[0].id}` }]]
          : undefined
      await avisar([a], { texto: textoAviso, link: "/painel/aprovar", evento: "pendencia_aprovacao", assunto: "Ordem de pagamento aguardando sua autorização", telegramBotoes }, amb)
    }
  } catch (e) {
    console.error("avisarOrdensEmAutorizacao:", e)
  }
}

// ── Preferências (Meu perfil → Avisos) ───────────────────────────────────────

export type PreferenciasAviso = { email: PreferenciasTelegram; telegram: PreferenciasTelegram; push: PreferenciasTelegram }

export async function preferenciasDeAviso(usuarioId: string): Promise<PreferenciasAviso> {
  const admin = await createAdminClient()
  const completo = await admin
    .from("usuarios")
    .select("notif_email_prefs, telegram_notif_prefs, push_notif_prefs")
    .eq("id", usuarioId)
    .maybeSingle()
  if (!completo.error) {
    return {
      email: normalizarPreferencias(completo.data?.notif_email_prefs),
      telegram: normalizarPreferencias(completo.data?.telegram_notif_prefs),
      push: normalizarPreferencias(completo.data?.push_notif_prefs),
    }
  }
  // Coluna do celular ainda não existe: e-mail e Telegram.
  const { data } = await admin.from("usuarios").select("notif_email_prefs, telegram_notif_prefs").eq("id", usuarioId).maybeSingle()
  return {
    email: normalizarPreferencias(data?.notif_email_prefs),
    telegram: normalizarPreferencias(data?.telegram_notif_prefs),
    push: normalizarPreferencias(null),
  }
}

export async function definirPreferenciasDeAviso(
  usuarioId: string,
  prefs: PreferenciasAviso
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { error } = await admin
    .from("usuarios")
    .update({ notif_email_prefs: prefs.email, telegram_notif_prefs: prefs.telegram, push_notif_prefs: prefs.push })
    .eq("id", usuarioId)
    .eq("emp_proprietaria_id", emp)
  if (!error) return {}
  if (["PGRST204", "42703"].includes(error.code ?? "")) {
    // Sem a coluna do celular: grava e-mail e Telegram e avisa.
    const { error: e2 } = await admin
      .from("usuarios")
      .update({ notif_email_prefs: prefs.email, telegram_notif_prefs: prefs.telegram })
      .eq("id", usuarioId)
      .eq("emp_proprietaria_id", emp)
    if (e2) return { erro: e2.message }
    return { erro: "As escolhas do celular ainda não estão disponíveis — rode supabase/avisos-preferencias-opt-in.sql. E-mail e Telegram foram salvos." }
  }
  return { erro: error.message }
}
