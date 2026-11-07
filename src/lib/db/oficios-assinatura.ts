import "server-only"
import { cpfConfiavel } from "@/lib/cpf"

import { createHash, randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto"
import { createElement } from "react"
import { renderToBuffer } from "@react-pdf/renderer"
import QRCode from "qrcode"

import { texto } from "@/lib/db/comum"
import { criarNotificacao } from "@/lib/db/notificacoes"
import {
  assinantesDoOficio,
  dadosImpressao,
  numerarOficio,
  obterOficio,
  prepararEmissao,
  type DadosImpressao,
  type DetalheOficio,
} from "@/lib/db/oficios"
import { enviarEmail } from "@/lib/email"
import { enviarTelegram } from "@/lib/telegram"
import {
  botaoEmail,
  caixaAviso,
  caixaCodigo,
  escaparHtml,
  linkReserva,
  paragrafo,
  textoSuave,
} from "@/lib/email-layout"
import { OficioPDF, type AssinaturaPDF, type CancelamentoPDF } from "@/lib/pdf/oficio"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"
import { origemAtual } from "@/lib/tenant-url"

/**
 * Assinatura eletrônica de ofícios — ver supabase/oficios-assinatura.sql.
 *
 * Fluxo (inspirado no DocuSign):
 *  1. ENVIO: o rascunho recebe o número, fica travado em "Aguardando
 *     assinatura" e o conteúdo é congelado num hash. O assinante recebe e-mail
 *     com um link de token único.
 *  2. REVISÃO: o link abre o documento completo e registra a abertura.
 *  3. ASSINATURA: um código de 6 dígitos vai ao mesmo e-mail (prova de posse
 *     da caixa); com o aceite e o código certo, o hash é conferido de novo, o
 *     ofício vira "Emitido" e o PDF final — QR Code no cabeçalho, carimbo sob a
 *     assinatura e página de certificado com a trilha — vai para o bucket.
 *  4. RECUSA ou CANCELAMENTO: o ofício volta ao rascunho com o número
 *     reservado; quem enviou é avisado.
 *  6. VÁRIOS ASSINANTES (06/11/2026): um envelope por pessoa, todos na mesma
 *     RODADA e enviados juntos. O ofício é emitido quando o último assina; a
 *     recusa de qualquer um cancela os convites que faltam e devolve ao
 *     rascunho. Assinatura dada numa rodada que não terminou fica registrada,
 *     mas não vale para o ofício (a verificação diz isso).
 *  5. OFÍCIO CANCELADO DEPOIS DE ASSINADO: o envelope, o hash, o PDF guardado
 *     e a trilha NÃO mudam; a trilha ganha "documento_cancelado", /verificar
 *     mostra o cancelamento em destaque e o PDF gerado na hora sai com tarja
 *     (ver registrarCancelamentoNaAssinatura e cancelamentoParaPdf).
 *
 * O lado público (/assinar, /verificar) não tem sessão: o tenant vem do
 * subdomínio e o cliente do tenant (JWT) lê só o que é dele.
 */

const VALIDADE_CODIGO_MIN = 10
const MAX_TENTATIVAS = 5
const INTERVALO_REENVIO_CODIGO_S = 60
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const FUSO = "America/Sao_Paulo"

export type SituacaoAssinatura = "pendente" | "assinado" | "recusado" | "cancelado"

/** Por onde vão o convite e o código: e-mail ou Telegram (ver supabase/oficios-assinatura-telegram.sql). */
export type CanalAssinatura = "email" | "telegram"

export type EventoAssinatura = {
  tipo: string
  detalhe: string | null
  ip: string | null
  userAgent: string | null
  quando: string
}

export type Assinatura = {
  id: string
  oficioId: string
  integranteId: string | null
  nome: string | null
  cargo: string | null
  email: string | null
  canal: CanalAssinatura
  telegramChatId: string | null
  /** Telefone confirmado no Telegram (só dígitos), como estava no envio. */
  telegramTelefone: string | null
  token: string
  certificado: string | null
  situacao: SituacaoAssinatura
  hashDocumento: string | null
  enviadoEm: string | null
  visualizadoEm: string | null
  assinadoEm: string | null
  recusadoEm: string | null
  motivoRecusa: string | null
  ip: string | null
  userAgent: string | null
  /** Envelopes do mesmo envio (vários assinantes). Nulo no envio de um só. */
  rodada: string | null
  ordem: number
  criadoEm: string
  eventos: EventoAssinatura[]
}

export const ROTULO_EVENTO: Record<string, string> = {
  enviado: "Enviado para assinatura",
  reenviado: "Convite reenviado",
  visualizado: "Documento aberto pelo assinante",
  codigo_enviado: "Código de uso único enviado",
  codigo_invalido: "Código incorreto informado",
  assinado: "Assinado eletronicamente",
  recusado: "Assinatura recusada",
  cancelado: "Envio cancelado pelo remetente",
  // Ato POSTERIOR à assinatura: a assinatura continua autêntica, o ofício
  // deixa de valer (ver registrarCancelamentoNaAssinatura).
  documento_cancelado: "Ofício cancelado pela entidade",
}

// ── utilidades ──────────────────────────────────────────────────────────────

function hashCodigo(codigo: string, token: string): string {
  return createHash("sha256").update(`${codigo}:${token}`).digest("hex")
}

function conferirCodigo(codigo: string, token: string, hash: string): boolean {
  const a = Buffer.from(hashCodigo(codigo, token))
  const b = Buffer.from(hash)
  return a.length === b.length && timingSafeEqual(a, b)
}

/** Certificado público: 12 caracteres sem ambíguos (0/O, 1/I/L), em trincas de 4. */
function novoCertificado(): string {
  const alfabeto = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"
  const bytes = randomBytes(12)
  const c = Array.from(bytes, (b) => alfabeto[b % alfabeto.length]).join("")
  return `${c.slice(0, 4)}-${c.slice(4, 8)}-${c.slice(8, 12)}`
}

/**
 * SHA-256 do conteúdo que o PDF mostra. Calculado no envio e conferido na
 * assinatura: o que o assinante leu é o que ele assinou.
 */
export function hashDoConteudo(o: DetalheOficio): string {
  const conteudo = {
    numero: o.numero,
    ano: o.ano,
    data: o.data,
    destinatario: o.destinatarioNome ?? o.destinatarioTexto,
    aosCuidados: o.aosCuidados,
    assunto: o.assunto,
    saudacao: o.saudacao,
    corpo: o.corpo,
    pessoas: o.filiados.map((f) => [f.nome, f.matricula]),
    fecho: o.fecho,
    assinante: [o.assinanteNome, o.assinanteCargo],
    // Só entra com vários assinantes: o resumo dos ofícios já assinados não muda.
    ...(o.coassinantes.length ? { coassinantes: o.coassinantes.map((c) => [c.nome, c.cargo]) } : {}),
  }
  return createHash("sha256").update(JSON.stringify(conteudo)).digest("hex")
}

export function formatarMomento(iso: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso)
  const data = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, day: "2-digit", month: "2-digit", year: "numeric" }).format(d)
  const hora = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(d)
  return `${data} às ${hora}`
}

/** "joao.silva@x.org" → "jo***@x.org" — o PDF circula fora da entidade. */
export function mascararEmail(email: string | null): string {
  if (!email) return "—"
  const [usuario, dominio] = email.split("@")
  if (!dominio) return email
  return `${usuario.slice(0, 2)}***@${dominio}`
}

/** "22998765432" → "(22) ••••-5432" — o certificado circula fora da entidade. */
export function mascararTelefone(digitos: string | null): string {
  const d = (digitos ?? "").replace(/\D/g, "")
  if (d.length < 8) return "—"
  return `(${d.slice(0, 2)}) ••••-${d.slice(-4)}`
}

/** Para onde foram o convite e o código, já mascarado, conforme o canal. */
export function destinoDaAssinatura(a: {
  canal: CanalAssinatura
  email: string | null
  telegramTelefone: string | null
}): string {
  return a.canal === "telegram"
    ? `Telegram ${mascararTelefone(a.telegramTelefone)}`
    : mascararEmail(a.email)
}

const numeroDoOficio = (o: { numero: number | null; ano: number | null }) =>
  o.numero != null ? `${o.numero}/${o.ano}` : "sem número"

function normalizar(linha: Record<string, unknown>, eventos: EventoAssinatura[] = []): Assinatura {
  return {
    id: String(linha.id),
    oficioId: String(linha.oficio_id),
    integranteId: texto(linha.integrante_id),
    nome: texto(linha.nome),
    cargo: texto(linha.cargo),
    email: texto(linha.email),
    canal: (texto(linha.canal) ?? "email") as CanalAssinatura,
    telegramChatId: texto(linha.telegram_chat_id),
    telegramTelefone: texto(linha.telegram_telefone),
    token: String(linha.token),
    certificado: texto(linha.certificado),
    situacao: (texto(linha.situacao) ?? "pendente") as SituacaoAssinatura,
    hashDocumento: texto(linha.hash_documento),
    enviadoEm: texto(linha.enviado_em),
    visualizadoEm: texto(linha.visualizado_em),
    assinadoEm: texto(linha.assinado_em),
    recusadoEm: texto(linha.recusado_em),
    motivoRecusa: texto(linha.motivo_recusa),
    ip: texto(linha.ip),
    userAgent: texto(linha.user_agent),
    rodada: texto(linha.rodada),
    ordem: Number(linha.ordem ?? 1),
    criadoEm: String(linha.created_at ?? ""),
    eventos,
  }
}

// ── rodadas (vários assinantes) ─────────────────────────────────────────────

/**
 * Envelopes do envio mais recente, na ordem do documento. Envelope sem rodada
 * (envio de um assinante só) é a sua própria rodada.
 */
export function rodadaAtual(lista: Assinatura[]): Assinatura[] {
  const ultima = [...lista].sort((a, b) => b.criadoEm.localeCompare(a.criadoEm))[0]
  if (!ultima) return []
  if (!ultima.rodada) return [ultima]
  return lista.filter((a) => a.rodada === ultima.rodada).sort((a, b) => a.ordem - b.ordem)
}

/** A rodada terminou sem emitir: alguém recusou ou o envio foi cancelado. */
export function rodadaEncerrada(rodada: Assinatura[]): boolean {
  return rodada.some((a) => a.situacao === "recusado" || a.situacao === "cancelado")
}

/** O que vale para o ofício: a rodada atual, se ela ainda está de pé. */
export function rodadaVigente(lista: Assinatura[]): Assinatura[] {
  const rodada = rodadaAtual(lista)
  return rodadaEncerrada(rodada) ? [] : rodada
}

/** Todos da rodada assinaram (o ofício foi emitido por ela). */
export function rodadaConcluida(rodada: Assinatura[]): boolean {
  return rodada.length > 0 && rodada.every((a) => a.situacao === "assinado")
}

async function envelopesDaRodada(a: Assinatura): Promise<Assinatura[]> {
  if (!a.rodada) return [a]
  const admin = await createAdminClient()
  const { data } = await admin
    .from("documento_assinaturas")
    .select("*")
    .eq("rodada", a.rodada)
    .eq("emp_proprietaria_id", await tenantAtual())
    .order("ordem", { ascending: true })
  const lista = data ?? []
  const eventos = await eventosDe(lista.map((x) => String(x.id)))
  return lista.map((x) => normalizar(x, eventos.get(String(x.id)) ?? []))
}

const listaDeNomes = (nomes: (string | null)[]) => {
  const n = nomes.map((x) => x ?? "assinante")
  return n.length <= 1 ? (n[0] ?? "") : `${n.slice(0, -1).join(", ")} e ${n[n.length - 1]}`
}

async function registrarEvento(
  assinatura: { id: string },
  tipo: string,
  extra: { detalhe?: string | null; ip?: string | null; userAgent?: string | null } = {}
): Promise<void> {
  const admin = await createAdminClient()
  await admin.from("documento_assinatura_eventos").insert({
    assinatura_id: assinatura.id,
    tipo,
    detalhe: extra.detalhe ?? null,
    ip: extra.ip ?? null,
    user_agent: extra.userAgent ?? null,
    emp_proprietaria_id: await tenantAtual(),
  })
}

async function eventosDe(ids: string[]): Promise<Map<string, EventoAssinatura[]>> {
  const mapa = new Map<string, EventoAssinatura[]>()
  if (ids.length === 0) return mapa
  const admin = await createAdminClient()
  const { data } = await admin
    .from("documento_assinatura_eventos")
    .select("assinatura_id, tipo, detalhe, ip, user_agent, created_at")
    .in("assinatura_id", ids)
    .order("created_at", { ascending: true })
  for (const e of data ?? []) {
    const lista = mapa.get(String(e.assinatura_id)) ?? []
    lista.push({
      tipo: String(e.tipo),
      detalhe: texto(e.detalhe),
      ip: texto(e.ip),
      userAgent: texto(e.user_agent),
      quando: String(e.created_at),
    })
    mapa.set(String(e.assinatura_id), lista)
  }
  return mapa
}

// ── leitura (painel) ────────────────────────────────────────────────────────

/** Envelopes do ofício, mais recente primeiro, com a trilha. Vazio sem o SQL. */
export async function assinaturasDoOficio(oficioId: string): Promise<Assinatura[]> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("documento_assinaturas")
    .select("*")
    .eq("oficio_id", oficioId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .order("created_at", { ascending: false })
  if (error || !data) return []
  const eventos = await eventosDe(data.map((a) => String(a.id)))
  return data.map((a) => normalizar(a, eventos.get(String(a.id)) ?? []))
}

/**
 * E-mail sugerido para o assinante: o que já foi usado nele, o do usuário do
 * painel ligado ao integrante, o do usuário com o mesmo CPF ou o da filiação.
 */
export async function emailSugeridoDoIntegrante(integranteId: string | null): Promise<string | null> {
  if (!integranteId) return null
  const admin = await createAdminClient()
  const { data: i } = await admin
    .from("diretoria_integrantes")
    .select("*")
    .eq("id", integranteId)
    .maybeSingle()
  if (!i) return null
  if (texto(i.email)) return texto(i.email)
  const emp = await tenantAtual()
  if (texto(i.usuario_id)) {
    const { data: u } = await admin.from("usuarios").select("email").eq("id", i.usuario_id).maybeSingle()
    if (texto(u?.email)) return texto(u?.email)
  }
  const cpf = cpfConfiavel(i.cpf as string | null)
  if (cpf) {
    const { data: u } = await admin.from("usuarios").select("email").eq("cpf", cpf).eq("emp_proprietaria_id", emp).limit(1).maybeSingle()
    if (texto(u?.email)) return texto(u?.email)
  }
  if (texto(i.filiacao_id)) {
    const { data: f } = await admin
      .from("filiacoes")
      .select("email_pessoal, email_corporativo")
      .eq("id", i.filiacao_id)
      .maybeSingle()
    return texto(f?.email_pessoal) ?? texto(f?.email_corporativo)
  }
  return null
}

// ── envio (painel) ──────────────────────────────────────────────────────────

async function linkAssinatura(token: string): Promise<string> {
  return `${await origemAtual()}/assinar/${token}`
}

async function nomeRemetente(): Promise<string> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("empresa")
    .select("nome_fantasia, nome_razao")
    .eq("id", await tenantAtual())
    .maybeSingle()
  return texto(data?.nome_fantasia) ?? texto(data?.nome_razao) ?? "a entidade"
}

/**
 * Telegram do integrante: o bot só entrega a quem vinculou a conta E confirmou
 * o telefone (mesma régua do push do painel — ver lib/db/telegram.ts).
 */
export async function telegramDoIntegrante(
  integranteId: string | null
): Promise<{ disponivel: boolean; chatId: string | null; telefone: string | null }> {
  const vazio = { disponivel: false, chatId: null, telefone: null }
  if (!integranteId) return vazio
  const admin = await createAdminClient()
  const { data: i } = await admin
    .from("diretoria_integrantes")
    .select("usuario_id, cpf")
    .eq("id", integranteId)
    .maybeSingle()
  if (!i) return vazio
  const emp = await tenantAtual()
  const cpf = cpfConfiavel(i.cpf as string | null)
  const busca = admin.from("usuarios").select("telegram_chat_id, telegram_telefone")
  const { data: u } = texto(i.usuario_id)
    ? await busca.eq("id", i.usuario_id).maybeSingle()
    : cpf
      ? await busca.eq("cpf", cpf).eq("emp_proprietaria_id", emp).limit(1).maybeSingle()
      : { data: null }
  const chatId = texto(u?.telegram_chat_id)
  const telefone = texto(u?.telegram_telefone)
  return { disponivel: Boolean(chatId && telefone), chatId, telefone }
}

/** Os outros assinantes do ofício, para o convite dizer com quem se assina. */
function tambemAssinam(a: Assinatura, oficio: DetalheOficio): string | null {
  const outros = assinantesDoOficio(oficio).filter((x) => x.integranteId !== a.integranteId)
  return outros.length ? listaDeNomes(outros.map((x) => x.nome)) : null
}

async function enviarConviteTelegram(
  a: Assinatura,
  oficio: DetalheOficio,
  reenvio: boolean
): Promise<boolean> {
  if (!a.telegramChatId) return false
  const link = await linkAssinatura(a.token)
  const remetente = await nomeRemetente()
  const outros = tambemAssinam(a, oficio)
  return enviarTelegram({
    chatId: a.telegramChatId,
    formato: null,
    texto: [
      reenvio ? `Lembrete: o Ofício ${numeroDoOficio(oficio)} aguarda sua assinatura.` : `${remetente} enviou o Ofício ${numeroDoOficio(oficio)} para a sua assinatura eletrônica.`,
      ``,
      `Assunto: ${oficio.assunto ?? "—"}`,
      `Para: ${oficio.destinatarioNome ?? oficio.destinatarioTexto ?? "—"}`,
      ...(outros ? [`Também assinam: ${outros}`] : []),
      ``,
      `Revisar e assinar: ${link}`,
      ``,
      `Você lê o documento completo antes de decidir. Para assinar, mando aqui mesmo um código de uso único. Se algo estiver errado, pode recusar e dizer o motivo.`,
    ].join("\n"),
  })
}

async function enviarConvite(a: Assinatura, oficio: DetalheOficio, reenvio: boolean): Promise<boolean> {
  if (a.canal === "telegram") return enviarConviteTelegram(a, oficio, reenvio)
  if (!a.email) return false
  const link = await linkAssinatura(a.token)
  const remetente = await nomeRemetente()
  const outros = tambemAssinam(a, oficio)
  return enviarEmail({
    email: a.email,
    nome: a.nome,
    assunto: `${reenvio ? "Lembrete: o" : "O"}fício ${numeroDoOficio(oficio)} aguarda sua assinatura`,
    html:
      paragrafo(`Olá, ${escaparHtml(a.nome ?? "")}.`) +
      paragrafo(
        `${escaparHtml(remetente)} enviou o <strong>Ofício ${escaparHtml(numeroDoOficio(oficio))}</strong> para a sua assinatura eletrônica.`
      ) +
      caixaAviso(
        `<strong>Assunto:</strong> ${escaparHtml(oficio.assunto ?? "—")}<br><strong>Para:</strong> ${escaparHtml(oficio.destinatarioNome ?? oficio.destinatarioTexto ?? "—")}` +
          (outros ? `<br><strong>Também assinam:</strong> ${escaparHtml(outros)}` : "")
      ) +
      botaoEmail(link, "Revisar e assinar") +
      linkReserva(link) +
      textoSuave(
        "Ao abrir, você lê o documento completo antes de decidir. Para assinar, enviamos um código de uso único para este e-mail. Se algo estiver errado, você pode recusar e informar o motivo."
      ),
  })
}

/** Por onde vai o convite de cada assinante. */
export type DestinoEnvio = {
  integranteId: string
  canal: CanalAssinatura
  email: string
}

/**
 * Rascunho → "Aguardando assinatura": numera, congela o conteúdo e manda um
 * convite a cada assinante, todos ao mesmo tempo e na mesma rodada.
 */
export async function enviarParaAssinatura(dados: {
  oficioId: string
  destinos: DestinoEnvio[]
  numeroManual: number | null
  usuarioId: string
}): Promise<{ erro?: string; numero?: number; ano?: number; entregues?: string[]; naoEntregues?: string[] }> {
  const preparo = await prepararEmissao(dados.oficioId)
  if ("erro" in preparo) return preparo

  // Cada assinante do ofício precisa de um destino válido, antes de numerar.
  const porId = new Map(dados.destinos.map((d) => [d.integranteId, d]))
  const envios: {
    assinante: (typeof preparo.assinantes)[number]
    canal: CanalAssinatura
    email: string | null
    telegram: { chatId: string | null; telefone: string | null }
  }[] = []
  for (const assinante of preparo.assinantes) {
    const destino = porId.get(assinante.integranteId)
    const nome = assinante.nome ?? "o assinante"
    if (!destino) return { erro: `Informe para onde vai o convite de ${nome}.` }
    const email = destino.email.trim().toLowerCase()
    if (destino.canal === "telegram") {
      const telegram = await telegramDoIntegrante(assinante.integranteId)
      if (!telegram.disponivel) {
        return {
          erro: `${nome} não tem o Telegram vinculado e confirmado — peça em Meu perfil › Telegram, ou envie por e-mail.`,
        }
      }
      envios.push({ assinante, canal: "telegram", email: EMAIL.test(email) ? email : null, telegram })
    } else {
      if (!EMAIL.test(email)) return { erro: `Informe um e-mail válido para ${nome}.` }
      envios.push({ assinante, canal: "email", email, telegram: { chatId: null, telefone: null } })
    }
  }

  const numerado = await numerarOficio(dados.oficioId, preparo, dados.numeroManual, {
    situacao: "Aguardando assinatura",
    enviado_por_id: dados.usuarioId,
  })
  if (numerado.erro) return numerado

  const admin = await createAdminClient()
  const oficio = await obterOficio(dados.oficioId)
  if (!oficio) return { erro: "Ofício não encontrado depois da numeração." }

  // O e-mail usado fica no integrante para o próximo envio.
  for (const e of envios) {
    if (e.email) await admin.from("diretoria_integrantes").update({ email: e.email }).eq("id", e.assinante.integranteId)
  }

  const agora = new Date().toISOString()
  const hash = hashDoConteudo(oficio)
  const emp = await tenantAtual()
  // Rodada só com mais de um assinante: o envio de um só segue como antes.
  const rodada = envios.length > 1 ? randomUUID() : null
  let criadas: Record<string, unknown>[] | null = null
  for (let tentativa = 0; tentativa < 3 && !criadas; tentativa++) {
    // Um insert só: ou entram todos os envelopes, ou nenhum.
    const { data, error } = await admin
      .from("documento_assinaturas")
      .insert(
        envios.map((e, i) => ({
          // O envelope serve a mais de um documento desde 24/09/2026; o par
          // (tipo, id) é o vínculo novo, e `oficio_id` segue para o cascade.
          documento_tipo: "oficio",
          documento_id: dados.oficioId,
          oficio_id: dados.oficioId,
          integrante_id: e.assinante.integranteId,
          nome: e.assinante.nome,
          cargo: e.assinante.cargo,
          email: e.email,
          canal: e.canal,
          telegram_chat_id: e.telegram.chatId,
          telegram_telefone: e.telegram.telefone,
          certificado: novoCertificado(),
          situacao: "pendente",
          hash_documento: hash,
          enviado_em: agora,
          enviado_por_id: dados.usuarioId,
          ordem: i + 1,
          ...(rodada ? { rodada } : {}),
          emp_proprietaria_id: emp,
        }))
      )
      .select("*")
    if (!error) criadas = data ?? []
    else if (error.code !== "23505") {
      // Sem os envelopes o ofício não pode ficar travado: volta ao rascunho.
      await admin.from("oficios").update({ situacao: "Rascunho" }).eq("id", dados.oficioId)
      return { erro: `Falha ao criar a assinatura: ${error.message}` }
    }
  }
  if (!criadas?.length) {
    await admin.from("oficios").update({ situacao: "Rascunho" }).eq("id", dados.oficioId)
    return { erro: "Não foi possível gerar o certificado. Tente novamente." }
  }

  const entregues: string[] = []
  const naoEntregues: string[] = []
  for (const linha of criadas.sort((a, b) => Number(a.ordem) - Number(b.ordem))) {
    const assinatura = normalizar(linha)
    const destino = destinoDaAssinatura(assinatura)
    await registrarEvento(assinatura, "enviado", { detalhe: `Para ${destino}` })
    const ok = await enviarConvite(assinatura, oficio, false)
    ;(ok ? entregues : naoEntregues).push(`${assinatura.nome ?? "assinante"} (${destino})`)
  }
  return { numero: numerado.numero, ano: numerado.ano, entregues, naoEntregues }
}

/** Envelopes pendentes do envio atual. */
async function pendentesDoOficio(oficioId: string): Promise<Assinatura[]> {
  return rodadaAtual(await assinaturasDoOficio(oficioId)).filter((a) => a.situacao === "pendente")
}

/** Reenvia o convite a um assinante pendente, ou a todos os pendentes. */
export async function reenviarConvite(
  oficioId: string,
  assinaturaId?: string | null
): Promise<{ erro?: string; entregues?: string[]; naoEntregues?: string[] }> {
  const [pendentes, oficio] = await Promise.all([pendentesDoOficio(oficioId), obterOficio(oficioId)])
  const alvo = assinaturaId ? pendentes.filter((a) => a.id === assinaturaId) : pendentes
  if (!alvo.length || !oficio) return { erro: "Não há assinatura pendente neste ofício." }
  const entregues: string[] = []
  const naoEntregues: string[] = []
  for (const a of alvo) {
    const destino = destinoDaAssinatura(a)
    await registrarEvento(a, "reenviado", { detalhe: `Para ${destino}` })
    ;((await enviarConvite(a, oficio, true)) ? entregues : naoEntregues).push(`${a.nome ?? "assinante"} (${destino})`)
  }
  return { entregues, naoEntregues }
}

/** Cancela os convites que faltam numa rodada (recusa ou cancelamento do envio). */
async function cancelarPendentes(pendentes: Assinatura[], detalhe: string | null): Promise<void> {
  const admin = await createAdminClient()
  const agora = new Date().toISOString()
  for (const a of pendentes) {
    const { data } = await admin
      .from("documento_assinaturas")
      .update({ situacao: "cancelado", codigo_hash: null, updated_at: agora })
      .eq("id", a.id)
      .eq("situacao", "pendente")
      .select("id")
    if (data?.length) await registrarEvento(a, "cancelado", { detalhe })
  }
}

/** Cancela o envio: os links deixam de valer e o ofício volta ao rascunho com o número. */
export async function cancelarEnvio(oficioId: string, motivo: string | null): Promise<{ erro?: string }> {
  const pendentes = await pendentesDoOficio(oficioId)
  if (!pendentes.length) return { erro: "Não há assinatura pendente neste ofício." }
  const admin = await createAdminClient()
  const agora = new Date().toISOString()
  await cancelarPendentes(pendentes, motivo)
  await admin
    .from("oficios")
    .update({ situacao: "Rascunho", updated_at: agora })
    .eq("id", oficioId)
    .eq("situacao", "Aguardando assinatura")
  return {}
}

// ── cancelamento do ofício (painel) ─────────────────────────────────────────

/**
 * Reflexo do cancelamento do ofício (lib/db/oficios.ts → cancelarOficio) na
 * assinatura eletrônica. NADA do que foi assinado é alterado:
 *  • envelope PENDENTE: o link deixa de valer (situação "cancelado") e a
 *    trilha ganha o evento "cancelado" com o motivo;
 *  • envelope ASSINADO: continua "assinado", com o mesmo hash, certificado e
 *    PDF no bucket. A trilha (append-only) ganha o evento novo
 *    "documento_cancelado" — quem, quando e por quê — e o assinante e quem
 *    enviou são avisados. A página /verificar passa a mostrar o cancelamento.
 */
export async function registrarCancelamentoNaAssinatura(dados: {
  oficioId: string
  motivo: string
  usuarioId: string
  usuarioNome: string | null
}): Promise<{ assinado: boolean }> {
  const lista = await assinaturasDoOficio(dados.oficioId)
  const admin = await createAdminClient()
  const agora = new Date().toISOString()
  const quem = dados.usuarioNome ? ` (por ${dados.usuarioNome})` : ""

  for (const a of lista.filter((x) => x.situacao === "pendente")) {
    const { data: gravada } = await admin
      .from("documento_assinaturas")
      .update({ situacao: "cancelado", codigo_hash: null, updated_at: agora })
      .eq("id", a.id)
      .eq("situacao", "pendente")
      .select("id")
    if (gravada?.length) {
      await registrarEvento(a, "cancelado", { detalhe: `Ofício cancelado: ${dados.motivo}${quem}` })
    }
  }

  // Relido: se o assinante assinou no mesmo instante, o envelope é "assinado".
  // Só o envio atual: assinatura de uma rodada que já tinha sido recusada não
  // chegou a valer para o ofício.
  const assinadas = rodadaAtual(await assinaturasDoOficio(dados.oficioId)).filter((a) => a.situacao === "assinado")
  if (assinadas.length === 0) return { assinado: false }
  const oficio = await obterOficio(dados.oficioId)
  for (const a of assinadas) {
    await registrarEvento(a, "documento_cancelado", { detalhe: `${dados.motivo}${quem}` })
    if (oficio) {
      await avisarCancelamento(a, oficio, dados.motivo, dados.usuarioId).catch(() => undefined)
    }
  }
  return { assinado: true }
}

/** Avisa o assinante (canal do envelope) e quem enviou (notificação + e-mail). */
async function avisarCancelamento(
  a: Assinatura,
  oficio: DetalheOficio,
  motivo: string,
  canceladoPorId: string
): Promise<void> {
  const admin = await createAdminClient()
  const numero = numeroDoOficio(oficio)
  const remetente = await nomeRemetente()
  const verificar = a.certificado ? await urlVerificacao(a.certificado) : null
  const quando = formatarMomento(new Date().toISOString())

  if (a.canal === "telegram" && a.telegramChatId) {
    await enviarTelegram({
      chatId: a.telegramChatId,
      formato: null,
      texto: [
        `${remetente} cancelou o Ofício ${numero}, que você assinou eletronicamente.`,
        `Motivo: ${motivo}`,
        ``,
        `Sua assinatura continua registrada e autêntica — o que muda é que o ofício não está mais em vigor.`,
        verificar ? `Página de verificação: ${verificar}` : ``,
      ].join("\n").trim(),
    }).catch(() => false)
  } else if (a.email) {
    await enviarEmail({
      email: a.email,
      nome: a.nome,
      assunto: `Ofício ${numero} cancelado`,
      html:
        paragrafo(
          `${escaparHtml(remetente)} cancelou em ${escaparHtml(quando)} o <strong>Ofício ${escaparHtml(numero)}</strong>, que você assinou eletronicamente.`
        ) +
        caixaAviso(`<strong>Motivo:</strong> ${escaparHtml(motivo)}`) +
        paragrafo(
          "A sua assinatura continua registrada e autêntica — o que muda é que o ofício não está mais em vigor. A página de verificação do certificado passa a mostrar o cancelamento."
        ) +
        (verificar ? botaoEmail(verificar, "Ver a página de verificação") : ""),
    }).catch(() => false)
  }

  const { data: o } = await admin.from("oficios").select("enviado_por_id").eq("id", oficio.id).maybeSingle()
  const remetenteId = texto(o?.enviado_por_id)
  // Quem cancelou já sabe; o aviso vai a quem enviou, quando é outra pessoa.
  if (!remetenteId || remetenteId === canceladoPorId) return
  await criarNotificacao({
    usuarioId: remetenteId,
    texto: `Ofício ${numero} (assinado por ${a.nome ?? "assinante"}) foi cancelado — ${motivo}`,
  }).catch(() => undefined)
  const { data: u } = await admin.from("usuarios").select("email, nome_completo").eq("id", remetenteId).maybeSingle()
  if (!texto(u?.email)) return
  const link = `${await origemAtual()}/painel/ferramentas/oficios/${oficio.id}`
  await enviarEmail({
    email: String(u?.email),
    nome: texto(u?.nome_completo),
    assunto: `Ofício ${numero} cancelado`,
    html:
      paragrafo(
        `O <strong>Ofício ${escaparHtml(numero)}</strong>, que você enviou e ${escaparHtml(a.nome ?? "o assinante")} assinou, foi cancelado em ${escaparHtml(quando)}.`
      ) +
      caixaAviso(`<strong>Motivo:</strong> ${escaparHtml(motivo)}`) +
      botaoEmail(link, "Abrir o ofício"),
  }).catch(() => false)
}

// ── lado público (/assinar/<token>) ─────────────────────────────────────────

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type Envelope = {
  assinatura: Assinatura
  /** Todos os envelopes do mesmo envio, na ordem do documento (inclui este). */
  rodada: Assinatura[]
  oficio: DetalheOficio
  remetente: string
}

export async function envelopePorToken(token: string): Promise<Envelope | null> {
  if (!UUID.test(token)) return null
  const admin = await createAdminClient()
  const { data } = await admin
    .from("documento_assinaturas")
    .select("*")
    .eq("token", token)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (!data) return null
  const [eventos, oficio, remetente] = await Promise.all([
    eventosDe([String(data.id)]),
    obterOficio(String(data.oficio_id)),
    nomeRemetente(),
  ])
  if (!oficio) return null
  const assinatura = normalizar(data, eventos.get(String(data.id)) ?? [])
  return { assinatura, rodada: await envelopesDaRodada(assinatura), oficio, remetente }
}

/** Abertura do link pelo assinante (uma marca a cada 10 min, para não inflar a trilha). */
export async function registrarAbertura(
  envelope: Envelope,
  contexto: { ip: string | null; userAgent: string | null }
): Promise<void> {
  const a = envelope.assinatura
  if (a.situacao !== "pendente") return
  const ultima = [...a.eventos].reverse().find((e) => e.tipo === "visualizado")
  if (ultima && Date.now() - new Date(ultima.quando).getTime() < 10 * 60 * 1000) return
  const admin = await createAdminClient()
  if (!a.visualizadoEm) {
    await admin.from("documento_assinaturas").update({ visualizado_em: new Date().toISOString() }).eq("id", a.id)
  }
  await registrarEvento(a, "visualizado", contexto)
}

export async function solicitarCodigo(
  token: string,
  contexto: { ip: string | null; userAgent: string | null }
): Promise<{ erro?: string; email?: string }> {
  const envelope = await envelopePorToken(token)
  if (!envelope) return { erro: "Link de assinatura inválido." }
  const a = envelope.assinatura
  if (a.situacao !== "pendente") return { erro: "Este ofício não está mais aguardando assinatura." }
  if (a.canal === "telegram" ? !a.telegramChatId : !a.email) {
    return { erro: "O envio não tem para onde mandar o código. Peça um novo envio." }
  }

  const ultimo = [...a.eventos].reverse().find((e) => e.tipo === "codigo_enviado")
  if (ultimo && Date.now() - new Date(ultimo.quando).getTime() < INTERVALO_REENVIO_CODIGO_S * 1000) {
    return { erro: "Um código acabou de ser enviado. Aguarde um minuto antes de pedir outro." }
  }

  const codigo = String(randomInt(0, 1_000_000)).padStart(6, "0")
  const admin = await createAdminClient()
  const { error } = await admin
    .from("documento_assinaturas")
    .update({
      codigo_hash: hashCodigo(codigo, a.token),
      codigo_expira_em: new Date(Date.now() + VALIDADE_CODIGO_MIN * 60 * 1000).toISOString(),
      codigo_tentativas: 0,
      updated_at: new Date().toISOString(),
    })
    .eq("id", a.id)
    .eq("situacao", "pendente")
  if (error) return { erro: "Não foi possível gerar o código. Tente novamente." }

  const enviado =
    a.canal === "telegram"
      ? await enviarTelegram({
          chatId: a.telegramChatId!,
          formato: null,
          texto: [
            `Código para assinar o Ofício ${numeroDoOficio(envelope.oficio)}: ${codigo}`,
            ``,
            `Vale por ${VALIDADE_CODIGO_MIN} minutos e só serve para este documento. Se você não pediu, ignore — sem o código ninguém assina em seu nome.`,
          ].join("\n"),
        })
      : await enviarEmail({
          email: a.email!,
          nome: a.nome,
          assunto: `Código para assinar o Ofício ${numeroDoOficio(envelope.oficio)}`,
          html:
            paragrafo(`Use o código abaixo para assinar o <strong>Ofício ${escaparHtml(numeroDoOficio(envelope.oficio))}</strong>.`) +
            caixaCodigo(codigo) +
            textoSuave(
              `O código vale por ${VALIDADE_CODIGO_MIN} minutos e só serve para este documento. Se você não pediu, ignore este e-mail — sem o código ninguém assina em seu nome.`
            ),
        })
  const destino = destinoDaAssinatura(a)
  if (!enviado) {
    if (process.env.NODE_ENV !== "production") console.info(`[assinatura ${a.id}] código ${codigo}`)
    else {
      return {
        erro:
          a.canal === "telegram"
            ? "Não foi possível enviar o código pelo Telegram. Tente novamente em instantes."
            : "Não foi possível enviar o código por e-mail. Tente novamente em instantes.",
      }
    }
  }
  await registrarEvento(a, "codigo_enviado", { detalhe: `Para ${destino}`, ...contexto })
  return { email: destino }
}

export async function assinar(
  token: string,
  entrada: { codigo: string; aceite: boolean },
  contexto: { ip: string | null; userAgent: string | null }
): Promise<{ erro?: string }> {
  if (!entrada.aceite) return { erro: "Confirme que leu o documento e concorda em assiná-lo eletronicamente." }
  const envelope = await envelopePorToken(token)
  if (!envelope) return { erro: "Link de assinatura inválido." }
  const a = envelope.assinatura
  if (a.situacao !== "pendente") return { erro: "Este ofício não está mais aguardando assinatura." }

  const admin = await createAdminClient()
  const { data: segredo } = await admin
    .from("documento_assinaturas")
    .select("codigo_hash, codigo_expira_em, codigo_tentativas")
    .eq("id", a.id)
    .single()
  const codigo = entrada.codigo.replace(/\D/g, "")
  if (!segredo?.codigo_hash) return { erro: "Peça o código de assinatura primeiro." }
  if ((segredo.codigo_tentativas ?? 0) >= MAX_TENTATIVAS) {
    return { erro: "Muitas tentativas com código errado. Peça um novo código." }
  }
  if (!segredo.codigo_expira_em || new Date(segredo.codigo_expira_em).getTime() < Date.now()) {
    return { erro: "O código expirou. Peça um novo." }
  }
  if (codigo.length !== 6 || !conferirCodigo(codigo, a.token, String(segredo.codigo_hash))) {
    await admin
      .from("documento_assinaturas")
      .update({ codigo_tentativas: (segredo.codigo_tentativas ?? 0) + 1 })
      .eq("id", a.id)
    await registrarEvento(a, "codigo_invalido", contexto)
    return { erro: "Código incorreto. Confira o e-mail e tente de novo." }
  }

  // O que foi lido é o que se assina: conteúdo tem de bater com o do envio.
  if (hashDoConteudo(envelope.oficio) !== a.hashDocumento) {
    return { erro: "O conteúdo do ofício mudou depois do envio. Peça ao remetente um novo envio." }
  }

  const assinadoEm = new Date().toISOString()
  const { data: gravada, error } = await admin
    .from("documento_assinaturas")
    .update({
      situacao: "assinado",
      assinado_em: assinadoEm,
      ip: contexto.ip,
      user_agent: contexto.userAgent,
      codigo_hash: null,
      updated_at: assinadoEm,
    })
    .eq("id", a.id)
    .eq("situacao", "pendente")
    .select("id")
  if (error || !gravada?.length) return { erro: "Não foi possível registrar a assinatura. Tente novamente." }

  await registrarEvento(a, "assinado", { detalhe: `Aceite dos termos e código de uso único conferido`, ...contexto })

  // Com vários assinantes, o ofício só é emitido quando o último assina.
  const rodada = await envelopesDaRodada({ ...a, situacao: "assinado", assinadoEm })
  const faltam = rodada.filter((x) => x.situacao === "pendente")
  if (faltam.length > 0 || !rodadaConcluida(rodada)) {
    await avisarAssinaturaParcial(envelope, faltam).catch(() => undefined)
    return {}
  }
  // Dois assinando no mesmo instante: só quem tirou o ofício de "Aguardando"
  // gera o PDF e manda os avisos.
  const { data: emitido } = await admin
    .from("oficios")
    .update({ situacao: "Emitido", emitido_em: assinadoEm, updated_at: assinadoEm })
    .eq("id", a.oficioId)
    .eq("situacao", "Aguardando assinatura")
    .select("id")
  if (!emitido?.length) return {}

  // O PDF final e os avisos não podem desfazer a assinatura se falharem.
  const arquivo = await guardarPdfAssinado(a.oficioId).catch(() => null)
  await avisarConclusao({ ...envelope, rodada }, "assinado", null, arquivo !== null).catch(() => undefined)
  return {}
}

/** Um assinou e ainda faltam outros: confirma a quem assinou e avisa quem enviou. */
async function avisarAssinaturaParcial(envelope: Envelope, faltam: Assinatura[]): Promise<void> {
  const { assinatura: a, oficio } = envelope
  const admin = await createAdminClient()
  const origem = await origemAtual()
  const numero = numeroDoOficio(oficio)
  const pendentes = listaDeNomes(faltam.map((x) => x.nome))
  const falta = faltam.length ? `Falta${faltam.length > 1 ? "m" : ""} ${pendentes}.` : ""

  if (a.canal === "telegram" && a.telegramChatId) {
    await enviarTelegram({
      chatId: a.telegramChatId,
      formato: null,
      texto: [
        `Sua assinatura eletrônica no Ofício ${numero} foi registrada.`,
        `Certificado: ${a.certificado ?? "—"}`,
        ``,
        `O ofício é emitido quando todos assinarem. ${falta}`.trim(),
      ].join("\n"),
    }).catch(() => false)
  } else if (a.email) {
    await enviarEmail({
      email: a.email,
      nome: a.nome,
      assunto: `Você assinou o Ofício ${numero}`,
      html:
        paragrafo(`A sua assinatura eletrônica no <strong>Ofício ${escaparHtml(numero)}</strong> foi registrada.`) +
        caixaAviso(`<strong>Certificado:</strong> ${escaparHtml(a.certificado ?? "—")}`) +
        paragrafo(`O ofício é emitido quando todos assinarem. ${escaparHtml(falta)}`) +
        botaoEmail(`${origem}/assinar/${a.token}`, "Ver o documento"),
    }).catch(() => false)
  }

  const { data: o } = await admin.from("oficios").select("enviado_por_id").eq("id", oficio.id).maybeSingle()
  const remetenteId = texto(o?.enviado_por_id)
  if (!remetenteId) return
  await criarNotificacao({
    usuarioId: remetenteId,
    texto: `Ofício ${numero}: ${a.nome ?? "um assinante"} assinou. ${falta}`.trim(),
  }).catch(() => undefined)
}

export async function recusar(
  token: string,
  motivo: string,
  contexto: { ip: string | null; userAgent: string | null }
): Promise<{ erro?: string }> {
  const razao = motivo.trim()
  if (razao.length < 5) return { erro: "Conte em poucas palavras o motivo da recusa." }
  const envelope = await envelopePorToken(token)
  if (!envelope) return { erro: "Link de assinatura inválido." }
  const a = envelope.assinatura
  if (a.situacao !== "pendente") return { erro: "Este ofício não está mais aguardando assinatura." }

  const admin = await createAdminClient()
  const agora = new Date().toISOString()
  const { data: gravada } = await admin
    .from("documento_assinaturas")
    .update({
      situacao: "recusado",
      recusado_em: agora,
      motivo_recusa: razao,
      ip: contexto.ip,
      user_agent: contexto.userAgent,
      codigo_hash: null,
      updated_at: agora,
    })
    .eq("id", a.id)
    .eq("situacao", "pendente")
    .select("id")
  if (!gravada?.length) return { erro: "Não foi possível registrar a recusa. Tente novamente." }
  await registrarEvento(a, "recusado", { detalhe: razao, ...contexto })
  // Uma recusa encerra o envio: os outros convites deixam de valer.
  await cancelarPendentes(
    envelope.rodada.filter((x) => x.id !== a.id && x.situacao === "pendente"),
    `${a.nome ?? "Outro assinante"} recusou a assinatura`
  )
  await admin
    .from("oficios")
    .update({ situacao: "Rascunho", updated_at: agora })
    .eq("id", a.oficioId)
    .eq("situacao", "Aguardando assinatura")
  await avisarConclusao(envelope, "recusado", razao, false).catch(() => undefined)
  return {}
}

async function avisarConclusao(
  envelope: Envelope,
  resultado: "assinado" | "recusado",
  motivo: string | null,
  temPdf: boolean
): Promise<void> {
  const { assinatura: a, oficio } = envelope
  const admin = await createAdminClient()
  const origem = await origemAtual()
  const numero = numeroDoOficio(oficio)
  const varios = envelope.rodada.length > 1
  const todos = listaDeNomes(envelope.rodada.map((x) => x.nome))

  if (resultado === "assinado" && a.canal === "telegram" && a.telegramChatId) {
    await enviarTelegram({
      chatId: a.telegramChatId,
      formato: null,
      texto: [
        `Sua assinatura eletrônica no Ofício ${numero} foi registrada.`,
        `Certificado: ${a.certificado ?? "—"}`,
        ``,
        temPdf ? `Baixar o documento assinado: ${origem}/assinar/${a.token}` : `Ver o documento: ${origem}/assinar/${a.token}`,
      ].join("\n"),
    })
  } else if (resultado === "assinado" && a.email) {
    await enviarEmail({
      email: a.email,
      nome: a.nome,
      assunto: `Você assinou o Ofício ${numero}`,
      html:
        paragrafo(`A sua assinatura eletrônica no <strong>Ofício ${escaparHtml(numero)}</strong> foi registrada.`) +
        caixaAviso(`<strong>Certificado:</strong> ${escaparHtml(a.certificado ?? "—")}`) +
        botaoEmail(`${origem}/assinar/${a.token}`, temPdf ? "Baixar o documento assinado" : "Ver o documento") +
        textoSuave("Guarde este e-mail. O QR Code do documento leva à página de verificação do certificado."),
    })
  }

  const { data: o } = await admin.from("oficios").select("enviado_por_id").eq("id", oficio.id).maybeSingle()
  const remetenteId = texto(o?.enviado_por_id)
  if (!remetenteId) return
  const textoAviso =
    resultado === "assinado"
      ? `Ofício ${numero} assinado por ${varios ? todos : (a.nome ?? "assinante")} e emitido.`
      : `Ofício ${numero}: ${a.nome ?? "o assinante"} recusou a assinatura — ${motivo}`
  await criarNotificacao({ usuarioId: remetenteId, texto: textoAviso }).catch(() => undefined)
  const { data: u } = await admin.from("usuarios").select("email, nome_completo").eq("id", remetenteId).maybeSingle()
  if (!texto(u?.email)) return
  const link = `${origem}/painel/ferramentas/oficios/${oficio.id}`
  await enviarEmail({
    email: String(u?.email),
    nome: texto(u?.nome_completo),
    assunto: resultado === "assinado" ? `Ofício ${numero} assinado e emitido` : `Ofício ${numero}: assinatura recusada`,
    html:
      paragrafo(
        resultado === "assinado"
          ? varios
            ? `O Ofício ${escaparHtml(numero)} foi assinado por todos — ${escaparHtml(todos)} — e está emitido. A última assinatura foi em ${escaparHtml(formatarMomento(new Date().toISOString()))}.`
            : `<strong>${escaparHtml(a.nome ?? "O assinante")}</strong> assinou o Ofício ${escaparHtml(numero)} em ${escaparHtml(formatarMomento(new Date().toISOString()))}. O ofício está emitido.`
          : `<strong>${escaparHtml(a.nome ?? "O assinante")}</strong> recusou a assinatura do Ofício ${escaparHtml(numero)}. O ofício voltou ao rascunho, com o número reservado${varios ? ", e os convites que faltavam deixaram de valer" : ""}.`
      ) +
      (motivo ? caixaAviso(`<strong>Motivo:</strong> ${escaparHtml(motivo)}`) : "") +
      botaoEmail(link, "Abrir o ofício"),
  })
}

// ── PDF assinado e verificação ──────────────────────────────────────────────

export async function urlVerificacao(certificado: string): Promise<string> {
  return `${await origemAtual()}/verificar/${certificado}`
}

/** Dados de assinatura para o PDF (carimbo, QR e página de certificado). */
export async function assinaturaParaPdf(a: Assinatura): Promise<AssinaturaPDF> {
  const url = a.certificado ? await urlVerificacao(a.certificado) : ""
  const qrDataUri = url
    ? await QRCode.toDataURL(url, { margin: 0, width: 240, errorCorrectionLevel: "M" })
    : null
  return {
    integranteId: a.integranteId,
    situacao: a.situacao,
    nome: a.nome,
    cargo: a.cargo,
    destino: destinoDaAssinatura(a),
    autenticacao:
      a.canal === "telegram"
        ? "Link individual enviado ao Telegram do assinante + código de uso único no Telegram"
        : "Link individual por e-mail + código de uso único enviado ao e-mail",
    certificado: a.certificado,
    hash: a.hashDocumento,
    assinadoEm: a.assinadoEm ? formatarMomento(a.assinadoEm) : null,
    ip: a.ip,
    navegador: a.userAgent,
    urlVerificacao: url,
    qrDataUri,
    trilha: a.eventos
      .filter((e) => e.tipo !== "codigo_invalido")
      .map((e) => ({
        quando: formatarMomento(e.quando),
        evento: ROTULO_EVENTO[e.tipo] ?? e.tipo,
        detalhe:
          e.tipo === "enviado" || e.tipo === "reenviado" || e.tipo === "codigo_enviado"
            ? `Para ${destinoDaAssinatura(a)}`
            : e.detalhe,
        ip: e.ip,
      })),
  }
}

/** Baixa o logo (png/jpg) como data URI; ignora SVG e falhas de rede. */
export async function logoDataUri(url: string | null): Promise<string | null> {
  if (!url) return null
  try {
    const r = await fetch(url)
    if (!r.ok) return null
    const tipo = r.headers.get("content-type") ?? ""
    if (!/image\/(png|jpe?g)/.test(tipo)) return null
    const buf = Buffer.from(await r.arrayBuffer())
    return `data:${tipo};base64,${buf.toString("base64")}`
  } catch {
    return null
  }
}

/**
 * PDF do ofício com o estado de assinatura de cada assinante: pendente mostra
 * "Aguardando assinatura eletrônica"; assinado leva o carimbo; com todos
 * assinados, o QR e a página de certificado. `assinaturas` é a rodada (ver
 * rodadaVigente); recusada ou cancelada não aparece.
 */
export async function renderizarPdfOficio(
  dados: DadosImpressao,
  assinaturas: Assinatura[],
  /** O PDF guardado no bucket na assinatura nunca leva a marca de cancelado. */
  opcoes: { marcarCancelamento?: boolean; previa?: boolean } = {}
): Promise<Buffer> {
  const validas = rodadaEncerrada(assinaturas) ? [] : assinaturas
  const [logo, assinaturasPdf] = await Promise.all([
    logoDataUri(dados.organizacao.logoUrl),
    Promise.all(validas.map((a) => assinaturaParaPdf(a))),
  ])
  const elemento = createElement(OficioPDF, {
    dados,
    logoDataUri: logo,
    assinaturas: assinaturasPdf,
    cancelamento: opcoes.marcarCancelamento === false ? null : cancelamentoParaPdf(dados.oficio),
    previa: opcoes.previa === true,
  }) as Parameters<typeof renderToBuffer>[0]
  return renderToBuffer(elemento)
}

/**
 * Marca de cancelado do PDF GERADO NA HORA (tarja + aviso + seção no
 * certificado). O PDF assinado guardado no bucket nunca é regravado: ele é o
 * registro do que foi assinado e fica para auditoria.
 */
export function cancelamentoParaPdf(o: DetalheOficio): CancelamentoPDF | null {
  if (o.situacao !== "Cancelado") return null
  return {
    em: o.canceladoEm ? formatarMomento(o.canceladoEm) : null,
    motivo: o.cancelamentoMotivo,
  }
}

async function guardarPdfAssinado(oficioId: string): Promise<string | null> {
  const [dados, lista] = await Promise.all([dadosImpressao(oficioId), assinaturasDoOficio(oficioId)])
  const rodada = rodadaVigente(lista)
  if (!dados || !rodadaConcluida(rodada)) return null
  const buffer = await renderizarPdfOficio(dados, rodada, { marcarCancelamento: false })
  const caminho = `oficios/${oficioId}/assinado-${rodada[0].certificado}.pdf`
  const admin = await createAdminClient()
  const { error } = await admin.storage
    .from("documentos")
    .upload(caminho, buffer, { contentType: "application/pdf", upsert: true })
  if (error) return null
  await admin.from("oficios").update({ arquivo_assinado: caminho }).eq("id", oficioId)
  return caminho
}

export type Verificacao = {
  certificado: string
  situacao: SituacaoAssinatura
  oficioSituacao: string | null
  numero: string
  data: string | null
  assunto: string | null
  destinatario: string | null
  remetente: string
  assinante: string | null
  cargo: string | null
  assinadoEm: string | null
  hash: string | null
  /** Cancelamento posterior do ofício (a assinatura segue autêntica). */
  canceladoEm: string | null
  cancelamentoMotivo: string | null
  /** Todos os assinantes do mesmo envio, na ordem do documento (inclui este). */
  assinantes: { nome: string | null; cargo: string | null; situacao: SituacaoAssinatura; assinadoEm: string | null }[]
  /** O envio terminou sem emitir (outro recusou ou o envio foi cancelado). */
  envioEncerrado: boolean
}

export async function verificarCertificado(certificado: string): Promise<Verificacao | null> {
  const codigo = certificado.trim().toUpperCase()
  if (!/^[2-9A-Z]{4}-[2-9A-Z]{4}-[2-9A-Z]{4}$/.test(codigo)) return null
  const admin = await createAdminClient()
  const { data } = await admin
    .from("documento_assinaturas")
    .select("*")
    .eq("certificado", codigo)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (!data) return null
  const [oficio, remetente, rodada] = await Promise.all([
    obterOficio(String(data.oficio_id)),
    nomeRemetente(),
    envelopesDaRodada(normalizar(data)),
  ])
  if (!oficio) return null
  return {
    assinantes: rodada.map((x) => ({ nome: x.nome, cargo: x.cargo, situacao: x.situacao, assinadoEm: x.assinadoEm })),
    envioEncerrado: rodadaEncerrada(rodada),
    certificado: codigo,
    situacao: (texto(data.situacao) ?? "pendente") as SituacaoAssinatura,
    oficioSituacao: oficio.situacao,
    numero: numeroDoOficio(oficio),
    data: oficio.data,
    assunto: oficio.assunto,
    destinatario: oficio.destinatarioNome ?? oficio.destinatarioTexto,
    remetente,
    assinante: texto(data.nome),
    cargo: texto(data.cargo),
    assinadoEm: texto(data.assinado_em),
    hash: texto(data.hash_documento),
    canceladoEm: oficio.canceladoEm,
    cancelamentoMotivo: oficio.cancelamentoMotivo,
  }
}

// ── Ofício assinado à mão (sem assinatura eletrônica) ───────────────────────

/**
 * Anexa o PDF do ofício assinado à mão (digitalizado) ao ofício já emitido.
 * Guarda no mesmo lugar do PDF assinado eletronicamente e do que veio do
 * sistema antigo — `oficios.arquivo_assinado`, bucket `documentos`.
 */
export async function anexarAssinadoAMao(
  oficioId: string,
  arquivo: File
): Promise<{ erro?: string; caminho?: string }> {
  if (arquivo.type !== "application/pdf") return { erro: "O arquivo deve ser um PDF." }
  if (arquivo.size === 0) return { erro: "O arquivo está vazio." }
  if (arquivo.size > 10 * 1024 * 1024) return { erro: "O arquivo deve ter no máximo 10 MB." }

  const admin = await createAdminClient()
  const { data: o } = await admin
    .from("oficios")
    .select("situacao, arquivo_assinado")
    .eq("id", oficioId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (!o) return { erro: "Ofício não encontrado." }
  if (o.situacao === "Rascunho") return { erro: "Emita o ofício antes de anexar o documento assinado." }
  if (o.situacao === "Cancelado") return { erro: "Ofício cancelado não recebe documento assinado." }
  if (o.situacao === "Aguardando assinatura") {
    return { erro: "Este ofício está em assinatura eletrônica — cancele o envio antes de anexar um documento assinado à mão." }
  }
  if (rodadaConcluida(rodadaVigente(await assinaturasDoOficio(oficioId)))) {
    return { erro: "Este ofício já tem assinatura eletrônica: o PDF assinado é gerado pelo próprio sistema." }
  }

  const caminho = `oficios/${oficioId}/assinado-mao-${randomUUID().slice(0, 8)}.pdf`
  const { error } = await admin.storage
    .from("documentos")
    .upload(caminho, arquivo, { contentType: "application/pdf" })
  if (error) return { erro: `Falha ao subir o arquivo: ${error.message}` }

  const { error: erroBanco } = await admin
    .from("oficios")
    .update({ arquivo_assinado: caminho, updated_at: new Date().toISOString() })
    .eq("id", oficioId)
  if (erroBanco) {
    await admin.storage.from("documentos").remove([caminho])
    return { erro: `Falha ao gravar o arquivo no ofício: ${erroBanco.message}` }
  }
  // O anterior fica no bucket de propósito: histórico do que já circulou.
  return { caminho }
}
