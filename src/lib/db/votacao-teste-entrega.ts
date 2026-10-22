import "server-only"

import { createHmac, timingSafeEqual } from "node:crypto"

import type { SupabaseClient } from "@supabase/supabase-js"

import { cpfConfiavel } from "@/lib/cpf"
import { lerEmLotes, texto } from "@/lib/db/comum"
import { contextoDoTenant } from "@/lib/db/comunicacao-mensagens"
import { dadosDoAviso, desligaramEmailDeVotacao, type AmbienteEnvio } from "@/lib/db/votacao-aviso"
import { janelasOnline, type Ambiente } from "@/lib/db/votacao-sem-link"
import { enviarEmail } from "@/lib/email"
import { marcaEmailVoto } from "@/lib/db/votacao-eventos-email"
import { assuntoAvisoPrevio, montarEmailAvisoPrevio } from "@/lib/email-aviso-aptos"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"
import { origemAtual } from "@/lib/tenant-url"

/**
 * TESTE DE ENTREGA ANTECIPADO (fase 3 do plano de 21/10/2026,
 * docs/plano-votacao-entrega-preparacao.md).
 *
 * Na Halliburton o link pessoal foi "entregue" ao e-mail corporativo, mas só o
 * robô de segurança da empresa o abriu — e o sindicato só descobriu com a
 * votação aberta. Aqui se descobre DIAS ANTES:
 *
 *  1. AVISO PRÉVIO ao e-mail corporativo (botão ou automático N dias antes),
 *     sem link de voto, com o botão "Recebi". O botão abre uma página com um
 *     formulário de confirmação: o robô abre endereços, não envia formulários
 *     — só a confirmação humana conta (`recebido_em`).
 *  2. A taxa de confirmação vira a situação do domínio: chega, não chega ou
 *     incerto. "Não chega" acende o alerta na rodada, no painel e na caixa de
 *     entrada, recomendando o pré-cadastro (fase 2) e o Telegram.
 *  3. HISTÓRICO POR DOMÍNIO (`voto_entrega_dominios`): o tick grava a medição
 *     do aviso prévio (48 h depois do envio) e a da votação (votos pelo link
 *     pessoal, quando ela termina). A próxima rodada da mesma empresa já nasce
 *     com o alerta, antes de qualquer envio.
 */

/** Medição com menos que isto é ruído. */
const MIN_BASE = 20
/** Aviso prévio: confirmaram/avisados. Pouca gente clica "Recebi" mesmo recebendo — por isso os limites baixos. */
const PREVIO = { chega: 0.2, naoChega: 0.1 }
/** Votação: votos pelo link pessoal/votantes com canal (SLB 79%, Halliburton 3%). */
const VOTACAO = { chega: 0.4, naoChega: 0.15 }
/** Horas depois do primeiro aviso prévio para a taxa valer (e ser gravada no histórico). */
const HORAS_LEITURA = 24
const HORAS_MEDICAO = 48

export const OPCOES_AVISO_PREVIO = [3, 5, 7] as const

export type Situacao = "chega" | "nao_chega" | "incerto"

export function classificar(medida: "aviso_previo" | "votacao", base: number, sucesso: number): Situacao {
  if (base < MIN_BASE) return "incerto"
  const lim = medida === "aviso_previo" ? PREVIO : VOTACAO
  const taxa = sucesso / base
  return taxa >= lim.chega ? "chega" : taxa < lim.naoChega ? "nao_chega" : "incerto"
}

// ── Domínio da empresa ─────────────────────────────────────────────────────

const PROVEDORES_PUBLICOS =
  /^(gmail|googlemail|hotmail|outlook|live|msn|windowslive|yahoo|ymail|rocketmail|icloud|me|mac|bol|uol|terra|ig|globo|globomail|zipmail|r7|protonmail|proton|aol|gmx|mail)\./

/** Domínio corporativo predominante (≥ metade da lista) — null se a lista é de e-mails pessoais ou mista. */
export function dominioCorporativo(emails: (string | null)[]): string | null {
  const conta = new Map<string, number>()
  let total = 0
  for (const e of emails) {
    const d = e?.split("@")[1]?.trim().toLowerCase()
    if (!d) continue
    total++
    conta.set(d, (conta.get(d) ?? 0) + 1)
  }
  let melhor: string | null = null
  let n = 0
  for (const [d, c] of conta) if (c > n) [melhor, n] = [d, c]
  if (!melhor || n < total / 2 || PROVEDORES_PUBLICOS.test(melhor)) return null
  return melhor
}

// ── Token do "Recebi" (não abre cédula: rótulo próprio na assinatura) ───────

function assinar(corpo: string): string {
  const s = process.env.SUPABASE_JWT_SECRET
  if (!s) throw new Error("SUPABASE_JWT_SECRET ausente")
  return createHmac("sha256", `${s}:votacao-recebi`).update(corpo).digest("base64url")
}

export function tokenRecebi(aptoId: string): string {
  const corpo = Buffer.from(aptoId).toString("base64url")
  return `${corpo}.${assinar(corpo)}`
}

function aptoDoTokenRecebi(token: string): string | null {
  const [corpo, sig] = token.split(".")
  if (!corpo || !sig) return null
  const esperado = Buffer.from(assinar(corpo))
  const veio = Buffer.from(sig)
  if (esperado.length !== veio.length || !timingSafeEqual(esperado, veio)) return null
  const id = Buffer.from(corpo, "base64url").toString()
  return /^[0-9a-f-]{36}$/i.test(id) ? id : null
}

/** "Recebi": grava a confirmação humana (POST da página /votar/recebi). */
export async function confirmarRecebido(token: string): Promise<{ ok?: true; erro?: string }> {
  const aptoId = aptoDoTokenRecebi(token)
  if (!aptoId) return { erro: "Este endereço não é válido. Abra de novo o botão do e-mail." }
  const admin = await createAdminClient()
  const { error } = await admin
    .from("voto_assembleias_aptos")
    .update({ recebido_em: new Date().toISOString() })
    .eq("id", aptoId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .is("recebido_em", null)
  return error ? { erro: "Não foi possível registrar agora. Tente de novo em instantes." } : { ok: true }
}

// ── Histórico por domínio ──────────────────────────────────────────────────

export type MedicaoDominio = {
  dominio: string
  rodadaId: string | null
  rodadaNome: string | null
  medida: "aviso_previo" | "votacao"
  medidoEm: string
  base: number
  sucesso: number
  situacao: Situacao
  observacao: string | null
}

async function historico(client: SupabaseClient, emp: string, dominio: string, excetoRodada?: string): Promise<MedicaoDominio[]> {
  const { data, error } = await client
    .from("voto_entrega_dominios")
    .select("dominio, rodada_id, rodada_nome, medida, medido_em, base, sucesso, situacao, observacao")
    .eq("emp_proprietaria_id", emp)
    .eq("dominio", dominio)
    .order("medido_em", { ascending: false })
    .limit(6)
  if (error) return []
  return (data ?? [])
    .filter((m) => !excetoRodada || m.rodada_id !== excetoRodada)
    .map((m) => ({
      dominio: String(m.dominio),
      rodadaId: texto(m.rodada_id),
      rodadaNome: texto(m.rodada_nome),
      medida: m.medida as MedicaoDominio["medida"],
      medidoEm: String(m.medido_em),
      base: Number(m.base),
      sucesso: Number(m.sucesso),
      situacao: m.situacao as Situacao,
      observacao: texto(m.observacao),
    }))
}

// ── Leitura da rodada ──────────────────────────────────────────────────────

type LinhaApto = {
  email_corporativo: string | null
  aviso_previo_em: string | null
  aviso_previo_erro: string | null
  recebido_em: string | null
  hora_voto: string | null
  acesso_canal: string | null
}

async function aptosDaRodada(client: SupabaseClient, emp: string, rodadaId: string): Promise<LinhaApto[]> {
  return lerEmLotes<LinhaApto>((de, ate) =>
    client
      .from("voto_assembleias_aptos")
      .select("email_corporativo, aviso_previo_em, aviso_previo_erro, recebido_em, hora_voto, acesso_canal")
      .eq("emp_proprietaria_id", emp)
      .eq("rod_assembleia_id", rodadaId)
      .order("id")
      .range(de, ate)
  )
}

export type LeituraPrevio = {
  avisados: number
  confirmaram: number
  pendentes: number
  semEmail: number
  falhas: number
  primeiroEnvio: string | null
  horasDesde: number | null
  /** "sem_envio" | "aguardando" (menos de 24 h) | situação da taxa. */
  situacao: "sem_envio" | "aguardando" | Situacao
}

function lerPrevio(linhas: LinhaApto[], agora = Date.now()): LeituraPrevio {
  let avisados = 0
  let confirmaram = 0
  let pendentes = 0
  let semEmail = 0
  let falhas = 0
  let primeiro: string | null = null
  for (const l of linhas) {
    if (l.recebido_em) confirmaram++
    if (!l.aviso_previo_em) {
      if (!l.hora_voto) pendentes++
      continue
    }
    if (l.aviso_previo_erro === "sem_email") semEmail++
    else if (l.aviso_previo_erro === "falha") falhas++
    else if (!l.aviso_previo_erro) {
      avisados++
      if (!primeiro || l.aviso_previo_em < primeiro) primeiro = l.aviso_previo_em
    }
  }
  const horasDesde = primeiro ? (agora - new Date(primeiro).getTime()) / 3600_000 : null
  const situacao =
    avisados === 0 ? "sem_envio" : (horasDesde ?? 0) < HORAS_LEITURA ? "aguardando" : classificar("aviso_previo", avisados, confirmaram)
  return { avisados, confirmaram, pendentes, semEmail, falhas, primeiroEnvio: primeiro, horasDesde, situacao }
}

export type TesteEntrega = {
  /** false = migração da fase 3 não aplicada. */
  disponivel: boolean
  dominio: string | null
  previo: LeituraPrevio
  /** Envio automático (dias antes da abertura; null = desligado) e quando começa. */
  dias: number | null
  comecaEm: number | null
  /** O automático já está na janela (o tick envia a cada 15 min). */
  automaticoAtivo: boolean
  /** A votação pela internet já abriu (o aviso prévio não faz mais sentido). */
  aberta: boolean
  /** Medições anteriores do mesmo domínio (outras rodadas). */
  historico: MedicaoDominio[]
}

export async function testeEntregaDaRodada(rodadaId: string): Promise<TesteEntrega | null> {
  const client = await createAdminClient()
  const emp = await tenantAtual()
  const { data: rod, error } = await client
    .from("voto_rod_assembleias")
    .select("aviso_previo_dias")
    .eq("id", rodadaId)
    .eq("emp_proprietaria_id", emp)
    .maybeSingle()
  const vazio: LeituraPrevio = { avisados: 0, confirmaram: 0, pendentes: 0, semEmail: 0, falhas: 0, primeiroEnvio: null, horasDesde: null, situacao: "sem_envio" }
  if (error) return { disponivel: false, dominio: null, previo: vazio, dias: null, comecaEm: null, automaticoAtivo: false, aberta: false, historico: [] }
  const [janela] = await janelasOnline({ client, emp }, { rodadaIds: [rodadaId] })
  // Só faz sentido com voto pela internet ainda por vir ou aberto.
  if (!janela) return null
  const linhas = await aptosDaRodada(client, emp, rodadaId)
  const dominio = dominioCorporativo(linhas.map((l) => l.email_corporativo))
  const dias = typeof rod?.aviso_previo_dias === "number" ? rod.aviso_previo_dias : null
  const comecaEm = dias !== null && janela.abreEm !== null ? janela.abreEm - dias * 86400_000 : null
  return {
    disponivel: true,
    dominio,
    previo: lerPrevio(linhas),
    dias,
    comecaEm,
    automaticoAtivo: comecaEm !== null && comecaEm <= Date.now(),
    aberta: janela.aberta,
    historico: dominio ? await historico(client, emp, dominio, rodadaId) : [],
  }
}

export async function configurarAvisoPrevio(rodadaId: string, dias: number | null): Promise<{ erro?: string }> {
  if (dias !== null && !(OPCOES_AVISO_PREVIO as readonly number[]).includes(dias)) {
    return { erro: "Escolha 3, 5 ou 7 dias antes da abertura." }
  }
  const client = await createAdminClient()
  const { error } = await client
    .from("voto_rod_assembleias")
    .update({ aviso_previo_dias: dias })
    .eq("id", rodadaId)
    .eq("emp_proprietaria_id", await tenantAtual())
  return error ? { erro: `Não foi possível salvar: ${error.message}` } : {}
}

// ── Envio do aviso prévio ──────────────────────────────────────────────────

export type ResultadoLotePrevio = { processados: number; enviados: number; falhas: number; restantes: number }

const EMAIL_VALIDO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

/** Envia o aviso prévio a até `limite` aptos que ainda não o receberam (e não votaram). */
export async function enviarLoteAvisoPrevio(
  rodadaId: string,
  limite = 60,
  amb?: AmbienteEnvio
): Promise<{ resultado?: ResultadoLotePrevio; erro?: string }> {
  if (!process.env.BREVO_API_KEY || !process.env.EMAIL_REMETENTE) {
    return { erro: "O envio de e-mails não está configurado neste ambiente." }
  }
  const client = amb?.client ?? (await createAdminClient())
  const emp = amb?.tenantId ?? (await tenantAtual())
  const { dados, erro } = await dadosDoAviso(rodadaId, amb)
  if (!dados) return { erro }

  const { data, error } = await client
    .from("voto_assembleias_aptos")
    .select("id, cpf, nome_completo, email_corporativo")
    .eq("emp_proprietaria_id", emp)
    .eq("rod_assembleia_id", rodadaId)
    .is("aviso_previo_em", null)
    .is("hora_voto", null)
    .order("id")
    .limit(limite)
  if (error) {
    return { erro: error.code === "42703" ? "Falta aplicar a migração do teste de entrega." : `Falha ao ler os aptos: ${error.message}` }
  }
  const aptos = (data ?? []) as { id: string; cpf: string | null; nome_completo: string | null; email_corporativo: string | null }[]

  const emails = [...new Set(aptos.map((a) => a.email_corporativo?.trim().toLowerCase()).filter((e): e is string => Boolean(e)))]
  const jaAvisados = new Set<string>()
  if (emails.length) {
    const { data: feitos } = await client
      .from("voto_assembleias_aptos")
      .select("email_corporativo")
      .eq("emp_proprietaria_id", emp)
      .eq("rod_assembleia_id", rodadaId)
      .not("aviso_previo_em", "is", null)
      .is("aviso_previo_erro", null)
      .in("email_corporativo", emails)
    for (const f of feitos ?? []) if (f.email_corporativo) jaAvisados.add(String(f.email_corporativo).toLowerCase())
  }
  // Quem desligou o e-mail de "Votações" no portal não recebe: o aviso prévio
  // não é o caminho do voto. Sem conseguir conferir, o lote para.
  let desligaram: Set<string>
  try {
    desligaram = await desligaramEmailDeVotacao(
      { client, tenantId: emp },
      [...new Set(aptos.map((a) => cpfConfiavel(a.cpf)).filter((c): c is string => Boolean(c)))]
    )
  } catch (e) {
    return { erro: `Não foi possível conferir as preferências de aviso: ${(e as Error).message}` }
  }

  const origem = amb?.contexto.origem ?? (await origemAtual())
  const assunto = assuntoAvisoPrevio(dados)
  const marcas: { id: string; erro: string | null }[] = []
  const envios: { id: string; email: string; nome: string | null }[] = []
  const vistos = new Set<string>()
  for (const a of aptos) {
    const email = a.email_corporativo?.trim().toLowerCase() ?? ""
    const cpf = cpfConfiavel(a.cpf)
    if (!EMAIL_VALIDO.test(email)) marcas.push({ id: a.id, erro: "sem_email" })
    else if (cpf && desligaram.has(cpf)) marcas.push({ id: a.id, erro: "preferencia" })
    else if (jaAvisados.has(email) || vistos.has(email)) marcas.push({ id: a.id, erro: "duplicado" })
    else {
      vistos.add(email)
      envios.push({ id: a.id, email, nome: a.nome_completo })
    }
  }

  const resultado: ResultadoLotePrevio = { processados: aptos.length, enviados: 0, falhas: 0, restantes: 0 }
  const PARALELO = 6
  for (let i = 0; i < envios.length; i += PARALELO) {
    const fatia = envios.slice(i, i + PARALELO)
    const oks = await Promise.all(
      fatia.map((e) =>
        enviarEmail({
          email: e.email,
          nome: e.nome,
          assunto,
          html: montarEmailAvisoPrevio(dados, {
            nome: e.nome,
            linkRecebi: `${origem}/votar/recebi?t=${encodeURIComponent(tokenRecebi(e.id))}`,
            linkCadastro: `${origem}/votar`,
          }),
          contexto: amb?.contexto,
          cabecalhos: marcaEmailVoto(emp, "p", e.id),
        })
      )
    )
    fatia.forEach((e, j) => {
      if (oks[j]) resultado.enviados++
      else resultado.falhas++
      marcas.push({ id: e.id, erro: oks[j] ? null : "falha" })
    })
  }

  // Client novo: o JWT do tenant vence em 60 s, e o lote pode passar disso.
  const gravar = amb?.client ?? (await createAdminClient())
  const agora = new Date().toISOString()
  const grupos = new Map<string, string[]>()
  for (const m of marcas) grupos.set(m.erro ?? "", [...(grupos.get(m.erro ?? "") ?? []), m.id])
  for (const [erroMarca, ids] of grupos) {
    await gravar
      .from("voto_assembleias_aptos")
      .update({ aviso_previo_em: agora, aviso_previo_erro: erroMarca || null })
      .eq("emp_proprietaria_id", emp)
      .in("id", ids)
  }
  const { count } = await gravar
    .from("voto_assembleias_aptos")
    .select("id", { count: "exact", head: true })
    .eq("emp_proprietaria_id", emp)
    .eq("rod_assembleia_id", rodadaId)
    .is("aviso_previo_em", null)
    .is("hora_voto", null)
  resultado.restantes = count ?? 0
  return { resultado }
}

// ── Alerta: o e-mail da empresa não chega ──────────────────────────────────

export type RodadaEntregaRuim = {
  rodadaId: string
  rodadaNome: string | null
  dominio: string
  /** "aviso_previo" = medido nesta rodada; "historico" = em votação anterior da mesma empresa. */
  motivo: "aviso_previo" | "historico"
  base: number
  sucesso: number
  /** Medição anterior que pesou (motivo "historico"). */
  anterior: MedicaoDominio | null
}

/**
 * Rodadas com votação pela internet por vir ou aberta em que o e-mail
 * corporativo não chega a quem vota — pelo aviso prévio desta rodada ou, sem
 * ele, pela última medição do mesmo domínio. Tolerante: erro → vazio.
 */
export async function rodadasComEntregaRuim(
  amb: Ambiente,
  filtro: { rodadaIds?: string[] } = {}
): Promise<RodadaEntregaRuim[]> {
  const { client, emp } = amb
  try {
    const janelas = await janelasOnline(amb, filtro)
    const saida: RodadaEntregaRuim[] = []
    for (const j of janelas) {
      const linhas = await aptosDaRodada(client, emp, j.rodadaId)
      const dominio = dominioCorporativo(linhas.map((l) => l.email_corporativo))
      if (!dominio) continue
      const previo = lerPrevio(linhas)
      if (previo.situacao === "nao_chega") {
        saida.push({ rodadaId: j.rodadaId, rodadaNome: j.rodadaNome, dominio, motivo: "aviso_previo", base: previo.avisados, sucesso: previo.confirmaram, anterior: null })
        continue
      }
      // Com o aviso prévio desta rodada já medindo, ele manda; senão, o histórico.
      if (previo.situacao !== "sem_envio") continue
      const [ultima] = await historico(client, emp, dominio, j.rodadaId)
      if (ultima?.situacao === "nao_chega") {
        saida.push({ rodadaId: j.rodadaId, rodadaNome: j.rodadaNome, dominio, motivo: "historico", base: ultima.base, sucesso: ultima.sucesso, anterior: ultima })
      }
    }
    return saida
  } catch {
    return []
  }
}

/** `rodadasComEntregaRuim` com o cliente e o tenant da requisição. */
export async function entregaRuimDasRodadas(filtro: { rodadaIds?: string[] } = {}): Promise<RodadaEntregaRuim[]> {
  return rodadasComEntregaRuim({ client: await createAdminClient(), emp: await tenantAtual() }, filtro)
}

// ── Tick: envio automático e medições ──────────────────────────────────────

async function gravarMedicao(
  client: SupabaseClient,
  emp: string,
  m: { dominio: string; rodadaId: string; rodadaNome: string | null; medida: "aviso_previo" | "votacao"; base: number; sucesso: number }
): Promise<boolean> {
  const { error } = await client.from("voto_entrega_dominios").upsert(
    {
      emp_proprietaria_id: emp,
      dominio: m.dominio,
      rodada_id: m.rodadaId,
      rodada_nome: m.rodadaNome,
      medida: m.medida,
      medido_em: new Date().toISOString(),
      base: m.base,
      sucesso: m.sucesso,
      situacao: classificar(m.medida, m.base, m.sucesso),
    },
    { onConflict: "emp_proprietaria_id,rodada_id,medida,dominio", ignoreDuplicates: true }
  )
  return !error
}

async function jaMedida(client: SupabaseClient, emp: string, rodadaId: string, medida: string): Promise<boolean> {
  const { count, error } = await client
    .from("voto_entrega_dominios")
    .select("id", { count: "exact", head: true })
    .eq("emp_proprietaria_id", emp)
    .eq("rodada_id", rodadaId)
    .eq("medida", medida)
  return Boolean(error) || (count ?? 0) > 0
}

export type ResultadoTesteEntrega = { previos: number; medicoes: number; erros: string[] }

/**
 * No tick da votação: (1) envia o aviso prévio nas rodadas com o automático
 * ligado e já na janela (até a votação abrir); (2) grava a medição do aviso
 * prévio 48 h depois do primeiro envio (ou na abertura, com 24 h); (3) grava a
 * medição da votação das rodadas que terminaram nos últimos 5 dias.
 */
export async function rodarTesteEntrega(opcoes: {
  client: SupabaseClient
  limite: number
  tenant?: string | null
}): Promise<ResultadoTesteEntrega> {
  const r: ResultadoTesteEntrega = { previos: 0, medicoes: 0, erros: [] }
  const client = opcoes.client
  const desde = new Date(Date.now() - 5 * 86400_000).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })
  let q = client
    .from("voto_rod_assembleias")
    .select("id, nome_assembleia, emp_proprietaria_id, termino, aviso_previo_dias")
    .gte("termino", desde)
  if (opcoes.tenant) q = q.eq("emp_proprietaria_id", opcoes.tenant)
  const { data, error } = await q
  if (error) {
    // Sem a coluna (migração não aplicada), não há o que fazer.
    if (error.code !== "42703") r.erros.push(`rodadas: ${error.message}`)
    return r
  }
  const porTenant = new Map<string, typeof data>()
  for (const x of data ?? []) porTenant.set(String(x.emp_proprietaria_id), [...(porTenant.get(String(x.emp_proprietaria_id)) ?? []), x])
  const agora = Date.now()

  for (const [emp, rodadas] of porTenant) {
    const janelas = await janelasOnline({ client, emp }, { rodadaIds: rodadas.map((x) => String(x.id)) })
    const janelaDe = new Map(janelas.map((j) => [j.rodadaId, j]))
    let contexto: AmbienteEnvio["contexto"] | null = null
    for (const rod of rodadas) {
      if (Date.now() > opcoes.limite) return r
      const rodadaId = String(rod.id)
      const nome = texto(rod.nome_assembleia)
      const j = janelaDe.get(rodadaId)
      try {
        // (1) envio automático do aviso prévio, até a votação abrir.
        const dias = typeof rod.aviso_previo_dias === "number" ? rod.aviso_previo_dias : null
        if (j && !j.aberta && dias !== null && j.abreEm !== null && j.abreEm - dias * 86400_000 <= agora) {
          contexto ??= await contextoDoTenant(emp, client)
          for (;;) {
            if (Date.now() > opcoes.limite) return r
            const lote = await enviarLoteAvisoPrevio(rodadaId, 60, { client, tenantId: emp, contexto })
            if (lote.erro || !lote.resultado) {
              r.erros.push(`${nome ?? rodadaId} (aviso prévio): ${lote.erro ?? "falha"}`)
              break
            }
            r.previos += lote.resultado.enviados
            if (lote.resultado.restantes === 0 || lote.resultado.processados === 0) break
          }
        }

        // (2) medição do aviso prévio.
        if (j && !(await jaMedida(client, emp, rodadaId, "aviso_previo"))) {
          const linhas = await aptosDaRodada(client, emp, rodadaId)
          const p = lerPrevio(linhas)
          const horas = p.horasDesde ?? 0
          const dominio = dominioCorporativo(linhas.map((l) => l.email_corporativo))
          if (dominio && p.avisados > 0 && (horas >= HORAS_MEDICAO || (j.aberta && horas >= HORAS_LEITURA))) {
            if (await gravarMedicao(client, emp, { dominio, rodadaId, rodadaNome: nome, medida: "aviso_previo", base: p.avisados, sucesso: p.confirmaram })) r.medicoes++
          }
        }

        // (3) medição da votação: a votação pela internet desta rodada terminou.
        // Sem janela viva = sem voto pela internet por vir ou aberto; sem votos
        // com canal (rodada só presencial, ou ainda sem assembleia), não mede.
        if (!j && !(await jaMedida(client, emp, rodadaId, "votacao"))) {
          const linhas = await aptosDaRodada(client, emp, rodadaId)
          const dominio = dominioCorporativo(linhas.map((l) => l.email_corporativo))
          const comCanal = linhas.filter((l) => l.hora_voto && l.acesso_canal)
          if (dominio && comCanal.length >= MIN_BASE) {
            const pelo = comCanal.filter((l) => l.acesso_canal === "link_pessoal").length
            if (await gravarMedicao(client, emp, { dominio, rodadaId, rodadaNome: nome, medida: "votacao", base: comCanal.length, sucesso: pelo })) r.medicoes++
          }
        }
      } catch (e) {
        r.erros.push(`${nome ?? rodadaId}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
  }
  return r
}
