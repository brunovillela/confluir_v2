import "server-only"
import { hojeSP, texto } from "@/lib/db/comum"
import { randomUUID } from "node:crypto"

import { tenantAtual } from "@/lib/tenant"

import { gerarCodigoProcesso } from "@/lib/db/compras"
import { listarFontesPagadoras } from "@/lib/db/fontes"
import { createAdminClient } from "@/lib/supabase/admin"
import {
  estadoPrazo,
  MODOS_FORMALIZACAO,
  SITUACOES_CAMPANHA,
  type ModoFormalizacao,
  type SituacaoCampanha,
  type SituacaoOpositor,
} from "@/lib/oposicao-constantes"

/**
 * Oposição à Contribuição Assistencial — área do módulo Filiação. Leitura das
 * campanhas migradas do Bubble (2 campanhas, 9.587 opositores, 2.834 respostas)
 * e da fila de avaliação. Escrita (cadastro/avaliação) e portal em fases
 * seguintes.
 */

const OPOSITORES_POR_PAGINA = 50

function escaparLike(t: string): string {
  return t.replace(/[%_\\]/g, "\\$&")
}

// ── Campanhas ────────────────────────────────────────────────────────────────

export type CampanhaLinha = {
  id: string
  nome: string | null
  codigo: string | null
  prazo_inicio: string | null
  prazo_fim: string | null
  situacao: SituacaoCampanha
  totalOpositores: number
}

/** Situações por campanha via count (evita puxar 9,5k linhas). */
async function contarPorCampanha(
  admin: Awaited<ReturnType<typeof createAdminClient>>,
  empId: string,
  campanhaId: string,
  situacao?: SituacaoOpositor
): Promise<number> {
  let q = admin
    .from("oposicao_opositor")
    .select("id", { count: "exact", head: true })
    .eq("emp_proprietaria_id", empId)
    .eq("campanha_id", campanhaId)
  if (situacao) q = q.eq("situacao", situacao)
  const { count } = await q
  return count ?? 0
}

export async function listarCampanhas(): Promise<CampanhaLinha[]> {
  const empId = await tenantAtual()
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("oposicao_campanha")
    .select("id, nome, codigo, prazo_inicio, prazo_fim, situacao")
    .eq("emp_proprietaria_id", empId)
    .order("prazo_inicio", { ascending: false, nullsFirst: false })
  if (error) throw new Error(`Falha ao listar campanhas: ${error.message}`)

  return Promise.all(
    (data ?? []).map(async (c) => ({
      id: String(c.id),
      nome: texto(c.nome),
      codigo: texto(c.codigo),
      prazo_inicio: texto(c.prazo_inicio),
      prazo_fim: texto(c.prazo_fim),
      situacao: (c.situacao ?? "rascunho") as SituacaoCampanha,
      totalOpositores: await contarPorCampanha(admin, empId, String(c.id)),
    }))
  )
}

export type CampanhaDetalhe = {
  id: string
  nome: string | null
  codigo: string | null
  detalhe_desconto: string | null
  prazo_inicio: string | null
  prazo_fim: string | null
  situacao: SituacaoCampanha
  modo_formalizacao: ModoFormalizacao
  video_filiado_url: string | null
  video_filiado_tempo: number | null
  video_nao_filiado_url: string | null
  video_nao_filiado_tempo: number | null
  video_agradecimento_url: string | null
  texto_declaracao: string | null
  fontes: string[]
  perguntas: { id: string; pergunta: string | null }[]
  contagem: Record<SituacaoOpositor, number>
  total: number
}

const SITUACOES: SituacaoOpositor[] = [
  "aguardando_documento",
  "nao_avaliada",
  "aprovada",
  "reprovada",
  "desistente",
]

export async function obterCampanha(
  id: string
): Promise<CampanhaDetalhe | null> {
  const empId = await tenantAtual()
  const admin = await createAdminClient()
  const { data: c, error } = await admin
    .from("oposicao_campanha")
    .select("*")
    .eq("id", id)
    .eq("emp_proprietaria_id", empId)
    .maybeSingle()
  if (error) throw new Error(`Falha ao carregar campanha: ${error.message}`)
  if (!c) return null

  const [fontesRes, perguntasRes, ...contagens] = await Promise.all([
    admin
      .from("oposicao_campanha_fontes")
      .select("empresa_id")
      .eq("campanha_id", id)
      .eq("emp_proprietaria_id", empId),
    admin
      .from("oposicao_perguntas")
      .select("id, pergunta")
      .eq("campanha_id", id)
      .eq("emp_proprietaria_id", empId)
      .order("ordem", { ascending: true }),
    ...SITUACOES.map((s) => contarPorCampanha(admin, empId, id, s)),
  ])

  const empresaIds = (fontesRes.data ?? [])
    .map((f) => texto(f.empresa_id))
    .filter((v): v is string => Boolean(v))
  const fontes: string[] = []
  if (empresaIds.length) {
    const { data: emps } = await admin
      .from("empresa")
      .select("id, nome_fantasia, nome_razao")
      .in("id", empresaIds)
    for (const e of emps ?? []) {
      const nome = texto(e.nome_fantasia) ?? texto(e.nome_razao)
      if (nome) fontes.push(nome)
    }
  }

  const contagem = Object.fromEntries(
    SITUACOES.map((s, i) => [s, contagens[i]])
  ) as Record<SituacaoOpositor, number>

  return {
    id: String(c.id),
    nome: texto(c.nome),
    codigo: texto(c.codigo),
    detalhe_desconto: texto(c.detalhe_desconto),
    prazo_inicio: texto(c.prazo_inicio),
    prazo_fim: texto(c.prazo_fim),
    situacao: (c.situacao ?? "rascunho") as SituacaoCampanha,
    modo_formalizacao: (c.modo_formalizacao ?? "tela") as ModoFormalizacao,
    video_filiado_url: texto(c.video_filiado_url),
    video_filiado_tempo: c.video_filiado_tempo == null ? null : Number(c.video_filiado_tempo),
    video_nao_filiado_url: texto(c.video_nao_filiado_url),
    video_nao_filiado_tempo:
      c.video_nao_filiado_tempo == null ? null : Number(c.video_nao_filiado_tempo),
    video_agradecimento_url: texto(c.video_agradecimento_url),
    texto_declaracao: texto(c.texto_declaracao),
    fontes,
    perguntas: (perguntasRes.data ?? []).map((p) => ({
      id: String(p.id),
      pergunta: texto(p.pergunta),
    })),
    contagem,
    total: SITUACOES.reduce((s, k) => s + contagem[k], 0),
  }
}

// ── Fila de opositores ───────────────────────────────────────────────────────

export type OpositorLinha = {
  id: string
  nome: string | null
  cpf: string | null
  matricula: string | null
  empregadorNome: string | null
  situacao: SituacaoOpositor
  ehFiliado: boolean
  created_at: string | null
}

export type ListaOpositores = {
  linhas: OpositorLinha[]
  total: number
  pagina: number
  totalPaginas: number
}

export type FiltrosOpositores = {
  campanhaId: string
  situacao?: SituacaoOpositor | "todas"
  busca?: string
  pagina?: number
}

export async function listarOpositores(
  filtros: FiltrosOpositores
): Promise<ListaOpositores> {
  const empId = await tenantAtual()
  const admin = await createAdminClient()
  const pagina = filtros.pagina && filtros.pagina > 0 ? filtros.pagina : 1

  let q = admin
    .from("oposicao_opositor")
    .select(
      "id, nome_completo, cpf, matricula, empregador_id, situacao, filiacao_id, created_at",
      { count: "exact" }
    )
    .eq("emp_proprietaria_id", empId)
    .eq("campanha_id", filtros.campanhaId)

  if (filtros.situacao && filtros.situacao !== "todas") {
    q = q.eq("situacao", filtros.situacao)
  }
  const termo = (filtros.busca ?? "").trim()
  if (termo) {
    const e = escaparLike(termo)
    q = q.or(
      `nome_completo.ilike.%${e}%,cpf.ilike.%${e}%,matricula.ilike.%${e}%`
    )
  }

  const de = (pagina - 1) * OPOSITORES_POR_PAGINA
  const { data, count, error } = await q
    .order("created_at", { ascending: false, nullsFirst: false })
    .range(de, de + OPOSITORES_POR_PAGINA - 1)
  if (error) throw new Error(`Falha ao listar opositores: ${error.message}`)

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
      situacao: (o.situacao ?? "nao_avaliada") as SituacaoOpositor,
      ehFiliado: Boolean(o.filiacao_id),
      created_at: texto(o.created_at),
    })),
    total,
    pagina,
    totalPaginas: Math.max(1, Math.ceil(total / OPOSITORES_POR_PAGINA)),
  }
}

// ── Escrita: cadastro da campanha (Fase 1) ───────────────────────────────────

export type OpcaoFonte = { id: string; nome: string }

/** Fontes pagadoras disponíveis para vincular à campanha. */
export async function opcoesFontes(): Promise<OpcaoFonte[]> {
  const fontes = await listarFontesPagadoras()
  return fontes.map((f) => ({
    id: f.id,
    nome: f.nome_fantasia ?? f.nome_razao ?? "(sem nome)",
  }))
}

export type DadosCampanha = {
  nome: string
  detalhe_desconto: string | null
  prazo_inicio: string | null
  prazo_fim: string | null
  modo_formalizacao: ModoFormalizacao
  situacao: SituacaoCampanha
  texto_declaracao: string | null
  video_filiado_url: string | null
  video_filiado_tempo: number | null
  video_nao_filiado_url: string | null
  video_nao_filiado_tempo: number | null
  video_agradecimento_url: string | null
  /** Caminho já gravável (upload feito na action); undefined = não mexer. */
  documento_modelo_url?: string | null
  fonteIds: string[]
}

function normalizar(dados: DadosCampanha): Record<string, unknown> {
  const p: Record<string, unknown> = {
    nome: dados.nome,
    detalhe_desconto: dados.detalhe_desconto,
    prazo_inicio: dados.prazo_inicio,
    prazo_fim: dados.prazo_fim,
    modo_formalizacao: MODOS_FORMALIZACAO.some((m) => m.chave === dados.modo_formalizacao)
      ? dados.modo_formalizacao
      : "tela",
    situacao: SITUACOES_CAMPANHA.some((s) => s.chave === dados.situacao)
      ? dados.situacao
      : "rascunho",
    texto_declaracao: dados.texto_declaracao,
    video_filiado_url: dados.video_filiado_url,
    video_filiado_tempo: dados.video_filiado_tempo,
    video_nao_filiado_url: dados.video_nao_filiado_url,
    video_nao_filiado_tempo: dados.video_nao_filiado_tempo,
    video_agradecimento_url: dados.video_agradecimento_url,
  }
  if (dados.documento_modelo_url !== undefined) {
    p.documento_modelo_url = dados.documento_modelo_url
  }
  return p
}

/** Substitui o conjunto de fontes da campanha. */
async function gravarFontes(
  admin: Awaited<ReturnType<typeof createAdminClient>>,
  empId: string,
  campanhaId: string,
  fonteIds: string[]
): Promise<void> {
  await admin
    .from("oposicao_campanha_fontes")
    .delete()
    .eq("campanha_id", campanhaId)
    .eq("emp_proprietaria_id", empId)
  const unicos = [...new Set(fonteIds.filter(Boolean))]
  if (unicos.length) {
    await admin.from("oposicao_campanha_fontes").insert(
      unicos.map((empresa_id) => ({
        campanha_id: campanhaId,
        empresa_id,
        emp_proprietaria_id: empId,
      }))
    )
  }
}

export async function criarCampanha(
  dados: DadosCampanha
): Promise<{ id?: string; erro?: string }> {
  if (!dados.nome.trim()) return { erro: "Informe o nome da campanha." }
  const empId = await tenantAtual()
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("oposicao_campanha")
    .insert({
      ...normalizar(dados),
      codigo: gerarCodigoProcesso(),
      emp_proprietaria_id: empId,
    })
    .select("id")
    .single()
  if (error) return { erro: `Falha ao criar a campanha: ${error.message}` }
  await gravarFontes(admin, empId, String(data.id), dados.fonteIds)
  return { id: String(data.id) }
}

export async function atualizarCampanha(
  id: string,
  dados: DadosCampanha
): Promise<{ erro?: string }> {
  if (!dados.nome.trim()) return { erro: "Informe o nome da campanha." }
  const empId = await tenantAtual()
  const admin = await createAdminClient()
  const { error } = await admin
    .from("oposicao_campanha")
    .update(normalizar(dados))
    .eq("id", id)
    .eq("emp_proprietaria_id", empId)
  if (error) return { erro: `Falha ao salvar a campanha: ${error.message}` }
  await gravarFontes(admin, empId, id, dados.fonteIds)
  return {}
}

/** Sobe o documento-modelo (gov.br) no bucket privado; devolve o caminho. */
export async function subirDocumentoModelo(
  arquivo: File
): Promise<{ caminho?: string; erro?: string }> {
  if (arquivo.type !== "application/pdf") {
    return { erro: "O modelo deve ser um PDF." }
  }
  const admin = await createAdminClient()
  const caminho = `modelos/${randomUUID()}.pdf`
  const { error } = await admin.storage
    .from("oposicao")
    .upload(caminho, arquivo, { contentType: "application/pdf", upsert: false })
  if (error) return { erro: `Falha ao subir o modelo: ${error.message}` }
  return { caminho }
}

// ── Perguntas do questionário ────────────────────────────────────────────────

export async function adicionarPergunta(
  campanhaId: string,
  pergunta: string
): Promise<{ erro?: string }> {
  if (!pergunta.trim()) return { erro: "Informe a pergunta." }
  const empId = await tenantAtual()
  const admin = await createAdminClient()
  // Confirma que a campanha é do tenant antes de anexar a pergunta.
  const { data: c } = await admin
    .from("oposicao_campanha")
    .select("id")
    .eq("id", campanhaId)
    .eq("emp_proprietaria_id", empId)
    .maybeSingle()
  if (!c) return { erro: "Campanha não encontrada." }
  const { count } = await admin
    .from("oposicao_perguntas")
    .select("id", { count: "exact", head: true })
    .eq("campanha_id", campanhaId)
    .eq("emp_proprietaria_id", empId)
  const { error } = await admin.from("oposicao_perguntas").insert({
    campanha_id: campanhaId,
    pergunta: pergunta.trim(),
    ordem: count ?? 0,
    emp_proprietaria_id: empId,
  })
  if (error) return { erro: `Falha ao adicionar a pergunta: ${error.message}` }
  return {}
}

export async function excluirPergunta(id: string): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin
    .from("oposicao_perguntas")
    .delete()
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: `Falha ao excluir a pergunta: ${error.message}` }
  return {}
}

/** ids das fontes vinculadas (para pré-marcar o form de edição). */
export async function fonteIdsDaCampanha(
  campanhaId: string
): Promise<string[]> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("oposicao_campanha_fontes")
    .select("empresa_id")
    .eq("campanha_id", campanhaId)
    .eq("emp_proprietaria_id", await tenantAtual())
  return (data ?? [])
    .map((f) => texto(f.empresa_id))
    .filter((v): v is string => Boolean(v))
}

// ── Portal do trabalhador (Fase 2) ───────────────────────────────────────────

export type CampanhaAberta = {
  id: string
  nome: string | null
  detalhe_desconto: string | null
  prazo_inicio: string | null
  prazo_fim: string | null
}

/** Campanhas com situação 'aberta' (a janela de prazo é checada na tela). */
export async function campanhasAbertas(): Promise<CampanhaAberta[]> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("oposicao_campanha")
    .select("id, nome, detalhe_desconto, prazo_inicio, prazo_fim")
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("situacao", "aberta")
    .order("prazo_inicio", { ascending: false, nullsFirst: false })
  return (data ?? []).map((c) => ({
    id: String(c.id),
    nome: texto(c.nome),
    detalhe_desconto: texto(c.detalhe_desconto),
    prazo_inicio: texto(c.prazo_inicio),
    prazo_fim: texto(c.prazo_fim),
  }))
}

/**
 * Campanhas de oposição ABERTAS relevantes para o banner do filiado na home:
 * dentro do prazo e onde ele ainda NÃO concluiu (não se opôs, ou se opôs mas
 * falta enviar o documento assinado). Espelha o banner de votação.
 */
export type OposicaoDoFiliado = {
  campanhaId: string
  nome: string | null
  detalhe: string | null
  prazoFim: string | null
  jaOpos: boolean
  pendenteDocumento: boolean
  opositorId: string | null
}

export async function oposicoesParaFiliado(
  cpf: string
): Promise<OposicaoDoFiliado[]> {
  const campanhas = await campanhasAbertas()
  const hoje = hojeSP()
  const out: OposicaoDoFiliado[] = []
  for (const c of campanhas) {
    if (estadoPrazo(c.prazo_inicio, c.prazo_fim, hoje) !== "aberto") continue
    const minha = await minhaOposicao(c.id, cpf)
    const pendente = minha?.situacao === "aguardando_documento"
    if (minha && !pendente) continue // já concluída → fora do banner
    out.push({
      campanhaId: c.id,
      nome: c.nome,
      detalhe: c.detalhe_desconto,
      prazoFim: c.prazo_fim,
      jaOpos: Boolean(minha),
      pendenteDocumento: pendente,
      opositorId: minha?.id ?? null,
    })
  }
  return out
}

export type CampanhaPublica = {
  id: string
  nome: string | null
  detalhe_desconto: string | null
  prazo_inicio: string | null
  prazo_fim: string | null
  situacao: SituacaoCampanha
  modo_formalizacao: ModoFormalizacao
  texto_declaracao: string | null
  documento_modelo_url: string | null
  video_filiado_url: string | null
  video_filiado_tempo: number | null
  video_nao_filiado_url: string | null
  video_nao_filiado_tempo: number | null
  video_agradecimento_url: string | null
  fontes: { id: string; nome: string }[]
  perguntas: { id: string; pergunta: string | null }[]
}

export async function obterCampanhaPublica(
  id: string
): Promise<CampanhaPublica | null> {
  const empId = await tenantAtual()
  const admin = await createAdminClient()
  const { data: c } = await admin
    .from("oposicao_campanha")
    .select("*")
    .eq("id", id)
    .eq("emp_proprietaria_id", empId)
    .maybeSingle()
  if (!c) return null

  const [fontesRes, perguntasRes] = await Promise.all([
    admin
      .from("oposicao_campanha_fontes")
      .select("empresa_id")
      .eq("campanha_id", id)
      .eq("emp_proprietaria_id", empId),
    admin
      .from("oposicao_perguntas")
      .select("id, pergunta")
      .eq("campanha_id", id)
      .eq("emp_proprietaria_id", empId)
      .order("ordem", { ascending: true }),
  ])
  const empresaIds = (fontesRes.data ?? [])
    .map((f) => texto(f.empresa_id))
    .filter((v): v is string => Boolean(v))
  const fontes: { id: string; nome: string }[] = []
  if (empresaIds.length) {
    const { data: emps } = await admin
      .from("empresa")
      .select("id, nome_fantasia, nome_razao")
      .in("id", empresaIds)
    for (const e of emps ?? []) {
      fontes.push({
        id: String(e.id),
        nome: texto(e.nome_fantasia) ?? texto(e.nome_razao) ?? "(sem nome)",
      })
    }
  }

  return {
    id: String(c.id),
    nome: texto(c.nome),
    detalhe_desconto: texto(c.detalhe_desconto),
    prazo_inicio: texto(c.prazo_inicio),
    prazo_fim: texto(c.prazo_fim),
    situacao: (c.situacao ?? "rascunho") as SituacaoCampanha,
    modo_formalizacao: (c.modo_formalizacao ?? "tela") as ModoFormalizacao,
    texto_declaracao: texto(c.texto_declaracao),
    documento_modelo_url: texto(c.documento_modelo_url),
    video_filiado_url: texto(c.video_filiado_url),
    video_filiado_tempo:
      c.video_filiado_tempo == null ? null : Number(c.video_filiado_tempo),
    video_nao_filiado_url: texto(c.video_nao_filiado_url),
    video_nao_filiado_tempo:
      c.video_nao_filiado_tempo == null ? null : Number(c.video_nao_filiado_tempo),
    video_agradecimento_url: texto(c.video_agradecimento_url),
    fontes,
    perguntas: (perguntasRes.data ?? []).map((p) => ({
      id: String(p.id),
      pergunta: texto(p.pergunta),
    })),
  }
}

/** A oposição do trabalhador nesta campanha (por CPF), se existir. */
export async function minhaOposicao(
  campanhaId: string,
  cpf: string
): Promise<{ id: string; situacao: SituacaoOpositor } | null> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("oposicao_opositor")
    .select("id, situacao")
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("campanha_id", campanhaId)
    .eq("cpf", cpf)
    .maybeSingle()
  if (!data) return null
  return { id: String(data.id), situacao: (data.situacao ?? "nao_avaliada") as SituacaoOpositor }
}

/** Registra um evento de auditoria (append-only). */
export async function registrarEvento(
  opositorId: string,
  evento: string,
  detalhe: string | null,
  ip: string | null,
  userAgent: string | null
): Promise<void> {
  const admin = await createAdminClient()
  await admin.from("oposicao_eventos").insert({
    opositor_id: opositorId,
    evento,
    detalhe,
    ip,
    user_agent: userAgent,
    emp_proprietaria_id: await tenantAtual(),
  })
}

export type DadosOposicao = {
  campanhaId: string
  cpf: string
  nome: string | null
  email: string | null
  perfil: "filiado" | "nao_filiado"
  filiacaoId: string | null
  empregadorId: string | null
  matricula: string | null
  respostas: { perguntaId: string; resposta: string }[]
  ip: string | null
  userAgent: string | null
}

/** Próximo protocolo sequencial da campanha (max+1). */
async function proximoProtocolo(
  admin: Awaited<ReturnType<typeof createAdminClient>>,
  empId: string,
  campanhaId: string
): Promise<number> {
  const { data } = await admin
    .from("oposicao_opositor")
    .select("protocolo")
    .eq("emp_proprietaria_id", empId)
    .eq("campanha_id", campanhaId)
    .not("protocolo", "is", null)
    .order("protocolo", { ascending: false })
    .limit(1)
  const max = data?.[0]?.protocolo
  return (typeof max === "number" ? max : 0) + 1
}

/**
 * Formaliza a oposição. `exigeDoc` = modo/perfil que precisa do documento
 * assinado → nasce `aguardando_documento`; senão `nao_avaliada`. Idempotente
 * por CPF+campanha (bloqueia duplicidade).
 */
export async function registrarOposicao(
  dados: DadosOposicao,
  exigeDoc: boolean
): Promise<{ id?: string; protocolo?: number; erro?: string }> {
  const empId = await tenantAtual()
  const admin = await createAdminClient()

  const existente = await minhaOposicao(dados.campanhaId, dados.cpf)
  if (existente) {
    return { erro: "Você já registrou uma oposição nesta campanha." }
  }

  const protocolo = await proximoProtocolo(admin, empId, dados.campanhaId)
  const { data, error } = await admin
    .from("oposicao_opositor")
    .insert({
      campanha_id: dados.campanhaId,
      cpf: dados.cpf,
      nome_completo: dados.nome,
      email: dados.email,
      filiacao_id: dados.filiacaoId,
      empregador_id: dados.empregadorId,
      matricula: dados.matricula,
      situacao: exigeDoc ? "aguardando_documento" : "nao_avaliada",
      protocolo,
      confirmado_em: new Date().toISOString(),
      ip: dados.ip,
      user_agent: dados.userAgent,
      emp_proprietaria_id: empId,
    })
    .select("id")
    .single()
  if (error) return { erro: `Falha ao registrar a oposição: ${error.message}` }

  const opositorId = String(data.id)
  const respostas = dados.respostas.filter((r) => r.resposta.trim())
  if (respostas.length) {
    await admin.from("oposicao_resposta").insert(
      respostas.map((r) => ({
        opositor_id: opositorId,
        pergunta_id: r.perguntaId,
        resposta: r.resposta.trim(),
        emp_proprietaria_id: empId,
      }))
    )
  }
  await registrarEvento(
    opositorId,
    "oposicao_confirmada",
    `perfil=${dados.perfil}; protocolo=${protocolo}`,
    dados.ip,
    dados.userAgent
  )
  return { id: opositorId, protocolo }
}

/** Marca desistência (viu o vídeo e desistiu). */
export async function registrarDesistencia(
  campanhaId: string,
  sessao: {
    cpf: string
    nome: string | null
    email: string | null
    perfil: "filiado" | "nao_filiado"
    filiacaoId: string | null
  },
  ip: string | null,
  userAgent: string | null
): Promise<{ erro?: string }> {
  const empId = await tenantAtual()
  const admin = await createAdminClient()
  if (await minhaOposicao(campanhaId, sessao.cpf)) return {}
  const { data, error } = await admin
    .from("oposicao_opositor")
    .insert({
      campanha_id: campanhaId,
      cpf: sessao.cpf,
      nome_completo: sessao.nome,
      email: sessao.email,
      filiacao_id: sessao.filiacaoId,
      situacao: "desistente",
      desistente: true,
      confirmado_em: new Date().toISOString(),
      ip,
      user_agent: userAgent,
      emp_proprietaria_id: empId,
    })
    .select("id")
    .single()
  if (error) return { erro: error.message }
  await registrarEvento(String(data.id), "desistiu", null, ip, userAgent)
  return {}
}

/** Sobe o documento assinado (gov.br) e move p/ nao_avaliada. */
export async function subirDocumentoAssinado(
  opositorId: string,
  cpf: string,
  arquivo: File,
  ip: string | null,
  userAgent: string | null
): Promise<{ erro?: string }> {
  if (arquivo.type !== "application/pdf") return { erro: "Envie o PDF assinado." }
  const empId = await tenantAtual()
  const admin = await createAdminClient()
  // Confirma posse (mesmo CPF) antes de aceitar o upload.
  const { data: o } = await admin
    .from("oposicao_opositor")
    .select("id")
    .eq("id", opositorId)
    .eq("cpf", cpf)
    .eq("emp_proprietaria_id", empId)
    .maybeSingle()
  if (!o) return { erro: "Oposição não encontrada." }

  const caminho = `assinados/${randomUUID()}.pdf`
  const up = await admin.storage
    .from("oposicao")
    .upload(caminho, arquivo, { contentType: "application/pdf", upsert: false })
  if (up.error) return { erro: `Falha ao subir o documento: ${up.error.message}` }

  const { error } = await admin
    .from("oposicao_opositor")
    .update({ documento_assinado_url: caminho, situacao: "nao_avaliada" })
    .eq("id", opositorId)
    .eq("emp_proprietaria_id", empId)
  if (error) return { erro: error.message }
  await registrarEvento(opositorId, "documento_enviado", null, ip, userAgent)
  return {}
}

export type Comprovante = {
  id: string
  campanhaId: string | null
  protocolo: number | null
  campanhaNome: string | null
  detalhe_desconto: string | null
  nome: string | null
  cpf: string | null
  matricula: string | null
  empregadorNome: string | null
  situacao: SituacaoOpositor
  texto_declaracao: string | null
  confirmado_em: string | null
  /** URL assinada do documento-modelo (quando situação = aguardando_documento). */
  modeloUrl: string | null
}

/** Comprovante da oposição — só para o próprio CPF (segurança). */
export async function obterComprovante(
  id: string,
  cpf: string
): Promise<Comprovante | null> {
  const empId = await tenantAtual()
  const admin = await createAdminClient()
  const { data: o } = await admin
    .from("oposicao_opositor")
    .select(
      "id, protocolo, campanha_id, nome_completo, cpf, matricula, empregador_id, situacao, confirmado_em"
    )
    .eq("id", id)
    .eq("cpf", cpf)
    .eq("emp_proprietaria_id", empId)
    .maybeSingle()
  if (!o) return null

  const [camp, emp] = await Promise.all([
    o.campanha_id
      ? admin
          .from("oposicao_campanha")
          .select("nome, detalhe_desconto, texto_declaracao, documento_modelo_url")
          .eq("id", o.campanha_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    o.empregador_id
      ? admin
          .from("empresa")
          .select("nome_fantasia, nome_razao")
          .eq("id", o.empregador_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ])
  const c = camp.data as Record<string, unknown> | null
  const e = emp.data as Record<string, unknown> | null

  let modeloUrl: string | null = null
  const modeloPath = c ? texto(c.documento_modelo_url) : null
  if (modeloPath && o.situacao === "aguardando_documento") {
    const { data: assinada } = await admin.storage
      .from("oposicao")
      .createSignedUrl(modeloPath, 3600)
    modeloUrl = assinada?.signedUrl ?? null
  }

  return {
    id: String(o.id),
    campanhaId: texto(o.campanha_id),
    protocolo: o.protocolo == null ? null : Number(o.protocolo),
    campanhaNome: c ? texto(c.nome) : null,
    detalhe_desconto: c ? texto(c.detalhe_desconto) : null,
    nome: texto(o.nome_completo),
    cpf: texto(o.cpf),
    matricula: texto(o.matricula),
    empregadorNome: e ? (texto(e.nome_fantasia) ?? texto(e.nome_razao)) : null,
    situacao: (o.situacao ?? "nao_avaliada") as SituacaoOpositor,
    texto_declaracao: c ? texto(c.texto_declaracao) : null,
    confirmado_em: texto(o.confirmado_em),
    modeloUrl,
  }
}

// ── Avaliação da Filiação (Fase 3) ───────────────────────────────────────────

export type OpositorDetalhe = {
  id: string
  campanhaId: string | null
  protocolo: number | null
  nome: string | null
  nome_social: string | null
  cpf: string | null
  email: string | null
  telefone: string | null
  matricula: string | null
  lotacao: string | null
  empregadorNome: string | null
  ehFiliado: boolean
  situacao: SituacaoOpositor
  confirmado_em: string | null
  ip: string | null
  avaliacao_data: string | null
  avaliadorNome: string | null
  reprovacao_motivo: string | null
  documentoAssinadoUrl: string | null
  respostas: { pergunta: string | null; resposta: string | null }[]
  eventos: { evento: string | null; detalhe: string | null; ip: string | null; created_at: string | null }[]
}

export async function obterOpositorDetalhe(
  id: string
): Promise<OpositorDetalhe | null> {
  const empId = await tenantAtual()
  const admin = await createAdminClient()
  const { data: o } = await admin
    .from("oposicao_opositor")
    .select("*")
    .eq("id", id)
    .eq("emp_proprietaria_id", empId)
    .maybeSingle()
  if (!o) return null

  const [empRes, respRes, evRes, avalRes] = await Promise.all([
    o.empregador_id
      ? admin
          .from("empresa")
          .select("nome_fantasia, nome_razao")
          .eq("id", o.empregador_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    admin
      .from("oposicao_resposta")
      .select("resposta, pergunta_id")
      .eq("opositor_id", id)
      .eq("emp_proprietaria_id", empId),
    admin
      .from("oposicao_eventos")
      .select("evento, detalhe, ip, created_at")
      .eq("opositor_id", id)
      .eq("emp_proprietaria_id", empId)
      .order("created_at", { ascending: true }),
    o.avaliacao_avaliador_id
      ? admin
          .from("usuarios")
          .select("nome_completo, nome_guerra")
          .eq("id", o.avaliacao_avaliador_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  const perguntaIds = [
    ...new Set(
      (respRes.data ?? [])
        .map((r) => texto(r.pergunta_id))
        .filter((v): v is string => Boolean(v))
    ),
  ]
  const textoPergunta = new Map<string, string>()
  if (perguntaIds.length) {
    const { data: pergs } = await admin
      .from("oposicao_perguntas")
      .select("id, pergunta")
      .in("id", perguntaIds)
    for (const p of pergs ?? []) {
      const t = texto(p.pergunta)
      if (t) textoPergunta.set(String(p.id), t)
    }
  }

  const e = empRes.data as Record<string, unknown> | null
  const av = avalRes.data as Record<string, unknown> | null
  return {
    id: String(o.id),
    campanhaId: texto(o.campanha_id),
    protocolo: o.protocolo == null ? null : Number(o.protocolo),
    nome: texto(o.nome_completo),
    nome_social: texto(o.nome_social),
    cpf: texto(o.cpf),
    email: texto(o.email),
    telefone: texto(o.telefone),
    matricula: texto(o.matricula),
    lotacao: texto(o.lotacao),
    empregadorNome: e ? (texto(e.nome_fantasia) ?? texto(e.nome_razao)) : null,
    ehFiliado: Boolean(o.filiacao_id),
    situacao: (o.situacao ?? "nao_avaliada") as SituacaoOpositor,
    confirmado_em: texto(o.confirmado_em),
    ip: texto(o.ip),
    avaliacao_data: texto(o.avaliacao_data),
    avaliadorNome: av
      ? (texto(av.nome_completo) ?? texto(av.nome_guerra))
      : null,
    reprovacao_motivo: texto(o.reprovacao_motivo),
    documentoAssinadoUrl: texto(o.documento_assinado_url),
    respostas: (respRes.data ?? []).map((r) => ({
      pergunta: texto(r.pergunta_id)
        ? (textoPergunta.get(String(r.pergunta_id)) ?? null)
        : null,
      resposta: texto(r.resposta),
    })),
    eventos: (evRes.data ?? []).map((ev) => ({
      evento: texto(ev.evento),
      detalhe: texto(ev.detalhe),
      ip: texto(ev.ip),
      created_at: texto(ev.created_at),
    })),
  }
}

/** Aprova (procedente) ou reprova (improcedente + motivo) a oposição. */
export async function avaliarOpositor(
  id: string,
  aprovar: boolean,
  motivo: string | null,
  avaliadorId: string
): Promise<{ erro?: string }> {
  if (!aprovar && !motivo?.trim()) {
    return { erro: "Informe o motivo da reprovação." }
  }
  const empId = await tenantAtual()
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("oposicao_opositor")
    .update({
      situacao: aprovar ? "aprovada" : "reprovada",
      avaliacao: aprovar,
      avaliacao_data: hojeSP(),
      avaliacao_avaliador_id: avaliadorId,
      reprovacao_motivo: aprovar ? null : motivo?.trim(),
    })
    .eq("id", id)
    .eq("emp_proprietaria_id", empId)
    .in("situacao", ["nao_avaliada", "aprovada", "reprovada"])
    .select("id")
  if (error) return { erro: `Falha ao avaliar: ${error.message}` }
  if ((data ?? []).length === 0) {
    return { erro: "Oposição não pode ser avaliada nesta situação." }
  }
  await registrarEvento(
    id,
    aprovar ? "aprovada" : "reprovada",
    aprovar ? null : (motivo?.trim() ?? null),
    null,
    null
  )
  return {}
}
