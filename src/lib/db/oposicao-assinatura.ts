import "server-only"

import { createElement } from "react"
import { renderToBuffer } from "@react-pdf/renderer"
import QRCode from "qrcode"

import type { ValidacaoAssinatura } from "@/lib/assinatura-pdf"
import type { SessaoTrabalhador } from "@/lib/auth"
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
import { hojeSP, texto } from "@/lib/db/comum"
import { mascararCpf, type CertificacaoPDF, type VerificacaoMinuta } from "@/lib/db/minuta-assinatura"
import { obterComprovante, registrarEvento, type Comprovante } from "@/lib/db/oposicao"
import { regrasDaCampanha } from "@/lib/db/oposicao-regras"
import { obterOrganizacao } from "@/lib/db/organizacao"
import { enviarEmail } from "@/lib/email"
import { botaoEmail, caixaAviso, caixaCodigo, escaparHtml, paragrafo, textoSuave, tituloEmail } from "@/lib/email-layout"
import { formatarCnpjCpf, formatarData } from "@/lib/formato"
import { assinaPeloConfluir } from "@/lib/oposicao-constantes"
import { CartaOposicaoPDF, type DadosCartaOposicao } from "@/lib/pdf/carta-oposicao"
import { logoDataUri } from "@/lib/pdf/logo-pdf"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { tenantAtual } from "@/lib/tenant"
import { origemAtual } from "@/lib/tenant-url"

/**
 * CARTA DE OPOSIÇÃO ASSINADA PELO PRÓPRIO CONFLUIR (08/11/2026).
 *
 * Quando a campanha aceita (decisão "assinaturas aceitas" = `confluir` ou
 * `confluir_ou_carta`), a pessoa assina a carta na página do comprovante, sem
 * baixar nem reenviar PDF. A mecânica é a dos ofícios, do aviso de férias e
 * do RPA (documento_assinaturas, tipo `oposicao`): resumo SHA-256 do
 * conteúdo, certificado público com QR code (/verificar/<certificado>),
 * trilha com IP e navegador, e o PDF com a página de certificado guardado
 * como a carta da oposição.
 *
 * PROVA DE QUE É ELA (decisão do usuário, 08/11/2026): quem confirmou o
 * e-mail por código NESTA MESMA SESSÃO, há até JANELA_SEM_CODIGO_MIN, assina
 * sem novo código — a jornada inteira (instruções, dados, vídeos, carta)
 * cabe na janela. Quem voltou depois, entrou por senha ou abriu outra sessão
 * recebe um código de 6 dígitos no e-mail. A sessão é lida do JWT verificado
 * (`getClaims`: `amr` com o método e a hora do login, e o `session_id`).
 */

/** Jornada do trabalhador: instruções, conferência dos dados, vídeos e carta. */
export const JANELA_SEM_CODIGO_MIN = 120

const METODOS_POR_EMAIL = new Set(["otp", "magiclink"])
const PASTA = "assinados"
const PAPEL = "Trabalhador(a) — oposição à contribuição"

export const ROTULO_EVENTO_CARTA: Record<string, string> = {
  codigo_enviado: "Código de assinatura enviado ao e-mail",
  codigo_invalido: "Código errado",
  sessao_confirmada: "Identidade: e-mail confirmado por código nesta sessão",
  codigo_conferido: "Identidade: código de assinatura conferido",
  assinatura: "Carta assinada",
}

// ── Prova da sessão ──────────────────────────────────────────────────────────

export type ProvaDaSessao = {
  /** Pode assinar sem novo código. */
  dispensaCodigo: boolean
  /** Quando o e-mail foi confirmado por código nesta sessão (ISO). */
  confirmadoEm: string | null
  /** Até quando a janela vale (ISO). */
  janelaAte: string | null
  sessaoId: string | null
}

export async function provaDaSessao(): Promise<ProvaDaSessao> {
  const nada: ProvaDaSessao = { dispensaCodigo: false, confirmadoEm: null, janelaAte: null, sessaoId: null }
  try {
    const supabase = await createClient()
    const { data } = await supabase.auth.getClaims()
    const claims = data?.claims as { amr?: { method?: string; timestamp?: number }[]; session_id?: string } | undefined
    if (!claims) return nada
    const porEmail = (claims.amr ?? [])
      .filter((a) => a.method && METODOS_POR_EMAIL.has(a.method) && typeof a.timestamp === "number")
      .map((a) => a.timestamp as number)
    if (porEmail.length === 0) return { ...nada, sessaoId: claims.session_id ?? null }
    const quando = Math.max(...porEmail) * 1000
    const ate = quando + JANELA_SEM_CODIGO_MIN * 60_000
    return {
      dispensaCodigo: Date.now() <= ate,
      confirmadoEm: new Date(quando).toISOString(),
      janelaAte: new Date(ate).toISOString(),
      sessaoId: claims.session_id ?? null,
    }
  } catch (e) {
    console.error("[oposicao] prova da sessão:", e)
    return nada
  }
}

// ── Conteúdo assinado ────────────────────────────────────────────────────────

/** Os dados da carta — os mesmos da carta para baixar e do PDF assinado. */
export async function dadosDaCarta(c: Comprovante): Promise<{ dados: DadosCartaOposicao; logo: string | null }> {
  const org = await obterOrganizacao().catch(() => null)
  return {
    dados: {
      organizacao: org?.nomeFantasia ?? org?.nomeRazao ?? null,
      nome: c.nome,
      cpf: c.cpf,
      matricula: c.matricula,
      empregador: c.empregadorNome,
      empregadorCnpj: c.empregadorCnpj ? formatarCnpjCpf(c.empregadorCnpj) : null,
      campanha: c.campanhaNome,
      detalhe: c.detalhe_desconto,
      declaracao: c.texto_declaracao,
      protocolo: c.protocolo,
      data: c.confirmado_em,
    },
    logo: await logoDataUri(org?.logoUrl ?? null),
  }
}

/** SHA-256 do conteúdo da carta (a ordem dos campos é fixa). */
export function hashDaCarta(d: DadosCartaOposicao): string {
  return hashTexto(
    JSON.stringify([
      d.organizacao,
      d.nome,
      (d.cpf ?? "").replace(/\D/g, ""),
      d.matricula,
      d.empregador,
      d.empregadorCnpj ?? null,
      d.campanha,
      d.detalhe,
      d.declaracao,
      d.protocolo,
      d.data,
    ])
  )
}

// ── Estado para a tela ───────────────────────────────────────────────────────

export type EstadoAssinaturaCarta = {
  /** A campanha aceita a assinatura pelo Confluir. */
  disponivel: boolean
  prova: ProvaDaSessao
  /** E-mail mascarado para onde vai o código. */
  emailMascarado: string | null
  /** Já há um código pedido e ainda válido. */
  codigoPendente: boolean
}

export async function estadoDaAssinaturaCarta(
  c: Comprovante,
  sessao: SessaoTrabalhador,
  aceitas: string | null
): Promise<EstadoAssinaturaCarta> {
  const prova = await provaDaSessao()
  let codigoPendente = false
  if (assinaPeloConfluir(aceitas)) {
    const pendente = await envelopePendente(c.id)
    codigoPendente = Boolean(
      pendente?.codigo_hash && pendente.codigo_expira_em && new Date(String(pendente.codigo_expira_em)).getTime() > Date.now()
    )
  }
  return {
    disponivel: assinaPeloConfluir(aceitas),
    prova,
    emailMascarado: sessao.email ? mascararEmailAssinatura(sessao.email) : null,
    codigoPendente,
  }
}

// ── Envelope ─────────────────────────────────────────────────────────────────

async function envelopePendente(opositorId: string) {
  const db = await createAdminClient()
  const { data } = await db
    .from("documento_assinaturas")
    .select("id, token, certificado, codigo_hash, codigo_expira_em, codigo_tentativas")
    .eq("documento_tipo", "oposicao")
    .eq("documento_id", opositorId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("situacao", "pendente")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  return data
}

async function evento(
  assinaturaId: string,
  tipo: string,
  detalhe: string | null,
  ctx: { ip: string | null; userAgent: string | null },
  emp: string,
  /** A mesma hora do assinado_em (o relógio do banco difere do servidor). */
  quando?: string
): Promise<void> {
  const db = await createAdminClient()
  await db.from("documento_assinatura_eventos").insert({
    assinatura_id: assinaturaId,
    tipo,
    detalhe,
    ip: ctx.ip,
    user_agent: ctx.userAgent,
    emp_proprietaria_id: emp,
    ...(quando ? { created_at: quando } : {}),
  })
}

/** A oposição pode receber a carta assinada pelo Confluir agora? */
async function conferirOposicao(
  opositorId: string,
  sessao: SessaoTrabalhador
): Promise<{ erro: string } | { c: Comprovante; aceitas: string | null }> {
  const c = await obterComprovante(opositorId, sessao.cpf)
  if (!c) return { erro: "Oposição não encontrada." }
  if (c.situacao !== "aguardando_documento") {
    return { erro: "Esta oposição não está aguardando a carta assinada. Recarregue a página." }
  }
  const { efetivas } = await regrasDaCampanha(c.campanhaId)
  if (!assinaPeloConfluir(efetivas.assinaturas_aceitas)) {
    return { erro: "Esta campanha não aceita a assinatura pelo Confluir." }
  }
  // A mesma regra do envio do PDF: "carta depois do prazo = recusar".
  if (efetivas.carta_fora_prazo === "recusar" && c.prazo_fim && hojeSP() > c.prazo_fim.slice(0, 10)) {
    return { erro: `O prazo para assinar a carta terminou em ${formatarData(c.prazo_fim)}. Fale com a entidade.` }
  }
  return { c, aceitas: efetivas.assinaturas_aceitas }
}

// ── Código (quando a janela da sessão não vale) ──────────────────────────────

export async function solicitarCodigoCarta(
  opositorId: string,
  sessao: SessaoTrabalhador,
  ctx: { ip: string | null; userAgent: string | null }
): Promise<{ erro?: string; destino?: string }> {
  const r = await conferirOposicao(opositorId, sessao)
  if ("erro" in r) return { erro: r.erro }
  if (!sessao.email) return { erro: "Não há e-mail no seu cadastro para enviar o código. Fale com a entidade." }
  const emp = await tenantAtual()
  const db = await createAdminClient()
  const { dados } = await dadosDaCarta(r.c)
  let envelope = await envelopePendente(opositorId)
  if (!envelope) {
    const { data, error } = await db
      .from("documento_assinaturas")
      .insert({
        emp_proprietaria_id: emp,
        documento_tipo: "oposicao",
        documento_id: opositorId,
        nome: r.c.nome,
        email: sessao.email,
        cpf: (sessao.cpf ?? "").replace(/\D/g, ""),
        papel: "assinante",
        certificado: novoCertificado(),
        hash_documento: hashDaCarta(dados),
        situacao: "pendente",
        enviado_em: new Date().toISOString(),
      })
      .select("id, token, certificado, codigo_hash, codigo_expira_em, codigo_tentativas")
      .single()
    if (error || !data) {
      console.error("[oposicao] envelope da carta (código):", error?.message)
      return { erro: "Não foi possível preparar a assinatura. Tente de novo." }
    }
    envelope = data
  }
  const codigo = gerarCodigoAssinatura()
  await db
    .from("documento_assinaturas")
    .update({
      codigo_hash: hashCodigo(codigo, String(envelope.token)),
      codigo_expira_em: new Date(Date.now() + VALIDADE_CODIGO_MIN * 60_000).toISOString(),
      codigo_tentativas: 0,
      email: sessao.email,
      hash_documento: hashDaCarta(dados),
    })
    .eq("id", envelope.id)
  await evento(String(envelope.id), "codigo_enviado", null, ctx, emp)
  await enviarEmail({
    email: sessao.email,
    nome: r.c.nome,
    assunto: "Código para assinar a carta de oposição",
    html:
      tituloEmail("Seu código de assinatura") +
      paragrafo("Digite o código abaixo na página da sua oposição para assinar a carta:") +
      caixaCodigo(codigo) +
      textoSuave(`O código vale por ${VALIDADE_CODIGO_MIN} minutos. Se não foi você que pediu, ignore este e-mail.`),
  })
  return { destino: mascararEmailAssinatura(sessao.email) }
}

// ── Assinar ──────────────────────────────────────────────────────────────────

export async function assinarCartaPeloConfluir(
  opositorId: string,
  sessao: SessaoTrabalhador,
  entrada: { codigo: string | null; nome: string; aceiteConteudo: boolean; aceiteEletronico: boolean },
  ctx: { ip: string | null; userAgent: string | null }
): Promise<{ erro?: string; precisaCodigo?: boolean }> {
  if (!entrada.aceiteConteudo) return { erro: "Confirme que leu a carta e quer se opor ao desconto." }
  if (!entrada.aceiteEletronico) return { erro: "Confirme que aceita assinar eletronicamente." }
  const nome = entrada.nome.trim().replace(/\s+/g, " ")
  if (nome.split(" ").length < 2) return { erro: "Digite o seu nome completo." }

  const r = await conferirOposicao(opositorId, sessao)
  if ("erro" in r) return { erro: r.erro }
  const { c } = r
  const emp = await tenantAtual()
  const db = await createAdminClient()
  const { dados, logo } = await dadosDaCarta(c)
  const hash = hashDaCarta(dados)

  // Quem é: a sessão em que o e-mail foi confirmado, ou um código novo.
  const prova = await provaDaSessao()
  let envelope = await envelopePendente(opositorId)
  let provaTexto: string
  let eventoProva: string
  if (prova.dispensaCodigo) {
    provaTexto = `Identidade: e-mail ${mascararEmailAssinatura(sessao.email)} confirmado por código de uso único em ${formatarMomentoAssinatura(prova.confirmadoEm)}, na mesma sessão da assinatura.`
    eventoProva = "sessao_confirmada"
  } else {
    if (!envelope?.codigo_hash) return { erro: "Peça o código de assinatura primeiro.", precisaCodigo: true }
    if ((envelope.codigo_tentativas ?? 0) >= MAX_TENTATIVAS_CODIGO) {
      return { erro: "Muitas tentativas. Peça um novo código.", precisaCodigo: true }
    }
    if (!envelope.codigo_expira_em || new Date(String(envelope.codigo_expira_em)).getTime() < Date.now()) {
      return { erro: "O código expirou. Peça um novo.", precisaCodigo: true }
    }
    const codigo = (entrada.codigo ?? "").replace(/\D/g, "")
    if (codigo.length !== 6 || !conferirCodigo(codigo, String(envelope.token), String(envelope.codigo_hash))) {
      await db
        .from("documento_assinaturas")
        .update({ codigo_tentativas: (envelope.codigo_tentativas ?? 0) + 1 })
        .eq("id", envelope.id)
      await evento(String(envelope.id), "codigo_invalido", null, ctx, emp)
      return { erro: "Código errado.", precisaCodigo: true }
    }
    provaTexto = `Identidade: código de uso único enviado ao e-mail ${mascararEmailAssinatura(sessao.email)} e conferido na assinatura.`
    eventoProva = "codigo_conferido"
  }

  const agora = new Date().toISOString()
  const campos = {
    situacao: "assinado",
    assinado_em: agora,
    codigo_hash: null,
    nome: c.nome,
    nome_declarado: nome,
    email: sessao.email,
    cpf: (sessao.cpf ?? "").replace(/\D/g, ""),
    cpf_conferido_em: agora,
    hash_documento: hash,
    ip: ctx.ip,
    user_agent: ctx.userAgent,
    updated_at: agora,
  }
  if (envelope) {
    const { data } = await db
      .from("documento_assinaturas")
      .update(campos)
      .eq("id", envelope.id)
      .eq("situacao", "pendente")
      .select("id, token, certificado, codigo_hash, codigo_expira_em, codigo_tentativas")
    if (!data?.length) return { erro: "A assinatura mudou enquanto você assinava. Recarregue a página." }
    envelope = data[0]
  } else {
    const { data, error } = await db
      .from("documento_assinaturas")
      .insert({
        ...campos,
        emp_proprietaria_id: emp,
        documento_tipo: "oposicao",
        documento_id: opositorId,
        papel: "assinante",
        certificado: novoCertificado(),
        enviado_em: agora,
      })
      .select("id, token, certificado, codigo_hash, codigo_expira_em, codigo_tentativas")
      .single()
    if (error || !data) {
      console.error("[oposicao] envelope da carta (assinar):", error?.message)
      return { erro: "Não foi possível registrar a assinatura. Tente de novo." }
    }
    envelope = data
  }
  const assinaturaId = String(envelope.id)
  const certificado = String(envelope.certificado)
  await evento(assinaturaId, eventoProva, prova.sessaoId ? `sessão ${prova.sessaoId}` : null, ctx, emp, agora)
  await evento(assinaturaId, "assinatura", certificado, ctx, emp, agora)

  // O PDF com o certificado vira a carta da oposição.
  const desfazer = async () => {
    await db.from("documento_assinaturas").update({ situacao: "cancelado", updated_at: new Date().toISOString() }).eq("id", assinaturaId)
  }
  let caminho: string
  try {
    const certificacao = await certificacaoDaCarta(opositorId, hash)
    const elemento = createElement(CartaOposicaoPDF, {
      dados,
      logoDataUri: logo,
      certificacao,
      provaIdentidade: provaTexto,
    }) as Parameters<typeof renderToBuffer>[0]
    const pdf = await renderToBuffer(elemento)
    caminho = `${PASTA}/confluir-${opositorId}-${certificado}.pdf`
    const up = await db.storage.from("oposicao").upload(caminho, new Uint8Array(pdf), { contentType: "application/pdf", upsert: true })
    if (up.error) throw new Error(up.error.message)
  } catch (e) {
    console.error("[oposicao] carta assinada pelo Confluir (PDF):", e)
    await desfazer()
    return { erro: "Não foi possível gerar a carta assinada. Tente de novo em instantes." }
  }

  const validacao: ValidacaoAssinatura = {
    situacao: "valida",
    resumo: `Assinada eletronicamente pelo Confluir em ${formatarMomentoAssinatura(agora)} — certificado ${certificado}. ${provaTexto}`,
    assinaturas: [],
    cpfEsperado: (sessao.cpf ?? "").replace(/\D/g, ""),
    cpfConfere: true,
    verificadoEm: agora,
    versao: 1,
    origem: "confluir",
    certificado,
  }
  const { data: gravado, error } = await db
    .from("oposicao_opositor")
    .update({
      documento_assinado_url: caminho,
      situacao: "nao_avaliada",
      assinatura_validacao: validacao,
      documento_enviado_em: agora,
      reprovacao_motivo: null,
    })
    .eq("id", opositorId)
    .eq("emp_proprietaria_id", emp)
    .eq("situacao", "aguardando_documento")
    .select("id")
  if (error || !gravado?.length) {
    await db.storage.from("oposicao").remove([caminho]).catch(() => undefined)
    await desfazer()
    return { erro: "A situação da sua oposição mudou enquanto você assinava. Recarregue a página e confira." }
  }
  await registrarEvento(
    opositorId,
    "carta_assinada_confluir",
    `certificado ${certificado} · ${eventoProva === "sessao_confirmada" ? "e-mail confirmado nesta sessão" : "código conferido"}`,
    ctx.ip,
    ctx.userAgent
  )

  if (sessao.email) {
    const origem = await origemAtual().catch(() => "")
    await enviarEmail({
      email: sessao.email,
      nome: c.nome,
      assunto: "Carta de oposição assinada",
      html:
        tituloEmail("Carta de oposição assinada") +
        paragrafo(
          `Sua carta de oposição${c.campanhaNome ? ` (${escaparHtml(c.campanhaNome)})` : ""} foi assinada em ${escaparHtml(formatarMomentoAssinatura(agora))} (horário de Brasília). A entidade agora analisa a sua oposição.`
        ) +
        botaoEmail(`${origem}/portal/oposicao/comprovante/${opositorId}`, "Ver o comprovante e baixar a carta") +
        caixaAviso(`Certificado da assinatura: ${certificado}. Qualquer pessoa pode conferir em ${origem}/verificar/${certificado}.`),
    }).catch((e) => console.error("[oposicao] e-mail da carta assinada:", e))
  }
  return {}
}

// ── Certificado no PDF e verificação pública ─────────────────────────────────

export async function certificacaoDaCarta(opositorId: string, hash: string): Promise<CertificacaoPDF | null> {
  const db = await createAdminClient()
  const { data: a } = await db
    .from("documento_assinaturas")
    .select("id, nome, nome_declarado, cpf, email, certificado, situacao, assinado_em, ip, user_agent")
    .eq("documento_tipo", "oposicao")
    .eq("documento_id", opositorId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("situacao", "assinado")
    .eq("hash_documento", hash)
    .order("assinado_em", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!a) return null
  const { data: eventos } = await db
    .from("documento_assinatura_eventos")
    .select("tipo, ip, created_at")
    .eq("assinatura_id", a.id)
    .order("created_at")
  const origem = await origemAtual().catch(() => "")
  const url = a.certificado ? `${origem}/verificar/${a.certificado}` : ""
  return {
    hash,
    concluida: true,
    assinantes: [
      {
        papel: PAPEL,
        nome: texto(a.nome_declarado) ?? texto(a.nome) ?? "—",
        cpf: mascararCpf(texto(a.cpf)),
        email: mascararEmailAssinatura(texto(a.email)),
        certificado: texto(a.certificado) ?? "—",
        situacao: String(a.situacao),
        assinadoEm: a.assinado_em ? formatarMomentoAssinatura(String(a.assinado_em)) : null,
        ip: texto(a.ip),
        navegador: texto(a.user_agent),
        url,
        qr: url ? await QRCode.toDataURL(url, { margin: 0, width: 200, errorCorrectionLevel: "M" }) : null,
        trilha: (eventos ?? [])
          .filter((e) => e.tipo !== "codigo_invalido")
          .map((e) => ({
            quando: formatarMomentoAssinatura(String(e.created_at)),
            evento: ROTULO_EVENTO_CARTA[String(e.tipo)] ?? String(e.tipo),
            ip: texto(e.ip),
          })),
      },
    ],
  }
}

/** /verificar/<certificado> para a carta de oposição. Não mostra o conteúdo. */
export async function verificarCertificadoOposicao(certificado: string): Promise<VerificacaoMinuta | null> {
  const c = certificado.trim().toUpperCase()
  if (!/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(c)) return null
  const db = await createAdminClient()
  const { data } = await db
    .from("documento_assinaturas")
    .select("emp_proprietaria_id, documento_id, nome, nome_declarado, cpf, situacao, assinado_em, hash_documento")
    .eq("certificado", c)
    .eq("documento_tipo", "oposicao")
    .maybeSingle()
  if (!data) return null
  const { data: org } = await db
    .from("empresa")
    .select("nome_razao, nome_fantasia")
    .eq("id", String(data.emp_proprietaria_id))
    .maybeSingle()
  // Campanha e integridade: só no domínio da própria entidade.
  let titulo = "Carta de oposição à contribuição assistencial"
  let conteudoIntegro = data.situacao === "assinado"
  if (String(data.emp_proprietaria_id) === (await tenantAtual()) && data.documento_id) {
    const { data: o } = await db
      .from("oposicao_opositor")
      .select("cpf, campanha_id")
      .eq("id", String(data.documento_id))
      .maybeSingle()
    const comp = o?.cpf ? await obterComprovante(String(data.documento_id), String(o.cpf)) : null
    if (comp) {
      if (comp.campanhaNome) titulo = `Carta de oposição — ${comp.campanhaNome}`
      conteudoIntegro = data.situacao === "assinado" && hashDaCarta((await dadosDaCarta(comp)).dados) === data.hash_documento
    }
  }
  const situacao = String(data.situacao)
  return {
    certificado: c,
    titulo,
    entidade: texto(org?.nome_razao) ?? texto(org?.nome_fantasia),
    nome: texto(data.nome_declarado) ?? texto(data.nome),
    papel: PAPEL,
    cpf: mascararCpf(texto(data.cpf)),
    situacao: situacao as VerificacaoMinuta["situacao"],
    assinadoEm: texto(data.assinado_em),
    hash: texto(data.hash_documento),
    conteudoIntegro,
    concluida: situacao === "assinado",
  }
}
