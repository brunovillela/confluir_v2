import "server-only"

import { createElement } from "react"
import { renderToBuffer } from "@react-pdf/renderer"
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
import { avisarQuemPodeOuCoordena, depoisDaResposta } from "@/lib/db/avisos"
import { texto } from "@/lib/db/comum"
import { mascararCpf, type CertificacaoPDF, type VerificacaoMinuta } from "@/lib/db/minuta-assinatura"
import { listarSedes, obterOrganizacao } from "@/lib/db/organizacao"
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
import { formatarData } from "@/lib/formato"
import { somarDiasISO } from "@/lib/periodo-dias"
import { AvisoFeriasPDF, type DadosAvisoFerias } from "@/lib/pdf/aviso-ferias"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"
import { origemAtual } from "@/lib/tenant-url"

/**
 * Aviso de férias assinado pelo funcionário (pedido de 19/10).
 *
 * Gozo AUTORIZADO → o sistema gera o Aviso de Férias (CLT art. 135), manda
 * por e-mail ao funcionário o link pessoal e colhe a assinatura eletrônica
 * dele: código de uso único no e-mail + nome completo e CPF conferido com o
 * cadastro + aceite expresso. O conteúdo (funcionário, período aquisitivo,
 * datas do gozo, retorno e abono) é congelado por SHA-256. Assinado, o PDF com
 * a página de certificado vira o aviso do gozo (aviso_ferias_url).
 *
 * Ajustar as datas muda o conteúdo: o link antigo é cancelado e sai um aviso
 * novo. Desfazer a autorização, excluir ou cancelar o gozo cancela o link.
 * Mesmo envelope dos ofícios/RPA (documento_assinaturas, tipo "ferias").
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
/** Pasta dos avisos assinados no bucket 'pessoal' (os enviados à mão ficam em ferias/<período>/). */
const PASTA_ASSINADOS = "ferias/avisos-assinados"

export type SituacaoAvisoFerias = "pendente" | "assinado" | "recusado" | "cancelado"

export type AssinaturaAviso = {
  id: string
  nome: string | null
  email: string | null
  cpf: string | null
  nomeDeclarado: string | null
  situacao: SituacaoAvisoFerias
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
  eventos: { tipo: string; detalhe: string | null; ip: string | null; quando: string }[]
}

export const ROTULO_EVENTO_AVISO: Record<string, string> = {
  enviado: "Aviso enviado por e-mail",
  reenviado: "Link reenviado",
  abertura: "Aviso aberto",
  codigo_enviado: "Código de uso único enviado",
  codigo_invalido: "Código incorreto",
  cpf_divergente: "CPF digitado não confere",
  assinatura: "Assinatura (ciência)",
  recusa: "Recusa",
  cancelado: "Link cancelado",
}

function normalizar(l: Record<string, unknown>, eventos: AssinaturaAviso["eventos"] = []): AssinaturaAviso {
  return {
    id: String(l.id),
    nome: texto(l.nome),
    email: texto(l.email),
    cpf: texto(l.cpf),
    nomeDeclarado: texto(l.nome_declarado),
    situacao: (l.situacao as SituacaoAvisoFerias) ?? "pendente",
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

// ── O aviso (dados, hash, PDF) ───────────────────────────────────────────────

export type AvisoDoGozo = {
  gozoId: string
  funcionarioId: string
  periodoId: string | null
  autorizado: boolean
  avisoAtual: string | null
  email: string | null
  /** CPF do cadastro (só dígitos) — o que o funcionário digita para assinar. */
  cpf: string | null
  dados: DadosAvisoFerias
}

/** Lê o gozo, o período e o funcionário (no tenant). Null se faltar data. */
export async function carregarAviso(gozoId: string): Promise<AvisoDoGozo | null> {
  if (!UUID.test(gozoId)) return null
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data: g } = await admin
    .from("pessoal_ferias_gozo")
    .select("id, funcionario_id, ferias_periodo_id, inicio, termino, dias, autorizado, abono_solicitado, aviso_ferias_url")
    .eq("id", gozoId)
    .eq("emp_proprietaria_id", emp)
    .maybeSingle()
  if (!g || !g.funcionario_id || !g.inicio || !g.termino || !g.dias) return null
  const [{ data: p }, { data: u }, { data: vs }] = await Promise.all([
    g.ferias_periodo_id
      ? admin.from("pessoal_ferias").select("aquisitivo_inicio, aquisitivo_termino, abono_pecuniario").eq("id", g.ferias_periodo_id).maybeSingle()
      : Promise.resolve({ data: null }),
    admin.from("usuarios").select("nome_completo, nome_guerra, cpf, email").eq("id", g.funcionario_id).maybeSingle(),
    admin
      .from("vinculos_trabalhistas")
      .select("cargo, matricula, contrato_demissao, contrato_admissao")
      .eq("trabalhador_id", g.funcionario_id)
      .eq("empregador_id", emp),
  ])
  const vinculo = (vs ?? []).sort((a, b) => Number(Boolean(a.contrato_demissao)) - Number(Boolean(b.contrato_demissao)))[0]
  const cpf = limparCpf(String(u?.cpf ?? ""))
  return {
    gozoId: String(g.id),
    funcionarioId: String(g.funcionario_id),
    periodoId: texto(g.ferias_periodo_id),
    autorizado: g.autorizado === true,
    avisoAtual: texto(g.aviso_ferias_url),
    email: texto(u?.email),
    cpf: cpf.length === 11 && validarCpf(cpf) ? cpf : null,
    dados: {
      funcionario: {
        nome: (texto(u?.nome_completo) ?? texto(u?.nome_guerra) ?? "—").trim(),
        cpf: cpf.length === 11 ? cpf : null,
        cargo: texto(vinculo?.cargo),
        matricula: texto(vinculo?.matricula),
      },
      aquisitivo: { inicio: texto(p?.aquisitivo_inicio), termino: texto(p?.aquisitivo_termino) },
      gozo: { inicio: String(g.inicio), termino: String(g.termino), dias: Number(g.dias), retorno: somarDiasISO(String(g.termino), 1) },
      abono: g.abono_solicitado === true || p?.abono_pecuniario === true,
    },
  }
}

/** O que a assinatura cobre: quem, de que período, quando sai e quando volta. */
export function hashDoAviso(d: DadosAvisoFerias): string {
  return hashTexto(
    JSON.stringify([
      d.funcionario.nome,
      d.funcionario.cpf,
      d.aquisitivo.inicio,
      d.aquisitivo.termino,
      d.gozo.inicio,
      d.gozo.termino,
      d.gozo.dias,
      d.gozo.retorno,
      d.abono,
    ])
  )
}

async function nomeEntidade(): Promise<string> {
  const org = await obterOrganizacao()
  return org?.nomeRazao ?? org?.nomeFantasia ?? "a entidade"
}

export async function renderizarPdfAviso(
  dados: DadosAvisoFerias,
  opcoes: { certificacao?: CertificacaoPDF | null; dataDocumento?: string | null } = {}
): Promise<Buffer> {
  const [organizacao, { sedes }] = await Promise.all([
    obterOrganizacao(),
    listarSedes().catch(() => ({ disponivel: false, sedes: [] })),
  ])
  const elemento = createElement(AvisoFeriasPDF, {
    dados,
    organizacao: {
      nome: organizacao?.nomeRazao ?? organizacao?.nomeFantasia ?? "Organização",
      cnpj: organizacao?.cnpjCpf ?? null,
      cidade: sedes[0]?.cidade ?? null,
    },
    dataDocumento: opcoes.dataDocumento ?? null,
    certificacao: opcoes.certificacao ?? null,
  }) as Parameters<typeof renderToBuffer>[0]
  return renderToBuffer(elemento)
}

// ── Envelope ─────────────────────────────────────────────────────────────────

async function evento(
  assinaturaId: string,
  tipo: string,
  detalhe: string | null,
  ctx: { ip: string | null; userAgent: string | null } = { ip: null, userAgent: null },
  emp?: string
): Promise<void> {
  const db = await createAdminClient()
  await db.from("documento_assinatura_eventos").insert({
    assinatura_id: assinaturaId,
    tipo,
    detalhe,
    ip: ctx.ip,
    user_agent: ctx.userAgent,
    ...(emp ? { emp_proprietaria_id: emp } : {}),
  })
}

/** Envios do aviso do gozo, do mais novo para o mais antigo. */
export async function assinaturasDoAviso(
  gozoId: string,
  opcoes: { comEventos?: boolean } = {}
): Promise<AssinaturaAviso[]> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("documento_assinaturas")
    .select("*")
    .eq("documento_tipo", "ferias")
    .eq("documento_id", gozoId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .order("created_at", { ascending: false })
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
        .map((e) => ({ tipo: String(e.tipo), detalhe: texto(e.detalhe), ip: texto(e.ip), quando: String(e.created_at) }))
    )
  )
}

/** Situação do aviso de cada gozo (o envio mais recente) — para o painel. */
export async function situacaoDosAvisos(
  gozoIds: string[]
): Promise<Map<string, { situacao: SituacaoAvisoFerias; enviadoEm: string | null; assinadoEm: string | null; motivoRecusa: string | null }>> {
  const mapa = new Map<string, { situacao: SituacaoAvisoFerias; enviadoEm: string | null; assinadoEm: string | null; motivoRecusa: string | null }>()
  if (gozoIds.length === 0) return mapa
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("documento_assinaturas")
    .select("documento_id, situacao, enviado_em, assinado_em, motivo_recusa, created_at")
    .eq("documento_tipo", "ferias")
    .eq("emp_proprietaria_id", await tenantAtual())
    .in("documento_id", gozoIds)
    .order("created_at", { ascending: false })
  if (error) return mapa
  for (const l of data ?? []) {
    const id = String(l.documento_id)
    if (mapa.has(id)) continue
    mapa.set(id, {
      situacao: l.situacao as SituacaoAvisoFerias,
      enviadoEm: texto(l.enviado_em),
      assinadoEm: texto(l.assinado_em),
      motivoRecusa: texto(l.motivo_recusa),
    })
  }
  return mapa
}

async function convidar(a: AssinaturaAviso, d: DadosAvisoFerias): Promise<void> {
  if (!a.email) return
  const link = `${await origemAtual()}/assinar/${a.token}`
  const entidade = await nomeEntidade()
  const primeiro = d.funcionario.nome.split(" ")[0]
  await enviarEmail({
    email: a.email,
    nome: a.nome,
    assunto: `Aviso de férias para assinar — ${formatarData(d.gozo.inicio)} a ${formatarData(d.gozo.termino)}`,
    html:
      tituloEmail("Aviso de férias") +
      paragrafo(`Olá, ${escaparHtml(primeiro)}.`) +
      paragrafo(
        `${escaparHtml(entidade)} comunica suas férias de <strong>${formatarData(d.gozo.inicio)} a ${formatarData(d.gozo.termino)}</strong> (${d.gozo.dias} dias corridos), com retorno ao trabalho em <strong>${formatarData(d.gozo.retorno)}</strong>. Leia o aviso e assine para confirmar que está ciente.`
      ) +
      botaoEmail(link, "Ler e assinar o aviso") +
      linkReserva(link) +
      textoSuave(
        "Ao abrir, você lê o aviso, pede um código de 6 dígitos por e-mail e confirma com seu nome completo e CPF. Este link é pessoal: não o encaminhe. Se algo estiver errado nas datas, fale com o departamento de pessoal antes de assinar."
      ),
  })
}

/**
 * Gera o aviso do gozo autorizado e manda o link ao funcionário. Idempotente:
 * se já há um envio (pendente ou assinado) do MESMO conteúdo, não faz nada;
 * se o conteúdo mudou (datas ajustadas), cancela o pendente e envia de novo.
 */
export async function enviarAvisoFerias(
  gozoId: string,
  usuarioId: string | null
): Promise<{ erro?: string; enviado?: boolean }> {
  const aviso = await carregarAviso(gozoId)
  if (!aviso) return { erro: "Gozo sem datas ou não encontrado." }
  if (!aviso.autorizado) return { erro: "O aviso só sai para gozo autorizado." }
  const hash = hashDoAviso(aviso.dados)
  const envios = await assinaturasDoAviso(gozoId)
  if (envios.some((a) => a.hashDocumento === hash && (a.situacao === "pendente" || a.situacao === "assinado"))) {
    return { enviado: false }
  }
  await cancelarAvisoFerias(gozoId, usuarioId, "As datas do gozo mudaram — um aviso novo foi enviado")
  if (!aviso.email || !EMAIL.test(aviso.email)) {
    return { erro: `${aviso.dados.funcionario.nome} não tem e-mail no cadastro — o aviso não foi enviado.` }
  }
  if (!aviso.cpf) {
    return { erro: `${aviso.dados.funcionario.nome} não tem CPF válido no cadastro — corrija-o na ficha para enviar o aviso.` }
  }

  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const agora = new Date().toISOString()
  const { data: nova, error } = await admin
    .from("documento_assinaturas")
    .insert({
      documento_tipo: "ferias",
      documento_id: gozoId,
      ordem: 1,
      papel: "assinante",
      nome: aviso.dados.funcionario.nome,
      email: aviso.email.toLowerCase(),
      cpf: aviso.cpf,
      situacao: "pendente",
      hash_documento: hash,
      certificado: novoCertificado(),
      enviado_por_id: usuarioId,
      enviado_em: agora,
      emp_proprietaria_id: emp,
    })
    .select("*")
    .single()
  if (error || !nova) {
    return {
      erro: /ck_doc_assinaturas_tipo/i.test(error?.message ?? "")
        ? "Assinatura do aviso de férias ainda não configurada no banco (migração ferias_aviso_assinatura)."
        : `Não foi possível enviar o aviso: ${error?.message ?? "erro desconhecido"}`,
    }
  }
  const a = normalizar(nova as Record<string, unknown>)
  await evento(a.id, "enviado", null, undefined, emp)
  await convidar(a, aviso.dados)
  return { enviado: true }
}

/** Manda de novo o e-mail com o mesmo link. */
export async function reenviarAvisoFerias(gozoId: string): Promise<{ erro?: string }> {
  const aviso = await carregarAviso(gozoId)
  if (!aviso) return { erro: "Gozo não encontrado." }
  const pendente = (await assinaturasDoAviso(gozoId)).find((a) => a.situacao === "pendente")
  if (!pendente) return { erro: "Não há aviso aguardando assinatura." }
  await evento(pendente.id, "reenviado", null, undefined, await tenantAtual())
  await convidar(pendente, aviso.dados)
  return {}
}

/** Cancela o link pendente (gozo desautorizado, excluído, cancelado ou com datas novas). */
export async function cancelarAvisoFerias(
  gozoId: string,
  usuarioId: string | null,
  motivo: string
): Promise<{ cancelados: number }> {
  const pendentes = (await assinaturasDoAviso(gozoId)).filter((a) => a.situacao === "pendente")
  if (pendentes.length === 0) return { cancelados: 0 }
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  await admin
    .from("documento_assinaturas")
    .update({ situacao: "cancelado", codigo_hash: null, updated_at: new Date().toISOString() })
    .in("id", pendentes.map((a) => a.id))
  for (const a of pendentes) {
    await evento(a.id, "cancelado", `${motivo}${usuarioId ? ` (usuário ${usuarioId})` : ""}`, undefined, emp)
  }
  return { cancelados: pendentes.length }
}

/**
 * Deixa o aviso de acordo com o gozo: autorizado → envia (ou reenvia, se as
 * datas mudaram); não autorizado → cancela o link. Erro só vai para o log —
 * o gozo já foi gravado; o painel mostra a situação do aviso.
 */
export async function sincronizarAvisoDoGozo(gozoId: string, usuarioId: string | null): Promise<void> {
  try {
    const aviso = await carregarAviso(gozoId)
    if (!aviso || !aviso.autorizado) {
      await cancelarAvisoFerias(gozoId, usuarioId, "Gozo sem autorização")
      return
    }
    const r = await enviarAvisoFerias(gozoId, usuarioId)
    if (r.erro) console.error("Aviso de férias:", r.erro)
  } catch (e) {
    console.error("Falha ao sincronizar o aviso de férias:", e)
  }
}

/**
 * Gozos AUTORIZADOS que ainda vão começar (início de hoje em diante) sem
 * aviso enviado — os anteriores a este recurso. Para o botão do painel.
 */
export async function gozosSemAviso(): Promise<{ gozoId: string; periodoId: string | null; funcionarioId: string; inicio: string }[]> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const hoje = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })
  const { data: gozos } = await admin
    .from("pessoal_ferias_gozo")
    .select("id, ferias_periodo_id, funcionario_id, inicio")
    .eq("emp_proprietaria_id", emp)
    .eq("autorizado", true)
    .gte("inicio", hoje)
  const lista = (gozos ?? []).filter((g) => g.funcionario_id && g.inicio)
  if (lista.length === 0) return []
  const situacoes = await situacaoDosAvisos(lista.map((g) => String(g.id)))
  return lista
    .filter((g) => {
      const s = situacoes.get(String(g.id))
      return !s || s.situacao === "cancelado"
    })
    .map((g) => ({ gozoId: String(g.id), periodoId: texto(g.ferias_periodo_id), funcionarioId: String(g.funcionario_id), inicio: String(g.inicio) }))
}

// ── PDF assinado ─────────────────────────────────────────────────────────────

export async function certificacaoDoAviso(gozoId: string, hash: string): Promise<CertificacaoPDF | null> {
  const lista = (await assinaturasDoAviso(gozoId, { comEventos: true })).filter(
    (a) => a.hashDocumento === hash && a.situacao === "assinado"
  )
  if (lista.length === 0) return null
  const origem = await origemAtual()
  return {
    hash,
    concluida: true,
    assinantes: await Promise.all(
      lista.slice(0, 1).map(async (a) => {
        const url = a.certificado ? `${origem}/verificar/${a.certificado}` : ""
        return {
          papel: "Empregado(a) — ciência do aviso",
          nome: a.nomeDeclarado ?? a.nome ?? "—",
          cpf: mascararCpf(a.cpf),
          email: mascararEmailAssinatura(a.email),
          certificado: a.certificado ?? "—",
          situacao: a.situacao,
          assinadoEm: a.assinadoEm ? formatarMomentoAssinatura(a.assinadoEm) : null,
          ip: a.ip,
          navegador: a.userAgent,
          url,
          qr: url ? await QRCode.toDataURL(url, { margin: 0, width: 200, errorCorrectionLevel: "M" }) : null,
          trilha: a.eventos
            .filter((e) => e.tipo !== "codigo_invalido")
            .map((e) => ({ quando: formatarMomentoAssinatura(e.quando), evento: ROTULO_EVENTO_AVISO[e.tipo] ?? e.tipo, ip: e.ip })),
        }
      })
    ),
  }
}

// ── Lado público (sem login) ─────────────────────────────────────────────────

export type EnvelopeAviso = {
  assinatura: AssinaturaAviso
  aviso: AvisoDoGozo
  emp: string
  entidade: string | null
}

export async function envelopeAvisoPorToken(token: string): Promise<EnvelopeAviso | null> {
  if (!UUID.test(token)) return null
  const db = await createAdminClient()
  const { data } = await db
    .from("documento_assinaturas")
    .select("*")
    .eq("token", token)
    .eq("documento_tipo", "ferias")
    .maybeSingle()
  if (!data) return null
  const emp = String(data.emp_proprietaria_id)
  // O link só vale no domínio da própria entidade.
  if (emp !== (await tenantAtual())) return null
  const aviso = await carregarAviso(String(data.documento_id))
  if (!aviso) return null
  return { assinatura: normalizar(data as Record<string, unknown>), aviso, emp, entidade: await nomeEntidade() }
}

export async function registrarAberturaAviso(
  envelope: EnvelopeAviso,
  ctx: { ip: string | null; userAgent: string | null }
): Promise<void> {
  const db = await createAdminClient()
  if (!envelope.assinatura.visualizadoEm) {
    await db.from("documento_assinaturas").update({ visualizado_em: new Date().toISOString() }).eq("id", envelope.assinatura.id)
  }
  await evento(envelope.assinatura.id, "abertura", null, ctx, envelope.emp)
}

export async function solicitarCodigoAviso(
  token: string,
  ctx: { ip: string | null; userAgent: string | null }
): Promise<{ erro?: string; destino?: string }> {
  const envelope = await envelopeAvisoPorToken(token)
  if (!envelope) return { erro: "Link inválido." }
  const a = envelope.assinatura
  if (a.situacao !== "pendente") return { erro: "Este aviso não está aguardando sua assinatura." }
  if (!a.email) return { erro: "Não há e-mail para enviar o código." }
  const db = await createAdminClient()
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
    assunto: "Código para assinar o aviso de férias",
    html:
      tituloEmail("Seu código de assinatura") +
      paragrafo("Digite o código abaixo na página do aviso de férias para concluir sua assinatura:") +
      caixaCodigo(codigo) +
      textoSuave(`O código vale por ${VALIDADE_CODIGO_MIN} minutos. Se não foi você que pediu, ignore este e-mail.`),
  })
  return { destino: mascararEmailAssinatura(a.email) }
}

export async function assinarAviso(
  token: string,
  entrada: { codigo: string; nome: string; cpf: string; aceiteConteudo: boolean; aceiteEletronico: boolean },
  ctx: { ip: string | null; userAgent: string | null }
): Promise<{ erro?: string }> {
  if (!entrada.aceiteConteudo) return { erro: "Confirme que leu o aviso e está ciente das suas férias." }
  if (!entrada.aceiteEletronico) return { erro: "Confirme que aceita assinar eletronicamente." }
  const envelope = await envelopeAvisoPorToken(token)
  if (!envelope) return { erro: "Link inválido." }
  const a = envelope.assinatura
  if (a.situacao !== "pendente") return { erro: "Este aviso não está aguardando sua assinatura." }

  const db = await createAdminClient()
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
  const errou = async (tipo: string) => {
    await db.from("documento_assinaturas").update({ codigo_tentativas: (segredo.codigo_tentativas ?? 0) + 1 }).eq("id", a.id)
    await evento(a.id, tipo, null, ctx, envelope.emp)
  }
  if (codigo.length !== 6 || !conferirCodigo(codigo, a.token, String(segredo.codigo_hash))) {
    await errou("codigo_invalido")
    return { erro: "Código errado." }
  }
  if (!a.cpf || limparCpf(entrada.cpf) !== a.cpf) {
    await errou("cpf_divergente")
    return { erro: "O CPF não confere com o do cadastro. Se houver engano, fale com o departamento de pessoal." }
  }
  const nome = entrada.nome.trim().replace(/\s+/g, " ")
  if (nome.split(" ").length < 2) return { erro: "Digite seu nome completo." }
  if (!a.hashDocumento || a.hashDocumento !== hashDoAviso(envelope.aviso.dados)) {
    return { erro: "As datas das férias mudaram depois do envio. Um aviso novo será enviado pelo departamento de pessoal." }
  }

  const agora = new Date().toISOString()
  const { data: assinou } = await db
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
    .eq("situacao", "pendente")
    .select("id")
  if (!assinou?.length) return { erro: "Este aviso não está mais aguardando sua assinatura." }
  await evento(a.id, "assinatura", a.certificado, ctx, envelope.emp)

  // O PDF com o certificado vira o aviso do gozo (sem apagar um aviso que o
  // departamento tenha anexado à mão — esse só é trocado se não houver).
  try {
    const certificacao = await certificacaoDoAviso(envelope.aviso.gozoId, a.hashDocumento)
    const pdf = await renderizarPdfAviso(envelope.aviso.dados, { certificacao, dataDocumento: a.enviadoEm })
    const caminho = `${PASTA_ASSINADOS}/${envelope.aviso.gozoId}-${a.certificado ?? Date.now()}.pdf`
    const { error: erroUp } = await db.storage.from("pessoal").upload(caminho, new Uint8Array(pdf), { contentType: "application/pdf", upsert: true })
    if (erroUp) throw new Error(erroUp.message)
    const anterior = envelope.aviso.avisoAtual
    if (!anterior || anterior.startsWith(`${PASTA_ASSINADOS}/`)) {
      await db.from("pessoal_ferias_gozo").update({ aviso_ferias_url: caminho, updated_at: agora }).eq("id", envelope.aviso.gozoId)
    }
  } catch (e) {
    console.error("Aviso de férias assinado (gravar o PDF):", e)
  }

  depoisDaResposta(() =>
    avisarQuemPodeOuCoordena("pessoal_gestao", [], envelope.aviso.funcionarioId, {
      texto: `${envelope.aviso.dados.funcionario.nome} assinou o aviso de férias (${formatarData(envelope.aviso.dados.gozo.inicio)} a ${formatarData(envelope.aviso.dados.gozo.termino)}).`,
      link: envelope.aviso.periodoId ? `/painel/pessoal/ferias/${envelope.aviso.periodoId}` : "/painel/pessoal/ferias",
      evento: "pessoal_aviso_ferias",
      assunto: "Aviso de férias assinado",
      exceto: envelope.aviso.funcionarioId,
    })
  )

  if (a.email) {
    await enviarEmail({
      email: a.email,
      nome: a.nome,
      assunto: "Aviso de férias assinado",
      html:
        tituloEmail("Aviso de férias assinado") +
        paragrafo(
          `Sua assinatura no aviso de férias de <strong>${formatarData(envelope.aviso.dados.gozo.inicio)} a ${formatarData(envelope.aviso.dados.gozo.termino)}</strong> foi registrada em ${escaparHtml(formatarMomentoAssinatura(agora))} (horário de Brasília).`
        ) +
        botaoEmail(`${await origemAtual()}/assinar/${a.token}`, "Ver e baixar o aviso assinado") +
        caixaAviso("Guarde o PDF: ele traz o certificado com a trilha da assinatura."),
    })
  }
  return {}
}

export async function recusarAviso(
  token: string,
  motivo: string,
  ctx: { ip: string | null; userAgent: string | null }
): Promise<{ erro?: string }> {
  if (motivo.trim().length < 3) return { erro: "Diga o motivo." }
  const envelope = await envelopeAvisoPorToken(token)
  if (!envelope) return { erro: "Link inválido." }
  const a = envelope.assinatura
  if (a.situacao !== "pendente") return { erro: "Este aviso não está aguardando sua assinatura." }
  const db = await createAdminClient()
  const agora = new Date().toISOString()
  await db
    .from("documento_assinaturas")
    .update({ situacao: "recusado", recusado_em: agora, motivo_recusa: motivo.trim(), codigo_hash: null, ip: ctx.ip, user_agent: ctx.userAgent, updated_at: agora })
    .eq("id", a.id)
  await evento(a.id, "recusa", motivo.trim(), ctx, envelope.emp)
  depoisDaResposta(() =>
    avisarQuemPodeOuCoordena("pessoal_gestao", [], envelope.aviso.funcionarioId, {
      texto: `${envelope.aviso.dados.funcionario.nome} não assinou o aviso de férias (${formatarData(envelope.aviso.dados.gozo.inicio)} a ${formatarData(envelope.aviso.dados.gozo.termino)}): ${motivo.trim()}`,
      link: envelope.aviso.periodoId ? `/painel/pessoal/ferias/${envelope.aviso.periodoId}` : "/painel/pessoal/ferias",
      evento: "pendencia_pessoal",
      assunto: "Aviso de férias recusado",
      exceto: envelope.aviso.funcionarioId,
    })
  )
  return {}
}

/** /verificar/<certificado> para o aviso de férias. */
export async function verificarCertificadoAviso(certificado: string): Promise<VerificacaoMinuta | null> {
  const c = certificado.trim().toUpperCase()
  if (!/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(c)) return null
  const db = await createAdminClient()
  const { data } = await db.from("documento_assinaturas").select("*").eq("certificado", c).eq("documento_tipo", "ferias").maybeSingle()
  if (!data) return null
  const a = normalizar(data as Record<string, unknown>)
  const { data: org } = await db.from("empresa").select("nome_razao, nome_fantasia").eq("id", String(data.emp_proprietaria_id)).maybeSingle()
  const aviso = String(data.emp_proprietaria_id) === (await tenantAtual()) ? await carregarAviso(String(data.documento_id)) : null
  return {
    certificado: c,
    titulo: aviso
      ? `Aviso de férias — ${formatarData(aviso.dados.gozo.inicio)} a ${formatarData(aviso.dados.gozo.termino)}`
      : "Aviso de férias",
    entidade: texto(org?.nome_razao) ?? texto(org?.nome_fantasia),
    nome: a.nomeDeclarado ?? a.nome,
    papel: "Empregado(a) — ciência do aviso",
    cpf: mascararCpf(a.cpf),
    situacao: a.situacao,
    assinadoEm: a.assinadoEm,
    hash: a.hashDocumento,
    conteudoIntegro: aviso ? hashDoAviso(aviso.dados) === a.hashDocumento : a.situacao === "assinado",
    concluida: a.situacao === "assinado",
  }
}
