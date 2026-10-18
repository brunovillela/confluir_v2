import "server-only"

import { cache } from "react"
import type { SupabaseClient } from "@supabase/supabase-js"

import { cpfConfiavel, grafiasDoCpf } from "@/lib/cpf"
import { esquemaAusente, lerEmLotes, texto } from "@/lib/db/comum"
import { filiadosAtivos } from "@/lib/db/filiacao-ativos"
import { configDoPortal, lerConfigPortal, type ConfigPortal } from "@/lib/db/portal-partes"
import { enviarPushPortal, temPushPortal } from "@/lib/db/push"
import { enviarEmail, type ContextoEmail } from "@/lib/email"
import { botaoEmail, COR, escaparHtml, paragrafo, textoSuave, tituloEmail } from "@/lib/email-layout"
import { paginar, type Paginacao } from "@/lib/paginacao"
import {
  type EventoPortal,
  normalizarPreferenciasPortal,
  PARTES_DO_EVENTO,
  type PreferenciasPortal,
} from "@/lib/portal-avisos-eventos"
import { parteDoLink, type ChaveParte } from "@/lib/portal-partes-constantes"
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
 *
 * Celular (A52): depois do sino, o aviso vai como notificação para os
 * aparelhos que a pessoa ligou em Avisos → Preferências (lib/db/push.ts),
 * obedecendo à mesma preferência por tipo do e-mail — inclusive com
 * `soSino`. Sem chaves VAPID ou sem a tabela, segue sem push e sem erro.
 */

export type AvisoPortal = {
  cpf: string
  evento: EventoPortal
  texto: string
  /** Caminho dentro do portal (ex.: /portal/hospedagem). */
  link: string
  assunto?: string
  html?: string
  /**
   * Não manda e-mail: o desta ação já saiu por outro caminho. Grava no sino e,
   * se a pessoa ligou o celular, avisa no aparelho.
   */
  soSino?: boolean
  /** Não repete se já há aviso igual (mesmo texto e link) para a pessoa. */
  umaVez?: boolean
  /**
   * Sai mesmo com a parte do link desabilitada (Área do associado): o aviso
   * é consequência de algo que a pessoa já fez (ex.: a falta numa reserva
   * confirmada, que continua valendo no hotel). Pula só essa trava; o
   * portal fora do ar segue gravando só no sino.
   */
  mesmoComParteDesabilitada?: boolean
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

// ── Área do associado (Filiados › Área do associado) ─────────────────────────

/**
 * A parte do portal de que o aviso fala: a do link ("/portal/eventos#…" →
 * eventos) e, quando o link não diz (fora do portal, como a oferta da lista
 * de espera), a do tipo de uma parte só. Mesma régua do Início
 * (`avisosNaoLidos`, portal-inicio.ts): o sino, a lista e as Novidades contam
 * igual.
 */
export function parteDoAviso(link: string | null | undefined, evento: string): ChaveParte | null {
  const doLink = parteDoLink(link)
  if (doLink) return doLink
  const partes = PARTES_DO_EVENTO[evento as EventoPortal] as readonly ChaveParte[] | undefined
  return partes?.length === 1 ? partes[0] : null
}

/**
 * O que a entidade escolheu para as partes do portal, lido para o aviso:
 * dentro da requisição, a leitura dividida com a página (`configDoPortal`);
 * com o ambiente explícito (ticks, painel), pelo MESMO client e tenant do
 * sino — fora de requisição `tenantAtual()` não é o da volta do laço (A19).
 * Leitura que falha devolve null e o aviso segue como antes: na dúvida, a
 * parte vale.
 */
async function configDasPartes(amb: { client: SupabaseClient; tenantId: string } | null): Promise<ConfigPortal | null> {
  try {
    return amb ? await lerConfigPortal(amb) : await configDoPortal()
  } catch (e) {
    console.error("avisos do portal (área do associado):", e)
    return null
  }
}

/** O aviso leva a uma parte desabilitada: o associado cairia na página "indisponível". */
function deParteDesabilitada(cfg: ConfigPortal | null, link: string | null | undefined, evento: string): boolean {
  const parte = parteDoAviso(link, evento)
  return !!cfg && !!parte && cfg.partes[parte].estado === "desabilitada"
}

/** Alguma parte desabilitada hoje (sem nenhuma, os leitores nem olham o link). */
function temParteDesabilitada(cfg: ConfigPortal | null): cfg is ConfigPortal {
  return !!cfg && Object.entries(cfg.partes).some(([chave, p]) => chave !== "portal" && p.estado === "desabilitada")
}

/**
 * Portal fora do ar (a parte "portal" desabilitada): o sino guarda o aviso
 * para a volta, mas e-mail e celular levariam a uma porta fechada. A
 * contribuição assistencial (oposição) segue aberta, com prazo legal, e
 * continua avisando.
 */
function portalForaDoAr(cfg: ConfigPortal | null, link: string | null | undefined): boolean {
  return !!cfg && cfg.partes.portal.estado === "desabilitada" && parteDoLink(link) !== "oposicao"
}

/** Onde o associado ajusta o que recebe fora do portal (A153/A176). */
export const CAMINHO_PREFERENCIAS_AVISOS = "/portal/avisos/preferencias"

/**
 * Rodapé dos e-mails de aviso: o nome da página, com link para ela (A153 e
 * A176). Sem a origem do portal, o caminho por extenso.
 */
export function rodapePreferenciasAvisos(origem: string | null | undefined): string {
  if (!origem) {
    return textoSuave("Você pode escolher quais avisos recebe por e-mail no portal, em Avisos → Preferências de avisos.")
  }
  return textoSuave(
    `Você pode escolher quais avisos recebe por e-mail em <a href="${origem}${CAMINHO_PREFERENCIAS_AVISOS}" style="color:${COR.laranjaAcao};">Preferências de avisos</a>, no portal.`
  )
}

/**
 * A frase de antes, sem link, que os módulos que montam o próprio e-mail
 * ainda escrevem (eventos, filiação, hospedagem, oposição, votação). O
 * `avisarFiliado` a troca pelo rodapé com link até eles passarem a usar
 * `rodapePreferenciasAvisos`.
 */
const RODAPE_SEM_LINK = textoSuave(
  "Você pode escolher quais avisos recebe por e-mail em Portal → Avisos → Preferências."
)

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
 *   ausente, erro, ou o aviso leva a uma parte desabilitada na Área do
 *   associado);
 * - `"sino"`: gravou no sino, mas nenhum e-mail saiu por este caminho
 *   (`soSino`, preferência desligada, cadastro sem e-mail, portal fora do ar
 *   ou o provedor recusou);
 * - `"email"`: gravou no sino e o provedor aceitou o e-mail.
 * Os dois valores verdadeiros mantêm o `if (ok)` de quem lia o antigo boolean.
 */
export type ResultadoAviso = false | "sino" | "email"

/**
 * O assunto pode vir no padrão dos e-mails ("… — {ENTIDADE}"), que só o
 * `enviarEmail` troca pelo nome. A notificação não passa por ele: troca aqui
 * ou, sem o nome (dentro de requisição não há `contexto`), tira o marcador.
 */
function semMarcadorEntidade(s: string, entidade: string | undefined): string {
  if (!s.includes("{ENTIDADE}")) return s
  if (entidade) return s.replaceAll("{ENTIDADE}", entidade)
  return s.replace(/\s*[—–-]\s*\{ENTIDADE\}/g, "").replaceAll("{ENTIDADE}", "a entidade")
}

/**
 * Grava no sino do filiado e, conforme a preferência do tipo, avisa nos
 * aparelhos ligados e manda o e-mail. O push é melhor esforço e não muda o
 * retorno: quem chama continua sabendo só do sino e do e-mail.
 *
 * Área do associado: aviso de parte desabilitada não sai (nem no sino), a
 * não ser com `mesmoComParteDesabilitada`; com o portal fora do ar, só o
 * sino grava.
 */
export async function avisarFiliado(aviso: AvisoPortal, amb: Ambiente = {}): Promise<ResultadoAviso> {
  const cpf = cpfConfiavel(aviso.cpf)
  if (!cpf) return false
  let noSino = false
  try {
    const { client, tenantId, contexto } = await ambiente(amb)
    const partes = await configDasPartes(amb.client || amb.tenantId ? { client, tenantId } : null)
    if (!aviso.mesmoComParteDesabilitada && deParteDesabilitada(partes, aviso.link, aviso.evento)) return false

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
    if (portalForaDoAr(partes, aviso.link)) return "sino"

    // Celular (A52): vale também com `soSino` — o e-mail dessas ações sai por
    // outro caminho, mas a notificação no aparelho só sai por aqui. Quem não
    // tem aparelho ligado (quase todos, num lote) não paga consulta a mais.
    const celular = await temPushPortal(cpf, { client, tenantId })
    if (aviso.soSino && !celular) return "sino"

    // A mesma preferência por tipo liga e desliga o e-mail E o celular: uma
    // decisão só para o associado (Avisos → Preferências). O sino recebe sempre.
    const prefs = await preferenciasDoFiliado(cpf, { client, tenantId })
    if (!prefs[aviso.evento]) return "sino"

    if (celular) {
      const entidade = contexto?.entidade
      await enviarPushPortal(
        cpf,
        {
          titulo: semMarcadorEntidade(aviso.assunto || entidade || "Portal do Associado", entidade),
          corpo: semMarcadorEntidade(aviso.texto, entidade),
          url: aviso.link,
        },
        { client, tenantId }
      )
    }
    if (aviso.soSino) return "sino"

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
      html: aviso.html
        ? aviso.html.replace(RODAPE_SEM_LINK, rodapePreferenciasAvisos(origem))
        : tituloEmail(escaparHtml(aviso.assunto ?? "Aviso do portal")) +
          paragrafo(escaparHtml(aviso.texto)) +
          (url ? botaoEmail(url, "Abrir no portal") : "") +
          rodapePreferenciasAvisos(origem),
      contexto,
      // Todo e-mail que sai daqui obedece à preferência por tipo: o "cancelar
      // inscrição" do leitor de e-mail abre a página onde ela se ajusta. Sem
      // List-Unsubscribe-Post: a página pede entrar no portal, e o descadastro
      // num clique exigiria um link com token, como o da mala direta (A176).
      cabecalhos: origem ? { "List-Unsubscribe": `<${origem}${CAMINHO_PREFERENCIAS_AVISOS}>` } : undefined,
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

export type ListaDeAvisos = {
  /** Os avisos desta página. */
  avisos: AvisoDoFiliado[]
  /** Quantos há no filtro escolhido (todos ou um tipo). */
  total: number
  pagina: number
  totalPaginas: number
  /** Não lidos de todos os tipos — o número do sino. */
  naoLidos: number
  /** Total e não lidos por tipo, para os filtros (só os tipos com algum aviso). */
  porTipo: Map<string, { total: number; naoLidos: number }>
}

/** Por quanto tempo um aviso recém-lido continua no topo da lista (a visita). */
const LIDO_HA_POUCO_MS = 30 * 60_000

/**
 * A lista de Avisos (A100, A101): os não lidos primeiro (com os lidos nos
 * últimos 30 minutos), depois os demais, cada grupo do mais novo para o mais
 * antigo; filtrada por tipo e paginada.
 * Lê primeiro só o índice do histórico inteiro (id, tipo, link, lido, data)
 * — em lotes, porque o PostgREST para em 1.000 linhas — e o texto só da
 * página. Aviso que leva a uma parte desabilitada na Área do associado fica
 * de fora (e das contagens): ele cairia na página "indisponível"; reabilitada
 * a parte, volta. Sem a tabela, lista vazia; outro erro sobe para a tela de
 * erro, em vez de dizer "nenhum aviso" a quem tem avisos.
 */
export async function listaDeAvisos(
  cpf: string,
  opcoes: { tipo?: string | null; paginacao: Paginacao }
): Promise<ListaDeAvisos> {
  const vazia: ListaDeAvisos = { avisos: [], total: 0, pagina: 1, totalPaginas: 1, naoLidos: 0, porTipo: new Map() }
  const chave = cpfConfiavel(cpf)
  if (!chave) return vazia
  const admin = await createAdminClient()
  const tenantId = await tenantAtual()
  // Nunca rejeita (falha = null, tudo vale): pode correr junto do índice.
  const lendoPartes = configDasPartes(null)

  type Indice = { id: string; evento: string; link: string | null; lida_em: string | null; created_at: string }
  let indice: Indice[]
  try {
    indice = await lerEmLotes<Indice>((de, ate) =>
      admin
        .from("portal_avisos")
        .select("id, evento, link, lida_em, created_at")
        .eq("emp_proprietaria_id", tenantId)
        .eq("cpf", chave)
        .order("created_at", { ascending: false })
        .order("id")
        .range(de, ate)
    )
  } catch (e) {
    if (tabelaAusente(e as { code?: string })) return vazia
    throw e
  }
  const partes = await lendoPartes
  if (temParteDesabilitada(partes)) indice = indice.filter((a) => !deParteDesabilitada(partes, a.link, a.evento))

  const porTipo = new Map<string, { total: number; naoLidos: number }>()
  let naoLidos = 0
  for (const a of indice) {
    const t = porTipo.get(a.evento) ?? { total: 0, naoLidos: 0 }
    t.total++
    if (!a.lida_em) {
      t.naoLidos++
      naoLidos++
    }
    porTipo.set(a.evento, t)
  }

  // A ordem do banco já é a da data; o sort é estável, então só sobem os não
  // lidos. O lido há pouco ainda sobe junto: marcado enquanto a pessoa lê (ao
  // aparecer, ao abrir numa aba nova), ele não pula para outra página.
  const agora = Date.now()
  const doTopo = (a: Indice) => !a.lida_em || agora - Date.parse(a.lida_em) < LIDO_HA_POUCO_MS
  const selecionados = indice
    .filter((a) => !opcoes.tipo || a.evento === opcoes.tipo)
    .sort((a, b) => Number(!doTopo(a)) - Number(!doTopo(b)))
  const { linhas, ...info } = paginar(selecionados, opcoes.paginacao)

  const textos = new Map<string, { texto: string; link: string | null }>()
  if (linhas.length > 0) {
    const { data, error } = await admin
      .from("portal_avisos")
      .select("id, texto, link")
      .eq("emp_proprietaria_id", tenantId)
      .eq("cpf", chave)
      .in(
        "id",
        linhas.map((a) => a.id)
      )
    if (error) throw new Error(`Falha ao ler os avisos: ${error.message}`)
    for (const a of data ?? []) {
      textos.set(String(a.id), { texto: String(a.texto), link: (a.link as string | null) ?? null })
    }
  }

  return {
    ...info,
    naoLidos,
    porTipo,
    avisos: linhas.map((a) => ({
      id: String(a.id),
      evento: String(a.evento),
      texto: textos.get(String(a.id))?.texto ?? "",
      link: textos.get(String(a.id))?.link ?? null,
      lidaEm: a.lida_em ?? null,
      criadoEm: String(a.created_at),
    })),
  }
}

/**
 * O número do sino. Com alguma parte desabilitada na Área do associado, conta
 * como a lista (`listaDeAvisos`): lê os não lidos (tipo e link) e tira os que
 * levam a ela; sem nenhuma, só a contagem do banco, como sempre. Uma conta
 * por requisição (React cache): a casca e as Novidades do Início dividem.
 */
export const contarAvisosNaoLidos = cache(async (cpf: string): Promise<number> => {
  const chave = cpfConfiavel(cpf)
  if (!chave) return 0
  const admin = await createAdminClient()
  const tenantId = await tenantAtual()
  const partes = await configDasPartes(null)
  if (temParteDesabilitada(partes)) {
    try {
      const naoLidos = await lerEmLotes<{ evento: string; link: string | null }>((de, ate) =>
        admin
          .from("portal_avisos")
          .select("id, evento, link")
          .eq("emp_proprietaria_id", tenantId)
          .eq("cpf", chave)
          .is("lida_em", null)
          .order("id")
          .range(de, ate)
      )
      return naoLidos.filter((a) => !deParteDesabilitada(partes, a.link, a.evento)).length
    } catch {
      return 0
    }
  }
  const { count, error } = await admin
    .from("portal_avisos")
    .select("id", { count: "exact", head: true })
    .eq("emp_proprietaria_id", tenantId)
    .eq("cpf", chave)
    .is("lida_em", null)
  return error ? 0 : (count ?? 0)
})

/**
 * Marca como lidos os avisos da pessoa (A100): os indicados por `ids` (vistos
 * na lista ou abertos), os que levam a `link` (a pessoa chegou à página por
 * outro caminho) ou, sem nenhum dos dois, todos ("Marcar todos como lidos").
 * Devolve quantos mudaram — zero quando já estavam lidos, e então a tela nem
 * precisa recarregar.
 */
export async function marcarAvisosLidos(
  cpf: string,
  alvo: { ids?: string[]; link?: string } = {}
): Promise<{ marcados: number; erro?: string }> {
  const chave = cpfConfiavel(cpf)
  if (!chave) return { marcados: 0 }
  if (alvo.ids && alvo.ids.length === 0) return { marcados: 0 }
  const admin = await createAdminClient()
  let consulta = admin
    .from("portal_avisos")
    .update({ lida_em: new Date().toISOString() }, { count: "exact" })
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("cpf", chave)
    .is("lida_em", null)
  if (alvo.ids) consulta = consulta.in("id", alvo.ids)
  if (alvo.link) consulta = consulta.eq("link", alvo.link)
  const { count, error } = await consulta
  if (error) {
    if (tabelaAusente(error)) return { marcados: 0 }
    console.error("avisos do portal (lidos):", error.message)
    return { marcados: 0, erro: "Não foi possível marcar os avisos agora. Tente de novo em instantes." }
  }
  return { marcados: count ?? 0 }
}

// ── Aviso em massa, só no sino (A80, A123) ───────────────────────────────────

export type AvisoEmMassa = {
  evento: EventoPortal
  texto: string
  /** Caminho no portal. É também a trava: uma vez por pessoa e link. */
  link: string
  /** Título da notificação no celular. */
  assunto: string
}

export type ResultadoEmMassa = {
  gravados: number
  /** Já tinham no sino um aviso com este link. */
  jaAvisados: number
  /** Não couberam no tempo desta volta. */
  restantes: number
  celular: number
  erro?: string
}

/** Linhas por insert no sino. */
const LOTE_SINO = 500
/** Folga dentro do tempo da função: o que passar disso fica para a próxima volta. */
const TEMPO_MAX_EM_MASSA_MS = 45_000

/**
 * Aviso SÓ NO SINO para muita gente de uma vez — convênio novo (A80),
 * notícia publicada (A123). Nunca por e-mail: para isso a entidade tem a
 * mala direta, com descadastro. No celular, só para quem ligou o tipo em
 * Preferências de avisos (o de notícias nasce desligado).
 *
 * `avisarFiliado` por pessoa seriam milhares de idas ao banco; aqui as linhas
 * entram em lotes de 500. Uma vez por pessoa e link: quem já tem no sino um
 * aviso com este link não recebe outro — rodar de novo só completa o que
 * faltou. Cada etapa abre um client novo: o JWT do tenant vale 60 s.
 *
 * Área do associado: o link de parte desabilitada não grava nada; com o
 * portal fora do ar, grava no sino e não avisa no celular.
 */
export async function avisarNoSinoEmMassa(cpfs: Iterable<string>, aviso: AvisoEmMassa): Promise<ResultadoEmMassa> {
  const r: ResultadoEmMassa = { gravados: 0, jaAvisados: 0, restantes: 0, celular: 0 }
  const inicio = Date.now()
  const todos = [...new Set([...cpfs].map((c) => cpfConfiavel(c)).filter((c): c is string => Boolean(c)))]
  if (todos.length === 0) return r
  const tenantId = await tenantAtual()
  const partes = await configDasPartes(null)
  if (deParteDesabilitada(partes, aviso.link, aviso.evento)) return r

  let ja: Set<string>
  try {
    const client = await createAdminClient()
    const linhas = await lerEmLotes<{ cpf: string }>((de, ate) =>
      client
        .from("portal_avisos")
        .select("id, cpf")
        .eq("emp_proprietaria_id", tenantId)
        .eq("link", aviso.link)
        .order("id")
        .range(de, ate)
    )
    ja = new Set(linhas.map((l) => String(l.cpf)))
  } catch (e) {
    // Sem a tabela não há sino (e avisarFiliado também não grava).
    if (tabelaAusente(e as { code?: string })) return r
    return { ...r, erro: (e as Error).message }
  }

  const novos = todos.filter((c) => !ja.has(c))
  r.jaAvisados = todos.length - novos.length
  for (let i = 0; i < novos.length; i += LOTE_SINO) {
    if (Date.now() - inicio > TEMPO_MAX_EM_MASSA_MS) {
      r.restantes = novos.length - i
      break
    }
    const lote = novos.slice(i, i + LOTE_SINO)
    const client = await createAdminClient()
    const { error } = await client.from("portal_avisos").insert(
      lote.map((cpf) => ({
        emp_proprietaria_id: tenantId,
        cpf,
        evento: aviso.evento,
        texto: aviso.texto,
        link: aviso.link,
      }))
    )
    if (error) {
      r.restantes = novos.length - i
      r.erro = error.message
      break
    }
    r.gravados += lote.length
  }

  // Celular: só quem tem aparelho ligado (quase ninguém, num lote destes — a
  // lista vem da memória de push.ts) e o tipo ligado nas preferências.
  try {
    const amb = { client: await createAdminClient(), tenantId }
    const comAparelho: string[] = []
    // Portal fora do ar: ninguém recebe no aparelho (o sino guarda para a volta).
    const avisaveis = portalForaDoAr(partes, aviso.link) ? [] : novos.slice(0, r.gravados)
    for (const cpf of avisaveis) if (await temPushPortal(cpf, amb)) comAparelho.push(cpf)
    for (let i = 0; i < comAparelho.length; i += 5) {
      if (Date.now() - inicio > TEMPO_MAX_EM_MASSA_MS) break
      const etapa = { client: await createAdminClient(), tenantId }
      await Promise.all(
        comAparelho.slice(i, i + 5).map(async (cpf) => {
          const prefs = await preferenciasDoFiliado(cpf, etapa)
          if (!prefs[aviso.evento]) return
          await enviarPushPortal(cpf, { titulo: aviso.assunto, corpo: aviso.texto, url: aviso.link }, etapa)
          r.celular++
        })
      )
    }
  } catch (e) {
    console.error("aviso em massa (celular):", e)
  }

  if (r.restantes > 0 || r.erro) {
    console.warn(
      `[avisos] ${aviso.link}: ${r.gravados} no sino, ${r.restantes} ficaram para a próxima volta${r.erro ? ` (${r.erro})` : ""}`
    )
  }
  return r
}

/**
 * O aviso em massa para os filiados ativos da entidade — a régua de
 * filiacao-ativos.ts (condição Ativo, sem excluídos nem anonimizados). Vale
 * dentro da requisição ou no `after` dela (o tenant vem dos cabeçalhos).
 */
export async function avisarAtivosNoSino(aviso: AvisoEmMassa): Promise<ResultadoEmMassa> {
  const ativos = await filiadosAtivos()
  return avisarNoSinoEmMassa(
    [...ativos.values()].map((f) => f.cpf ?? ""),
    aviso
  )
}

/** Tira do sino os avisos que levam a um item que deixou de existir (notícia ou convênio excluído). */
export async function removerAvisosDoLink(link: string): Promise<void> {
  try {
    const admin = await createAdminClient()
    const { error } = await admin
      .from("portal_avisos")
      .delete()
      .eq("emp_proprietaria_id", await tenantAtual())
      .eq("link", link)
    if (error && !tabelaAusente(error)) console.error("avisos do portal (remover):", error.message)
  } catch (e) {
    console.error("avisos do portal (remover):", e)
  }
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
