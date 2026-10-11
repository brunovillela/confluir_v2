import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"

import { validarAssinaturasPdf, type ValidacaoAssinatura } from "@/lib/assinatura-pdf"
import { cpfConfiavel, grafiasDoCpf, limparCpf } from "@/lib/cpf"
import { esquemaAusente, hojeSP, lerEmLotes, texto } from "@/lib/db/comum"
import { randomUUID } from "node:crypto"

import { tenantAtual } from "@/lib/tenant"
import { origemAtual } from "@/lib/tenant-url"

import { depoisDaResposta } from "@/lib/db/avisos"
import { gerarCodigoProcesso } from "@/lib/db/compras"
import { listarFontesPagadoras } from "@/lib/db/fontes"
import { avisarFiliado, type ResultadoAviso } from "@/lib/db/portal-avisos"
import { empregadoresAtivos } from "@/lib/db/votacao-portal"
import { enviarEmail, type ContextoEmail } from "@/lib/email"
import { botaoEmail, caixaAviso, escaparHtml, paragrafo, textoSuave, tituloEmail } from "@/lib/email-layout"
import { formatarData } from "@/lib/formato"
import { somarDiasISO } from "@/lib/periodo-dias"
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
    // Já concluída → fora do banner. 'desistente' também: a pessoa já
    // escolheu, e a página da oposição segue deixando mudar de ideia no prazo.
    if (minha && !pendente) continue
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

/**
 * A aba "Oposição" some da visualização da gestão (é um fluxo com sessão
 * própria), MENOS quando ela diz algo sobre ESTE filiado: ele já se opôs
 * alguma vez, ou hoje trabalha numa fonte pagadora com campanha aberta
 * dentro do prazo. Campanha aberta sem fonte marcada vale para todos.
 */
export async function oposicaoRelevanteParaFiliado(
  cpf: string
): Promise<boolean> {
  // Só dígitos e com verificadores certos: o `/D/g` antigo só tirava a letra
  // "D" e deixava a máscara (CPF mascarado nunca casava com o histórico), e um
  // CPF "0" do legado casaria com qualquer opositor gravado como "0".
  const cpfLimpo = cpfConfiavel(cpf)
  if (!cpfLimpo) return false
  const admin = await createAdminClient()
  const emp = await tenantAtual()

  const { data: historico } = await admin
    .from("oposicao_opositor")
    .select("id")
    .eq("emp_proprietaria_id", emp)
    .in("cpf", grafiasDoCpf(cpfLimpo))
    .limit(1)
  if ((historico ?? []).length > 0) return true

  const hoje = hojeSP()
  const noPrazo = (await campanhasAbertas()).filter(
    (c) => estadoPrazo(c.prazo_inicio, c.prazo_fim, hoje) === "aberto"
  )
  if (noPrazo.length === 0) return false

  const { data: escopo } = await admin
    .from("oposicao_campanha_fontes")
    .select("campanha_id, empresa_id")
    .eq("emp_proprietaria_id", emp)
    .in(
      "campanha_id",
      noPrazo.map((c) => c.id)
    )
  const comEscopo = new Set((escopo ?? []).map((f) => String(f.campanha_id)))
  if (noPrazo.some((c) => !comEscopo.has(c.id))) return true

  const fontes = await empregadoresAtivos(cpfLimpo)
  if (fontes.size === 0) return false
  return (escopo ?? []).some((f) => fontes.has(String(f.empresa_id)))
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

/** Dia de calendário (AAAA-MM-DD) de um instante, no fuso de São Paulo. */
function diaSP(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d)
}

export type MinhaOposicao = {
  id: string
  situacao: SituacaoOpositor
  protocolo: number | null
  /**
   * Dia (AAAA-MM-DD, fuso de SP) do registro — da oposição ou do "não quero me
   * opor". Só de `confirmado_em`: no legado do Bubble ele é nulo e o
   * `created_at` é o dia da MIGRAÇÃO (25/07/2026), não o da escolha.
   */
  dia: string | null
}

/**
 * A linha do trabalhador nesta campanha (por CPF), se existir. 'desistente'
 * ("não quero me opor") também volta aqui — quem chama decide: dentro do
 * prazo ela NÃO tranca a pessoa fora (A14). Não há unique em cpf+campanha e o
 * legado do Bubble tem CPF repetido na mesma campanha: havendo mais de uma
 * linha, vale a mais recente que não seja desistência (antes, o
 * `maybeSingle` falhava e a pessoa parecia nunca ter se oposto). O CPF pode
 * chegar com máscara (o da filiação, no banner e na visualização da gestão);
 * a sessão do trabalhador traz só dígitos — as duas grafias valem.
 */
export async function minhaOposicao(
  campanhaId: string,
  cpf: string
): Promise<MinhaOposicao | null> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("oposicao_opositor")
    .select("id, situacao, protocolo, confirmado_em")
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("campanha_id", campanhaId)
    .in("cpf", grafiasDoCpf(limparCpf(cpf) || cpf))
    .order("created_at", { ascending: false, nullsFirst: false })
    .limit(20)
  const linhas = data ?? []
  if (linhas.length === 0) return null
  const linha =
    linhas.find((l) => (l.situacao ?? "nao_avaliada") !== "desistente") ?? linhas[0]
  return {
    id: String(linha.id),
    situacao: (linha.situacao ?? "nao_avaliada") as SituacaoOpositor,
    protocolo: linha.protocolo == null ? null : Number(linha.protocolo),
    dia: diaSP(texto(linha.confirmado_em)),
  }
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
 * por CPF+campanha (bloqueia duplicidade). Quem tinha dito "não quero me
 * opor" (linha 'desistente') e voltou dentro do prazo — a action confere o
 * prazo — tem ESSA linha atualizada, não uma segunda: não há unique em
 * cpf+campanha para segurar a duplicata. O evento 'desistiu' fica na trilha e
 * o 'oposicao_confirmada' entra depois dele, contando a história inteira.
 */
export async function registrarOposicao(
  dados: DadosOposicao,
  exigeDoc: boolean
): Promise<{ id?: string; protocolo?: number; confirmadoEm?: string; erro?: string }> {
  const empId = await tenantAtual()
  const admin = await createAdminClient()

  const existente = await minhaOposicao(dados.campanhaId, dados.cpf)
  if (existente && existente.situacao !== "desistente") {
    return { erro: "Você já registrou uma oposição nesta campanha." }
  }

  const protocolo =
    existente?.protocolo ?? (await proximoProtocolo(admin, empId, dados.campanhaId))
  const campos = {
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
  }

  let opositorId: string
  if (existente) {
    const { data, error } = await admin
      .from("oposicao_opositor")
      .update({
        ...campos,
        // O CPF na grafia da sessão (o comprovante confere por ela) e nada de
        // avaliação/documento herdados da linha antiga: há desistentes do
        // legado com avaliação gravada, e esta é uma oposição nova, a avaliar.
        cpf: dados.cpf,
        desistente: false,
        avaliacao: null,
        avaliacao_data: null,
        avaliacao_avaliador_id: null,
        reprovacao_motivo: null,
        documento_assinado_url: null,
      })
      .eq("id", existente.id)
      .eq("emp_proprietaria_id", empId)
      // Duas abas confirmando juntas: só a primeira acha a linha ainda 'desistente'.
      .eq("situacao", "desistente")
      .select("id")
    if (error) return { erro: `Falha ao registrar a oposição: ${error.message}` }
    if ((data ?? []).length === 0) {
      return { erro: "Você já registrou uma oposição nesta campanha." }
    }
    opositorId = existente.id
  } else {
    const { data, error } = await admin
      .from("oposicao_opositor")
      .insert({
        ...campos,
        campanha_id: dados.campanhaId,
        cpf: dados.cpf,
        emp_proprietaria_id: empId,
      })
      .select("id")
      .single()
    if (error) return { erro: `Falha ao registrar a oposição: ${error.message}` }
    opositorId = String(data.id)
  }

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
    `perfil=${dados.perfil}; protocolo=${protocolo}` +
      (existente ? "; registrada depois de ter optado por não se opor" : ""),
    dados.ip,
    dados.userAgent
  )
  return { id: opositorId, protocolo, confirmadoEm: campos.confirmado_em }
}

/**
 * Marca o "não quero me opor" (viu o vídeo e escolheu não se opor). Só para
 * campanha DESTE tenant, aberta e dentro do prazo (A143): o id vem do
 * formulário, e uma linha para campanha de outra entidade ficaria órfã na
 * trilha — numa encerrada, inflaria a contagem de desistentes.
 */
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
  const { data: campanha } = await admin
    .from("oposicao_campanha")
    .select("situacao, prazo_inicio, prazo_fim")
    .eq("id", campanhaId)
    .eq("emp_proprietaria_id", empId)
    .maybeSingle()
  if (!campanha || campanha.situacao !== "aberta") {
    return { erro: "Campanha indisponível." }
  }
  if (
    estadoPrazo(texto(campanha.prazo_inicio), texto(campanha.prazo_fim), hojeSP()) !==
    "aberto"
  ) {
    return { erro: "Fora do prazo desta campanha." }
  }

  const existente = await minhaOposicao(campanhaId, sessao.cpf)
  if (existente) {
    // Já tinha dito que não quer se opor: nada novo a gravar.
    if (existente.situacao === "desistente") return {}
    return { erro: "Você já registrou uma oposição nesta campanha." }
  }
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

  // Validação PAdES/ICP-Brasil (onda 5, A4): CPF do certificado × CPF do opositor.
  let validacao: ValidacaoAssinatura | null = null
  try {
    validacao = validarAssinaturasPdf(new Uint8Array(await arquivo.arrayBuffer()), cpf)
  } catch (e) {
    console.error("validação da assinatura:", e)
  }

  const caminho = `assinados/${randomUUID()}.pdf`
  const up = await admin.storage
    .from("oposicao")
    .upload(caminho, arquivo, { contentType: "application/pdf", upsert: false })
  if (up.error) return { erro: `Falha ao subir o documento: ${up.error.message}` }

  let { error } = await admin
    .from("oposicao_opositor")
    .update({ documento_assinado_url: caminho, situacao: "nao_avaliada", assinatura_validacao: validacao })
    .eq("id", opositorId)
    .eq("emp_proprietaria_id", empId)
  if (error && (error.code === "42703" || error.code === "PGRST204")) {
    // Sem a coluna (supabase/assinatura-validacao.sql): grava sem o resultado.
    ;({ error } = await admin.from("oposicao_opositor").update({ documento_assinado_url: caminho, situacao: "nao_avaliada" }).eq("id", opositorId).eq("emp_proprietaria_id", empId))
  }
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
  /** Dia (AAAA-MM-DD, fuso de SP) do registro — só de `confirmado_em` (ver MinhaOposicao.dia). */
  dia: string | null
  /** Janela da campanha: a página de quem optou por não se opor diz se ainda dá para voltar. */
  campanhaAberta: boolean
  prazo_inicio: string | null
  prazo_fim: string | null
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
          .select(
            "nome, detalhe_desconto, texto_declaracao, documento_modelo_url, situacao, prazo_inicio, prazo_fim"
          )
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
    dia: diaSP(texto(o.confirmado_em)),
    campanhaAberta: c?.situacao === "aberta",
    prazo_inicio: c ? texto(c.prazo_inicio) : null,
    prazo_fim: c ? texto(c.prazo_fim) : null,
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
  // O antes, para avisar só quando a decisão muda (A58): a gestão pode
  // re-decidir, e o mesmo "Reprovar" salvo duas vezes não é um fato novo.
  const { data: antes } = await admin
    .from("oposicao_opositor")
    .select("situacao, reprovacao_motivo, cpf, email, nome_completo, filiacao_id, protocolo, campanha_id")
    .eq("id", id)
    .eq("emp_proprietaria_id", empId)
    .maybeSingle()
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
  const situacaoNova = aprovar ? "aprovada" : "reprovada"
  const motivoNovo = aprovar ? null : (motivo?.trim() ?? null)
  if (antes && (antes.situacao !== situacaoNova || (texto(antes.reprovacao_motivo) ?? null) !== motivoNovo)) {
    avisarOposicaoAvaliada({
      opositorId: id,
      aprovada: aprovar,
      motivo: motivoNovo,
      protocolo: antes.protocolo == null ? null : Number(antes.protocolo),
      campanhaId: texto(antes.campanha_id),
      pessoa: {
        cpf: texto(antes.cpf),
        nome: texto(antes.nome_completo),
        email: texto(antes.email)?.trim() ?? null,
        filiado: Boolean(antes.filiacao_id),
      },
    })
  }
  return {}
}

// ── Avisos ao trabalhador (A16/A58) ──────────────────────────────────────────

const PREFERENCIAS_PORTAL =
  "Você pode escolher quais avisos recebe por e-mail em Portal → Avisos → Preferências."

/** "11/10/2026" no fuso de São Paulo (data pura passa direto). */
function dataSPBR(valor: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) return formatarData(valor)
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(valor))
}

/** "14:32" no fuso de São Paulo. */
function horaSPBR(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso))
}

function saudacaoEmail(nome: string | null): string {
  const primeiro = nome?.trim().split(/\s+/)[0]
  return primeiro ? `Olá, ${escaparHtml(primeiro)}!` : "Olá!"
}

function dadosEmail(pares: [string, string][]): string {
  return paragrafo(
    pares.map(([rotulo, valor]) => `<strong>${escaparHtml(rotulo)}:</strong> ${escaparHtml(valor)}`).join("<br>")
  )
}

const PASSOS_CARTA = paragrafo(
  "1. Abra o comprovante e baixe a sua carta, já preenchida com seus dados.<br>" +
    "2. Assine no Assinador gov.br (assinatura digital).<br>" +
    "3. Envie o PDF assinado pelo próprio comprovante."
)

type PessoaDoAviso = {
  cpf: string | null
  nome: string | null
  email: string | null
  /** Filiado tem sino no portal; o trabalhador não filiado, só o e-mail. */
  filiado: boolean
}

type AmbienteAviso = { client?: SupabaseClient; tenantId?: string; contexto?: ContextoEmail }

/**
 * Entrega um aviso da oposição. Filiado: pelo aviso do portal (sino + e-mail
 * conforme a preferência "Filiação e oposição"; `umaVez` não repete o mesmo
 * texto). O trabalhador não filiado não tem sino: o e-mail vai direto ao
 * endereço que ele confirmou com o código (ajuste de exatidão do A16).
 *
 * `umaVez: false` na avaliação: quem decide se é fato novo é a mudança da
 * decisão. Aceita → não aceita → aceita de novo precisa avisar a terceira, e
 * o `umaVez` a barraria por ter o mesmo texto da primeira.
 */
async function entregarAvisoOposicao(
  a: { pessoa: PessoaDoAviso; assunto: string; texto: string; link: string; html: string; umaVez?: boolean },
  amb: AmbienteAviso = {}
): Promise<ResultadoAviso> {
  const cpf = cpfConfiavel(a.pessoa.cpf)
  if (a.pessoa.filiado && cpf) {
    return avisarFiliado(
      {
        cpf,
        nome: a.pessoa.nome,
        email: a.pessoa.email,
        evento: "filiacao",
        assunto: a.assunto,
        texto: a.texto,
        link: a.link,
        html: a.html + textoSuave(PREFERENCIAS_PORTAL),
        umaVez: a.umaVez ?? true,
      },
      amb
    )
  }
  if (!a.pessoa.email) return false
  const saiu = await enviarEmail({
    email: a.pessoa.email,
    nome: a.pessoa.nome,
    assunto: a.assunto,
    html: a.html,
    contexto: amb.contexto,
  })
  return saiu ? "email" : false
}

/** Para a trilha de auditoria: a entidade sabe se a pessoa foi avisada. */
function descreverEntrega(r: ResultadoAviso): string {
  if (r === "email") return "e-mail enviado"
  if (r === "sino") return "aviso no portal; e-mail não saiu (desligado nas preferências, sem endereço ou recusado)"
  return "aviso não enviado (já avisado, sem e-mail ou falha no envio)"
}

/**
 * Comprovante por e-mail da oposição registrada (A16): protocolo, data e
 * hora, campanha e o link do comprovante — o único registro de um ato com
 * prazo legal não pode existir só na tela. Quando falta a carta assinada, o
 * e-mail diz até quando e como enviá-la (anexar o PDF da carta fica para
 * depois: o comprovante já a gera). Roda depois da resposta: o registro
 * nunca espera o provedor de e-mail.
 */
export function avisarOposicaoRegistrada(o: {
  opositorId: string
  protocolo: number | null
  confirmadoEm: string
  campanhaNome: string | null
  prazoFim: string | null
  exigeDocumento: boolean
  pessoa: PessoaDoAviso
}): void {
  depoisDaResposta(async () => {
    const protocolo = o.protocolo == null ? "—" : String(o.protocolo)
    const campanha = o.campanhaNome ?? "—"
    const quando = `${dataSPBR(o.confirmadoEm)} às ${horaSPBR(o.confirmadoEm)}`
    const prazo = o.prazoFim ? formatarData(o.prazoFim) : null
    const link = `/portal/oposicao/comprovante/${o.opositorId}`
    const origem = await origemAtual().catch(() => "")
    const falta = `Falta enviar a carta assinada${prazo ? ` até ${prazo}` : ""}.`

    const html =
      tituloEmail(o.exigeDocumento ? "Oposição registrada: falta a carta assinada" : "Oposição registrada") +
      paragrafo(
        `${saudacaoEmail(o.pessoa.nome)} Registramos a sua oposição à contribuição assistencial. Guarde este e-mail como comprovante.`
      ) +
      dadosEmail([
        ["Protocolo", protocolo],
        ["Data e hora", quando],
        ["Campanha", campanha],
      ]) +
      (o.exigeDocumento
        ? caixaAviso(`<strong>${escaparHtml(falta)}</strong> Sem ela, a oposição não é avaliada.`) + PASSOS_CARTA
        : paragrafo("A entidade vai avaliar a sua oposição, e você recebe outro aviso com o resultado.")) +
      (origem
        ? botaoEmail(`${origem}${link}`, o.exigeDocumento ? "Abrir o comprovante e enviar a carta" : "Ver o comprovante")
        : "")

    const r = await entregarAvisoOposicao({
      pessoa: o.pessoa,
      assunto: o.exigeDocumento
        ? `Oposição registrada — falta enviar a carta (protocolo ${protocolo})`
        : `Oposição registrada — protocolo ${protocolo}`,
      texto:
        `Sua oposição à contribuição assistencial foi registrada em ${quando}: protocolo ${protocolo}, campanha ${campanha}.` +
        (o.exigeDocumento ? ` ${falta}` : ""),
      link,
      html,
    })
    await registrarEvento(o.opositorId, "aviso_registro", descreverEntrega(r), null, null)
  })
}

/**
 * Resultado da avaliação (A16/A58): aceita ou não aceita, com o motivo e o
 * caminho para discordar. Chamada por `avaliarOpositor` só quando a decisão
 * muda — salvar a mesma decisão de novo não repete o aviso.
 */
function avisarOposicaoAvaliada(o: {
  opositorId: string
  aprovada: boolean
  motivo: string | null
  protocolo: number | null
  campanhaId: string | null
  pessoa: PessoaDoAviso
}): void {
  depoisDaResposta(async () => {
    let campanha = "—"
    if (o.campanhaId) {
      const admin = await createAdminClient()
      const { data } = await admin
        .from("oposicao_campanha")
        .select("nome")
        .eq("id", o.campanhaId)
        .eq("emp_proprietaria_id", await tenantAtual())
        .maybeSingle()
      campanha = texto(data?.nome) ?? campanha
    }
    const protocolo = o.protocolo == null ? "—" : String(o.protocolo)
    const link = `/portal/oposicao/comprovante/${o.opositorId}`
    const origem = await origemAtual().catch(() => "")
    const resumo = `Sua oposição à contribuição assistencial (protocolo ${protocolo}, campanha ${campanha})`

    const html =
      tituloEmail(o.aprovada ? "Sua oposição foi aceita" : "Sua oposição não foi aceita") +
      paragrafo(
        `${saudacaoEmail(o.pessoa.nome)} ${escaparHtml(resumo)} ${
          o.aprovada ? "foi <strong>aceita</strong> pela entidade." : "<strong>não foi aceita</strong> pela entidade."
        }`
      ) +
      (o.aprovada
        ? ""
        : caixaAviso(`<strong>Motivo:</strong> ${escaparHtml(o.motivo ?? "não informado")}`) +
          paragrafo("Se discordar da decisão, procure a entidade o quanto antes, informando o número do protocolo.")) +
      (origem ? botaoEmail(`${origem}${link}`, "Ver o comprovante") : "")

    const r = await entregarAvisoOposicao({
      pessoa: o.pessoa,
      assunto: o.aprovada
        ? `Sua oposição foi aceita — protocolo ${protocolo}`
        : `Sua oposição não foi aceita — protocolo ${protocolo}`,
      texto: o.aprovada ? `${resumo} foi aceita.` : `${resumo} não foi aceita. Motivo: ${o.motivo ?? "não informado"}`,
      link,
      html,
      umaVez: false,
    })
    await registrarEvento(o.opositorId, "aviso_avaliacao", descreverEntrega(r), null, null)
  })
}

/** Quantos dias antes do fim do prazo sai o lembrete da carta. */
const DIAS_ANTES_DO_PRAZO_CARTA = 3

export type ResultadoLembretesCarta = {
  /** Oposições aguardando a carta em campanhas perto do fim do prazo. */
  pendentes: number
  avisados: number
  porEmail: number
  /** Já tinham o lembrete na trilha (ou registraram há menos de um dia). */
  pulados: number
  falhas: number
  erro?: string
}

/**
 * Lembrete da carta assinada (A16, parte 3), para o tick diário — roda FORA
 * de requisição: passe o service client, o tenant da volta do laço e o
 * contexto do e-mail (`contextoDoTenant`), como nos outros lembretes. Quem
 * está em 'aguardando_documento' numa campanha aberta cujo prazo termina nos
 * próximos dias recebe UM lembrete: o envio fica na trilha de auditoria
 * (`lembrete_carta`), que é também o que impede a repetição — o trabalhador
 * não filiado não tem sino onde o `umaVez` pudesse conferir. Quem registrou
 * há menos de um dia fica de fora: o comprovante com o prazo acabou de sair.
 */
export async function lembretesCartaOposicao(amb: {
  client: SupabaseClient
  tenantId: string
  contexto: ContextoEmail
}): Promise<ResultadoLembretesCarta> {
  const { client, tenantId, contexto } = amb
  const vazio: ResultadoLembretesCarta = { pendentes: 0, avisados: 0, porEmail: 0, pulados: 0, falhas: 0 }
  const hoje = hojeSP()

  const { data: campanhas, error } = await client
    .from("oposicao_campanha")
    .select("id, nome, prazo_inicio, prazo_fim")
    .eq("emp_proprietaria_id", tenantId)
    .eq("situacao", "aberta")
    .gte("prazo_fim", hoje)
    .lte("prazo_fim", somarDiasISO(hoje, DIAS_ANTES_DO_PRAZO_CARTA))
  if (error) return { ...vazio, erro: esquemaAusente(error) ? "sem tabela de oposição" : error.message }
  const porCampanha = new Map(
    (campanhas ?? [])
      .filter((c) => estadoPrazo(texto(c.prazo_inicio), texto(c.prazo_fim), hoje) === "aberto")
      .map((c) => [String(c.id), { nome: texto(c.nome), prazoFim: String(c.prazo_fim).slice(0, 10) }])
  )
  if (porCampanha.size === 0) return vazio

  let pendentes: Record<string, unknown>[]
  try {
    pendentes = await lerEmLotes((de, ate) =>
      client
        .from("oposicao_opositor")
        .select("id, cpf, nome_completo, email, filiacao_id, protocolo, campanha_id, confirmado_em")
        .eq("emp_proprietaria_id", tenantId)
        .in("campanha_id", [...porCampanha.keys()])
        .eq("situacao", "aguardando_documento")
        .order("id")
        .range(de, ate)
    )
  } catch (e) {
    return { ...vazio, erro: (e as Error).message }
  }
  if (pendentes.length === 0) return vazio

  // Uma vez por oposição: quem já tem `lembrete_carta` na trilha fica de fora.
  // Se a trilha não puder ser lida, não arrisca repetir — tenta no dia seguinte.
  const jaLembrados = new Set<string>()
  const ids = pendentes.map((p) => String(p.id))
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error: erroTrilha } = await client
      .from("oposicao_eventos")
      .select("opositor_id")
      .eq("emp_proprietaria_id", tenantId)
      .eq("evento", "lembrete_carta")
      .in("opositor_id", ids.slice(i, i + 200))
    if (erroTrilha) return { ...vazio, pendentes: pendentes.length, erro: erroTrilha.message }
    for (const e of data ?? []) jaLembrados.add(String(e.opositor_id))
  }

  const resultado: ResultadoLembretesCarta = { ...vazio, pendentes: pendentes.length }
  const recem = Date.now() - 24 * 60 * 60 * 1000
  const fila = pendentes.filter((p) => {
    const registro = texto(p.confirmado_em) ? Date.parse(String(p.confirmado_em)) : Number.NaN
    const pular = jaLembrados.has(String(p.id)) || (Number.isFinite(registro) && registro > recem)
    if (pular) resultado.pulados++
    return !pular
  })

  // Cinco por vez: sequencial demora numa campanha grande; tudo junto estoura o provedor.
  for (let i = 0; i < fila.length; i += 5) {
    await Promise.all(
      fila.slice(i, i + 5).map(async (p) => {
        const id = String(p.id)
        const campanha = porCampanha.get(String(p.campanha_id))
        const prazo = campanha ? formatarData(campanha.prazoFim) : "—"
        const protocolo = p.protocolo == null ? "—" : String(p.protocolo)
        const link = `/portal/oposicao/comprovante/${id}`
        const pessoa: PessoaDoAviso = {
          cpf: texto(p.cpf),
          nome: texto(p.nome_completo),
          email: texto(p.email)?.trim() ?? null,
          filiado: Boolean(p.filiacao_id),
        }
        const html =
          tituloEmail("Falta enviar a carta da sua oposição") +
          paragrafo(
            `${saudacaoEmail(pessoa.nome)} A sua oposição à contribuição assistencial (protocolo ${escaparHtml(protocolo)}, campanha ${escaparHtml(campanha?.nome ?? "—")}) ainda espera a carta assinada.`
          ) +
          caixaAviso(`<strong>O prazo termina em ${escaparHtml(prazo)}.</strong> Sem a carta, a oposição não é avaliada.`) +
          PASSOS_CARTA +
          botaoEmail(`${contexto.origem}${link}`, "Abrir o comprovante e enviar a carta")
        try {
          const r = await entregarAvisoOposicao(
            {
              pessoa,
              assunto: `Falta enviar a carta da sua oposição — prazo até ${prazo}`,
              texto: `Falta enviar a carta assinada da sua oposição (protocolo ${protocolo}). O prazo termina em ${prazo}; sem a carta, a oposição não é avaliada.`,
              link,
              html,
            },
            { client, tenantId, contexto }
          )
          if (r) resultado.avisados++
          else resultado.falhas++
          if (r === "email") resultado.porEmail++
          await client.from("oposicao_eventos").insert({
            opositor_id: id,
            evento: "lembrete_carta",
            detalhe: descreverEntrega(r),
            emp_proprietaria_id: tenantId,
          })
        } catch (e) {
          console.error("lembrete da carta de oposição:", e)
          resultado.falhas++
        }
      })
    )
  }
  return resultado
}
