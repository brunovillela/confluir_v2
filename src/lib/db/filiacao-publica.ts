import "server-only"
import { createHash, randomInt, randomUUID, timingSafeEqual } from "node:crypto"

import { tenantAtual } from "@/lib/tenant"

import { listarFontesPagadoras } from "@/lib/db/fontes"
import { type FiliacaoCondicao } from "@/lib/filiacao"
import { semAcento } from "@/lib/texto"
import { createAdminClient, createServiceClient } from "@/lib/supabase/admin"

/**
 * Ficha de filiação pública (sem login). O aspirante preenche em `/filiar`,
 * confirma o e-mail por código, abre a ficha pelo link único `/ficha/<token>`,
 * assina no Assinador gov.br e sobe o PDF; a submissão entra na fila de
 * avaliação (`/painel/filiados/solicitacoes`) e, aprovada, CRIA a filiação.
 *
 * Espelha o padrão da Oposição (`db/oposicao.ts`): grava via service role +
 * `tenantAtual()`, protocolo sequencial por tenant, trilha append-only, upload
 * de PDF assinado no Storage (bucket privado `filiacao`).
 */

const SOLICITACOES_POR_PAGINA = 50
const CODIGO_VALIDADE_MIN = 15
const CODIGO_MAX_TENTATIVAS = 5

export const SITUACOES_SOLICITACAO = [
  "aguardando_verificacao",
  "aguardando_assinatura",
  "nao_avaliada",
  "aprovada",
  "reprovada",
  "desistente",
] as const
export type SituacaoSolicitacao = (typeof SITUACOES_SOLICITACAO)[number]

export const ROTULO_SITUACAO_SOLICITACAO: Record<SituacaoSolicitacao, string> = {
  aguardando_verificacao: "Aguardando e-mail",
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
  "aprovada",
  "reprovada",
  "desistente",
] as const

function texto(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null
}

function escaparLike(t: string): string {
  return t.replace(/[%_\\]/g, "\\$&")
}

function hojeSPdata(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date())
}

// Código de 6 dígitos guardado hasheado (sha256 do código + token secreto).
function hashCodigo(codigo: string, token: string): string {
  return createHash("sha256").update(`${codigo}:${token}`).digest("hex")
}
function conferirHash(codigo: string, token: string, hash: string): boolean {
  const a = Buffer.from(hashCodigo(codigo, token))
  const b = Buffer.from(hash)
  return a.length === b.length && timingSafeEqual(a, b)
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
  const admin = createServiceClient()
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

export type DadosSolicitacao = {
  nome: string
  nome_social: string | null
  cpf: string
  nascimento: string | null
  sexo: string | null
  email: string
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
  empregador_id: string | null
  matricula: string | null
  cargo: string | null
  lotacao: string | null
  aceite_lgpd: boolean
  aceite_desconto: boolean
  tl_lgpd_id: string | null
  tl_desconto_id: string | null
  ip: string | null
  userAgent: string | null
}

async function registrarEvento(
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

/**
 * Cria a solicitação com `situacao='aguardando_verificacao'` e devolve o código
 * de 6 dígitos EM CLARO (uma única vez) para a action enviar por e-mail — no
 * banco só fica o hash + expiração. Bloqueia duplicidade por CPF (filiação já
 * existente ou solicitação pendente).
 */
export async function criarSolicitacao(
  dados: DadosSolicitacao
): Promise<{ erro?: string; id?: string; token?: string; codigo?: string }> {
  const empId = await tenantAtual()
  const admin = await createAdminClient()

  const { data: jaFiliado } = await admin
    .from("filiacoes")
    .select("id")
    .eq("cpf", dados.cpf)
    .eq("emp_proprietaria_id", empId)
    .limit(1)
    .maybeSingle()
  if (jaFiliado) {
    return {
      erro: "Já existe uma filiação com este CPF. Se você já é filiado, acesse o portal do filiado.",
    }
  }

  const { data: pendente } = await admin
    .from("filiacao_solicitacoes")
    .select("id")
    .eq("cpf", dados.cpf)
    .eq("emp_proprietaria_id", empId)
    .in("situacao", [
      "aguardando_verificacao",
      "aguardando_assinatura",
      "nao_avaliada",
    ])
    .limit(1)
    .maybeSingle()
  if (pendente) {
    return {
      erro: "Já existe uma ficha de filiação em andamento com este CPF. Verifique seu e-mail para continuar.",
    }
  }

  const token = randomUUID()
  const codigo = String(randomInt(0, 1_000_000)).padStart(6, "0")
  const expira = new Date(Date.now() + CODIGO_VALIDADE_MIN * 60_000)
  const agora = new Date().toISOString()

  const { data, error } = await admin
    .from("filiacao_solicitacoes")
    .insert({
      token,
      nome_completo: dados.nome,
      nome_social: dados.nome_social,
      cpf: dados.cpf,
      nascimento_data: dados.nascimento,
      sexo: dados.sexo,
      email: dados.email,
      telefone_1: dados.telefone_1,
      telefone_1_whatsapp: dados.telefone_1_whatsapp,
      telefone_2: dados.telefone_2,
      endereco_cep: dados.endereco_cep,
      endereco_logradouro: dados.endereco_logradouro,
      endereco_numero: dados.endereco_numero,
      endereco_complemento: dados.endereco_complemento,
      endereco_bairro: dados.endereco_bairro,
      endereco_cidade: dados.endereco_cidade,
      endereco_estado: dados.endereco_estado,
      empregador_id: dados.empregador_id,
      matricula: dados.matricula,
      cargo: dados.cargo,
      lotacao: dados.lotacao,
      aceite_lgpd_data: dados.aceite_lgpd ? agora : null,
      aceite_desconto_data: dados.aceite_desconto ? agora : null,
      tl_lgpd_id: dados.tl_lgpd_id,
      tl_desconto_id: dados.tl_desconto_id,
      codigo_hash: hashCodigo(codigo, token),
      codigo_expira_em: expira.toISOString(),
      situacao: "aguardando_verificacao",
      ip: dados.ip,
      user_agent: dados.userAgent,
      emp_proprietaria_id: empId,
    })
    .select("id")
    .single()
  if (error || !data) {
    return { erro: `Não foi possível enviar a ficha: ${error?.message ?? "?"}` }
  }
  await registrarEvento(String(data.id), "ficha_enviada", null, dados.ip, dados.userAgent)
  return { id: String(data.id), token, codigo }
}

/** Regenera o código de verificação (reenvio). Devolve o novo código em claro. */
export async function regenerarCodigo(
  token: string
): Promise<{ erro?: string; codigo?: string; email?: string; nome?: string | null }> {
  const empId = await tenantAtual()
  const admin = await createAdminClient()
  const { data } = await admin
    .from("filiacao_solicitacoes")
    .select("id, email, nome_completo, situacao")
    .eq("token", token)
    .eq("emp_proprietaria_id", empId)
    .maybeSingle()
  if (!data) return { erro: "Solicitação não encontrada." }
  if (data.situacao !== "aguardando_verificacao") {
    return { erro: "Este e-mail já foi verificado." }
  }
  const codigo = String(randomInt(0, 1_000_000)).padStart(6, "0")
  const expira = new Date(Date.now() + CODIGO_VALIDADE_MIN * 60_000)
  const { error } = await admin
    .from("filiacao_solicitacoes")
    .update({
      codigo_hash: hashCodigo(codigo, token),
      codigo_expira_em: expira.toISOString(),
      codigo_tentativas: 0,
      updated_at: new Date().toISOString(),
    })
    .eq("id", data.id)
    .eq("emp_proprietaria_id", empId)
  if (error) return { erro: `Falha ao reenviar: ${error.message}` }
  return { codigo, email: String(data.email), nome: texto(data.nome_completo) }
}

/**
 * Confere o código; no acerto grava `email_verificado_em` e move para
 * `aguardando_assinatura`. Devolve e-mail/nome p/ a action mandar o link único.
 */
export async function verificarCodigo(
  token: string,
  codigo: string,
  ip: string | null,
  userAgent: string | null
): Promise<{ erro?: string; ok?: boolean; email?: string; nome?: string | null }> {
  const empId = await tenantAtual()
  const admin = await createAdminClient()
  const { data } = await admin
    .from("filiacao_solicitacoes")
    .select(
      "id, email, nome_completo, situacao, codigo_hash, codigo_expira_em, codigo_tentativas"
    )
    .eq("token", token)
    .eq("emp_proprietaria_id", empId)
    .maybeSingle()
  if (!data) return { erro: "Solicitação não encontrada." }
  if (data.situacao !== "aguardando_verificacao") {
    // Já verificado: idempotente (o fluxo segue para a assinatura).
    return { ok: true, email: String(data.email), nome: texto(data.nome_completo) }
  }
  if ((data.codigo_tentativas ?? 0) >= CODIGO_MAX_TENTATIVAS) {
    return { erro: "Muitas tentativas. Peça um novo código." }
  }
  if (!data.codigo_expira_em || new Date(data.codigo_expira_em) < new Date()) {
    return { erro: "Código expirado. Peça um novo código." }
  }
  const limpo = codigo.replace(/\D/g, "")
  if (
    limpo.length !== 6 ||
    !data.codigo_hash ||
    !conferirHash(limpo, token, String(data.codigo_hash))
  ) {
    await admin
      .from("filiacao_solicitacoes")
      .update({ codigo_tentativas: (data.codigo_tentativas ?? 0) + 1 })
      .eq("id", data.id)
      .eq("emp_proprietaria_id", empId)
    return { erro: "Código incorreto." }
  }

  const { error } = await admin
    .from("filiacao_solicitacoes")
    .update({
      email_verificado_em: new Date().toISOString(),
      situacao: "aguardando_assinatura",
      codigo_hash: null,
      codigo_expira_em: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", data.id)
    .eq("emp_proprietaria_id", empId)
  if (error) return { erro: `Falha ao verificar: ${error.message}` }
  await registrarEvento(String(data.id), "email_verificado", null, ip, userAgent)
  return { ok: true, email: String(data.email), nome: texto(data.nome_completo) }
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
    .select("id, situacao, protocolo")
    .eq("token", token)
    .eq("emp_proprietaria_id", empId)
    .maybeSingle()
  if (!s) return { erro: "Solicitação não encontrada." }
  if (s.situacao === "aguardando_verificacao") {
    return { erro: "Confirme seu e-mail antes de enviar a ficha assinada." }
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
  const { error } = await admin
    .from("filiacao_solicitacoes")
    .update({
      documento_assinado_url: caminho,
      situacao: "nao_avaliada",
      protocolo,
      updated_at: new Date().toISOString(),
    })
    .eq("id", s.id)
    .eq("emp_proprietaria_id", empId)
  if (error) return { erro: error.message }
  await registrarEvento(String(s.id), "ficha_assinada_enviada", null, ip, userAgent)
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
    // Só as que já passaram da verificação de e-mail entram na fila.
    .neq("situacao", "aguardando_verificacao")

  if (filtros.situacao && filtros.situacao !== "todas") {
    q = q.eq("situacao", filtros.situacao)
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
  documentoAssinadoUrl: string | null
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
    documentoAssinadoUrl,
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
        avaliacao_data: hojeSPdata(),
        avaliacao_avaliador_id: avaliadorId,
        reprovacao_motivo: motivo?.trim() ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("emp_proprietaria_id", empId)
    if (error) return { erro: error.message }
    await registrarEvento(id, "reprovada", motivo?.trim() ?? null, null, null)
    return { ok: true, email: texto(s.email), nome: texto(s.nome_completo), aprovado: false }
  }

  // Aprovação: cria a filiação (se ainda não criada) e vincula.
  let filiacaoId = texto(s.filiacao_id)
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
        matricula_sindical: texto(s.matricula),
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

    if (texto(s.empregador_id)) {
      await admin.from("filiacao_vinculos").insert({
        filiado_id: filiacaoId,
        fonte_pagadora_id: s.empregador_id,
        cargo: texto(s.cargo),
        lotacao: texto(s.lotacao),
        matricula: texto(s.matricula),
        filiacao_condicao: condicao,
        emp_proprietaria_id: empId,
      })
    }
  }

  const { error } = await admin
    .from("filiacao_solicitacoes")
    .update({
      situacao: "aprovada",
      avaliacao: true,
      avaliacao_data: hojeSPdata(),
      avaliacao_avaliador_id: avaliadorId,
      reprovacao_motivo: null,
      filiacao_id: filiacaoId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("emp_proprietaria_id", empId)
  if (error) return { erro: error.message }
  await registrarEvento(id, "aprovada", `filiacao_id=${filiacaoId}`, null, null)
  return { ok: true, email: texto(s.email), nome: texto(s.nome_completo), aprovado: true }
}
