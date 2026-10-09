import "server-only"

import { createElement } from "react"
import { revalidatePath } from "next/cache"
import { renderToBuffer } from "@react-pdf/renderer"
import QRCode from "qrcode"

import type { ValidacaoAssinatura } from "@/lib/assinatura-pdf"
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
import { avisarOrdensEmAutorizacao, depoisDaResposta } from "@/lib/db/avisos"
import { esquemaAusente, texto } from "@/lib/db/comum"
import { subirComprovanteCompras } from "@/lib/db/compras"
import { buscarRpa, type RpaDetalhe } from "@/lib/db/compras-rpa"
import { mascararCpf, type CertificacaoPDF, type VerificacaoMinuta } from "@/lib/db/minuta-assinatura"
import { registrarEvento, SITUACAO_AGUARDANDO_DOCUMENTO } from "@/lib/db/ordens-ciclo"
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
import { formatarMoeda } from "@/lib/formato"
import { RpaPDF } from "@/lib/pdf/rpa"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"
import { origemAtual } from "@/lib/tenant-url"

/**
 * Assinatura do RPA pelo prestador.
 *
 * Dois caminhos, e o primeiro que chegar vale:
 * 1. Link no e-mail (como a minuta de contrato): link pessoal + código de
 *    uso único no e-mail + nome completo e CPF digitados, conferidos com o
 *    CPF do cadastro do fornecedor + aceite expresso. O conteúdo do recibo
 *    (número, prestador, serviço e valores) é congelado por SHA-256. Ao
 *    assinar, o sistema gera o PDF com a página de certificado e o grava
 *    como o recibo assinado.
 * 2. Anexo no painel: o recibo assinado à mão (digitalizado ou foto) ou
 *    pelo gov.br — para quem tem dificuldade com a tecnologia. Anexar CANCELA
 *    o link enviado; quem abrir o link vê que um documento foi incluído como
 *    comprovante de assinatura e que, na dúvida, deve procurar o contratante.
 *
 * Em ambos, o recibo assinado é o documento fiscal da compra/contrato (ver
 * registrarRpaAssinado). SQL: supabase/rpa-assinatura-eletronica.sql.
 */

export const AVISO_SQL_ASSINATURA_RPA =
  "Assinatura do RPA por e-mail ainda não configurada — rode supabase/rpa-assinatura-eletronica.sql no Supabase."

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type SituacaoAssinaturaRpa = "pendente" | "assinado" | "recusado" | "cancelado"

export type AssinaturaRpa = {
  id: string
  nome: string | null
  email: string | null
  cpf: string | null
  nomeDeclarado: string | null
  situacao: SituacaoAssinaturaRpa
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

export const ROTULO_EVENTO_RPA: Record<string, string> = {
  enviado: "Link enviado por e-mail",
  reenviado: "Link reenviado",
  abertura: "Recibo aberto",
  codigo_enviado: "Código de uso único enviado",
  codigo_invalido: "Código incorreto",
  cpf_divergente: "CPF digitado não confere",
  assinatura: "Assinatura",
  recusa: "Recusa",
  cancelado: "Envio cancelado",
}

function normalizar(l: Record<string, unknown>, eventos: AssinaturaRpa["eventos"] = []): AssinaturaRpa {
  return {
    id: String(l.id),
    nome: texto(l.nome),
    email: texto(l.email),
    cpf: texto(l.cpf),
    nomeDeclarado: texto(l.nome_declarado),
    situacao: (l.situacao as SituacaoAssinaturaRpa) ?? "pendente",
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

/**
 * O que a assinatura cobre. O RPA não é editável (corrige-se excluindo e
 * emitindo outro); a data impressa no recibo fica de fora porque muda.
 */
export function hashDoRpa(rpa: RpaDetalhe): string {
  return hashTexto(
    JSON.stringify([
      rpa.numero,
      rpa.fornecedorNome,
      (rpa.fornecedorCnpjCpf ?? "").replace(/\D/g, ""),
      rpa.descricao_servico,
      rpa.data_servico,
      rpa.valor_bruto,
      rpa.inss,
      rpa.irrf,
      rpa.iss,
      rpa.valor_liquido,
    ])
  )
}

/** CPF do prestador (só dígitos) — o que a pessoa precisa digitar para assinar. */
function cpfDoPrestador(rpa: RpaDetalhe): string | null {
  const d = limparCpf(rpa.fornecedorCnpjCpf ?? "")
  return d.length === 11 && validarCpf(d) ? d : null
}

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

/** Envios do RPA, do mais novo para o mais antigo. */
export async function assinaturasDoRpa(
  rpaId: string,
  opcoes: { comEventos?: boolean } = {}
): Promise<AssinaturaRpa[]> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("documento_assinaturas")
    .select("*")
    .eq("documento_tipo", "rpa")
    .eq("documento_id", rpaId)
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

async function nomeEntidade(): Promise<string> {
  const org = await obterOrganizacao()
  return org?.nomeRazao ?? org?.nomeFantasia ?? "a entidade"
}

async function convidar(a: AssinaturaRpa, rpa: RpaDetalhe): Promise<void> {
  if (!a.email) return
  const link = `${await origemAtual()}/assinar/${a.token}`
  const entidade = await nomeEntidade()
  await enviarEmail({
    email: a.email,
    nome: a.nome,
    assunto: `Recibo (RPA nº ${rpa.numero ?? "—"}) para assinar — ${entidade}`,
    html:
      tituloEmail("Recibo de pagamento para assinar") +
      paragrafo(
        `${escaparHtml(entidade)} enviou o <strong>Recibo de Pagamento a Autônomo nº ${rpa.numero ?? "—"}</strong>, de ${escaparHtml(formatarMoeda(rpa.valor_liquido))} líquidos, para você assinar.`
      ) +
      botaoEmail(link, "Ler e assinar o recibo") +
      linkReserva(link) +
      textoSuave(
        "Ao abrir, você lê o recibo, pede um código de 6 dígitos por e-mail e confirma com seu nome completo e CPF. Este link é pessoal: não o encaminhe. Se preferir assinar no papel ou pelo gov.br, fale com quem contratou o serviço."
      ),
  })
}

// ── Painel ───────────────────────────────────────────────────────────────────

export async function enviarRpaParaAssinatura(
  rpaId: string,
  dados: { nome: string; email: string },
  usuarioId: string
): Promise<{ erro?: string }> {
  const rpa = await buscarRpa(rpaId)
  if (!rpa) return { erro: "RPA não encontrado." }
  if (rpa.arquivoAssinado) return { erro: "Este RPA já tem o recibo assinado." }
  const cpf = cpfDoPrestador(rpa)
  if (!cpf) {
    return { erro: "O cadastro do prestador não tem um CPF válido — corrija-o em Fornecedores antes de enviar." }
  }
  const nome = dados.nome.trim()
  const email = dados.email.trim().toLowerCase()
  if (nome.length < 5) return { erro: "Informe o nome completo do prestador." }
  if (!EMAIL.test(email)) return { erro: "E-mail inválido." }
  const ativos = await assinaturasDoRpa(rpaId)
  if (ativos.some((a) => a.situacao === "pendente")) {
    return { erro: "Já há um link enviado aguardando a assinatura — cancele-o antes de enviar de novo." }
  }

  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const hash = hashDoRpa(rpa)
  const agora = new Date().toISOString()
  const { data: nova, error } = await admin
    .from("documento_assinaturas")
    .insert({
      documento_tipo: "rpa",
      documento_id: rpaId,
      ordem: 1,
      papel: "prestador",
      nome,
      email,
      cpf,
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
      erro:
        !error || esquemaAusente(error) || /check constraint|violates/i.test(error.message)
          ? AVISO_SQL_ASSINATURA_RPA
          : `Não foi possível enviar: ${error.message}`,
    }
  }
  await admin
    .from("compras_rpa")
    .update({ assinatura_hash: hash, assinatura_enviada_em: agora, updated_at: agora })
    .eq("id", rpaId)
    .eq("emp_proprietaria_id", emp)
  const a = normalizar(nova as Record<string, unknown>)
  await evento(a.id, "enviado", null, undefined, emp)
  await convidar(a, rpa)
  return {}
}

/** Manda de novo o e-mail com o link (o mesmo link). */
export async function reenviarLinkRpa(rpaId: string): Promise<{ erro?: string }> {
  const rpa = await buscarRpa(rpaId)
  if (!rpa) return { erro: "RPA não encontrado." }
  const pendente = (await assinaturasDoRpa(rpaId)).find((a) => a.situacao === "pendente")
  if (!pendente) return { erro: "Não há link aguardando assinatura." }
  await evento(pendente.id, "reenviado", null, undefined, await tenantAtual())
  await convidar(pendente, rpa)
  return {}
}

/** Cancela o link pendente (o painel desistiu, ou o recibo veio assinado por fora). */
export async function cancelarAssinaturaRpa(
  rpaId: string,
  usuarioId: string | null,
  motivo: string
): Promise<{ cancelados: number }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const pendentes = (await assinaturasDoRpa(rpaId)).filter((a) => a.situacao === "pendente")
  if (pendentes.length === 0) return { cancelados: 0 }
  const agora = new Date().toISOString()
  await admin
    .from("documento_assinaturas")
    .update({ situacao: "cancelado", codigo_hash: null, updated_at: agora })
    .in("id", pendentes.map((a) => a.id))
  for (const a of pendentes) {
    await evento(a.id, "cancelado", `${motivo}${usuarioId ? ` (usuário ${usuarioId})` : ""}`, undefined, emp)
  }
  await admin
    .from("compras_rpa")
    .update({ assinatura_hash: null, updated_at: agora })
    .eq("id", rpaId)
    .eq("emp_proprietaria_id", emp)
  return { cancelados: pendentes.length }
}

/**
 * Grava o recibo assinado (já no bucket `compras`) e faz o que ele
 * desencadeia: vira o documento fiscal do fornecimento e da ordem e, no RPA
 * de compra, tira a ordem de "Aguardando documento fiscal". Anexo do painel
 * cancela o link enviado por e-mail.
 */
export async function registrarRpaAssinado(
  rpa: RpaDetalhe,
  caminho: string,
  usuarioId: string | null,
  origem: "eletronica" | "anexo",
  validacao: ValidacaoAssinatura | null = null
): Promise<{ erro?: string; seguiu?: boolean; linkCancelado?: boolean }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const agora = new Date().toISOString()
  const base = { arquivo_assinado: caminho, assinado_em: agora, assinado_por_id: usuarioId, updated_at: agora }
  let { error } = await admin
    .from("compras_rpa")
    .update({ ...base, assinatura_origem: origem, assinatura_validacao: validacao })
    .eq("id", rpa.id)
    .eq("emp_proprietaria_id", emp)
  if (error && (error.code === "42703" || error.code === "PGRST204")) {
    // Sem supabase/rpa-assinatura-eletronica.sql: grava só o arquivo, como antes.
    ;({ error } = await admin.from("compras_rpa").update(base).eq("id", rpa.id).eq("emp_proprietaria_id", emp))
  }
  if (error) return { erro: esquemaAusente(error) ? "Rode supabase/rpa-avulso.sql no Supabase para anexar o recibo assinado." : `Não foi possível gravar o recibo: ${error.message}` }

  // O anterior (substituído) sai do bucket.
  if (rpa.arquivoAssinado && rpa.arquivoAssinado !== caminho && !/^(https?:)?\/\//.test(rpa.arquivoAssinado)) {
    await admin.storage.from("compras").remove([rpa.arquivoAssinado])
  }

  // Assinado por fora: o link do e-mail deixa de valer.
  const { cancelados } =
    origem === "anexo"
      ? await cancelarAssinaturaRpa(rpa.id, usuarioId, "Recibo assinado anexado no painel (à mão ou pelo gov.br)")
      : { cancelados: 0 }

  // Na compra, o recibo assinado é o documento fiscal: entra como a nota do
  // fornecimento e da ordem, onde estiver vazia ou for o recibo anterior.
  if (rpa.fornecimentoId) {
    const anterior = rpa.arquivoAssinado
    const alvos = [
      { tabela: "compras_fornecimentos", coluna: "nota_fiscal_url", id: rpa.fornecimentoId },
      { tabela: "ordens_pagamento", coluna: "arquivo_nota_fiscal", id: rpa.ordemId },
    ]
    for (const a of alvos) {
      if (!a.id) continue
      await admin
        .from(a.tabela)
        .update({ [a.coluna]: caminho })
        .eq("id", a.id)
        .or(anterior ? `${a.coluna}.is.null,${a.coluna}.eq."${anterior}"` : `${a.coluna}.is.null`)
    }
    if (rpa.compraId) revalidatePath(`/painel/compras/${rpa.compraId}`)
  }

  // RPA de compra: o recibo assinado é o documento fiscal que a ordem
  // esperava — ela segue para autorização.
  let seguiu = false
  if (rpa.ordemId && rpa.ordemSituacao === SITUACAO_AGUARDANDO_DOCUMENTO) {
    const { data: movida } = await admin
      .from("ordens_pagamento")
      .update({ situacao: "Em autorização", arquivo_nota_fiscal: caminho })
      .eq("id", rpa.ordemId)
      .eq("situacao", SITUACAO_AGUARDANDO_DOCUMENTO)
      .select("id")
    if (movida?.length) {
      seguiu = true
      await registrarEvento(
        rpa.ordemId,
        "documento_fiscal",
        usuarioId,
        origem === "eletronica"
          ? `Recibo do RPA nº ${rpa.numero ?? "—"} assinado eletronicamente pelo prestador — seguiu para autorização.`
          : `Recibo do RPA nº ${rpa.numero ?? "—"} assinado pelo prestador — seguiu para autorização.`,
        { arquivo_nota_fiscal: caminho }
      )
      depoisDaResposta(() => avisarOrdensEmAutorizacao([rpa.ordemId!]))
      revalidatePath(`/painel/financeiro/ordens/${rpa.ordemId}`)
      revalidatePath("/painel/compras/avaliacoes")
    }
  }
  revalidatePath(`/painel/compras/rpa/${rpa.id}`)
  revalidatePath("/painel/compras/rpa")
  if (rpa.contratoId) revalidatePath(`/painel/compras/contratos/${rpa.contratoId}`)
  return { seguiu, linkCancelado: cancelados > 0 }
}

// ── PDF ──────────────────────────────────────────────────────────────────────

export async function certificacaoDoRpa(rpaId: string, hash: string): Promise<CertificacaoPDF | null> {
  const lista = (await assinaturasDoRpa(rpaId, { comEventos: true })).filter(
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
          papel: "Prestador do serviço",
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
            .map((e) => ({ quando: formatarMomentoAssinatura(e.quando), evento: ROTULO_EVENTO_RPA[e.tipo] ?? e.tipo, ip: e.ip })),
        }
      })
    ),
  }
}

/** PDF do recibo — o do painel e o do link (com o certificado, se assinado pelo link). */
export async function renderizarPdfRpa(
  rpa: RpaDetalhe,
  opcoes: { certificacao?: CertificacaoPDF | null; dataDocumento?: string | null } = {}
): Promise<Buffer> {
  const [organizacao, { sedes }] = await Promise.all([
    obterOrganizacao(),
    listarSedes().catch(() => ({ disponivel: false, sedes: [] })),
  ])
  const elemento = createElement(RpaPDF, {
    rpa,
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

// ── Lado público (sem login) ─────────────────────────────────────────────────

export type EnvelopeRpa = {
  assinatura: AssinaturaRpa
  rpa: RpaDetalhe
  emp: string
  entidade: string | null
  /** O link foi cancelado porque o recibo assinado (à mão ou gov.br) foi anexado. */
  substituidoPorAnexo: boolean
}

export async function envelopeRpaPorToken(token: string): Promise<EnvelopeRpa | null> {
  if (!UUID.test(token)) return null
  const db = await createAdminClient()
  const { data } = await db
    .from("documento_assinaturas")
    .select("*")
    .eq("token", token)
    .eq("documento_tipo", "rpa")
    .maybeSingle()
  if (!data) return null
  const emp = String(data.emp_proprietaria_id)
  // O link só vale no domínio da própria entidade (buscarRpa filtra pelo tenant).
  if (emp !== (await tenantAtual())) return null
  const rpa = await buscarRpa(String(data.documento_id))
  if (!rpa) return null
  const a = normalizar(data as Record<string, unknown>)
  return {
    assinatura: a,
    rpa,
    emp,
    entidade: await nomeEntidade(),
    substituidoPorAnexo: a.situacao === "cancelado" && rpa.assinaturaOrigem === "anexo" && Boolean(rpa.arquivoAssinado),
  }
}

export async function registrarAberturaRpa(
  envelope: EnvelopeRpa,
  ctx: { ip: string | null; userAgent: string | null }
): Promise<void> {
  const db = await createAdminClient()
  if (!envelope.assinatura.visualizadoEm) {
    await db
      .from("documento_assinaturas")
      .update({ visualizado_em: new Date().toISOString() })
      .eq("id", envelope.assinatura.id)
  }
  await evento(envelope.assinatura.id, "abertura", null, ctx, envelope.emp)
}

export async function solicitarCodigoRpa(
  token: string,
  ctx: { ip: string | null; userAgent: string | null }
): Promise<{ erro?: string; destino?: string }> {
  const envelope = await envelopeRpaPorToken(token)
  if (!envelope) return { erro: "Link inválido." }
  const a = envelope.assinatura
  if (a.situacao !== "pendente") return { erro: "Este recibo não está aguardando sua assinatura." }
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
    assunto: `Código para assinar — RPA nº ${envelope.rpa.numero ?? "—"}`,
    html:
      tituloEmail("Seu código de assinatura") +
      paragrafo("Digite o código abaixo na página do recibo para concluir sua assinatura:") +
      caixaCodigo(codigo) +
      textoSuave(`O código vale por ${VALIDADE_CODIGO_MIN} minutos. Se não foi você que pediu, ignore este e-mail.`),
  })
  return { destino: mascararEmailAssinatura(a.email) }
}

export async function assinarRpa(
  token: string,
  entrada: { codigo: string; nome: string; cpf: string; aceiteConteudo: boolean; aceiteEletronico: boolean },
  ctx: { ip: string | null; userAgent: string | null }
): Promise<{ erro?: string }> {
  if (!entrada.aceiteConteudo) return { erro: "Confirme que leu o recibo e concorda com o conteúdo." }
  if (!entrada.aceiteEletronico) return { erro: "Confirme que aceita assinar eletronicamente." }
  const envelope = await envelopeRpaPorToken(token)
  if (!envelope) return { erro: "Link inválido." }
  const a = envelope.assinatura
  if (a.situacao !== "pendente") return { erro: "Este recibo não está aguardando sua assinatura." }
  if (envelope.rpa.arquivoAssinado) return { erro: "O recibo assinado já foi entregue à entidade." }

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
    await db
      .from("documento_assinaturas")
      .update({ codigo_tentativas: (segredo.codigo_tentativas ?? 0) + 1 })
      .eq("id", a.id)
    await evento(a.id, tipo, null, ctx, envelope.emp)
  }
  if (codigo.length !== 6 || !conferirCodigo(codigo, a.token, String(segredo.codigo_hash))) {
    await errou("codigo_invalido")
    return { erro: "Código errado." }
  }
  if (!a.cpf || limparCpf(entrada.cpf) !== a.cpf) {
    await errou("cpf_divergente")
    return { erro: "O CPF não confere com o do cadastro. Se houver engano, fale com quem contratou o serviço." }
  }
  const nome = entrada.nome.trim().replace(/\s+/g, " ")
  if (nome.split(" ").length < 2) return { erro: "Digite seu nome completo." }
  if (!a.hashDocumento || a.hashDocumento !== hashDoRpa(envelope.rpa)) {
    return { erro: "O recibo mudou depois do envio. Peça à entidade para enviar de novo." }
  }

  const agora = new Date().toISOString()
  // Só um vence: se o painel anexou o recibo no meio do caminho, o link já
  // está cancelado e o update não pega nada.
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
  if (!assinou?.length) return { erro: "Este recibo não está mais aguardando sua assinatura." }
  await evento(a.id, "assinatura", a.certificado, ctx, envelope.emp)

  // O recibo com o certificado vira o recibo assinado do RPA.
  const certificacao = await certificacaoDoRpa(envelope.rpa.id, a.hashDocumento)
  const pdf = await renderizarPdfRpa(envelope.rpa, { certificacao, dataDocumento: agora })
  const arquivo = new File([new Uint8Array(pdf)], `rpa-${envelope.rpa.numero ?? "assinado"}.pdf`, {
    type: "application/pdf",
  })
  const up = await subirComprovanteCompras(`rpa-assinados/${envelope.rpa.id}`, arquivo)
  if (up.caminho) {
    const r = await registrarRpaAssinado(envelope.rpa, up.caminho, null, "eletronica")
    if (r.erro) console.error("RPA assinado pelo link (gravar o recibo):", r.erro)
  } else {
    console.error("RPA assinado pelo link (subir o PDF):", up.erro)
  }

  if (a.email) {
    await enviarEmail({
      email: a.email,
      nome: a.nome,
      assunto: `Recibo assinado — RPA nº ${envelope.rpa.numero ?? "—"}`,
      html:
        tituloEmail("Recibo assinado") +
        paragrafo(
          `Sua assinatura no <strong>RPA nº ${envelope.rpa.numero ?? "—"}</strong> foi registrada em ${escaparHtml(formatarMomentoAssinatura(agora))} (horário de Brasília).`
        ) +
        botaoEmail(`${await origemAtual()}/assinar/${a.token}`, "Ver e baixar o recibo assinado") +
        caixaAviso("Guarde o PDF: ele traz o certificado com a trilha da assinatura."),
    })
  }
  return {}
}

export async function recusarRpa(
  token: string,
  motivo: string,
  ctx: { ip: string | null; userAgent: string | null }
): Promise<{ erro?: string }> {
  if (motivo.trim().length < 3) return { erro: "Diga o motivo da recusa." }
  const envelope = await envelopeRpaPorToken(token)
  if (!envelope) return { erro: "Link inválido." }
  const a = envelope.assinatura
  if (a.situacao !== "pendente") return { erro: "Este recibo não está aguardando sua assinatura." }
  const db = await createAdminClient()
  const agora = new Date().toISOString()
  await db
    .from("documento_assinaturas")
    .update({
      situacao: "recusado",
      recusado_em: agora,
      motivo_recusa: motivo.trim(),
      codigo_hash: null,
      ip: ctx.ip,
      user_agent: ctx.userAgent,
      updated_at: agora,
    })
    .eq("id", a.id)
  await evento(a.id, "recusa", motivo.trim(), ctx, envelope.emp)
  await db.from("compras_rpa").update({ assinatura_hash: null, updated_at: agora }).eq("id", envelope.rpa.id)
  return {}
}

/** /verificar/<certificado> para o RPA assinado pelo link. */
export async function verificarCertificadoRpa(certificado: string): Promise<VerificacaoMinuta | null> {
  const c = certificado.trim().toUpperCase()
  if (!/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(c)) return null
  const db = await createAdminClient()
  const { data } = await db
    .from("documento_assinaturas")
    .select("*")
    .eq("certificado", c)
    .eq("documento_tipo", "rpa")
    .maybeSingle()
  if (!data) return null
  const a = normalizar(data as Record<string, unknown>)
  const [{ data: r }, { data: org }] = await Promise.all([
    db.from("compras_rpa").select("id, numero, emp_proprietaria_id").eq("id", String(data.documento_id)).maybeSingle(),
    db.from("empresa").select("nome_razao, nome_fantasia").eq("id", String(data.emp_proprietaria_id)).maybeSingle(),
  ])
  // A integridade completa precisa do RPA inteiro (no tenant certo).
  const rpa = r && String(r.emp_proprietaria_id) === (await tenantAtual()) ? await buscarRpa(String(r.id)) : null
  return {
    certificado: c,
    titulo: `Recibo de Pagamento a Autônomo nº ${r?.numero ?? "—"}`,
    entidade: texto(org?.nome_razao) ?? texto(org?.nome_fantasia),
    nome: a.nomeDeclarado ?? a.nome,
    papel: "Prestador do serviço",
    cpf: mascararCpf(a.cpf),
    situacao: a.situacao,
    assinadoEm: a.assinadoEm,
    hash: a.hashDocumento,
    conteudoIntegro: rpa ? hashDoRpa(rpa) === a.hashDocumento : a.situacao === "assinado",
    concluida: a.situacao === "assinado",
  }
}

/** Quais destes RPAs têm link de assinatura por e-mail aguardando (anexar o cancela). */
export async function rpasComLinkPendente(rpaIds: string[]): Promise<Set<string>> {
  if (rpaIds.length === 0) return new Set()
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("documento_assinaturas")
    .select("documento_id")
    .eq("documento_tipo", "rpa")
    .eq("situacao", "pendente")
    .eq("emp_proprietaria_id", await tenantAtual())
    .in("documento_id", rpaIds)
  if (error) return new Set()
  return new Set((data ?? []).map((d) => String(d.documento_id)))
}
