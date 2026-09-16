import "server-only"
import { cpfConfiavel } from "@/lib/cpf"

import { createHash, randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto"
import { createElement } from "react"
import { renderToBuffer } from "@react-pdf/renderer"
import QRCode from "qrcode"

import { texto } from "@/lib/db/comum"
import { criarNotificacao } from "@/lib/db/notificacoes"
import {
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
import { OficioPDF, type AssinaturaPDF } from "@/lib/pdf/oficio"
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
    eventos,
  }
}

async function registrarEvento(
  assinatura: { id: string },
  tipo: string,
  extra: { detalhe?: string | null; ip?: string | null; userAgent?: string | null } = {}
): Promise<void> {
  const admin = await createAdminClient()
  await admin.from("oficios_assinaturas_eventos").insert({
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
    .from("oficios_assinaturas_eventos")
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
    .from("oficios_assinaturas")
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

async function enviarConviteTelegram(
  a: Assinatura,
  oficio: DetalheOficio,
  reenvio: boolean
): Promise<boolean> {
  if (!a.telegramChatId) return false
  const link = await linkAssinatura(a.token)
  const remetente = await nomeRemetente()
  return enviarTelegram({
    chatId: a.telegramChatId,
    formato: null,
    texto: [
      reenvio ? `Lembrete: o Ofício ${numeroDoOficio(oficio)} aguarda sua assinatura.` : `${remetente} enviou o Ofício ${numeroDoOficio(oficio)} para a sua assinatura eletrônica.`,
      ``,
      `Assunto: ${oficio.assunto ?? "—"}`,
      `Para: ${oficio.destinatarioNome ?? oficio.destinatarioTexto ?? "—"}`,
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
        `<strong>Assunto:</strong> ${escaparHtml(oficio.assunto ?? "—")}<br><strong>Para:</strong> ${escaparHtml(oficio.destinatarioNome ?? oficio.destinatarioTexto ?? "—")}`
      ) +
      botaoEmail(link, "Revisar e assinar") +
      linkReserva(link) +
      textoSuave(
        "Ao abrir, você lê o documento completo antes de decidir. Para assinar, enviamos um código de uso único para este e-mail. Se algo estiver errado, você pode recusar e informar o motivo."
      ),
  })
}

/** Rascunho → "Aguardando assinatura": numera, congela o conteúdo e manda o convite. */
export async function enviarParaAssinatura(dados: {
  oficioId: string
  email: string
  canal: CanalAssinatura
  numeroManual: number | null
  usuarioId: string
}): Promise<{ erro?: string; numero?: number; ano?: number; entregue?: boolean; destino?: string }> {
  const email = dados.email.trim().toLowerCase()
  const porTelegram = dados.canal === "telegram"
  if (!porTelegram && !EMAIL.test(email)) {
    return { erro: "Informe um e-mail válido para o assinante." }
  }

  const preparo = await prepararEmissao(dados.oficioId)
  if ("erro" in preparo) return preparo

  const telegram = porTelegram
    ? await telegramDoIntegrante(preparo.assinanteIntegranteId)
    : { disponivel: false, chatId: null, telefone: null }
  if (porTelegram && !telegram.disponivel) {
    return {
      erro: "O assinante não tem o Telegram vinculado e confirmado — peça a ele em Meu perfil › Telegram, ou envie por e-mail.",
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
  if (EMAIL.test(email)) {
    await admin.from("diretoria_integrantes").update({ email }).eq("id", preparo.assinanteIntegranteId)
  }

  const agora = new Date().toISOString()
  let criada: Record<string, unknown> | null = null
  for (let tentativa = 0; tentativa < 3 && !criada; tentativa++) {
    const { data, error } = await admin
      .from("oficios_assinaturas")
      .insert({
        oficio_id: dados.oficioId,
        integrante_id: preparo.assinanteIntegranteId,
        nome: preparo.assinanteNome,
        cargo: preparo.assinanteCargo,
        email: EMAIL.test(email) ? email : null,
        canal: dados.canal,
        telegram_chat_id: telegram.chatId,
        telegram_telefone: telegram.telefone,
        certificado: novoCertificado(),
        situacao: "pendente",
        hash_documento: hashDoConteudo(oficio),
        enviado_em: agora,
        enviado_por_id: dados.usuarioId,
        emp_proprietaria_id: await tenantAtual(),
      })
      .select("*")
      .single()
    if (!error) criada = data
    else if (error.code !== "23505") {
      // Sem o envelope o ofício não pode ficar travado: volta ao rascunho.
      await admin.from("oficios").update({ situacao: "Rascunho" }).eq("id", dados.oficioId)
      return {
        erro: /canal|telegram_chat_id/.test(error.message)
          ? "Envio pelo Telegram ainda não configurado — rode supabase/oficios-assinatura-telegram.sql."
          : /oficios_assinaturas/.test(error.message)
            ? "Assinatura eletrônica ainda não configurada — rode supabase/oficios-assinatura.sql."
            : `Falha ao criar a assinatura: ${error.message}`,
      }
    }
  }
  if (!criada) return { erro: "Não foi possível gerar o certificado. Tente novamente." }

  const assinatura = normalizar(criada)
  const destino = destinoDaAssinatura(assinatura)
  await registrarEvento(assinatura, "enviado", { detalhe: `Para ${destino}` })
  const entregue = await enviarConvite(assinatura, oficio, false)
  return { numero: numerado.numero, ano: numerado.ano, entregue, destino }
}

async function pendenteDoOficio(oficioId: string): Promise<Assinatura | null> {
  return (await assinaturasDoOficio(oficioId)).find((a) => a.situacao === "pendente") ?? null
}

export async function reenviarConvite(
  oficioId: string
): Promise<{ erro?: string; entregue?: boolean; destino?: string }> {
  const [a, oficio] = await Promise.all([pendenteDoOficio(oficioId), obterOficio(oficioId)])
  if (!a || !oficio) return { erro: "Não há assinatura pendente neste ofício." }
  const destino = destinoDaAssinatura(a)
  await registrarEvento(a, "reenviado", { detalhe: `Para ${destino}` })
  return { entregue: await enviarConvite(a, oficio, true), destino }
}

/** Cancela o envio: o link deixa de valer e o ofício volta ao rascunho com o número. */
export async function cancelarEnvio(oficioId: string, motivo: string | null): Promise<{ erro?: string }> {
  const a = await pendenteDoOficio(oficioId)
  if (!a) return { erro: "Não há assinatura pendente neste ofício." }
  const admin = await createAdminClient()
  const agora = new Date().toISOString()
  const { error } = await admin
    .from("oficios_assinaturas")
    .update({ situacao: "cancelado", codigo_hash: null, updated_at: agora })
    .eq("id", a.id)
    .eq("situacao", "pendente")
  if (error) return { erro: `Falha ao cancelar o envio: ${error.message}` }
  await registrarEvento(a, "cancelado", { detalhe: motivo })
  await admin
    .from("oficios")
    .update({ situacao: "Rascunho", updated_at: agora })
    .eq("id", oficioId)
    .eq("situacao", "Aguardando assinatura")
  return {}
}

// ── lado público (/assinar/<token>) ─────────────────────────────────────────

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type Envelope = {
  assinatura: Assinatura
  oficio: DetalheOficio
  remetente: string
}

export async function envelopePorToken(token: string): Promise<Envelope | null> {
  if (!UUID.test(token)) return null
  const admin = await createAdminClient()
  const { data } = await admin
    .from("oficios_assinaturas")
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
  return { assinatura: normalizar(data, eventos.get(String(data.id)) ?? []), oficio, remetente }
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
    await admin.from("oficios_assinaturas").update({ visualizado_em: new Date().toISOString() }).eq("id", a.id)
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
    .from("oficios_assinaturas")
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
    .from("oficios_assinaturas")
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
      .from("oficios_assinaturas")
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
    .from("oficios_assinaturas")
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
  await admin
    .from("oficios")
    .update({ situacao: "Emitido", emitido_em: assinadoEm, updated_at: assinadoEm })
    .eq("id", a.oficioId)
    .eq("situacao", "Aguardando assinatura")

  // O PDF final e os avisos não podem desfazer a assinatura se falharem.
  const arquivo = await guardarPdfAssinado(a.oficioId).catch(() => null)
  await avisarConclusao(envelope, "assinado", null, arquivo !== null).catch(() => undefined)
  return {}
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
    .from("oficios_assinaturas")
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
      ? `Ofício ${numero} assinado por ${a.nome ?? "assinante"} e emitido.`
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
          ? `<strong>${escaparHtml(a.nome ?? "O assinante")}</strong> assinou o Ofício ${escaparHtml(numero)} em ${escaparHtml(formatarMomento(new Date().toISOString()))}. O ofício está emitido.`
          : `<strong>${escaparHtml(a.nome ?? "O assinante")}</strong> recusou a assinatura do Ofício ${escaparHtml(numero)}. O ofício voltou ao rascunho, com o número reservado.`
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
 * PDF do ofício com o estado de assinatura: pendente mostra "Aguardando
 * assinatura eletrônica"; assinado leva QR, carimbo e certificado.
 */
export async function renderizarPdfOficio(
  dados: DadosImpressao,
  assinatura: Assinatura | null
): Promise<Buffer> {
  const [logo, assinaturaPdf] = await Promise.all([
    logoDataUri(dados.organizacao.logoUrl),
    assinatura && assinatura.situacao !== "cancelado" && assinatura.situacao !== "recusado"
      ? assinaturaParaPdf(assinatura)
      : Promise.resolve(null),
  ])
  const elemento = createElement(OficioPDF, {
    dados,
    logoDataUri: logo,
    assinatura: assinaturaPdf,
  }) as Parameters<typeof renderToBuffer>[0]
  return renderToBuffer(elemento)
}

/** Assinatura que vale para o PDF: a assinada, senão a pendente. */
export function assinaturaVigente(lista: Assinatura[]): Assinatura | null {
  return lista.find((a) => a.situacao === "assinado") ?? lista.find((a) => a.situacao === "pendente") ?? null
}

async function guardarPdfAssinado(oficioId: string): Promise<string | null> {
  const [dados, lista] = await Promise.all([dadosImpressao(oficioId), assinaturasDoOficio(oficioId)])
  const a = lista.find((x) => x.situacao === "assinado")
  if (!dados || !a) return null
  const buffer = await renderizarPdfOficio(dados, a)
  const caminho = `oficios/${oficioId}/assinado-${a.certificado}.pdf`
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
}

export async function verificarCertificado(certificado: string): Promise<Verificacao | null> {
  const codigo = certificado.trim().toUpperCase()
  if (!/^[2-9A-Z]{4}-[2-9A-Z]{4}-[2-9A-Z]{4}$/.test(codigo)) return null
  const admin = await createAdminClient()
  const { data } = await admin
    .from("oficios_assinaturas")
    .select("*")
    .eq("certificado", codigo)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (!data) return null
  const [oficio, remetente] = await Promise.all([obterOficio(String(data.oficio_id)), nomeRemetente()])
  if (!oficio) return null
  return {
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
  if (o.situacao === "Aguardando assinatura") {
    return { erro: "Este ofício está em assinatura eletrônica — cancele o envio antes de anexar um documento assinado à mão." }
  }
  const assinaturas = await assinaturasDoOficio(oficioId)
  if (assinaturas.some((a) => a.situacao === "assinado")) {
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
