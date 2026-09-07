import "server-only"

import { createHash, randomInt, timingSafeEqual } from "node:crypto"

import {
  capacidadeDoEvento,
  inscricoesAbertas,
  obterConfig,
  obterEventoPublico,
  termosEmVigor,
  type Evento,
  type ModoFoto,
} from "@/lib/db/eventos"
import { createServiceClient } from "@/lib/supabase/admin"

/**
 * Eventos — lado PÚBLICO (sem sessão).
 *
 * Usa SERVICE ROLE de propósito: quem se inscreve não tem conta, e o tenant vem
 * do subdomínio (header injetado pelo proxy), não de um JWT. Toda função recebe
 * `tenantId` EXPLÍCITO — nunca inferido — para não haver caminho em que uma
 * inscrição caia no sindicato errado.
 *
 * O código de 6 dígitos segue o mesmo mecanismo da ficha de filiação: guardado
 * como HASH salgado pelo token, com validade e limite de tentativas.
 */

const VALIDADE_CODIGO_MIN = 30
const MAX_TENTATIVAS = 5
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function hashCodigo(codigo: string, token: string): string {
  return createHash("sha256").update(`${codigo}:${token}`).digest("hex")
}

function conferirHash(codigo: string, token: string, hash: string): boolean {
  const a = Buffer.from(hashCodigo(codigo, token))
  const b = Buffer.from(hash)
  return a.length === b.length && timingSafeEqual(a, b)
}

export function limparCpf(v: string): string {
  return (v ?? "").replace(/\D/g, "")
}

/** Validação real de CPF (dígitos verificadores), não só o tamanho. */
export function validarCpf(cpf: string): boolean {
  const d = limparCpf(cpf)
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false
  const calc = (ate: number) => {
    let soma = 0
    for (let i = 0; i < ate; i++) soma += Number(d[i]) * (ate + 1 - i)
    const r = (soma * 10) % 11
    return r === 10 ? 0 : r
  }
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10])
}

// ── O que a página pública precisa saber ─────────────────────────────────────

export type EventoPublico = {
  evento: Evento
  modoFoto: ModoFoto
  retencaoFotoDias: number
  /** A foto é obrigatória? Só quando o tenant permite E o evento exige. */
  fotoObrigatoria: boolean
  aberta: boolean
  motivoFechada?: string
  vagasRestantes: number | null
  termoInscricao: { id: string; texto: string } | null
  termoFoto: { id: string; texto: string } | null
  campos: {
    id: string
    rotulo: string
    tipo: string
    opcoes: string[]
    ajuda: string | null
    obrigatorio: boolean
  }[]
}

export async function carregarEventoPublico(
  slug: string,
  tenantId: string
): Promise<EventoPublico | null> {
  const evento = await obterEventoPublico(slug, tenantId)
  if (!evento) return null

  const [{ config }, termos] = await Promise.all([obterConfig(), termosEmVigor()])
  const capacidade = await capacidadeDoEvento(evento)
  const abertura = inscricoesAbertas(evento, capacidade)

  const service = createServiceClient()
  const { data: campos } = await service
    .from("eventos_campos")
    .select("id, rotulo, tipo, opcoes, ajuda, obrigatorio")
    .eq("emp_proprietaria_id", tenantId)
    .eq("evento_id", evento.id)
    .eq("ativo", true)
    .order("ordem")

  // A foto só é pedida quando o TENANT permite e o EVENTO exige — nesta ordem.
  const modoFoto = config.modo_foto
  const fotoObrigatoria = modoFoto !== "nenhuma" && evento.exige_foto

  const termoFoto = termos.find(
    (t) =>
      t.tipo === (modoFoto === "biometrica" ? "foto_biometrica" : "foto_visual")
  )
  const termoInscricao = termos.find((t) => t.tipo === "inscricao")

  return {
    evento,
    modoFoto,
    retencaoFotoDias: config.retencao_foto_dias,
    fotoObrigatoria,
    aberta: abertura.aberta,
    motivoFechada: abertura.motivo,
    // O número mostrado é o das vagas do PÚBLICO, não o total: as guardadas
    // para convidados não estão à venda, e anunciá-las prometeria lugar que a
    // própria trava vai negar na hora de enviar.
    vagasRestantes: capacidade.publicasRestantes,
    termoInscricao: termoInscricao
      ? { id: termoInscricao.id, texto: termoInscricao.texto }
      : null,
    termoFoto:
      modoFoto !== "nenhuma" && termoFoto
        ? { id: termoFoto.id, texto: termoFoto.texto }
        : null,
    campos: (campos ?? []).map((c) => ({
      id: c.id as string,
      rotulo: (c.rotulo as string) ?? "",
      tipo: (c.tipo as string) ?? "texto",
      opcoes: (c.opcoes as string[] | null) ?? [],
      ajuda: (c.ajuda as string | null) ?? null,
      obrigatorio: c.obrigatorio === true,
    })),
  }
}

// ── Criar a inscrição ────────────────────────────────────────────────────────

export type DadosInscricao = {
  nome: string
  cpf: string
  email: string
  telefone: string
  termoId: string | null
  termoFotoId: string | null
  respostas: { campoId: string; rotulo: string; valor: string }[]
  ip: string | null
}

export async function criarInscricao(
  eventoId: string,
  tenantId: string,
  dados: DadosInscricao
): Promise<{ erro?: string; token?: string; codigo?: string }> {
  const service = createServiceClient()

  // Uma pessoa, uma inscrição por evento — o CPF é o identificador, como já é
  // em `filiacoes`. Reinscrever devolve o token existente em vez de duplicar.
  const { data: existente } = await service
    .from("eventos_inscricoes")
    .select("id, token, situacao, email_confirmado_em")
    .eq("emp_proprietaria_id", tenantId)
    .eq("evento_id", eventoId)
    .eq("cpf", dados.cpf)
    .maybeSingle()

  const codigo = String(randomInt(0, 1_000_000)).padStart(6, "0")
  const expira = new Date(
    Date.now() + VALIDADE_CODIGO_MIN * 60_000
  ).toISOString()

  if (existente) {
    const token = existente.token as string
    // Já confirmada: não reabre nem reenvia código — só devolve o endereço.
    if (existente.email_confirmado_em) return { token }
    await service
      .from("eventos_inscricoes")
      .update({
        nome: dados.nome,
        email: dados.email,
        telefone: dados.telefone || null,
        codigo_hash: hashCodigo(codigo, token),
        codigo_expira_em: expira,
        codigo_tentativas: 0,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existente.id as string)
    return { token, codigo }
  }

  const { data: criada, error } = await service
    .from("eventos_inscricoes")
    .insert({
      emp_proprietaria_id: tenantId,
      evento_id: eventoId,
      nome: dados.nome,
      cpf: dados.cpf,
      email: dados.email,
      telefone: dados.telefone || null,
      origem: "publica",
      situacao: "pendente",
      termo_id: dados.termoId,
      termo_foto_id: dados.termoFotoId,
      consentimento_em: new Date().toISOString(),
      consentimento_ip: dados.ip,
      codigo_expira_em: expira,
      codigo_tentativas: 0,
    })
    .select("id, token")
    .single()
  if (error || !criada) {
    return { erro: `Não foi possível registrar a inscrição: ${error?.message ?? "?"}` }
  }

  const token = criada.token as string
  await service
    .from("eventos_inscricoes")
    .update({ codigo_hash: hashCodigo(codigo, token) })
    .eq("id", criada.id as string)

  if (dados.respostas.length > 0) {
    await service.from("eventos_inscricao_respostas").insert(
      dados.respostas.map((r) => ({
        emp_proprietaria_id: tenantId,
        inscricao_id: criada.id as string,
        campo_id: r.campoId,
        rotulo: r.rotulo,
        valor: r.valor,
      }))
    )
  }

  return { token, codigo }
}

export function validarEmail(v: string): boolean {
  return EMAIL.test(v)
}

// ── A inscrição pelo token (a página privada da pessoa) ──────────────────────

export type InscricaoPublica = {
  id: string
  token: string
  eventoId: string
  eventoTitulo: string | null
  eventoSlug: string
  eventoInicio: string | null
  nome: string | null
  email: string | null
  situacao: string
  emailConfirmado: boolean
  temFoto: boolean
  fotoObrigatoria: boolean
  modoFoto: ModoFoto
  retencaoFotoDias: number
  exigeRsvp: boolean
  /** Quando a confirmação abre. Nulo = o organizador ainda não marcou. */
  rsvpAbreEm: string | null
  rsvpAberto: boolean
  rsvpConfirmado: boolean | null
  termoFotoTexto: string | null
  anonimizada: boolean
}

export async function obterInscricaoPorToken(
  token: string,
  tenantId: string
): Promise<InscricaoPublica | null> {
  const service = createServiceClient()
  const { data } = await service
    .from("eventos_inscricoes")
    .select(
      "id, token, evento_id, nome, email, situacao, email_confirmado_em, foto_url, rsvp_confirmado, anonimizada_em"
    )
    .eq("emp_proprietaria_id", tenantId)
    .eq("token", token)
    .maybeSingle()
  if (!data) return null

  const { data: ev } = await service
    .from("eventos")
    .select("id, titulo, slug, inicio, exige_foto, exige_rsvp, rsvp_abre_em")
    .eq("id", data.evento_id as string)
    .maybeSingle()

  const [{ config }, termos] = await Promise.all([obterConfig(), termosEmVigor()])
  const modoFoto = config.modo_foto
  const termoFoto = termos.find(
    (t) =>
      t.tipo === (modoFoto === "biometrica" ? "foto_biometrica" : "foto_visual")
  )

  return {
    id: data.id as string,
    token: data.token as string,
    eventoId: data.evento_id as string,
    eventoTitulo: (ev?.titulo as string | null) ?? null,
    eventoSlug: (ev?.slug as string) ?? "",
    eventoInicio: (ev?.inicio as string | null) ?? null,
    nome: (data.nome as string | null) ?? null,
    email: (data.email as string | null) ?? null,
    situacao: (data.situacao as string) ?? "pendente",
    emailConfirmado: data.email_confirmado_em !== null,
    temFoto: data.foto_url !== null,
    fotoObrigatoria: modoFoto !== "nenhuma" && ev?.exige_foto === true,
    modoFoto,
    retencaoFotoDias: config.retencao_foto_dias,
    exigeRsvp: ev?.exige_rsvp === true,
    rsvpAbreEm: (ev?.rsvp_abre_em as string | null) ?? null,
    // A confirmação não abre junto com a inscrição: confirmar presença um
    // minuto depois de se inscrever repetiria a inscrição, não informaria nada.
    rsvpAberto:
      ev?.rsvp_abre_em !== null &&
      ev?.rsvp_abre_em !== undefined &&
      new Date(ev.rsvp_abre_em as string) <= new Date(),
    rsvpConfirmado: (data.rsvp_confirmado as boolean | null) ?? null,
    termoFotoTexto: termoFoto?.texto ?? null,
    anonimizada: data.anonimizada_em !== null,
  }
}

/**
 * Confere o código e confirma o e-mail. Idempotente: código já usado devolve
 * sucesso em vez de erro, porque a pessoa pode recarregar a página.
 */
export async function confirmarEmail(
  token: string,
  codigo: string,
  tenantId: string
): Promise<{
  erro?: string
  ok?: boolean
  /** Ficou confirmada agora? É o gatilho do e-mail de confirmação. */
  confirmada?: boolean
  inscricaoId?: string
  eventoId?: string
}> {
  const service = createServiceClient()
  const { data } = await service
    .from("eventos_inscricoes")
    .select(
      "id, evento_id, email_confirmado_em, codigo_hash, codigo_expira_em, codigo_tentativas, filiacao_id"
    )
    .eq("emp_proprietaria_id", tenantId)
    .eq("token", token)
    .maybeSingle()
  if (!data) return { erro: "Inscrição não encontrada." }
  // Já confirmado antes: devolve sucesso sem `confirmada`, para recarregar a
  // página não disparar o e-mail de novo.
  if (data.email_confirmado_em) return { ok: true }

  const tentativas = Number(data.codigo_tentativas ?? 0)
  if (tentativas >= MAX_TENTATIVAS) {
    return {
      erro: "Muitas tentativas. Peça um novo código para continuar.",
    }
  }
  if (
    !data.codigo_expira_em ||
    new Date(data.codigo_expira_em as string) < new Date()
  ) {
    return { erro: "O código expirou. Peça um novo." }
  }
  if (
    !data.codigo_hash ||
    !conferirHash(codigo.trim(), token, data.codigo_hash as string)
  ) {
    await service
      .from("eventos_inscricoes")
      .update({ codigo_tentativas: tentativas + 1 })
      .eq("id", data.id as string)
    return { erro: "Código incorreto." }
  }

  // Confirmação automática: quando o evento não exige aprovação, a inscrição
  // já nasce confirmada assim que o e-mail é validado.
  const { data: ev } = await service
    .from("eventos")
    .select("exige_aprovacao")
    .eq("id", data.evento_id as string)
    .maybeSingle()

  const confirmada = ev?.exige_aprovacao !== true
  await service
    .from("eventos_inscricoes")
    .update({
      email_confirmado_em: new Date().toISOString(),
      situacao: confirmada ? "confirmada" : "pendente",
      codigo_hash: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", data.id as string)

  return {
    ok: true,
    confirmada,
    inscricaoId: data.id as string,
    eventoId: data.evento_id as string,
  }
}

/** Gera um código novo (reenvio). Devolve o código para o e-mail. */
export async function novoCodigo(
  token: string,
  tenantId: string
): Promise<{ erro?: string; codigo?: string; email?: string; nome?: string | null }> {
  const service = createServiceClient()
  const { data } = await service
    .from("eventos_inscricoes")
    .select("id, email, nome, email_confirmado_em")
    .eq("emp_proprietaria_id", tenantId)
    .eq("token", token)
    .maybeSingle()
  if (!data) return { erro: "Inscrição não encontrada." }
  if (data.email_confirmado_em) return { erro: "Este e-mail já foi confirmado." }

  const codigo = String(randomInt(0, 1_000_000)).padStart(6, "0")
  await service
    .from("eventos_inscricoes")
    .update({
      codigo_hash: hashCodigo(codigo, token),
      codigo_expira_em: new Date(
        Date.now() + VALIDADE_CODIGO_MIN * 60_000
      ).toISOString(),
      codigo_tentativas: 0,
    })
    .eq("id", data.id as string)

  return {
    codigo,
    email: (data.email as string) ?? undefined,
    nome: (data.nome as string | null) ?? null,
  }
}

// ── Foto ─────────────────────────────────────────────────────────────────────

export async function salvarFoto(
  token: string,
  tenantId: string,
  arquivo: File
): Promise<{ erro?: string; ok?: boolean }> {
  const service = createServiceClient()
  const { data } = await service
    .from("eventos_inscricoes")
    .select("id, evento_id, email_confirmado_em")
    .eq("emp_proprietaria_id", tenantId)
    .eq("token", token)
    .maybeSingle()
  if (!data) return { erro: "Inscrição não encontrada." }
  if (!data.email_confirmado_em) {
    return { erro: "Confirme o e-mail antes de enviar a foto." }
  }

  const { config } = await obterConfig()
  if (config.modo_foto === "nenhuma") {
    return { erro: "Esta entidade não coleta foto." }
  }

  const caminho = `fotos/${data.evento_id as string}/${data.id as string}.jpg`
  const { error } = await service.storage
    .from("eventos")
    .upload(caminho, arquivo, { contentType: "image/jpeg", upsert: true })
  if (error) return { erro: `Falha ao enviar a foto: ${error.message}` }

  await service
    .from("eventos_inscricoes")
    .update({
      foto_url: caminho,
      foto_capturada_em: new Date().toISOString(),
      // Biometria alimenta a catraca: a inscrição entra na fila de envio ao
      // controle de acesso. Conferência visual não precisa disso.
      acesso_situacao:
        config.modo_foto === "biometrica" ? "pendente" : "nao_aplica",
      updated_at: new Date().toISOString(),
    })
    .eq("id", data.id as string)

  return { ok: true }
}

/** Resposta ao RSVP pelo link do e-mail. */
export async function responderRsvp(
  token: string,
  tenantId: string,
  vem: boolean
): Promise<{ erro?: string; ok?: boolean; inscricaoId?: string }> {
  const service = createServiceClient()
  const { data, error } = await service
    .from("eventos_inscricoes")
    .update({
      rsvp_confirmado: vem,
      rsvp_respondido_em: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("emp_proprietaria_id", tenantId)
    .eq("token", token)
    .select("id")
    .maybeSingle()
  if (error) return { erro: "Não foi possível registrar sua resposta." }
  return { ok: true, inscricaoId: (data?.id as string) ?? undefined }
}
