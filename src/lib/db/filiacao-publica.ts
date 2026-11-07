import "server-only"
import { avisarQuemPode, depoisDaResposta } from "@/lib/db/avisos"
import { hojeSP, texto } from "@/lib/db/comum"
import { randomUUID } from "node:crypto"

import { validarAssinaturasPdf, type ValidacaoAssinatura } from "@/lib/assinatura-pdf"
import { emitirEvento } from "@/lib/db/webhooks"

import { tenantAtual } from "@/lib/tenant"
import { slugDoTenantAtual } from "@/lib/db/plataforma"
import { origemAtual, origemDoTenant } from "@/lib/tenant-url"

import { atribuirMatriculaSindical } from "@/lib/db/filiacao-identidade"
import { listarFontesPagadoras } from "@/lib/db/fontes"
import { type FiliacaoCondicao } from "@/lib/filiacao"
import { semAcento } from "@/lib/texto"
import { cpfConfiavel, grafiasDoCpf } from "@/lib/cpf"
import { DIAS_PARADA } from "@/lib/ficha-filiacao"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Ficha de filiação pública (sem login). O começo — CPF, e-mail, o link que
 * abre a ficha e os passos de preenchimento — mora em filiacao-ficha-online.ts.
 * Aqui: a leitura pelo link, o PDF assinado no Assinador gov.br, a fila de
 * avaliação (`/painel/filiados/solicitacoes`) e a aprovação, que atualiza o
 * cadastro do CPF ou, sem cadastro, CRIA a filiação.
 *
 * Espelha o padrão da Oposição (`db/oposicao.ts`): grava via service role +
 * `tenantAtual()`, protocolo sequencial por tenant, trilha append-only, upload
 * de PDF assinado no Storage (bucket privado `filiacao`).
 */

const SOLICITACOES_POR_PAGINA = 50

export const SITUACOES_SOLICITACAO = [
  "aguardando_verificacao",
  "em_preenchimento",
  "aguardando_assinatura",
  "nao_avaliada",
  "aprovada",
  "reprovada",
  "desistente",
] as const
export type SituacaoSolicitacao = (typeof SITUACOES_SOLICITACAO)[number]

export const ROTULO_SITUACAO_SOLICITACAO: Record<SituacaoSolicitacao, string> = {
  aguardando_verificacao: "Link enviado, não aberto",
  em_preenchimento: "Preenchendo a ficha",
  aguardando_assinatura: "Aguardando assinatura",
  nao_avaliada: "Em avaliação",
  aprovada: "Aprovada",
  reprovada: "Reprovada",
  desistente: "Desistência",
}

/** Situações que aparecem na fila do avaliador (fora aguardando_verificacao). */
export const SITUACOES_FILA_FILTRO = [
  "nao_avaliada",
  "aguardando_assinatura",
  "em_preenchimento",
  "aguardando_verificacao",
  "aprovada",
  "reprovada",
  "desistente",
] as const

function escaparLike(t: string): string {
  return t.replace(/[%_\\]/g, "\\$&")
}

// ── Opções do formulário ─────────────────────────────────────────────────────

export type OpcaoFonte = { id: string; nome: string }

/** Fontes pagadoras do tenant para o aspirante escolher o empregador. */
export async function opcoesFontesPublicas(): Promise<OpcaoFonte[]> {
  const fontes = await listarFontesPagadoras()
  return fontes.map((f) => ({
    id: f.id,
    nome: f.nome_fantasia ?? f.nome_razao ?? "(sem nome)",
  }))
}

export type Termo = { id: string; texto: string }

/**
 * Termos VIGENTES (`em_vigor`) de LGPD e de desconto em folha — o texto oficial
 * que o aspirante autoriza (tabelas `filiacao_tl_lgpd`/`filiacao_tl_desconto`).
 */
export async function obterTermosVigentes(): Promise<{
  lgpd: Termo | null
  desconto: Termo | null
}> {
  // Termos são POR TENANT (emp_proprietaria_id) — lê pelo JWT do tenant (RLS).
  const admin = await createAdminClient()
  const empId = await tenantAtual()
  const [lgpd, desconto] = await Promise.all([
    admin
      .from("filiacao_tl_lgpd")
      .select("id, texto")
      .eq("emp_proprietaria_id", empId)
      .eq("em_vigor", true)
      .order("created_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from("filiacao_tl_desconto")
      .select("id, texto")
      .eq("emp_proprietaria_id", empId)
      .eq("em_vigor", true)
      .order("created_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle(),
  ])
  const monta = (d: { id: unknown; texto: unknown } | null): Termo | null =>
    d && texto(d.texto) ? { id: String(d.id), texto: String(d.texto) } : null
  return { lgpd: monta(lgpd.data), desconto: monta(desconto.data) }
}

/** Textos dos termos EXATAMENTE aceitos (por id), para a ficha/PDF. */
export async function obterTextosDosTermos(
  lgpdId: string | null,
  descontoId: string | null
): Promise<{ lgpd: string | null; desconto: string | null }> {
  const admin = await createAdminClient()
  const buscar = async (tabela: string, id: string | null) => {
    if (!id) return null
    const { data } = await admin
      .from(tabela)
      .select("texto")
      .eq("id", id)
      .maybeSingle()
    return data ? texto(data.texto) : null
  }
  const [lgpd, desconto] = await Promise.all([
    buscar("filiacao_tl_lgpd", lgpdId),
    buscar("filiacao_tl_desconto", descontoId),
  ])
  return { lgpd, desconto }
}

// ── Escrita pública ──────────────────────────────────────────────────────────

export async function registrarEventoFicha(
  solicitacaoId: string,
  evento: string,
  detalhe: string | null,
  ip: string | null,
  userAgent: string | null
): Promise<void> {
  const admin = await createAdminClient()
  await admin.from("filiacao_solicitacao_eventos").insert({
    solicitacao_id: solicitacaoId,
    evento,
    detalhe,
    ip,
    user_agent: userAgent,
    emp_proprietaria_id: await tenantAtual(),
  })
}

// ── Leitura pública (link único /ficha/<token>) ──────────────────────────────

export type SolicitacaoPublica = {
  id: string
  token: string
  situacao: SituacaoSolicitacao
  protocolo: number | null
  nome: string | null
  nome_social: string | null
  cpf: string | null
  nascimento: string | null
  sexo: string | null
  email: string | null
  telefone_1: string | null
  telefone_1_whatsapp: boolean
  telefone_2: string | null
  endereco_cep: string | null
  endereco_logradouro: string | null
  endereco_numero: string | null
  endereco_complemento: string | null
  endereco_bairro: string | null
  endereco_cidade: string | null
  endereco_estado: string | null
  empregadorNome: string | null
  matricula: string | null
  cargo: string | null
  lotacao: string | null
  emailVerificado: boolean
  documentoAssinado: boolean
  reprovacao_motivo: string | null
  tlLgpdId: string | null
  tlDescontoId: string | null
  created_at: string | null
  updated_at: string | null
  /** Como a ficha começou (ver filiacao-ficha-online.ts). */
  caminho: "cadastro" | "outro_email" | "novo" | null
  cadastroExistenteId: string | null
  mesmaFonte: boolean | null
  passo: number
}

export async function obterSolicitacaoPorToken(
  token: string
): Promise<SolicitacaoPublica | null> {
  const empId = await tenantAtual()
  const admin = await createAdminClient()
  const { data: s } = await admin
    .from("filiacao_solicitacoes")
    .select("*")
    .eq("token", token)
    .eq("emp_proprietaria_id", empId)
    .maybeSingle()
  if (!s) return null

  let empregadorNome: string | null = null
  if (texto(s.empregador_id)) {
    const { data: e } = await admin
      .from("empresa")
      .select("nome_fantasia, nome_razao")
      .eq("id", s.empregador_id)
      .maybeSingle()
    empregadorNome = e ? (texto(e.nome_fantasia) ?? texto(e.nome_razao)) : null
  }

  return {
    id: String(s.id),
    token: String(s.token),
    situacao: (s.situacao ?? "aguardando_verificacao") as SituacaoSolicitacao,
    protocolo: s.protocolo == null ? null : Number(s.protocolo),
    nome: texto(s.nome_completo),
    nome_social: texto(s.nome_social),
    cpf: texto(s.cpf),
    nascimento: texto(s.nascimento_data),
    sexo: texto(s.sexo),
    email: texto(s.email),
    telefone_1: texto(s.telefone_1),
    telefone_1_whatsapp: s.telefone_1_whatsapp === true,
    telefone_2: texto(s.telefone_2),
    endereco_cep: texto(s.endereco_cep),
    endereco_logradouro: texto(s.endereco_logradouro),
    endereco_numero: texto(s.endereco_numero),
    endereco_complemento: texto(s.endereco_complemento),
    endereco_bairro: texto(s.endereco_bairro),
    endereco_cidade: texto(s.endereco_cidade),
    endereco_estado: texto(s.endereco_estado),
    empregadorNome,
    matricula: texto(s.matricula),
    cargo: texto(s.cargo),
    lotacao: texto(s.lotacao),
    emailVerificado: Boolean(s.email_verificado_em),
    documentoAssinado: Boolean(s.documento_assinado_url),
    reprovacao_motivo: texto(s.reprovacao_motivo),
    tlLgpdId: texto(s.tl_lgpd_id),
    tlDescontoId: texto(s.tl_desconto_id),
    created_at: texto(s.created_at),
    updated_at: texto(s.updated_at),
    caminho: (texto(s.caminho) as SolicitacaoPublica["caminho"]) ?? null,
    cadastroExistenteId: texto(s.cadastro_existente_id),
    mesmaFonte: typeof s.mesma_fonte === "boolean" ? s.mesma_fonte : null,
    passo: Number(s.passo ?? 0),
  }
}

/** Próximo protocolo sequencial do tenant (max+1). */
async function proximoProtocolo(
  admin: Awaited<ReturnType<typeof createAdminClient>>,
  empId: string
): Promise<number> {
  const { data } = await admin
    .from("filiacao_solicitacoes")
    .select("protocolo")
    .eq("emp_proprietaria_id", empId)
    .not("protocolo", "is", null)
    .order("protocolo", { ascending: false })
    .limit(1)
  const max = data?.[0]?.protocolo
  return (typeof max === "number" ? max : 0) + 1
}

/** Sobe o PDF assinado (gov.br), atribui protocolo e move p/ `nao_avaliada`. */
export async function subirFichaAssinada(
  token: string,
  arquivo: File,
  ip: string | null,
  userAgent: string | null
): Promise<{ erro?: string; protocolo?: number }> {
  if (arquivo.type !== "application/pdf") {
    return { erro: "Envie a ficha assinada em PDF." }
  }
  if (arquivo.size > 10 * 1024 * 1024) {
    return { erro: "O arquivo deve ter no máximo 10 MB." }
  }
  const empId = await tenantAtual()
  const admin = await createAdminClient()
  const { data: s } = await admin
    .from("filiacao_solicitacoes")
    .select("id, situacao, protocolo, cpf")
    .eq("token", token)
    .eq("emp_proprietaria_id", empId)
    .maybeSingle()
  if (!s) return { erro: "Solicitação não encontrada." }
  if (s.situacao === "aguardando_verificacao" || s.situacao === "em_preenchimento") {
    return { erro: "Termine de preencher a ficha antes de enviar o arquivo assinado." }
  }

  // Validação PAdES/ICP-Brasil (onda 5, A4) — nunca barra o envio: quem decide é a avaliação.
  const bytes = new Uint8Array(await arquivo.arrayBuffer())
  let validacao: ValidacaoAssinatura | null = null
  try {
    validacao = validarAssinaturasPdf(bytes, texto(s.cpf))
  } catch (e) {
    console.error("validação da assinatura:", e)
  }

  const caminho = `assinados/${randomUUID()}.pdf`
  const up = await admin.storage
    .from("filiacao")
    .upload(caminho, arquivo, { contentType: "application/pdf", upsert: false })
  if (up.error) return { erro: `Falha ao subir a ficha: ${up.error.message}` }

  const protocolo =
    typeof s.protocolo === "number"
      ? s.protocolo
      : await proximoProtocolo(admin, empId)
  const patchFicha = {
    documento_assinado_url: caminho,
    situacao: "nao_avaliada",
    protocolo,
    updated_at: new Date().toISOString(),
  }
  let { error } = await admin
    .from("filiacao_solicitacoes")
    .update({ ...patchFicha, assinatura_validacao: validacao })
    .eq("id", s.id)
    .eq("emp_proprietaria_id", empId)
  if (error && (error.code === "42703" || error.code === "PGRST204")) {
    // Sem a coluna (supabase/assinatura-validacao.sql): grava sem o resultado.
    ;({ error } = await admin.from("filiacao_solicitacoes").update(patchFicha).eq("id", s.id).eq("emp_proprietaria_id", empId))
  }
  if (error) return { erro: error.message }
  await registrarEventoFicha(String(s.id), "ficha_assinada_enviada", null, ip, userAgent)

  // Onda 2 (U2): a gestão da filiação fica sabendo que há ficha a avaliar.
  depoisDaResposta(() =>
    avisarQuemPode("filiacao_gestao", [], {
      texto: `Nova solicitação de filiação (protocolo ${protocolo}) aguardando avaliação.`,
      link: "/painel/filiados/solicitacoes",
      evento: "pendencia_filiacao",
      assunto: "Solicitação de filiação a avaliar",
    })
  )
  return { protocolo }
}

// ── Avaliação (painel — módulo Filiação) ─────────────────────────────────────

export type SolicitacaoLinha = {
  id: string
  nome: string | null
  cpf: string | null
  matricula: string | null
  empregadorNome: string | null
  situacao: SituacaoSolicitacao
  protocolo: number | null
  created_at: string | null
}

export type ListaSolicitacoes = {
  linhas: SolicitacaoLinha[]
  total: number
  pagina: number
  totalPaginas: number
  pendentes: number
}

export type FiltrosSolicitacoes = {
  situacao?: SituacaoSolicitacao | "todas"
  busca?: string
  pagina?: number
}

export async function listarSolicitacoes(
  filtros: FiltrosSolicitacoes = {}
): Promise<ListaSolicitacoes> {
  const empId = await tenantAtual()
  const admin = await createAdminClient()
  const pagina = filtros.pagina && filtros.pagina > 0 ? filtros.pagina : 1

  let q = admin
    .from("filiacao_solicitacoes")
    .select(
      "id, nome_completo, cpf, matricula, empregador_id, situacao, protocolo, created_at",
      { count: "exact" }
    )
    .eq("emp_proprietaria_id", empId)

  // "Todas" deixa de fora só o link que nem foi aberto (está no filtro próprio).
  if (filtros.situacao && filtros.situacao !== "todas") {
    q = q.eq("situacao", filtros.situacao)
  } else {
    q = q.neq("situacao", "aguardando_verificacao")
  }
  const termo = (filtros.busca ?? "").trim()
  if (termo) {
    const e = escaparLike(termo)
    q = q.or(
      `nome_completo_norm.ilike.%${semAcento(e)}%,cpf.ilike.%${e}%,matricula.ilike.%${e}%`
    )
  }

  const de = (pagina - 1) * SOLICITACOES_POR_PAGINA
  const { data, count, error } = await q
    .order("created_at", { ascending: false, nullsFirst: false })
    .range(de, de + SOLICITACOES_POR_PAGINA - 1)
  if (error) throw new Error(`Falha ao listar solicitações: ${error.message}`)

  const linhas = (data ?? []) as Record<string, unknown>[]
  const empresaIds = [
    ...new Set(linhas.map((o) => texto(o.empregador_id)).filter(Boolean)),
  ] as string[]
  const nomeEmpresa = new Map<string, string>()
  if (empresaIds.length) {
    const { data: emps } = await admin
      .from("empresa")
      .select("id, nome_fantasia, nome_razao")
      .in("id", empresaIds)
    for (const e of emps ?? []) {
      const nome = texto(e.nome_fantasia) ?? texto(e.nome_razao)
      if (nome) nomeEmpresa.set(String(e.id), nome)
    }
  }

  // Contador de pendentes (aguardando avaliação = nao_avaliada).
  const { count: pendentes } = await admin
    .from("filiacao_solicitacoes")
    .select("id", { count: "exact", head: true })
    .eq("emp_proprietaria_id", empId)
    .eq("situacao", "nao_avaliada")

  const total = count ?? 0
  return {
    linhas: linhas.map((o) => ({
      id: String(o.id),
      nome: texto(o.nome_completo),
      cpf: texto(o.cpf),
      matricula: texto(o.matricula),
      empregadorNome: texto(o.empregador_id)
        ? (nomeEmpresa.get(String(o.empregador_id)) ?? null)
        : null,
      situacao: (o.situacao ?? "nao_avaliada") as SituacaoSolicitacao,
      protocolo: o.protocolo == null ? null : Number(o.protocolo),
      created_at: texto(o.created_at),
    })),
    total,
    pagina,
    totalPaginas: Math.max(1, Math.ceil(total / SOLICITACOES_POR_PAGINA)),
    pendentes: pendentes ?? 0,
  }
}

/** Só o contador de pendentes (para o card do hub). */
export async function contarSolicitacoesPendentes(): Promise<number> {
  const empId = await tenantAtual()
  const admin = await createAdminClient()
  const { count } = await admin
    .from("filiacao_solicitacoes")
    .select("id", { count: "exact", head: true })
    .eq("emp_proprietaria_id", empId)
    .eq("situacao", "nao_avaliada")
  return count ?? 0
}

export type SolicitacaoDetalhe = SolicitacaoPublica & {
  /** O cadastro do CPF, que a aprovação atualiza (refiliação). */
  cadastroExistente: { id: string; nome: string | null; condicao: string | null; email: string | null } | null
  documentoAssinadoUrl: string | null
  /** Resultado da validação PAdES do PDF (onda 5, A4); null = não verificado. */
  assinaturaValidacao: ValidacaoAssinatura | null
  avaliacao_data: string | null
  avaliadorNome: string | null
  filiacaoId: string | null
  eventos: {
    evento: string | null
    detalhe: string | null
    ip: string | null
    created_at: string | null
  }[]
}

export async function obterSolicitacaoDetalhe(
  id: string
): Promise<SolicitacaoDetalhe | null> {
  const empId = await tenantAtual()
  const admin = await createAdminClient()
  const { data: s } = await admin
    .from("filiacao_solicitacoes")
    .select("*")
    .eq("id", id)
    .eq("emp_proprietaria_id", empId)
    .maybeSingle()
  if (!s) return null

  const [empRes, evRes, avalRes] = await Promise.all([
    texto(s.empregador_id)
      ? admin
          .from("empresa")
          .select("nome_fantasia, nome_razao")
          .eq("id", s.empregador_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    admin
      .from("filiacao_solicitacao_eventos")
      .select("evento, detalhe, ip, created_at")
      .eq("solicitacao_id", id)
      .eq("emp_proprietaria_id", empId)
      .order("created_at", { ascending: true }),
    texto(s.avaliacao_avaliador_id)
      ? admin
          .from("usuarios")
          .select("nome_completo, nome_guerra")
          .eq("id", s.avaliacao_avaliador_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ])
  const e = empRes.data as Record<string, unknown> | null
  const av = avalRes.data as Record<string, unknown> | null

  // O cadastro do CPF — o gravado no começo da ficha ou, sem ele, o achado agora.
  const existente = await cadastroParaAprovar(admin, empId, texto(s.cadastro_existente_id), texto(s.cpf))

  let documentoAssinadoUrl: string | null = null
  const docPath = texto(s.documento_assinado_url)
  if (docPath) {
    const { data: signed } = await admin.storage
      .from("filiacao")
      .createSignedUrl(docPath, 3600)
    documentoAssinadoUrl = signed?.signedUrl ?? null
  }

  return {
    id: String(s.id),
    token: String(s.token),
    situacao: (s.situacao ?? "nao_avaliada") as SituacaoSolicitacao,
    protocolo: s.protocolo == null ? null : Number(s.protocolo),
    nome: texto(s.nome_completo),
    nome_social: texto(s.nome_social),
    cpf: texto(s.cpf),
    nascimento: texto(s.nascimento_data),
    sexo: texto(s.sexo),
    email: texto(s.email),
    telefone_1: texto(s.telefone_1),
    telefone_1_whatsapp: s.telefone_1_whatsapp === true,
    telefone_2: texto(s.telefone_2),
    endereco_cep: texto(s.endereco_cep),
    endereco_logradouro: texto(s.endereco_logradouro),
    endereco_numero: texto(s.endereco_numero),
    endereco_complemento: texto(s.endereco_complemento),
    endereco_bairro: texto(s.endereco_bairro),
    endereco_cidade: texto(s.endereco_cidade),
    endereco_estado: texto(s.endereco_estado),
    empregadorNome: e ? (texto(e.nome_fantasia) ?? texto(e.nome_razao)) : null,
    matricula: texto(s.matricula),
    cargo: texto(s.cargo),
    lotacao: texto(s.lotacao),
    emailVerificado: Boolean(s.email_verificado_em),
    documentoAssinado: Boolean(s.documento_assinado_url),
    reprovacao_motivo: texto(s.reprovacao_motivo),
    tlLgpdId: texto(s.tl_lgpd_id),
    tlDescontoId: texto(s.tl_desconto_id),
    created_at: texto(s.created_at),
    updated_at: texto(s.updated_at),
    caminho: (texto(s.caminho) as SolicitacaoPublica["caminho"]) ?? null,
    cadastroExistenteId: texto(s.cadastro_existente_id),
    mesmaFonte: typeof s.mesma_fonte === "boolean" ? s.mesma_fonte : null,
    passo: Number(s.passo ?? 0),
    cadastroExistente: existente
      ? {
          id: String(existente.id),
          nome: texto(existente.nome_completo),
          condicao: texto(existente.filiacao_condicao),
          email: texto(existente.email_pessoal) ?? texto(existente.email_corporativo),
        }
      : null,
    documentoAssinadoUrl,
    assinaturaValidacao: (s.assinatura_validacao as ValidacaoAssinatura | null) ?? null,
    avaliacao_data: texto(s.avaliacao_data),
    avaliadorNome: av ? (texto(av.nome_completo) ?? texto(av.nome_guerra)) : null,
    filiacaoId: texto(s.filiacao_id),
    eventos: (evRes.data ?? []).map((ev) => ({
      evento: texto(ev.evento),
      detalhe: texto(ev.detalhe),
      ip: texto(ev.ip),
      created_at: texto(ev.created_at),
    })),
  }
}

/**
 * Aprova (cria a filiação em `filiacoes` + vínculo) ou reprova (motivo). Devolve
 * e-mail/nome p/ a action avisar o aspirante. Idempotente por situação.
 */
export async function avaliarSolicitacao(
  id: string,
  aprovar: boolean,
  motivo: string | null,
  avaliadorId: string
): Promise<{
  erro?: string
  ok?: boolean
  email?: string | null
  nome?: string | null
  aprovado?: boolean
}> {
  if (!aprovar && !motivo?.trim()) {
    return { erro: "Informe o motivo da reprovação." }
  }
  const empId = await tenantAtual()
  const admin = await createAdminClient()

  const { data: s } = await admin
    .from("filiacao_solicitacoes")
    .select("*")
    .eq("id", id)
    .eq("emp_proprietaria_id", empId)
    .maybeSingle()
  if (!s) return { erro: "Solicitação não encontrada." }
  if (!["nao_avaliada", "aprovada", "reprovada"].includes(String(s.situacao))) {
    return { erro: "Esta solicitação ainda não está pronta para avaliação." }
  }

  if (!aprovar) {
    const { error } = await admin
      .from("filiacao_solicitacoes")
      .update({
        situacao: "reprovada",
        avaliacao: false,
        avaliacao_data: hojeSP(),
        avaliacao_avaliador_id: avaliadorId,
        reprovacao_motivo: motivo?.trim() ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("emp_proprietaria_id", empId)
    if (error) return { erro: error.message }
    await registrarEventoFicha(id, "reprovada", motivo?.trim() ?? null, null, null)
    return { ok: true, email: texto(s.email), nome: texto(s.nome_completo), aprovado: false }
  }

  // Aprovação: o cadastro do CPF é atualizado e ganha o vínculo novo.
  let filiacaoId = texto(s.filiacao_id)
  const existente = filiacaoId ? null : await cadastroParaAprovar(admin, empId, texto(s.cadastro_existente_id), texto(s.cpf))
  if (!filiacaoId && existente) {
    const r = await atualizarCadastroNaAprovacao(admin, empId, existente, s, avaliadorId)
    if (r.erro) return { erro: r.erro }
    filiacaoId = String(existente.id)
  }
  if (!filiacaoId) {
    // Aprovada = filiação Ativa (valor central de filiacao_condicao).
    const condicao: FiliacaoCondicao = "Ativo"
    const nascimento = texto(s.nascimento_data)
    const { data: criada, error: erroFil } = await admin
      .from("filiacoes")
      .insert({
        nome_completo: texto(s.nome_completo),
        nome_social: texto(s.nome_social),
        cpf: texto(s.cpf),
        // "Matrícula" da ficha é a da empresa: vai para o vínculo, abaixo.
        matricula_sindical: null,
        sexo: ["Masculino", "Feminino", "Outro"].includes(String(s.sexo))
          ? String(s.sexo)
          : null,
        nascimento_data: nascimento,
        nascimento_dia: nascimento ? Number(nascimento.slice(8, 10)) : null,
        nascimento_mes: nascimento ? Number(nascimento.slice(5, 7)) : null,
        email_pessoal: texto(s.email),
        telefone_1: texto(s.telefone_1),
        telefone_1_whatsapp: s.telefone_1_whatsapp === true,
        telefone_2: texto(s.telefone_2),
        endereco_cep: texto(s.endereco_cep),
        endereco_logradouro: texto(s.endereco_logradouro),
        endereco_numero: texto(s.endereco_numero),
        endereco_complemento: texto(s.endereco_complemento),
        endereco_bairro: texto(s.endereco_bairro),
        endereco_cidade: texto(s.endereco_cidade),
        endereco_estado: texto(s.endereco_estado),
        filiacao_condicao: condicao,
        // Consentimentos registrados na ficha pública.
        tl_lgpd_data: texto(s.aceite_lgpd_data),
        tl_desconto_data: texto(s.aceite_desconto_data),
        tl_lgpd_id: texto(s.tl_lgpd_id),
        tl_desconto_id: texto(s.tl_desconto_id),
        emp_proprietaria_id: empId,
      })
      .select("id")
      .single()
    if (erroFil || !criada) {
      return { erro: `Falha ao criar a filiação: ${erroFil?.message ?? "?"}` }
    }
    filiacaoId = String(criada.id)
    await atribuirMatriculaSindical(filiacaoId)

    if (texto(s.empregador_id)) {
      await admin.from("filiacao_vinculos").insert({
        filiado_id: filiacaoId,
        fonte_pagadora_id: s.empregador_id,
        cargo: texto(s.cargo),
        lotacao: texto(s.lotacao),
        matricula: texto(s.matricula),
        emp_proprietaria_id: empId,
      })
    }
  }

  const { error } = await admin
    .from("filiacao_solicitacoes")
    .update({
      situacao: "aprovada",
      avaliacao: true,
      avaliacao_data: hojeSP(),
      avaliacao_avaliador_id: avaliadorId,
      reprovacao_motivo: null,
      filiacao_id: filiacaoId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("emp_proprietaria_id", empId)
  if (error) return { erro: error.message }
  await registrarEventoFicha(id, "aprovada", `filiacao_id=${filiacaoId}`, null, null)
  void emitirEvento("filiacao.aprovada", { solicitacaoId: id, filiacaoId, nome: texto(s.nome_completo), cpf: texto(s.cpf), protocolo: s.protocolo ?? null })
  return { ok: true, email: texto(s.email), nome: texto(s.nome_completo), aprovado: true }
}

/**
 * Endereço da ficha online para divulgar: sempre o subdomínio da entidade
 * (`https://<slug>.confluir.online/filiar`), mesmo quando quem copia entrou por
 * outro endereço. Sem slug cadastrado, o da requisição atual.
 */
export async function enderecoDaFichaPublica(): Promise<string> {
  const slug = await slugDoTenantAtual()
  return `${slug ? origemDoTenant(slug) : await origemAtual()}/filiar`
}

// ── Refiliação: a aprovação sobre um cadastro que já existe ──────────────────

/** Cadastro não excluído pelo id gravado na ficha ou, sem ele, pelo CPF. */
async function cadastroParaAprovar(
  admin: Awaited<ReturnType<typeof createAdminClient>>,
  empId: string,
  id: string | null,
  cpf: string | null
): Promise<Record<string, unknown> | null> {
  if (id) {
    const { data } = await admin
      .from("filiacoes")
      .select("*")
      .eq("id", id)
      .eq("emp_proprietaria_id", empId)
      .maybeSingle()
    // Mesclado depois que a ficha começou: vale o que ficou.
    if (data && data.filiacao_excluida === true && texto(data.mesclado_em_id)) {
      return cadastroParaAprovar(admin, empId, String(data.mesclado_em_id), null)
    }
    if (data && data.filiacao_excluida !== true) return data as Record<string, unknown>
  }
  const limpo = cpfConfiavel(cpf)
  if (!limpo) return null
  const { data } = await admin
    .from("filiacoes")
    .select("*")
    .eq("emp_proprietaria_id", empId)
    .in("cpf", grafiasDoCpf(limpo))
    .not("filiacao_excluida", "is", true)
    .order("created_at", { ascending: false })
    .limit(1)
  return (data?.[0] as Record<string, unknown> | undefined) ?? null
}

const CAMPOS_DA_FICHA_NO_CADASTRO: [string, string, string][] = [
  ["nome_completo", "nome_completo", "Nome"],
  ["nome_social", "nome_social", "Nome social"],
  ["nascimento_data", "nascimento_data", "Nascimento"],
  ["sexo", "sexo", "Sexo"],
  ["telefone_1", "telefone_1", "Telefone 1"],
  ["telefone_2", "telefone_2", "Telefone 2"],
  ["endereco_cep", "endereco_cep", "CEP"],
  ["endereco_logradouro", "endereco_logradouro", "Logradouro"],
  ["endereco_numero", "endereco_numero", "Número"],
  ["endereco_complemento", "endereco_complemento", "Complemento"],
  ["endereco_bairro", "endereco_bairro", "Bairro"],
  ["endereco_cidade", "endereco_cidade", "Cidade"],
  ["endereco_estado", "endereco_estado", "UF"],
]

/**
 * Refiliação aprovada: os dados conferidos na ficha vão para o cadastro (o que
 * mudou fica no prontuário), o e-mail confirmado vira o pessoal (o antigo vai
 * para Outros contatos), a condição volta a Ativo e o vínculo novo é aberto —
 * a não ser que já haja um aberto na mesma fonte.
 */
async function atualizarCadastroNaAprovacao(
  admin: Awaited<ReturnType<typeof createAdminClient>>,
  empId: string,
  f: Record<string, unknown>,
  s: Record<string, unknown>,
  avaliadorId: string
): Promise<{ erro?: string }> {
  const agora = new Date().toISOString()
  const patch: Record<string, unknown> = {}
  const mudou: string[] = []
  for (const [daFicha, doCadastro, rotulo] of CAMPOS_DA_FICHA_NO_CADASTRO) {
    const novo = texto(s[daFicha])
    if (!novo || novo === texto(f[doCadastro])) continue
    patch[doCadastro] = novo
    mudou.push(`${rotulo}: ${texto(f[doCadastro]) ?? "vazio"} → ${novo}`)
  }
  if (patch.nascimento_data) {
    const n = String(patch.nascimento_data)
    patch.nascimento_dia = Number(n.slice(8, 10))
    patch.nascimento_mes = Number(n.slice(5, 7))
  }
  if (typeof s.telefone_1_whatsapp === "boolean") patch.telefone_1_whatsapp = s.telefone_1_whatsapp
  const email = texto(s.email)
  const emailAntigo = texto(f.email_pessoal)
  if (email && email.toLowerCase() !== (emailAntigo ?? "").toLowerCase()) {
    patch.email_pessoal = email
    mudou.push(`E-mail pessoal: ${emailAntigo ?? "vazio"} → ${email}`)
    if (emailAntigo) {
      await admin.from("emails").insert({ email: emailAntigo.toLowerCase(), filiado_id: f.id, emp_proprietaria_id: empId })
    }
  }
  const { error } = await admin
    .from("filiacoes")
    .update({
      ...patch,
      filiacao_condicao: "Ativo",
      condicao_desde: agora,
      ativo_em: agora,
      tl_lgpd_data: texto(s.aceite_lgpd_data),
      tl_desconto_data: texto(s.aceite_desconto_data),
      tl_lgpd_id: texto(s.tl_lgpd_id),
      tl_desconto_id: texto(s.tl_desconto_id),
      updated_at: agora,
    })
    .eq("id", f.id)
    .eq("emp_proprietaria_id", empId)
  if (error) return { erro: `Falha ao atualizar o cadastro: ${error.message}` }

  let vinculo = "sem empresa informada"
  if (texto(s.empregador_id)) {
    const { data: aberto } = await admin
      .from("filiacao_vinculos")
      .select("id")
      .eq("filiado_id", f.id)
      .eq("fonte_pagadora_id", s.empregador_id)
      .is("data_desfiliacao", null)
      .is("filiacao_data_saida", null)
      .limit(1)
    if (aberto?.length) {
      vinculo = "já havia um vínculo aberto na mesma empresa, mantido"
    } else {
      const { error: ev } = await admin.from("filiacao_vinculos").insert({
        filiado_id: f.id,
        fonte_pagadora_id: s.empregador_id,
        matricula: texto(s.matricula),
        cargo: texto(s.cargo),
        lotacao: texto(s.lotacao),
        emp_proprietaria_id: empId,
      })
      vinculo = ev ? `o vínculo não pôde ser criado (${ev.message})` : s.mesma_fonte === true ? "vínculo novo na mesma empresa" : "vínculo novo"
    }
  }

  await admin.from("filiacao_prontuario").insert({
    filiacao_id: f.id,
    data: agora,
    tipo: "Atualização cadastral",
    descricao:
      `Refiliação pela ficha online (protocolo ${s.protocolo ?? "—"}): ${vinculo}.` +
      (mudou.length ? ` Dados atualizados: ${mudou.join("; ")}.` : " Dados do cadastro confirmados sem mudança."),
    diretor_funcionario_id: avaliadorId,
    emp_proprietaria_id: empId,
    created_at: agora,
    modified_at: agora,
  })
  return {}
}

// ── Quem parou no meio (avisos para a gestão) ────────────────────────────────

export type FichaParada = {
  id: string
  nome: string | null
  email: string | null
  telefone: string | null
  telefoneWhatsapp: boolean
  situacao: SituacaoSolicitacao
  passo: number
  /** Última mexida na ficha (ou no contato registrado). */
  desde: string | null
  ultimoContato: { em: string | null; nota: string | null } | null
}

/**
 * Fichas que começaram e não chegaram à avaliação: link enviado e não aberto,
 * preenchimento pela metade, ou concluída sem o PDF assinado. As mais antigas
 * primeiro. Registrar um contato renova a data (a ficha sai dos avisos por uns dias).
 */
export async function fichasParadas(): Promise<FichaParada[]> {
  const empId = await tenantAtual()
  const admin = await createAdminClient()
  const { data } = await admin
    .from("filiacao_solicitacoes")
    .select("id, nome_completo, email, telefone_1, telefone_1_whatsapp, situacao, passo, updated_at, created_at")
    .eq("emp_proprietaria_id", empId)
    .in("situacao", ["aguardando_verificacao", "em_preenchimento", "aguardando_assinatura"])
    .order("updated_at", { ascending: true, nullsFirst: true })
    .limit(200)
  const linhas = data ?? []
  const ids = linhas.map((l) => String(l.id))
  const contatos = new Map<string, { em: string | null; nota: string | null }>()
  if (ids.length) {
    const { data: ev } = await admin
      .from("filiacao_solicitacao_eventos")
      .select("solicitacao_id, detalhe, created_at")
      .eq("emp_proprietaria_id", empId)
      .eq("evento", "contato_registrado")
      .in("solicitacao_id", ids)
      .order("created_at", { ascending: false })
    for (const e of ev ?? []) {
      const id = String(e.solicitacao_id)
      if (!contatos.has(id)) contatos.set(id, { em: texto(e.created_at), nota: texto(e.detalhe) })
    }
  }
  return linhas.map((l) => ({
    id: String(l.id),
    nome: texto(l.nome_completo),
    email: texto(l.email),
    telefone: texto(l.telefone_1),
    telefoneWhatsapp: l.telefone_1_whatsapp === true,
    situacao: String(l.situacao) as SituacaoSolicitacao,
    passo: Number(l.passo ?? 0),
    desde: texto(l.updated_at) ?? texto(l.created_at),
    ultimoContato: contatos.get(String(l.id)) ?? null,
  }))
}

/** "Falei com a pessoa": fica na trilha e tira a ficha dos avisos por uns dias. */
export async function registrarContatoFicha(id: string, nota: string, usuarioId: string): Promise<{ erro?: string }> {
  const empId = await tenantAtual()
  const admin = await createAdminClient()
  const { error } = await admin
    .from("filiacao_solicitacoes")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("emp_proprietaria_id", empId)
  if (error) return { erro: error.message }
  await registrarEventoFicha(id, "contato_registrado", nota.trim().slice(0, 500) || "Contato feito pela gestão", null, null)
  await registrarEventoFicha(id, "contato_por", `usuario=${usuarioId}`, null, null)
  return {}
}

/** A pessoa desistiu (ou a ficha era engano): sai da lista de paradas. */
export async function marcarDesistenciaFicha(id: string, motivo: string): Promise<{ erro?: string }> {
  const empId = await tenantAtual()
  const admin = await createAdminClient()
  const { error } = await admin
    .from("filiacao_solicitacoes")
    .update({ situacao: "desistente", updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("emp_proprietaria_id", empId)
    .in("situacao", ["aguardando_verificacao", "em_preenchimento", "aguardando_assinatura"])
  if (error) return { erro: error.message }
  await registrarEventoFicha(id, "desistencia", motivo.trim().slice(0, 500) || null, null, null)
  return {}
}

/** Quantas pararam no meio há DIAS_PARADA dias ou mais (para o cartão do hub). */
export async function contarFichasParadas(): Promise<number> {
  const admin = await createAdminClient()
  const { count } = await admin
    .from("filiacao_solicitacoes")
    .select("id", { count: "exact", head: true })
    .eq("emp_proprietaria_id", await tenantAtual())
    .in("situacao", ["em_preenchimento", "aguardando_assinatura"])
    .lt("updated_at", new Date(Date.now() - DIAS_PARADA * 86_400_000).toISOString())
  return count ?? 0
}
