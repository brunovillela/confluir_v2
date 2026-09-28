import "server-only"

import QRCode from "qrcode"

import {
  conferirCodigo,
  formatarMomentoAssinatura,
  gerarCodigoAssinatura,
  hashCodigo,
  hashTexto,
  mascararEmailAssinatura,
  MAX_TENTATIVAS_CODIGO,
  novoCertificado,
  VALIDADE_CODIGO_MIN,
} from "@/lib/db/assinatura-comum"
import { esquemaAusente, texto } from "@/lib/db/comum"
import { obterOrganizacao } from "@/lib/db/organizacao"
import { limparCpf, validarCpf } from "@/lib/cpf"
import { enviarEmail } from "@/lib/email"
import {
  botaoEmail,
  caixaAviso,
  caixaCodigo,
  escaparHtml,
  linkReserva,
  paragrafo,
  textoSuave,
  tituloEmail,
} from "@/lib/email-layout"
import { createAdminClient, createServiceClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"
import { origemAtual } from "@/lib/tenant-url"

/**
 * Assinatura eletrônica da minuta de contrato.
 *
 * O que dá força à assinatura (e o que o certificado mostra a um juiz):
 * 1. Identidade: link individual + código de uso único no e-mail do assinante
 *    (prova de posse) + nome completo e CPF digitados na hora, conferidos
 *    com o CPF informado no envio.
 * 2. Integridade: o SHA-256 do texto é congelado no envio; a minuta fica
 *    travada; se o texto mudasse, a assinatura seria recusada.
 * 3. Consentimento: aceite expresso do conteúdo E da forma eletrônica (a
 *    MP 2.200-2/2001, art. 10, § 2º, admite assinatura fora da ICP-Brasil
 *    quando as partes a aceitam).
 * 4. Trilha: envio, abertura, código, assinatura — data, hora, IP, navegador.
 * 5. Testemunhas opcionais (duas): título executivo extrajudicial.
 *
 * Ordem: a OUTRA PARTE assina primeiro, depois a entidade, depois as
 * testemunhas — a entidade só se obriga quando a contraparte já se obrigou.
 */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const AVISO_SQL_ASSINATURA_MINUTA =
  "Assinatura de minutas ainda não configurada — rode supabase/minutas-assinatura.sql."

export type PapelMinuta = "contratante" | "contratada" | "testemunha"

export const ROTULO_PAPEL_MINUTA: Record<PapelMinuta, string> = {
  contratante: "Contratante",
  contratada: "Contratada",
  testemunha: "Testemunha",
}

export type SituacaoEnvelope = "pendente" | "assinado" | "recusado" | "cancelado"

export type EventoAssinatura = {
  tipo: string
  detalhe: string | null
  ip: string | null
  quando: string
}

export type AssinaturaMinuta = {
  id: string
  nome: string | null
  email: string | null
  cpf: string | null
  nomeDeclarado: string | null
  papel: PapelMinuta
  /** Assina pela entidade (e não pela outra parte). */
  daEntidade: boolean
  ordem: number
  situacao: SituacaoEnvelope
  certificado: string | null
  token: string
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

export const ROTULO_EVENTO_MINUTA: Record<string, string> = {
  enviado: "Convite enviado",
  abertura: "Documento aberto",
  codigo_enviado: "Código de uso único enviado",
  codigo_invalido: "Código incorreto",
  cpf_divergente: "CPF digitado não confere",
  assinatura: "Assinatura",
  recusa: "Recusa",
  cancelado: "Envio cancelado",
}

function normalizar(l: Record<string, unknown>, eventos: EventoAssinatura[] = []): AssinaturaMinuta {
  return {
    id: String(l.id),
    nome: texto(l.nome),
    email: texto(l.email),
    cpf: texto(l.cpf),
    nomeDeclarado: texto(l.nome_declarado),
    papel: (l.papel as PapelMinuta) ?? "testemunha",
    daEntidade: texto(l.cargo) === "entidade",
    ordem: Number(l.ordem ?? 1),
    situacao: (l.situacao as SituacaoEnvelope) ?? "pendente",
    certificado: texto(l.certificado),
    token: String(l.token),
    hashDocumento: texto(l.hash_documento),
    enviadoEm: texto(l.enviado_em),
    visualizadoEm: texto(l.visualizado_em),
    assinadoEm: texto(l.assinado_em),
    recusadoEm: texto(l.recusado_em),
    motivoRecusa: texto(l.motivo_recusa),
    ip: texto(l.ip),
    userAgent: texto(l.user_agent),
    eventos,
  }
}

/** "12345678901" → "***.456.789-**": o certificado circula fora da entidade. */
export function mascararCpf(cpf: string | null): string {
  const d = (cpf ?? "").replace(/\D/g, "")
  if (d.length !== 11) return "—"
  return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`
}

export async function assinaturasDaMinuta(
  minutaId: string,
  opcoes: { comEventos?: boolean } = {}
): Promise<AssinaturaMinuta[]> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("documento_assinaturas")
    .select("*")
    .eq("documento_tipo", "minuta")
    .eq("documento_id", minutaId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .order("ordem", { ascending: true })
  if (error) return []
  const linhas = (data ?? []) as Record<string, unknown>[]
  if (!opcoes.comEventos || linhas.length === 0) return linhas.map((l) => normalizar(l))
  const { data: evs } = await admin
    .from("documento_assinatura_eventos")
    .select("assinatura_id, tipo, detalhe, ip, created_at")
    .in("assinatura_id", linhas.map((l) => String(l.id)))
    .order("created_at", { ascending: true })
  return linhas.map((l) =>
    normalizar(
      l,
      (evs ?? [])
        .filter((e) => e.assinatura_id === l.id)
        .map((e) => ({
          tipo: String(e.tipo),
          detalhe: texto(e.detalhe),
          ip: texto(e.ip),
          quando: String(e.created_at),
        }))
    )
  )
}

async function evento(
  assinaturaId: string,
  tipo: string,
  detalhe: string | null,
  ctx: { ip: string | null; userAgent: string | null } = { ip: null, userAgent: null },
  emp?: string
): Promise<void> {
  const db = createServiceClient()
  await db.from("documento_assinatura_eventos").insert({
    assinatura_id: assinaturaId,
    tipo,
    detalhe,
    ip: ctx.ip,
    user_agent: ctx.userAgent,
    ...(emp ? { emp_proprietaria_id: emp } : {}),
  })
}

// ── Envio (painel) ───────────────────────────────────────────────────────────

export type AssinanteEnvio = { nome: string; email: string; cpf: string }

export async function enviarMinutaParaAssinatura(
  minutaId: string,
  dados: {
    entidade: AssinanteEnvio
    outraParte: AssinanteEnvio
    testemunhas: AssinanteEnvio[]
  },
  usuarioId: string
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data: m, error: erroMinuta } = await admin
    .from("contratos_minutas")
    .select("id, titulo, texto, finalizada, parametros, assinada_em, arquivo_assinado")
    .eq("id", minutaId)
    .eq("emp_proprietaria_id", emp)
    .eq("deletado", false)
    .maybeSingle()
  if (erroMinuta) {
    return { erro: esquemaAusente(erroMinuta) ? AVISO_SQL_ASSINATURA_MINUTA : erroMinuta.message }
  }
  if (!m?.texto) return { erro: "Minuta não encontrada." }
  if (!m.finalizada) return { erro: "Marque a minuta como finalizada (revisada) antes de enviar para assinatura." }
  if (m.assinada_em || m.arquivo_assinado) return { erro: "Esta minuta já está assinada." }
  if (/\[PREENCHER/i.test(String(m.texto))) {
    return { erro: "Ainda há “[PREENCHER]” no texto. Um contrato não pode ir para assinatura com lacunas." }
  }

  const todos = [
    { ...dados.outraParte, rotulo: "a outra parte" },
    { ...dados.entidade, rotulo: "a entidade" },
    ...dados.testemunhas.map((t, i) => ({ ...t, rotulo: `a ${i + 1}ª testemunha` })),
  ]
  for (const p of todos) {
    if (p.nome.trim().length < 5) return { erro: `Informe o nome completo de quem assina por ${p.rotulo}.` }
    if (!EMAIL.test(p.email.trim())) return { erro: `E-mail inválido para ${p.rotulo}.` }
    if (!validarCpf(limparCpf(p.cpf))) return { erro: `CPF inválido para ${p.rotulo}.` }
  }
  const cpfs = todos.map((p) => limparCpf(p.cpf))
  if (new Set(cpfs).size !== cpfs.length) return { erro: "O mesmo CPF aparece em mais de um assinante." }
  if (dados.testemunhas.length === 1) return { erro: "Informe duas testemunhas, ou nenhuma." }

  const ativos = await assinaturasDaMinuta(minutaId)
  if (ativos.some((a) => a.situacao === "pendente" || a.situacao === "assinado")) {
    return { erro: "Já há um envio em andamento — cancele-o antes de enviar de novo." }
  }

  const papelEntidade: PapelMinuta =
    (m.parametros as { papelEntidade?: string } | null)?.papelEntidade === "contratada" ? "contratada" : "contratante"
  const papelOutra: PapelMinuta = papelEntidade === "contratante" ? "contratada" : "contratante"
  const hash = hashTexto(String(m.texto))
  const agora = new Date().toISOString()

  const linha = (p: AssinanteEnvio, ordem: number, papel: PapelMinuta, entidade: boolean) => ({
    documento_tipo: "minuta",
    documento_id: minutaId,
    ordem,
    papel,
    // `cargo` marca quem assina pela entidade (o papel sozinho não diz).
    cargo: entidade ? "entidade" : null,
    nome: p.nome.trim(),
    email: p.email.trim().toLowerCase(),
    cpf: limparCpf(p.cpf),
    situacao: "pendente",
    hash_documento: hash,
    certificado: novoCertificado(),
    enviado_por_id: usuarioId,
    enviado_em: ordem === 1 ? agora : null,
    emp_proprietaria_id: emp,
  })
  const { error } = await admin.from("documento_assinaturas").insert([
    linha(dados.outraParte, 1, papelOutra, false),
    linha(dados.entidade, 2, papelEntidade, true),
    ...dados.testemunhas.map((t, i) => linha(t, 3 + i, "testemunha", false)),
  ])
  if (error) {
    return {
      erro: esquemaAusente(error) || /check constraint|violates/i.test(error.message)
        ? AVISO_SQL_ASSINATURA_MINUTA
        : `Não foi possível enviar: ${error.message}`,
    }
  }

  await admin
    .from("contratos_minutas")
    .update({ assinatura_hash: hash, assinatura_enviada_em: agora, assinada_em: null, updated_at: agora })
    .eq("id", minutaId)
    .eq("emp_proprietaria_id", emp)

  const lista = await assinaturasDaMinuta(minutaId)
  const primeiro = lista.find((a) => a.situacao === "pendente" && a.ordem === 1)
  if (primeiro) {
    await evento(primeiro.id, "enviado", null, undefined, emp)
    await convidar(primeiro, String(m.titulo ?? "Contrato"))
  }
  return {}
}

async function nomeEntidade(): Promise<string> {
  const org = await obterOrganizacao()
  return org?.nomeRazao ?? org?.nomeFantasia ?? "a entidade"
}

async function convidar(a: AssinaturaMinuta, titulo: string): Promise<void> {
  if (!a.email) return
  const link = `${await origemAtual()}/assinar/${a.token}`
  const entidade = await nomeEntidade()
  await enviarEmail({
    email: a.email,
    nome: a.nome,
    assunto: `Contrato para assinar — ${titulo}`,
    html:
      tituloEmail("Contrato para assinatura eletrônica") +
      paragrafo(
        `${escaparHtml(entidade)} enviou o contrato <strong>${escaparHtml(titulo)}</strong> para você assinar como <strong>${escaparHtml(ROTULO_PAPEL_MINUTA[a.papel])}</strong>.`
      ) +
      botaoEmail(link, "Ler e assinar o contrato") +
      linkReserva(link) +
      textoSuave(
        "Ao abrir, você lê o contrato inteiro, pede um código de 6 dígitos por e-mail e confirma com seu nome completo e CPF. Este link é pessoal: não o encaminhe."
      ),
  })
}

/** A minuta está travada para edição (envio ativo, assinada, ou PDF assinado anexado). */
export async function minutaTravada(minutaId: string): Promise<string | null> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("contratos_minutas")
    .select("assinatura_hash, assinada_em, arquivo_assinado")
    .eq("id", minutaId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (!data) return null
  if (data.assinada_em || data.arquivo_assinado) return "A minuta está assinada e não pode mais ser alterada. Para mudar algo, faça um termo aditivo."
  if (data.assinatura_hash) return "A minuta está em assinatura. Cancele o envio para editar."
  return null
}

export async function cancelarAssinaturaMinuta(
  minutaId: string,
  usuarioId: string
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data: m } = await admin
    .from("contratos_minutas")
    .select("assinada_em")
    .eq("id", minutaId)
    .eq("emp_proprietaria_id", emp)
    .maybeSingle()
  if (!m) return { erro: "Minuta não encontrada." }
  if (m.assinada_em) return { erro: "Todas as partes já assinaram — um contrato assinado não se cancela aqui." }

  // A rodada inteira deixa de valer — inclusive quem já tinha assinado: sem
  // todas as partes, não houve contrato. assinado_em fica como histórico.
  const daRodada = (await assinaturasDaMinuta(minutaId)).filter(
    (a) => a.situacao === "pendente" || a.situacao === "assinado"
  )
  const agora = new Date().toISOString()
  await admin
    .from("documento_assinaturas")
    .update({ situacao: "cancelado", updated_at: agora })
    .eq("documento_tipo", "minuta")
    .eq("documento_id", minutaId)
    .eq("emp_proprietaria_id", emp)
    .in("situacao", ["pendente", "assinado"])
  for (const a of daRodada) await evento(a.id, "cancelado", `Por usuário ${usuarioId}`, undefined, emp)
  // Destrava a edição: assinaturas já dadas deixam de valer se o texto mudar.
  await admin
    .from("contratos_minutas")
    .update({ assinatura_hash: null, updated_at: agora })
    .eq("id", minutaId)
    .eq("emp_proprietaria_id", emp)
  return {}
}

// ── Lado público (sem login) ─────────────────────────────────────────────────

export type EnvelopeMinuta = {
  assinatura: AssinaturaMinuta
  minutaId: string
  emp: string
  titulo: string
  texto: string
  entidade: string | null
  assinantes: { nome: string | null; papel: PapelMinuta; situacao: SituacaoEnvelope; ordem: number }[]
  aguardandoAnterior: boolean
  concluida: boolean
}

export async function envelopeMinutaPorToken(token: string): Promise<EnvelopeMinuta | null> {
  if (!UUID.test(token)) return null
  const db = createServiceClient()
  const { data } = await db
    .from("documento_assinaturas")
    .select("*")
    .eq("token", token)
    .eq("documento_tipo", "minuta")
    .maybeSingle()
  if (!data) return null
  const a = normalizar(data as Record<string, unknown>)
  const minutaId = String(data.documento_id)
  const emp = String(data.emp_proprietaria_id)
  const [{ data: m }, { data: todas }, { data: org }] = await Promise.all([
    db
      .from("contratos_minutas")
      .select("titulo, texto, assinada_em")
      .eq("id", minutaId)
      .eq("emp_proprietaria_id", emp)
      .maybeSingle(),
    db
      .from("documento_assinaturas")
      .select("*")
      .eq("documento_tipo", "minuta")
      .eq("documento_id", minutaId)
      .order("ordem", { ascending: true }),
    db.from("empresa").select("nome_razao, nome_fantasia").eq("id", emp).maybeSingle(),
  ])
  if (!m?.texto) return null
  // Só o envio desta rodada (mesmo hash); rodadas canceladas ficam de fora.
  const lista = (todas ?? [])
    .map((l) => normalizar(l as Record<string, unknown>))
    .filter((x) => x.hashDocumento === a.hashDocumento && (x.situacao !== "cancelado" || x.id === a.id))
  return {
    assinatura: a,
    minutaId,
    emp,
    titulo: texto(m.titulo) ?? "Contrato",
    texto: String(m.texto),
    entidade: texto(org?.nome_razao) ?? texto(org?.nome_fantasia),
    assinantes: lista.map((x) => ({ nome: x.nome, papel: x.papel, situacao: x.situacao, ordem: x.ordem })),
    aguardandoAnterior: lista.some((x) => x.ordem < a.ordem && x.situacao !== "assinado"),
    concluida: Boolean(m.assinada_em),
  }
}

export async function registrarAberturaMinuta(
  envelope: EnvelopeMinuta,
  ctx: { ip: string | null; userAgent: string | null }
): Promise<void> {
  const db = createServiceClient()
  if (!envelope.assinatura.visualizadoEm) {
    await db
      .from("documento_assinaturas")
      .update({ visualizado_em: new Date().toISOString() })
      .eq("id", envelope.assinatura.id)
  }
  await evento(envelope.assinatura.id, "abertura", null, ctx, envelope.emp)
}

export async function solicitarCodigoMinuta(
  token: string,
  ctx: { ip: string | null; userAgent: string | null }
): Promise<{ erro?: string; destino?: string }> {
  const envelope = await envelopeMinutaPorToken(token)
  if (!envelope) return { erro: "Link inválido." }
  const a = envelope.assinatura
  if (a.situacao !== "pendente") return { erro: "Este contrato não está aguardando sua assinatura." }
  if (envelope.aguardandoAnterior) return { erro: "Ainda não é a sua vez. Você receberá um e-mail." }
  if (!a.email) return { erro: "Não há e-mail para enviar o código." }

  const db = createServiceClient()
  const codigo = gerarCodigoAssinatura()
  await db
    .from("documento_assinaturas")
    .update({
      codigo_hash: hashCodigo(codigo, a.token),
      codigo_expira_em: new Date(Date.now() + VALIDADE_CODIGO_MIN * 60000).toISOString(),
      codigo_tentativas: 0,
    })
    .eq("id", a.id)
  await evento(a.id, "codigo_enviado", null, ctx, envelope.emp)
  await enviarEmail({
    email: a.email,
    nome: a.nome,
    assunto: `Código para assinar — ${envelope.titulo}`,
    html:
      tituloEmail("Seu código de assinatura") +
      paragrafo("Digite o código abaixo na página do contrato para concluir sua assinatura:") +
      caixaCodigo(codigo) +
      textoSuave(`O código vale por ${VALIDADE_CODIGO_MIN} minutos. Se não foi você que pediu, ignore este e-mail.`),
  })
  return { destino: mascararEmailAssinatura(a.email) }
}

export async function assinarMinuta(
  token: string,
  entrada: { codigo: string; nome: string; cpf: string; aceiteConteudo: boolean; aceiteEletronico: boolean },
  ctx: { ip: string | null; userAgent: string | null }
): Promise<{ erro?: string; concluido?: boolean }> {
  if (!entrada.aceiteConteudo) return { erro: "Confirme que leu o contrato e concorda com o conteúdo." }
  if (!entrada.aceiteEletronico) return { erro: "Confirme que aceita assinar eletronicamente." }
  const envelope = await envelopeMinutaPorToken(token)
  if (!envelope) return { erro: "Link inválido." }
  const a = envelope.assinatura
  if (a.situacao !== "pendente") return { erro: "Este contrato não está aguardando sua assinatura." }
  if (envelope.aguardandoAnterior) return { erro: "Ainda não é a sua vez." }

  const db = createServiceClient()
  const { data: segredo } = await db
    .from("documento_assinaturas")
    .select("codigo_hash, codigo_expira_em, codigo_tentativas")
    .eq("id", a.id)
    .single()
  if (!segredo?.codigo_hash) return { erro: "Peça o código primeiro." }
  if ((segredo.codigo_tentativas ?? 0) >= MAX_TENTATIVAS_CODIGO) return { erro: "Muitas tentativas. Peça um novo código." }
  if (!segredo.codigo_expira_em || new Date(String(segredo.codigo_expira_em)).getTime() < Date.now()) {
    return { erro: "O código expirou. Peça um novo." }
  }
  const codigo = entrada.codigo.replace(/\D/g, "")
  if (codigo.length !== 6 || !conferirCodigo(codigo, a.token, String(segredo.codigo_hash))) {
    await db
      .from("documento_assinaturas")
      .update({ codigo_tentativas: (segredo.codigo_tentativas ?? 0) + 1 })
      .eq("id", a.id)
    await evento(a.id, "codigo_invalido", null, ctx, envelope.emp)
    return { erro: "Código errado." }
  }

  // Identidade: o CPF digitado precisa ser o informado no envio.
  const cpf = limparCpf(entrada.cpf)
  if (!a.cpf || cpf !== a.cpf) {
    await db
      .from("documento_assinaturas")
      .update({ codigo_tentativas: (segredo.codigo_tentativas ?? 0) + 1 })
      .eq("id", a.id)
    await evento(a.id, "cpf_divergente", null, ctx, envelope.emp)
    return { erro: "O CPF não confere com o informado para esta assinatura. Se houver engano, fale com a entidade." }
  }
  const nome = entrada.nome.trim().replace(/\s+/g, " ")
  if (nome.split(" ").length < 2) return { erro: "Digite seu nome completo." }

  // Integridade: o texto não pode ter mudado desde o envio.
  if (!a.hashDocumento || a.hashDocumento !== hashTexto(envelope.texto)) {
    return { erro: "O contrato mudou depois do envio. Peça à entidade para enviar de novo." }
  }

  const agora = new Date().toISOString()
  await db
    .from("documento_assinaturas")
    .update({
      situacao: "assinado",
      assinado_em: agora,
      codigo_hash: null,
      nome_declarado: nome,
      cpf_conferido_em: agora,
      ip: ctx.ip,
      user_agent: ctx.userAgent,
      updated_at: agora,
    })
    .eq("id", a.id)
  await evento(a.id, "assinatura", a.certificado, ctx, envelope.emp)

  const { data: restantes } = await db
    .from("documento_assinaturas")
    .select("*")
    .eq("documento_tipo", "minuta")
    .eq("documento_id", envelope.minutaId)
    .eq("hash_documento", a.hashDocumento)
    .order("ordem", { ascending: true })
  const lista = (restantes ?? []).map((l) => normalizar(l as Record<string, unknown>))
  const proximo = lista.find((x) => x.situacao === "pendente")
  if (proximo) {
    await db.from("documento_assinaturas").update({ enviado_em: agora }).eq("id", proximo.id)
    await evento(proximo.id, "enviado", null, undefined, envelope.emp)
    await convidar(proximo, envelope.titulo)
    return { concluido: false }
  }

  await db
    .from("contratos_minutas")
    .update({ assinada_em: agora, updated_at: agora })
    .eq("id", envelope.minutaId)
    .eq("emp_proprietaria_id", envelope.emp)
  // Todos recebem o aviso com o link da própria página (de onde baixam o PDF).
  const origem = await origemAtual()
  for (const x of lista) {
    if (!x.email) continue
    await enviarEmail({
      email: x.email,
      nome: x.nome,
      assunto: `Contrato assinado por todas as partes — ${envelope.titulo}`,
      html:
        tituloEmail("Contrato assinado") +
        paragrafo(
          `O contrato <strong>${escaparHtml(envelope.titulo)}</strong> foi assinado por todas as partes${lista.some((y) => y.papel === "testemunha") ? " e testemunhas" : ""}.`
        ) +
        botaoEmail(`${origem}/assinar/${x.token}`, "Ver e baixar o contrato assinado") +
        caixaAviso("Guarde o PDF: ele traz o certificado com a trilha de cada assinatura."),
    })
  }
  return { concluido: true }
}

export async function recusarMinuta(
  token: string,
  motivo: string,
  ctx: { ip: string | null; userAgent: string | null }
): Promise<{ erro?: string }> {
  if (motivo.trim().length < 3) return { erro: "Diga o motivo da recusa." }
  const envelope = await envelopeMinutaPorToken(token)
  if (!envelope) return { erro: "Link inválido." }
  const a = envelope.assinatura
  if (a.situacao !== "pendente") return { erro: "Este contrato não está aguardando sua assinatura." }
  const db = createServiceClient()
  const agora = new Date().toISOString()
  await db
    .from("documento_assinaturas")
    .update({
      situacao: "recusado",
      recusado_em: agora,
      motivo_recusa: motivo.trim(),
      ip: ctx.ip,
      user_agent: ctx.userAgent,
      updated_at: agora,
    })
    .eq("id", a.id)
  await evento(a.id, "recusa", motivo.trim(), ctx, envelope.emp)
  return {}
}

// ── Verificação pública e PDF ────────────────────────────────────────────────

export type VerificacaoMinuta = {
  certificado: string
  titulo: string
  entidade: string | null
  nome: string | null
  papel: string
  cpf: string
  situacao: SituacaoEnvelope
  assinadoEm: string | null
  hash: string | null
  /** O texto atual da minuta ainda é o que foi assinado. */
  conteudoIntegro: boolean
  concluida: boolean
}

export async function verificarCertificadoMinuta(certificado: string): Promise<VerificacaoMinuta | null> {
  const c = certificado.trim().toUpperCase()
  if (!/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(c)) return null
  const db = createServiceClient()
  const { data } = await db
    .from("documento_assinaturas")
    .select("*")
    .eq("certificado", c)
    .eq("documento_tipo", "minuta")
    .maybeSingle()
  if (!data) return null
  const a = normalizar(data as Record<string, unknown>)
  const [{ data: m }, { data: org }] = await Promise.all([
    db
      .from("contratos_minutas")
      .select("titulo, texto, assinada_em")
      .eq("id", String(data.documento_id))
      .maybeSingle(),
    db.from("empresa").select("nome_razao, nome_fantasia").eq("id", String(data.emp_proprietaria_id)).maybeSingle(),
  ])
  return {
    certificado: c,
    titulo: texto(m?.titulo) ?? "Contrato",
    entidade: texto(org?.nome_razao) ?? texto(org?.nome_fantasia),
    nome: a.nomeDeclarado ?? a.nome,
    papel: ROTULO_PAPEL_MINUTA[a.papel],
    cpf: mascararCpf(a.cpf),
    situacao: a.situacao,
    assinadoEm: a.assinadoEm,
    hash: a.hashDocumento,
    conteudoIntegro: Boolean(m?.texto && a.hashDocumento && hashTexto(String(m.texto)) === a.hashDocumento),
    concluida: Boolean(m?.assinada_em),
  }
}

export type CertificacaoPDF = {
  hash: string
  concluida: boolean
  assinantes: {
    papel: string
    nome: string
    cpf: string
    email: string
    certificado: string
    situacao: string
    assinadoEm: string | null
    ip: string | null
    navegador: string | null
    url: string
    qr: string | null
    trilha: { quando: string; evento: string; ip: string | null }[]
  }[]
}

/**
 * Página de certificação do PDF: só com a rodada de assinaturas cujo hash é o
 * do texto ATUAL (se o texto mudou, nada é certificado).
 */
export async function certificacaoParaPdf(
  minutaId: string,
  textoAtual: string
): Promise<CertificacaoPDF | null> {
  const hash = hashTexto(textoAtual)
  const lista = (await assinaturasDaMinuta(minutaId, { comEventos: true })).filter(
    (a) => a.hashDocumento === hash && a.situacao !== "cancelado"
  )
  if (lista.length === 0) return null
  const origem = await origemAtual()
  return {
    hash,
    concluida: lista.every((a) => a.situacao === "assinado"),
    assinantes: await Promise.all(
      lista.map(async (a) => {
        const url = a.certificado ? `${origem}/verificar/${a.certificado}` : ""
        return {
          papel: `${ROTULO_PAPEL_MINUTA[a.papel]}${a.daEntidade ? " (entidade)" : ""}`,
          nome: a.nomeDeclarado ?? a.nome ?? "—",
          cpf: mascararCpf(a.cpf),
          email: mascararEmailAssinatura(a.email),
          certificado: a.certificado ?? "—",
          situacao: a.situacao,
          assinadoEm: a.assinadoEm ? formatarMomentoAssinatura(a.assinadoEm) : null,
          ip: a.ip,
          navegador: a.userAgent,
          url,
          qr:
            a.situacao === "assinado" && url
              ? await QRCode.toDataURL(url, { margin: 0, width: 200, errorCorrectionLevel: "M" })
              : null,
          trilha: a.eventos
            .filter((e) => e.tipo !== "codigo_invalido")
            .map((e) => ({
              quando: formatarMomentoAssinatura(e.quando),
              evento: ROTULO_EVENTO_MINUTA[e.tipo] ?? e.tipo,
              ip: e.ip,
            })),
        }
      })
    ),
  }
}

// ── PDF assinado por fora (ICP-Brasil / gov.br) ──────────────────────────────

const MAX_PDF_EXTERNO = 15 * 1024 * 1024

export async function anexarAssinadoExterno(
  minutaId: string,
  arquivo: File,
  usuarioId: string
): Promise<{ erro?: string }> {
  if (arquivo.type !== "application/pdf" && !arquivo.name.toLowerCase().endsWith(".pdf")) {
    return { erro: "Envie o PDF assinado." }
  }
  if (arquivo.size > MAX_PDF_EXTERNO) return { erro: "O PDF deve ter no máximo 15 MB." }
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const caminho = `minutas/${minutaId}/assinado-externo-${Date.now()}.pdf`
  const { error: erroUpload } = await admin.storage
    .from("documentos")
    .upload(caminho, arquivo, { contentType: "application/pdf" })
  if (erroUpload) return { erro: `Falha ao guardar o PDF: ${erroUpload.message}` }
  const agora = new Date().toISOString()
  const { error } = await admin
    .from("contratos_minutas")
    .update({
      arquivo_assinado: caminho,
      arquivo_assinado_em: agora,
      arquivo_assinado_por_id: usuarioId,
      updated_at: agora,
    })
    .eq("id", minutaId)
    .eq("emp_proprietaria_id", emp)
  if (error) return { erro: esquemaAusente(error) ? AVISO_SQL_ASSINATURA_MINUTA : error.message }
  return {}
}

export async function urlArquivoAssinado(caminho: string | null): Promise<string | null> {
  if (!caminho) return null
  const admin = await createAdminClient()
  const { data } = await admin.storage.from("documentos").createSignedUrl(caminho, 3600)
  return data?.signedUrl ?? null
}
