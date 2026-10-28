import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"

import { validarAssinaturasPdf, type ValidacaoAssinatura } from "@/lib/assinatura-pdf"
import { cpfConfiavel, grafiasDoCpf, limparCpf } from "@/lib/cpf"
import { esquemaAusente, hojeSP, lerEmLotes, texto } from "@/lib/db/comum"
import { createHash, randomUUID } from "node:crypto"

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
import { colunasDasRegras, regrasDaCampanha, regrasDaEntidade, regrasDaLinhaCampanha } from "@/lib/db/oposicao-regras"
import {
  CHAVES_DECISAO,
  DECISOES_JURIDICAS,
  DECLARACAO_PADRAO,
  decisoesFaltando,
  REGRAS_VAZIAS,
  regrasEfetivas,
  type ChaveDecisao,
  type RegrasOposicao,
  estadoPrazo,
  TAMANHO_MAX_CARTA,
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
  /** Oposições, sem os desistentes. */
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
  // Sem situação = o total de OPOSIÇÕES: quem desistiu não se opôs (M11).
  q = situacao ? q.eq("situacao", situacao) : q.neq("situacao", "desistente")
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
  /** Oposições, sem os desistentes (M11). */
  total: number
  /** Decisões jurídicas da própria campanha (nulo = padrão da entidade). */
  regras: RegrasOposicao
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
    total: SITUACOES.filter((k) => k !== "desistente").reduce((s, k) => s + contagem[k], 0),
    regras: regrasDaLinhaCampanha(c as Record<string, unknown>),
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
  protocolo: number | null
  confirmado_em: string | null
}

export type ListaOpositores = {
  linhas: OpositorLinha[]
  total: number
  pagina: number
  totalPaginas: number
  porPagina: number
}

export type FiltrosOpositores = {
  campanhaId: string
  /** "todas" = todas as oposições, sem os desistentes (M11). */
  situacao?: SituacaoOpositor | "todas"
  busca?: string
  /** Fonte pagadora; "sem" = sem fonte informada. */
  fonteId?: string
  pagina?: number
  /** Itens por página (padrão 50). */
  porPagina?: number
}

/**
 * Valor de filtro do PostgREST entre aspas: vírgula e parênteses deixam de
 * quebrar o `or` (a busca "Silva, João" derrubava a página — M10).
 */
function valorFiltro(v: string): string {
  return `"${v.replace(/["\\]/g, "\\$&")}"`
}

/**
 * Os filtros da lista, aplicados a qualquer consulta de `oposicao_opositor`
 * (lista, exportação, avaliação de "todas as filtradas"). CPF buscado pelos
 * dígitos (`cpf_digitos`), com ou sem máscara, e o protocolo pelo número.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- builder do PostgREST, tipado por quem chama
export function aplicarFiltrosOpositores<Q extends { eq: any; neq: any; or: any; is: any }>(q: Q, f: Omit<FiltrosOpositores, "pagina">): Q {
  let r = q.eq("campanha_id", f.campanhaId)
  r = f.situacao && f.situacao !== "todas" ? r.eq("situacao", f.situacao) : r.neq("situacao", "desistente")
  if (f.fonteId === "sem") r = r.is("empregador_id", null)
  else if (f.fonteId) r = r.eq("empregador_id", f.fonteId)
  const termo = (f.busca ?? "").trim()
  if (termo) {
    const digitos = termo.replace(/[.\-/\s]/g, "")
    if (/^\d{3,}$/.test(digitos)) {
      const partes = [`cpf_digitos.ilike.${valorFiltro(`%${digitos}%`)}`, `matricula.ilike.${valorFiltro(`%${escaparLike(termo)}%`)}`]
      if (digitos.length <= 9) partes.push(`protocolo.eq.${Number(digitos)}`)
      r = r.or(partes.join(","))
    } else {
      const e = escaparLike(termo)
      r = r.or(
        [`nome_completo.ilike.${valorFiltro(`%${e}%`)}`, `matricula.ilike.${valorFiltro(`%${e}%`)}`, `email.ilike.${valorFiltro(`%${e}%`)}`].join(",")
      )
    }
  }
  return r
}

export async function listarOpositores(
  filtros: FiltrosOpositores
): Promise<ListaOpositores> {
  const empId = await tenantAtual()
  const admin = await createAdminClient()
  const pagina = filtros.pagina && filtros.pagina > 0 ? filtros.pagina : 1
  const porPagina = filtros.porPagina && filtros.porPagina > 0 ? Math.min(filtros.porPagina, 200) : OPOSITORES_POR_PAGINA

  const q = aplicarFiltrosOpositores(
    admin
      .from("oposicao_opositor")
      .select(
        "id, nome_completo, cpf, matricula, empregador_id, situacao, filiacao_id, created_at, protocolo, confirmado_em",
        { count: "exact" }
      )
      .eq("emp_proprietaria_id", empId),
    filtros
  )

  const de = (pagina - 1) * porPagina
  // Ordem estável (M10): no legado, `created_at` se repete (data da migração)
  // e as linhas pulavam de uma página para outra; o id desempata.
  const { data, count, error } = await q
    .order("created_at", { ascending: false, nullsFirst: false })
    .order("id", { ascending: false })
    .range(de, de + porPagina - 1)
  // Página além do total (link antigo, filtro que encolheu): volta à primeira
  // em vez de quebrar a tela (o PostgREST responde 416).
  if (error && pagina > 1 && (error.code === "PGRST103" || /range/i.test(error.message))) {
    return listarOpositores({ ...filtros, pagina: 1 })
  }
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
      protocolo: o.protocolo == null ? null : Number(o.protocolo),
      confirmado_em: texto(o.confirmado_em),
    })),
    total,
    pagina,
    totalPaginas: Math.max(1, Math.ceil(total / porPagina)),
    porPagina,
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
  /** Decisões jurídicas da campanha (nulo = padrão da entidade); undefined = não mexer. */
  regras?: RegrasOposicao
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
  if (dados.regras) Object.assign(p, colunasDasRegras(dados.regras))
  return p
}

/** Decisões que mudam o que o trabalhador teve de fazer: travadas com oposições registradas. */
const DECISOES_DO_ATO: ChaveDecisao[] = ["video_minimo", "assinaturas_aceitas", "prova_nao_filiado"]

/**
 * Campanha que vai ficar ABERTA: todas as decisões jurídicas precisam valer
 * (as da campanha ou o padrão da entidade), e as vigentes são gravadas nela —
 * mudar o padrão depois não muda campanha aberta. Devolve o erro ou as
 * colunas a gravar.
 */
async function decisoesParaAbrir(
  situacao: string,
  propria: RegrasOposicao
): Promise<{ erro?: string; colunas?: Record<string, string | null> }> {
  if (situacao !== "aberta") return {}
  const entidade = (await regrasDaEntidade()).regras
  const efetivas = regrasEfetivas(propria, entidade)
  const faltam = decisoesFaltando(efetivas)
  if (faltam.length) {
    return {
      erro: `Para abrir a campanha, defina as decisões jurídicas (na campanha ou no padrão da entidade, em Oposição › Decisões jurídicas): ${faltam.join("; ")}.`,
    }
  }
  return { colunas: colunasDasRegras(efetivas) }
}

/**
 * Troca o conjunto de fontes da campanha SEM passar por "nenhuma fonte":
 * primeiro entram as novas, depois saem as retiradas (onda 0, 27/10/2026).
 * Antes era apagar tudo e reinserir — uma falha no meio deixava a campanha sem
 * fonte, e campanha sem fonte vale para todos os trabalhadores. Devolve o que
 * mudou, para a trilha.
 */
async function gravarFontes(
  admin: Awaited<ReturnType<typeof createAdminClient>>,
  empId: string,
  campanhaId: string,
  fonteIds: string[]
): Promise<{ erro?: string; entraram: string[]; sairam: string[] }> {
  const { data: atuais, error: erroLer } = await admin
    .from("oposicao_campanha_fontes")
    .select("empresa_id")
    .eq("campanha_id", campanhaId)
    .eq("emp_proprietaria_id", empId)
  if (erroLer) return { erro: `Falha ao ler as fontes: ${erroLer.message}`, entraram: [], sairam: [] }
  const antes = new Set((atuais ?? []).map((f) => String(f.empresa_id)))
  const depois = new Set(fonteIds.filter(Boolean))
  const entraram = [...depois].filter((f) => !antes.has(f))
  const sairam = [...antes].filter((f) => !depois.has(f))
  if (entraram.length) {
    const { error } = await admin.from("oposicao_campanha_fontes").insert(
      entraram.map((empresa_id) => ({ campanha_id: campanhaId, empresa_id, emp_proprietaria_id: empId }))
    )
    if (error) return { erro: `Falha ao vincular as fontes: ${error.message}`, entraram: [], sairam: [] }
  }
  if (sairam.length) {
    const { error } = await admin
      .from("oposicao_campanha_fontes")
      .delete()
      .eq("campanha_id", campanhaId)
      .eq("emp_proprietaria_id", empId)
      .in("empresa_id", sairam)
    if (error) return { erro: `Falha ao retirar fontes: ${error.message}`, entraram, sairam: [] }
  }
  return { entraram, sairam }
}

/** Oposições registradas no Confluir (fora o legado do Bubble) na campanha. */
async function oposicoesNovasDaCampanha(
  admin: Awaited<ReturnType<typeof createAdminClient>>,
  empId: string,
  campanhaId: string
): Promise<number> {
  const { count } = await admin
    .from("oposicao_opositor")
    .select("id", { count: "exact", head: true })
    .eq("campanha_id", campanhaId)
    .eq("emp_proprietaria_id", empId)
    .is("bubble_id", null)
  return count ?? 0
}

/** Rótulos dos campos da campanha, para a trilha da edição. */
const ROTULOS_CAMPO_CAMPANHA: Record<string, string> = {
  nome: "nome",
  detalhe_desconto: "detalhe do desconto",
  prazo_inicio: "início do prazo",
  prazo_fim: "fim do prazo",
  modo_formalizacao: "modo de formalização",
  situacao: "situação",
  texto_declaracao: "declaração",
  video_filiado_url: "vídeo do filiado",
  video_filiado_tempo: "tempo do vídeo do filiado",
  video_nao_filiado_url: "vídeo do não filiado",
  video_nao_filiado_tempo: "tempo do vídeo do não filiado",
  video_agradecimento_url: "vídeo de agradecimento",
  documento_modelo_url: "documento-modelo",
  ...Object.fromEntries(DECISOES_JURIDICAS.map((d) => [`regra_${d.chave}`, d.rotulo.toLowerCase()])),
}

/**
 * Situação e prazo coerentes (M12): a campanha aberta precisa do início e do
 * fim do prazo, e o fim não vem antes do início. Reabrir uma encerrada segue
 * possível (prorrogação), e fica na trilha como toda edição.
 */
function erroDeDatas(dados: Pick<DadosCampanha, "situacao" | "prazo_inicio" | "prazo_fim">): string | null {
  if (dados.prazo_inicio && dados.prazo_fim && dados.prazo_fim < dados.prazo_inicio) {
    return "O fim do prazo não pode ser antes do início."
  }
  if (dados.situacao === "aberta" && (!dados.prazo_inicio || !dados.prazo_fim)) {
    return "Para abrir a campanha, informe o início e o fim do prazo."
  }
  return null
}

export async function criarCampanha(
  dados: DadosCampanha,
  usuarioId?: string | null
): Promise<{ id?: string; erro?: string }> {
  if (!dados.nome.trim()) return { erro: "Informe o nome da campanha." }
  const erroDatas = erroDeDatas(dados)
  if (erroDatas) return { erro: erroDatas }
  const abrir = await decisoesParaAbrir(dados.situacao, dados.regras ?? { ...REGRAS_VAZIAS })
  if (abrir.erro) return { erro: abrir.erro }
  const empId = await tenantAtual()
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("oposicao_campanha")
    .insert({
      ...normalizar(dados),
      ...(abrir.colunas ?? {}),
      codigo: gerarCodigoProcesso(),
      emp_proprietaria_id: empId,
    })
    .select("id")
    .single()
  if (error) return { erro: `Falha ao criar a campanha: ${error.message}` }
  const fontes = await gravarFontes(admin, empId, String(data.id), dados.fonteIds)
  await registrarEvento(null, "campanha_criada", `fontes=${fontes.entraram.length}`, null, null, {
    usuarioId,
    campanhaId: String(data.id),
  })
  if (fontes.erro) return { id: String(data.id), erro: fontes.erro }
  return { id: String(data.id) }
}

/**
 * Salva a campanha. Com oposições já registradas (fora o legado), a
 * declaração e o modo de formalização ficam travados: mudá-los no meio daria a
 * quem se opôs antes e a quem se opõe depois regras diferentes (onda 0,
 * 27/10/2026). Prazo, fontes e vídeos continuam editáveis — mas toda mudança
 * vai para a trilha, com o autor e os valores de antes e depois.
 */
export async function atualizarCampanha(
  id: string,
  dados: DadosCampanha,
  usuarioId?: string | null
): Promise<{ erro?: string }> {
  if (!dados.nome.trim()) return { erro: "Informe o nome da campanha." }
  const erroDatas = erroDeDatas(dados)
  if (erroDatas) return { erro: erroDatas }
  const empId = await tenantAtual()
  const admin = await createAdminClient()
  const novo = normalizar(dados)
  const { data: atual, error: erroLer } = await admin
    .from("oposicao_campanha")
    .select([...new Set([...Object.keys(novo), ...CHAVES_DECISAO.map((c) => `regra_${c}`)])].join(", "))
    .eq("id", id)
    .eq("emp_proprietaria_id", empId)
    .maybeSingle()
  if (erroLer || !atual) return { erro: "Campanha não encontrada." }
  const antes = atual as unknown as Record<string, unknown>
  // Decisões jurídicas: as do formulário ou, sem elas, as que já estão gravadas.
  const propriaNova = dados.regras ?? regrasDaLinhaCampanha(antes)
  const abrir = await decisoesParaAbrir(String(novo.situacao), propriaNova)
  if (abrir.erro) return { erro: abrir.erro }
  if (abrir.colunas) Object.assign(novo, abrir.colunas)
  const mudou = Object.keys(novo).filter((k) => (antes[k] ?? null) !== (novo[k] ?? null))

  // O que o trabalhador teve de fazer (vídeo, assinatura, prova) não muda
  // depois de haver oposição registrada — comparado pelo que VALE, para que
  // gravar na campanha o padrão que ela já seguia não conte como mudança.
  const entidadeAgora = (await regrasDaEntidade()).regras
  const valiaAntes = regrasEfetivas(regrasDaLinhaCampanha(antes), entidadeAgora)
  const valeDepois = regrasEfetivas(abrir.colunas ? regrasDaLinhaCampanha(novo) : propriaNova, entidadeAgora)
  const atoMudou = DECISOES_DO_ATO.filter((c) => valiaAntes[c] !== valeDepois[c])
  if (atoMudou.length) {
    const registradas = await oposicoesNovasDaCampanha(admin, empId, id)
    if (registradas > 0) {
      return {
        erro: `Esta campanha já tem ${registradas.toLocaleString("pt-BR")} oposição(ões) registrada(s): ${atoMudou
          .map((c) => DECISOES_JURIDICAS.find((d) => d.chave === c)?.rotulo.toLowerCase())
          .join(", ")} não pode(m) mais mudar — quem se opôs seguiu as regras de agora.`,
      }
    }
  }

  if (mudou.some((k) => k === "texto_declaracao" || k === "modo_formalizacao")) {
    const registradas = await oposicoesNovasDaCampanha(admin, empId, id)
    if (registradas > 0) {
      return {
        erro: `Esta campanha já tem ${registradas.toLocaleString("pt-BR")} oposição(ões) registrada(s): a declaração e o modo de formalização não podem mais mudar — quem se opôs aceitou o texto e as regras de agora.`,
      }
    }
  }

  if (mudou.length) {
    const { error } = await admin.from("oposicao_campanha").update(novo).eq("id", id).eq("emp_proprietaria_id", empId)
    if (error) return { erro: `Falha ao salvar a campanha: ${error.message}` }
  }
  const fontes = await gravarFontes(admin, empId, id, dados.fonteIds)
  // Textos longos (a declaração) vão como "(texto)": o antes/depois completo fica na auditoria.
  const curto = (v: unknown) => (typeof v === "string" && v.length > 80 ? "(texto)" : String(v))
  const partes = mudou.map(
    (k) => `${ROTULOS_CAMPO_CAMPANHA[k] ?? k}: ${curto(antes[k] ?? "—")} → ${curto(novo[k] ?? "—")}`
  )
  if (fontes.entraram.length) partes.push(`fontes incluídas: ${fontes.entraram.length}`)
  if (fontes.sairam.length) partes.push(`fontes retiradas: ${fontes.sairam.length}`)
  if (partes.length) {
    await registrarEvento(null, "campanha_editada", partes.join("; "), null, null, { usuarioId, campanhaId: id })
  }
  return fontes.erro ? { erro: fontes.erro } : {}
}

/** Sobe o documento-modelo (gov.br) no bucket privado; devolve o caminho. */
export async function subirDocumentoModelo(
  arquivo: File
): Promise<{ caminho?: string; erro?: string }> {
  const bytes = new Uint8Array(await arquivo.arrayBuffer())
  if (!ehPdf(bytes)) {
    return { erro: "O modelo deve ser um PDF." }
  }
  const admin = await createAdminClient()
  const caminho = `modelos/${randomUUID()}.pdf`
  const { error } = await admin.storage
    .from("oposicao")
    .upload(caminho, bytes, { contentType: "application/pdf", upsert: false })
  if (error) return { erro: `Falha ao subir o modelo: ${error.message}` }
  return { caminho }
}

// ── Perguntas do questionário ────────────────────────────────────────────────

export async function adicionarPergunta(
  campanhaId: string,
  pergunta: string,
  usuarioId?: string | null
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
  await registrarEvento(null, "pergunta_incluida", pergunta.trim().slice(0, 300), null, null, { usuarioId, campanhaId })
  return {}
}

/** Exclui a pergunta — só se ainda não tem resposta (a resposta é prova). */
export async function excluirPergunta(id: string, usuarioId?: string | null): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const empId = await tenantAtual()
  const { data: p } = await admin
    .from("oposicao_perguntas")
    .select("campanha_id, pergunta")
    .eq("id", id)
    .eq("emp_proprietaria_id", empId)
    .maybeSingle()
  if (!p) return { erro: "Pergunta não encontrada." }
  const { count: respostas } = await admin
    .from("oposicao_resposta")
    .select("id", { count: "exact", head: true })
    .eq("pergunta_id", id)
    .eq("emp_proprietaria_id", empId)
  if ((respostas ?? 0) > 0) {
    return { erro: `Esta pergunta já tem ${(respostas ?? 0).toLocaleString("pt-BR")} resposta(s) e não pode ser excluída.` }
  }
  const { error } = await admin.from("oposicao_perguntas").delete().eq("id", id).eq("emp_proprietaria_id", empId)
  if (error) return { erro: `Falha ao excluir a pergunta: ${error.message}` }
  await registrarEvento(null, "pergunta_excluida", String(p.pergunta ?? "").slice(0, 300), null, null, {
    usuarioId,
    campanhaId: String(p.campanha_id),
  })
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
 * As campanhas da lista do trabalhador (M6): as abertas e, mesmo depois de
 * encerradas, aquelas em que ele tem registro — o comprovante não some
 * quando a entidade encerra a campanha.
 */
export async function campanhasDoTrabalhador(cpf: string): Promise<CampanhaAberta[]> {
  const abertas = await campanhasAbertas()
  const cpfLimpo = cpfConfiavel(cpf)
  if (!cpfLimpo) return abertas
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data: minhas } = await admin
    .from("oposicao_opositor")
    .select("campanha_id")
    .eq("emp_proprietaria_id", emp)
    .in("cpf", grafiasDoCpf(cpfLimpo))
    .neq("situacao", "desistente")
  const faltam = [
    ...new Set((minhas ?? []).map((m) => texto(m.campanha_id)).filter((v): v is string => Boolean(v))),
  ].filter((id) => !abertas.some((c) => c.id === id))
  if (faltam.length === 0) return abertas
  const { data: outras } = await admin
    .from("oposicao_campanha")
    .select("id, nome, detalhe_desconto, prazo_inicio, prazo_fim")
    .eq("emp_proprietaria_id", emp)
    .in("id", faltam)
  return [
    ...abertas,
    ...(outras ?? []).map((c) => ({
      id: String(c.id),
      nome: texto(c.nome),
      detalhe_desconto: texto(c.detalhe_desconto),
      prazo_inicio: texto(c.prazo_inicio),
      prazo_fim: texto(c.prazo_fim),
    })),
  ].sort((a, b) => (b.prazo_inicio ?? "").localeCompare(a.prazo_inicio ?? ""))
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
  const hoje = hojeSP()
  const campanhas = (await campanhasAbertas()).filter(
    (c) => estadoPrazo(c.prazo_inicio, c.prazo_fim, hoje) === "aberto"
  )
  if (campanhas.length === 0) return []
  // Só a campanha da empresa do filiado (M4): a de outra empresa aparecia no
  // banner de todos. Campanha sem fonte marcada vale para todos, como na aba.
  const admin = await createAdminClient()
  const { data: escopo } = await admin
    .from("oposicao_campanha_fontes")
    .select("campanha_id, empresa_id")
    .eq("emp_proprietaria_id", await tenantAtual())
    .in("campanha_id", campanhas.map((c) => c.id))
  const fontesPorCampanha = new Map<string, Set<string>>()
  for (const f of escopo ?? []) {
    const k = String(f.campanha_id)
    if (!fontesPorCampanha.has(k)) fontesPorCampanha.set(k, new Set())
    fontesPorCampanha.get(k)!.add(String(f.empresa_id))
  }
  const cpfLimpo = cpfConfiavel(cpf)
  const minhasFontes = cpfLimpo && fontesPorCampanha.size > 0 ? await empregadoresAtivos(cpfLimpo) : new Set<string>()
  const out: OposicaoDoFiliado[] = []
  for (const c of campanhas) {
    const minha = await minhaOposicao(c.id, cpf)
    const pendente = minha?.situacao === "aguardando_documento"
    // Já concluída → fora do banner. 'desistente' também: a pessoa já
    // escolheu, e a página da oposição segue deixando mudar de ideia no prazo.
    if (minha && !pendente) continue
    const fontes = fontesPorCampanha.get(c.id)
    if (!minha && fontes && ![...fontes].some((f) => minhasFontes.has(f))) continue
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
  /** Decisões jurídicas que valem (campanha ou padrão da entidade). */
  regras: RegrasOposicao
  /** Todas decididas: sem isso a campanha não recebe oposição. */
  regrasCompletas: boolean
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

  const regras = regrasEfetivas(regrasDaLinhaCampanha(c as Record<string, unknown>), (await regrasDaEntidade()).regras)
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
    regras,
    regrasCompletas: decisoesFaltando(regras).length === 0,
  }
}

/** Dia de calendário (AAAA-MM-DD) de um instante, no fuso de São Paulo. */
export function diaSP(iso: string | null): string | null {
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
  /** Dia da avaliação (coluna DATE), para a frase do resultado na lista (A15). */
  avaliadaEm: string | null
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
    .select("id, situacao, protocolo, confirmado_em, avaliacao_data")
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
    avaliadaEm: texto(linha.avaliacao_data)?.slice(0, 10) ?? null,
  }
}

export type VinculoAtivo = {
  fonteId: string
  fonteNome: string
  matricula: string | null
}

/**
 * Fontes pagadoras e matrículas dos vínculos ATIVOS do filiado (A103), para o
 * formulário da oposição vir preenchido com o cadastro. Mesma régua de
 * `empregadoresAtivos` (votacao-portal.ts): vínculo sem data de desfiliação
 * nem de demissão. A matrícula do vínculo cai para a do legado
 * (`fonte_pg_matricula`). Em ordem alfabética, uma linha por fonte.
 */
export async function vinculosAtivos(cpf: string): Promise<VinculoAtivo[]> {
  const cpfLimpo = cpfConfiavel(cpf)
  if (!cpfLimpo) return []
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data: filiacoes } = await admin
    .from("filiacoes")
    .select("id")
    .in("cpf", grafiasDoCpf(cpfLimpo))
    .eq("emp_proprietaria_id", emp)
    .not("filiacao_excluida", "is", true)
  const ids = (filiacoes ?? []).map((f) => String(f.id))
  if (ids.length === 0) return []

  const { data: vinc } = await admin
    .from("filiacao_vinculos")
    .select("fonte_pagadora_id, matricula, fonte_pg_matricula, data_desfiliacao, data_saida_demissao")
    .in("filiado_id", ids)
    .eq("emp_proprietaria_id", emp)
  const matriculaPorFonte = new Map<string, string | null>()
  for (const v of vinc ?? []) {
    const fonte = texto(v.fonte_pagadora_id)
    if (!fonte || texto(v.data_desfiliacao) || texto(v.data_saida_demissao)) continue
    const matricula = texto(v.matricula)?.trim() || texto(v.fonte_pg_matricula)?.trim() || null
    if (!matriculaPorFonte.has(fonte) || (!matriculaPorFonte.get(fonte) && matricula)) {
      matriculaPorFonte.set(fonte, matricula)
    }
  }
  if (matriculaPorFonte.size === 0) return []

  const { data: emps } = await admin
    .from("empresa")
    .select("id, nome_fantasia, nome_razao")
    .in("id", [...matriculaPorFonte.keys()])
  return (emps ?? [])
    .map((e) => ({
      fonteId: String(e.id),
      fonteNome: texto(e.nome_fantasia) ?? texto(e.nome_razao) ?? "(sem nome)",
      matricula: matriculaPorFonte.get(String(e.id)) ?? null,
    }))
    .sort((a, b) => a.fonteNome.localeCompare(b.fonteNome, "pt-BR"))
}

/**
 * Registra um evento na trilha — imutável no banco (migração
 * …_oposicao_integridade). `opositorId` nulo = evento da campanha (edição,
 * fontes, perguntas), com `campanhaId`. `usuarioId` = quem da entidade agiu.
 * Nunca derruba a ação, mas a falha vai para o log (antes era engolida).
 */
export async function registrarEvento(
  opositorId: string | null,
  evento: string,
  detalhe: string | null,
  ip: string | null,
  userAgent: string | null,
  opcoes: { usuarioId?: string | null; campanhaId?: string | null } = {}
): Promise<void> {
  try {
    const admin = await createAdminClient()
    const { error } = await admin.from("oposicao_eventos").insert({
      opositor_id: opositorId,
      evento,
      detalhe,
      ip,
      user_agent: userAgent,
      usuario_id: opcoes.usuarioId ?? null,
      campanha_id: opcoes.campanhaId ?? null,
      emp_proprietaria_id: await tenantAtual(),
    })
    if (error) console.error("[oposicao] evento não gravado:", evento, opositorId, error.message)
  } catch (e) {
    console.error("[oposicao] evento não gravado:", evento, opositorId, e instanceof Error ? e.message : e)
  }
}

/** Eventos do próprio trabalhador sobre a sua oposição (M9). */
export type AcessoDoTitular = "comprovante_visto" | "comprovante_pdf_baixado" | "carta_baixada"

/**
 * Registra na trilha que o trabalhador viu o comprovante ou baixou o PDF ou a
 * carta (M9), com IP e navegador. O mesmo evento repetido em 30 minutos conta
 * uma vez só — recarregar a página não enche a trilha. Nunca atrapalha a tela.
 */
export async function registrarAcessoDoTitular(opositorId: string, evento: AcessoDoTitular): Promise<void> {
  try {
    const admin = await createAdminClient()
    const emp = await tenantAtual()
    const desde = new Date(Date.now() - 30 * 60_000).toISOString()
    const { data: recente } = await admin
      .from("oposicao_eventos")
      .select("id")
      .eq("emp_proprietaria_id", emp)
      .eq("opositor_id", opositorId)
      .eq("evento", evento)
      .gte("created_at", desde)
      .limit(1)
    if ((recente ?? []).length > 0) return
    const { headers } = await import("next/headers")
    const h = await headers()
    const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null
    await registrarEvento(opositorId, evento, null, ip, h.get("user-agent"))
  } catch (e) {
    console.error("[oposicao] acesso não registrado:", evento, e instanceof Error ? e.message : e)
  }
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

/**
 * Próximo protocolo da campanha, pelo contador atômico do banco
 * (oposicao_proximo_protocolo, onda 0 de 27/10/2026). O max+1 de antes dava o
 * mesmo número a duas confirmações simultâneas; agora o unique
 * (campanha, protocolo) também recusa a duplicata.
 */
async function proximoProtocolo(
  admin: Awaited<ReturnType<typeof createAdminClient>>,
  empId: string,
  campanhaId: string
): Promise<number> {
  const { data, error } = await admin.rpc("oposicao_proximo_protocolo", { p_campanha: campanhaId, p_emp: empId })
  if (error || typeof data !== "number") throw new Error(`Falha ao gerar o protocolo: ${error?.message ?? "sem número"}`)
  return data
}

/** sha256 em hex (declaração aceita). */
function hashTexto(t: string): string {
  return createHash("sha256").update(t, "utf8").digest("hex")
}

/** Erro de unique (23505) do PostgREST. */
function duplicado(e: { code?: string } | null | undefined): boolean {
  return e?.code === "23505"
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

  // O ato fica gravado como foi (onda 0, 27/10/2026): a declaração aceita, o
  // modo e o prazo de agora — o comprovante e a carta usam estes, não os da
  // campanha, que podem mudar depois.
  const { data: campanha } = await admin
    .from("oposicao_campanha")
    .select("texto_declaracao, modo_formalizacao, prazo_fim")
    .eq("id", dados.campanhaId)
    .eq("emp_proprietaria_id", empId)
    .maybeSingle()
  if (!campanha) return { erro: "Campanha indisponível." }
  const declaracao = texto(campanha.texto_declaracao) ?? DECLARACAO_PADRAO

  let protocolo: number
  try {
    protocolo = existente?.protocolo ?? (await proximoProtocolo(admin, empId, dados.campanhaId))
  } catch (e) {
    console.error("[oposicao]", e)
    return { erro: "Não foi possível gerar o protocolo agora. Tente de novo em instantes." }
  }
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
    declaracao_aceita: declaracao,
    declaracao_hash: hashTexto(declaracao),
    modo_formalizacao_ato: texto(campanha.modo_formalizacao),
    prazo_fim_ato: texto(campanha.prazo_fim),
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
        documento_enviado_em: null,
      })
      .eq("id", existente.id)
      .eq("emp_proprietaria_id", empId)
      // Duas abas confirmando juntas: só a primeira acha a linha ainda 'desistente'.
      .eq("situacao", "desistente")
      .select("id")
    if (duplicado(error)) return { erro: "Você já registrou uma oposição nesta campanha." }
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
    // Duas abas, duplo clique ou reenvio da rede: o unique (campanha, CPF)
    // recusa a segunda linha — a pessoa já tem a oposição registrada.
    if (duplicado(error)) return { erro: "Você já registrou uma oposição nesta campanha." }
    if (error) return { erro: `Falha ao registrar a oposição: ${error.message}` }
    opositorId = String(data.id)
  }

  const respostas = dados.respostas.filter((r) => r.resposta.trim())
  if (respostas.length) {
    const { error: erroRespostas } = await admin.from("oposicao_resposta").insert(
      respostas.map((r) => ({
        opositor_id: opositorId,
        pergunta_id: r.perguntaId,
        resposta: r.resposta.trim(),
        emp_proprietaria_id: empId,
      }))
    )
    if (erroRespostas) console.error("[oposicao] respostas não gravadas:", opositorId, erroRespostas.message)
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
  if (duplicado(error)) {
    // A outra aba gravou primeiro: se foi também "não quero me opor", nada a fazer.
    const agora = await minhaOposicao(campanhaId, sessao.cpf)
    return agora?.situacao === "desistente" ? {} : { erro: "Você já registrou uma oposição nesta campanha." }
  }
  if (error) return { erro: error.message }
  await registrarEvento(String(data.id), "desistiu", null, ip, userAgent)
  return {}
}

/**
 * Sobe o documento assinado (gov.br) e move p/ nao_avaliada. Devolve a
 * validação da assinatura (A53) — a mesma que fica gravada e que o
 * comprovante mostra ao trabalhador.
 *
 * Quando aceita: na primeira carta ('aguardando_documento') e na TROCA do
 * arquivo, enquanto a oposição está em análise ('nao_avaliada' com documento)
 * e o prazo da campanha segue aberto — quem mandou o PDF errado corrige sem
 * perder o prazo. Avaliada, desistente ou oposição que não pede documento,
 * não: antes, qualquer upload devolvia a oposição a 'nao_avaliada', inclusive
 * uma já avaliada. Na troca, o arquivo anterior fica no bucket e o caminho
 * dele vai para a trilha ('documento_reenviado'), para a auditoria.
 */
/** Os bytes começam com "%PDF-" (até 1 KB de lixo antes é tolerado, como nos leitores). */
function ehPdf(bytes: Uint8Array): boolean {
  const inicio = new TextDecoder("latin1").decode(bytes.subarray(0, 1024))
  return inicio.includes("%PDF-")
}

export async function subirDocumentoAssinado(
  opositorId: string,
  cpf: string,
  arquivo: File,
  ip: string | null,
  userAgent: string | null
): Promise<{ erro?: string; validacao?: ValidacaoAssinatura | null }> {
  // O que vale é o conteúdo, não o tipo que o navegador informa (M3): um
  // JPEG renomeado para .pdf passava; um PDF que o celular manda como
  // "octet-stream" era recusado.
  if (arquivo.size > TAMANHO_MAX_CARTA) {
    return { erro: `O arquivo tem ${(arquivo.size / 1024 / 1024).toFixed(1).replace(".", ",")} MB; o limite é 3,8 MB.` }
  }
  const bytes = new Uint8Array(await arquivo.arrayBuffer())
  if (!ehPdf(bytes)) return { erro: "O arquivo enviado não é um PDF. Envie o PDF assinado no gov.br." }
  const empId = await tenantAtual()
  const admin = await createAdminClient()
  // Confirma posse (mesmo CPF) antes de aceitar o upload.
  const { data: o } = await admin
    .from("oposicao_opositor")
    .select("id, situacao, documento_assinado_url, campanha_id, prazo_fim_ato")
    .eq("id", opositorId)
    .in("cpf", grafiasDoCpf(limparCpf(cpf) || cpf))
    .eq("emp_proprietaria_id", empId)
    .maybeSingle()
  if (!o) return { erro: "Oposição não encontrada." }

  const situacao = (o.situacao ?? "nao_avaliada") as SituacaoOpositor
  const anterior = texto(o.documento_assinado_url)
  const troca = situacao === "nao_avaliada" && Boolean(anterior)
  if (situacao !== "aguardando_documento" && !troca) {
    return {
      erro:
        situacao === "aprovada" || situacao === "reprovada"
          ? "Esta oposição já foi avaliada pela entidade; o documento não pode mais ser trocado."
          : "Esta oposição não recebe documento.",
    }
  }
  // Decisão jurídica "carta depois do prazo = recusar": a primeira carta
  // que chega depois do prazo do ato não é recebida.
  if (!troca) {
    const { efetivas } = await regrasDaCampanha(texto(o.campanha_id))
    if (efetivas.carta_fora_prazo === "recusar") {
      const { data: camp } = o.campanha_id
        ? await admin.from("oposicao_campanha").select("prazo_fim").eq("id", o.campanha_id).eq("emp_proprietaria_id", empId).maybeSingle()
        : { data: null }
      const prazo = texto(o.prazo_fim_ato)?.slice(0, 10) ?? texto(camp?.prazo_fim)?.slice(0, 10) ?? null
      if (prazo && hojeSP() > prazo) {
        return { erro: `O prazo para enviar a carta assinada terminou em ${formatarData(prazo)}. Fale com a entidade.` }
      }
    }
  }
  if (troca) {
    const { data: campanha } = o.campanha_id
      ? await admin
          .from("oposicao_campanha")
          .select("situacao, prazo_inicio, prazo_fim")
          .eq("id", o.campanha_id)
          .eq("emp_proprietaria_id", empId)
          .maybeSingle()
      : { data: null }
    const noPrazo =
      campanha?.situacao === "aberta" &&
      estadoPrazo(texto(campanha.prazo_inicio), texto(campanha.prazo_fim), hojeSP()) === "aberto"
    if (!noPrazo) return { erro: "O prazo da campanha terminou: o documento enviado não pode mais ser trocado." }
  }

  // Validação PAdES/ICP-Brasil (onda 5, A4): CPF do certificado × CPF do opositor.
  let validacao: ValidacaoAssinatura | null = null
  try {
    validacao = validarAssinaturasPdf(bytes, cpf)
  } catch (e) {
    console.error("validação da assinatura:", e)
  }

  const caminho = `assinados/${randomUUID()}.pdf`
  const up = await admin.storage
    .from("oposicao")
    .upload(caminho, bytes, { contentType: "application/pdf", upsert: false })
  if (up.error) return { erro: `Falha ao subir o documento: ${up.error.message}` }

  // Só grava se a situação ainda é a que foi lida: uma avaliação no meio do
  // caminho não pode ser desfeita pelo upload.
  const gravar = (campos: Record<string, unknown>) =>
    admin
      .from("oposicao_opositor")
      .update(campos)
      .eq("id", opositorId)
      .eq("emp_proprietaria_id", empId)
      .eq("situacao", situacao)
      .select("id")
  let { data: gravado, error } = await gravar({
    documento_assinado_url: caminho,
    situacao: "nao_avaliada",
    assinatura_validacao: validacao,
    // Quando a PRIMEIRA carta chegou: a avaliação compara com o prazo (onda 0).
    ...(troca ? {} : { documento_enviado_em: new Date().toISOString() }),
  })
  if (error && (error.code === "42703" || error.code === "PGRST204")) {
    // Sem a coluna (supabase/assinatura-validacao.sql): grava sem o resultado.
    ;({ data: gravado, error } = await gravar({ documento_assinado_url: caminho, situacao: "nao_avaliada" }))
  }
  if (error || (gravado ?? []).length === 0) {
    // Nada gravado: o PDF que acabou de subir não fica órfão no bucket.
    await admin.storage.from("oposicao").remove([caminho]).catch(() => undefined)
  }
  if (error) return { erro: error.message }
  if ((gravado ?? []).length === 0) {
    return { erro: "A situação da sua oposição mudou enquanto o arquivo subia. Recarregue a página e confira." }
  }
  await registrarEvento(
    opositorId,
    troca ? "documento_reenviado" : "documento_enviado",
    troca ? `substitui ${anterior}` : null,
    ip,
    userAgent
  )
  return { validacao }
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
  /** CNPJ da fonte pagadora, para a carta identificar a empresa (onda 3). */
  empregadorCnpj: string | null
  /** Vídeo de agradecimento da campanha, mostrado logo depois do registro. */
  videoAgradecimentoUrl: string | null
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
  /** Resultado da avaliação (A15): dia (AAAA-MM-DD) e, se não aceita, o motivo. */
  avaliacao_data: string | null
  reprovacao_motivo: string | null
  /** Há PDF assinado enviado (A53). */
  temDocumento: boolean
  /** URL assinada (1 h) do PDF que o trabalhador enviou — "Ver o PDF enviado". */
  documentoUrl: string | null
  /** Quando o último PDF chegou (trilha de auditoria). */
  documentoRecebidoEm: string | null
  /** Validação da assinatura do último PDF; null sem a coluna ou sem validação. */
  validacao: ValidacaoAssinatura | null
}

const COLUNAS_COMPROVANTE =
  "id, protocolo, campanha_id, nome_completo, cpf, matricula, empregador_id, situacao, confirmado_em, avaliacao_data, reprovacao_motivo, documento_assinado_url, declaracao_aceita"

/** Comprovante da oposição — só para o próprio CPF (segurança). */
export async function obterComprovante(
  id: string,
  cpf: string
): Promise<Comprovante | null> {
  const empId = await tenantAtual()
  const admin = await createAdminClient()
  const ler = (colunas: string) =>
    admin
      .from("oposicao_opositor")
      .select(colunas)
      .eq("id", id)
      .in("cpf", grafiasDoCpf(limparCpf(cpf) || cpf))
      .eq("emp_proprietaria_id", empId)
      .maybeSingle()
  // A validação da assinatura é coluna de supabase/assinatura-validacao.sql:
  // sem ela, o comprovante sai sem o resultado, como o upload já tolera.
  let lido = await ler(`${COLUNAS_COMPROVANTE}, assinatura_validacao`)
  if (lido.error && esquemaAusente(lido.error)) lido = await ler(COLUNAS_COMPROVANTE)
  const o = lido.data as Record<string, unknown> | null
  if (!o) return null

  const caminhoDocumento = texto(o.documento_assinado_url)
  const [camp, emp, docUrl, recebido] = await Promise.all([
    o.campanha_id
      ? admin
          .from("oposicao_campanha")
          .select(
            "nome, detalhe_desconto, texto_declaracao, documento_modelo_url, situacao, prazo_inicio, prazo_fim, video_agradecimento_url"
          )
          .eq("id", String(o.campanha_id))
          .eq("emp_proprietaria_id", empId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    o.empregador_id
      ? admin
          .from("empresa")
          .select("nome_fantasia, nome_razao, cnpj_cpf")
          .eq("id", String(o.empregador_id))
          .maybeSingle()
      : Promise.resolve({ data: null }),
    caminhoDocumento
      ? admin.storage.from("oposicao").createSignedUrl(caminhoDocumento, 3600)
      : Promise.resolve({ data: null }),
    caminhoDocumento
      ? admin
          .from("oposicao_eventos")
          .select("created_at")
          .eq("opositor_id", id)
          .eq("emp_proprietaria_id", empId)
          .in("evento", ["documento_enviado", "documento_reenviado"])
          .order("created_at", { ascending: false })
          .limit(1)
      : Promise.resolve({ data: null }),
  ])
  const c = camp.data as Record<string, unknown> | null
  const e = emp.data as Record<string, unknown> | null
  const validacao = (o.assinatura_validacao ?? null) as ValidacaoAssinatura | null

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
    empregadorCnpj: e ? texto(e.cnpj_cpf) : null,
    videoAgradecimentoUrl: c ? texto(c.video_agradecimento_url) : null,
    situacao: (o.situacao ?? "nao_avaliada") as SituacaoOpositor,
    // O texto que a pessoa aceitou (gravado no ato); o legado e as oposições
    // de antes da onda 0 não o têm, e caem no texto atual da campanha.
    texto_declaracao: texto(o.declaracao_aceita) ?? (c ? texto(c.texto_declaracao) : null),
    confirmado_em: texto(o.confirmado_em),
    dia: diaSP(texto(o.confirmado_em)),
    campanhaAberta: c?.situacao === "aberta",
    prazo_inicio: c ? texto(c.prazo_inicio) : null,
    prazo_fim: c ? texto(c.prazo_fim) : null,
    modeloUrl,
    avaliacao_data: texto(o.avaliacao_data)?.slice(0, 10) ?? null,
    reprovacao_motivo: texto(o.reprovacao_motivo),
    temDocumento: Boolean(caminhoDocumento),
    documentoUrl: docUrl.data?.signedUrl ?? null,
    documentoRecebidoEm:
      texto((recebido.data as { created_at?: unknown }[] | null)?.[0]?.created_at) ??
      (validacao?.verificadoEm || null),
    validacao: validacao && typeof validacao === "object" && "situacao" in validacao ? validacao : null,
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
  /** Link temporário (1 h) para abrir o PDF assinado no painel (item 13). */
  documentoLink: string | null
  documentoEnviadoEm: string | null
  validacao: ValidacaoAssinatura | null
  /** O que impede aprovar sem conferir o PDF (null = nada). */
  problemaAssinatura: string | null
  userAgent: string | null
  /** O ato como foi aceito (onda 0): texto, hash, modo e prazo vigentes. */
  declaracaoAceita: string | null
  declaracaoHash: string | null
  modoAto: string | null
  prazoFimAto: string | null
  respostas: { pergunta: string | null; resposta: string | null }[]
  eventos: {
    evento: string | null
    detalhe: string | null
    ip: string | null
    created_at: string | null
    usuarioNome: string | null
  }[]
  /** Requisitos conferidos de verdade (onda 0 — antes o checklist era sempre verde). */
  requisitos: RequisitosOposicao
}

/**
 * Cada requisito: true = cumpre, false = não cumpre, null = sem como saber
 * (o legado do Bubble não guardou a hora da oposição).
 */
export type RequisitosOposicao = {
  /** Confirmada até o fim do prazo (dia de SP, inclusive). */
  noPrazo: boolean | null
  /** Dia (SP) da confirmação e o fim do prazo considerado. */
  diaConfirmacao: string | null
  prazoFim: string | null
  /** A primeira carta assinada chegou no prazo (null = não houve carta). */
  cartaNoPrazo: boolean | null
  diaCarta: string | null
  /** Outras oposições do mesmo CPF nesta campanha. */
  outrasDoCpf: number
  /** Fonte pagadora informada e vinculada à campanha (null = campanha sem fontes). */
  fonteNaCampanha: boolean | null
  /** CPF válido e nome informado. */
  identificacao: boolean
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

  const cpfDigitos = limparCpf(texto(o.cpf) ?? "")
  const [empRes, respRes, evRes, avalRes, campRes, fontesRes, mesmoCpfRes] = await Promise.all([
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
      .select("evento, detalhe, ip, created_at, usuario_id")
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
    o.campanha_id
      ? admin
          .from("oposicao_campanha")
          .select("prazo_fim")
          .eq("id", o.campanha_id)
          .eq("emp_proprietaria_id", empId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    o.campanha_id
      ? admin
          .from("oposicao_campanha_fontes")
          .select("empresa_id")
          .eq("campanha_id", o.campanha_id)
          .eq("emp_proprietaria_id", empId)
      : Promise.resolve({ data: [] as { empresa_id: string }[] }),
    o.campanha_id && cpfDigitos
      ? admin
          .from("oposicao_opositor")
          .select("id", { count: "exact", head: true })
          .eq("campanha_id", o.campanha_id)
          .eq("emp_proprietaria_id", empId)
          .in("cpf", grafiasDoCpf(cpfDigitos))
          .neq("id", id)
      : Promise.resolve({ count: 0 }),
  ])

  // Quem da entidade aparece na trilha (avaliador, quem editou).
  const usuarioIds = [
    ...new Set((evRes.data ?? []).map((ev) => texto(ev.usuario_id)).filter((v): v is string => Boolean(v))),
  ]
  const nomeUsuario = new Map<string, string>()
  if (usuarioIds.length) {
    const { data: us } = await admin.from("usuarios").select("id, nome_completo, nome_guerra").in("id", usuarioIds)
    for (const u of us ?? []) nomeUsuario.set(String(u.id), texto(u.nome_completo) ?? texto(u.nome_guerra) ?? "—")
  }

  const prazoFim = texto(o.prazo_fim_ato) ?? texto(campRes.data?.prazo_fim)
  const diaConfirmacao = diaSP(texto(o.confirmado_em))
  const diaCarta = diaSP(texto(o.documento_enviado_em))
  const fontes = (fontesRes.data ?? []).map((f) => String(f.empresa_id))
  const requisitos: RequisitosOposicao = {
    noPrazo: diaConfirmacao && prazoFim ? diaConfirmacao <= prazoFim.slice(0, 10) : null,
    diaConfirmacao,
    prazoFim: prazoFim?.slice(0, 10) ?? null,
    cartaNoPrazo: diaCarta && prazoFim ? diaCarta <= prazoFim.slice(0, 10) : null,
    diaCarta,
    outrasDoCpf: mesmoCpfRes.count ?? 0,
    fonteNaCampanha: fontes.length === 0 ? null : Boolean(o.empregador_id && fontes.includes(String(o.empregador_id))),
    identificacao: Boolean(cpfConfiavel(texto(o.cpf)) && texto(o.nome_completo)),
  }

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
  // A carta do legado do Bubble ficou na coluna `carta` (URL da CDN dele).
  const caminhoDocumento = texto(o.documento_assinado_url) ?? texto(o.carta)
  let documentoLink: string | null = null
  if (caminhoDocumento) {
    // Legado do Bubble guardou a URL pública; o novo, o caminho no bucket.
    if (/^https?:\/\//.test(caminhoDocumento) || caminhoDocumento.startsWith("//")) {
      documentoLink = caminhoDocumento.startsWith("//") ? `https:${caminhoDocumento}` : caminhoDocumento
    } else {
      const { data: assinado } = await admin.storage.from("oposicao").createSignedUrl(caminhoDocumento, 3600)
      documentoLink = assinado?.signedUrl ?? null
    }
  }
  const validacaoBruta = o.assinatura_validacao as ValidacaoAssinatura | null
  const validacao = validacaoBruta && typeof validacaoBruta === "object" && "situacao" in validacaoBruta ? validacaoBruta : null
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
    documentoAssinadoUrl: caminhoDocumento,
    documentoLink,
    documentoEnviadoEm: texto(o.documento_enviado_em),
    validacao,
    problemaAssinatura: caminhoDocumento
      ? problemaDaAssinatura(validacao, (await regrasDaCampanha(texto(o.campanha_id))).efetivas.assinaturas_aceitas)
      : null,
    userAgent: texto(o.user_agent),
    declaracaoAceita: texto(o.declaracao_aceita),
    declaracaoHash: texto(o.declaracao_hash),
    modoAto: texto(o.modo_formalizacao_ato),
    prazoFimAto: texto(o.prazo_fim_ato),
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
      usuarioNome: texto(ev.usuario_id) ? (nomeUsuario.get(String(ev.usuario_id)) ?? null) : null,
    })),
    requisitos,
  }
}

/**
 * O que impede aprovar sem olhar o PDF (item 13 da onda 2): assinatura
 * inválida, ausente, não verificada ou com CPF de outra pessoa — e, com a
 * decisão jurídica "só gov.br" (`aceitas = "govbr"`), a carta assinada com
 * e-CPF da ICP-Brasil. "Ressalva" (íntegra, raiz fora da lista) não barra.
 * Null = sem impedimento.
 */
export function problemaDaAssinatura(
  validacao: ValidacaoAssinatura | null | undefined,
  aceitas: string | null = null
): string | null {
  if (!validacao || typeof validacao !== "object" || !("situacao" in validacao)) {
    return "A assinatura do PDF não foi verificada."
  }
  if (validacao.situacao === "invalida") return "A assinatura do PDF é inválida."
  if (validacao.situacao === "sem_assinatura") return "O PDF não tem assinatura digital."
  if (validacao.situacao === "erro") return "Não foi possível verificar a assinatura do PDF."
  if (validacao.cpfConfere === false) return "O CPF do certificado não confere com o da oposição."
  if (aceitas === "govbr") {
    const valida = validacao.assinaturas.find((a) => a.integra && a.assinaturaOk && a.cobreArquivoTodo) ?? validacao.assinaturas[0]
    if (valida?.raizTipo === "icp_brasil") {
      return "A carta foi assinada com e-CPF (ICP-Brasil), e esta campanha aceita só a assinatura do gov.br."
    }
  }
  return null
}

/** Hosts de onde a carta do legado pode ser baixada (o resto do caminho vem do banco). */
const HOST_CARTA_LEGADO = /^[0-9a-f]+\.cdn\.bubble\.io$/

/**
 * Baixa a carta assinada (Storage ou, no legado, a CDN do Bubble), passa de
 * novo pelo validador e grava o resultado (onda 3): serve à carta do legado,
 * que nunca foi verificada, e a qualquer carta depois de o validador mudar.
 */
export async function reverificarAssinaturaOposicao(
  id: string,
  usuarioId: string
): Promise<{ erro?: string; resumo?: string }> {
  const empId = await tenantAtual()
  const admin = await createAdminClient()
  const { data: o } = await admin
    .from("oposicao_opositor")
    .select("id, cpf, campanha_id, documento_assinado_url, carta")
    .eq("id", id)
    .eq("emp_proprietaria_id", empId)
    .maybeSingle()
  const caminho = texto(o?.documento_assinado_url) ?? texto(o?.carta)
  if (!o || !caminho) return { erro: "Esta oposição não tem carta assinada." }
  let bytes: Uint8Array
  if (/^(https?:)?\/\//.test(caminho)) {
    const url = new URL(caminho.startsWith("//") ? `https:${caminho}` : caminho)
    if (!HOST_CARTA_LEGADO.test(url.hostname)) return { erro: "Endereço da carta fora do armazenamento conhecido." }
    const r = await fetch(url).catch(() => null)
    if (!r?.ok) return { erro: "Não foi possível baixar a carta do armazenamento antigo." }
    bytes = new Uint8Array(await r.arrayBuffer())
  } else {
    const { data: arquivo, error } = await admin.storage.from("oposicao").download(caminho)
    if (error || !arquivo) return { erro: `Não foi possível ler o PDF: ${error?.message ?? "?"}` }
    bytes = new Uint8Array(await arquivo.arrayBuffer())
  }
  const validacao = validarAssinaturasPdf(bytes, texto(o.cpf))
  const { error } = await admin
    .from("oposicao_opositor")
    .update({ assinatura_validacao: validacao })
    .eq("id", id)
    .eq("emp_proprietaria_id", empId)
  if (error) return { erro: error.message }
  await registrarEvento(id, "assinatura_reverificada", validacao.resumo, null, null, {
    usuarioId,
    campanhaId: texto(o.campanha_id),
  })
  return { resumo: validacao.resumo }
}

/** Aprova (procedente) ou reprova (improcedente + motivo) a oposição. */
export async function avaliarOpositor(
  id: string,
  aprovar: boolean,
  motivo: string | null,
  avaliadorId: string,
  opcoes: {
    /** O avaliador conferiu o PDF e aprova apesar do problema da assinatura. */
    confirmarAssinatura?: boolean
  } = {}
): Promise<{ erro?: string; exigeConfirmacao?: boolean }> {
  if (!aprovar && !motivo?.trim()) {
    return { erro: "Informe o motivo da reprovação." }
  }
  const empId = await tenantAtual()
  const admin = await createAdminClient()
  // O antes, para avisar só quando a decisão muda (A58): a gestão pode
  // re-decidir, e o mesmo "Reprovar" salvo duas vezes não é um fato novo.
  const { data: antes } = await admin
    .from("oposicao_opositor")
    .select("situacao, reprovacao_motivo, cpf, email, nome_completo, filiacao_id, protocolo, campanha_id, documento_assinado_url, carta, assinatura_validacao")
    .eq("id", id)
    .eq("emp_proprietaria_id", empId)
    .maybeSingle()
  const situacaoAntes = texto(antes?.situacao)
  if (!antes || !situacaoAntes || !["nao_avaliada", "aprovada", "reprovada"].includes(situacaoAntes)) {
    return { erro: "Oposição não pode ser avaliada nesta situação." }
  }
  // Aprovar com a assinatura problemática só com a conferência declarada.
  const problemaAssinatura =
    aprovar && (texto(antes.documento_assinado_url) ?? texto(antes.carta))
      ? problemaDaAssinatura(
          antes.assinatura_validacao as ValidacaoAssinatura | null,
          (await regrasDaCampanha(texto(antes.campanha_id))).efetivas.assinaturas_aceitas
        )
      : null
  if (problemaAssinatura && !opcoes.confirmarAssinatura) {
    return {
      erro: `${problemaAssinatura} Abra o PDF, confira e marque “Conferi o documento” para aprovar assim mesmo.`,
      exigeConfirmacao: true,
    }
  }
  const { data, error } = await admin
    .from("oposicao_opositor")
    .update({
      situacao: aprovar ? "aprovada" : "reprovada",
      avaliacao: aprovar,
      avaliacao_data: hojeSP(),
      avaliacao_avaliador_id: avaliadorId,
      reprovacao_motivo: aprovar ? null : motivo?.trim(),
      // A decisão individual avisa na hora: sai da fila do lote, se estava nela.
      aviso_avaliacao_pendente_em: null,
    })
    .eq("id", id)
    .eq("emp_proprietaria_id", empId)
    // Só se ninguém decidiu no meio (onda 0): dois avaliadores ao mesmo tempo
    // gravavam os dois, e o trabalhador recebia "aceita" e "não aceita".
    .eq("situacao", situacaoAntes)
    .select("id")
  if (error) return { erro: `Falha ao avaliar: ${error.message}` }
  if ((data ?? []).length === 0) {
    return { erro: "Outra pessoa acabou de avaliar esta oposição. Recarregue a página e confira a decisão." }
  }
  const redecisao = situacaoAntes !== "nao_avaliada"
  await registrarEvento(
    id,
    aprovar ? "aprovada" : "reprovada",
    [
      redecisao ? `re-decisão: ${situacaoAntes} → ${aprovar ? "aprovada" : "reprovada"}` : null,
      problemaAssinatura ? `aprovada após conferência manual do PDF (${problemaAssinatura})` : null,
      // Texto escrito no campo do motivo e "Aprovar": não se perde, vai como observação.
      aprovar ? (motivo?.trim() ? `observação do avaliador: ${motivo.trim()}` : null) : (motivo?.trim() ?? null),
    ]
      .filter(Boolean)
      .join("; ") || null,
    null,
    null,
    { usuarioId: avaliadorId, campanhaId: texto(antes.campanha_id) }
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

type DadosAvisoAvaliacao = {
  opositorId: string
  aprovada: boolean
  motivo: string | null
  protocolo: number | null
  campanhaNome: string
  pessoa: PessoaDoAviso
}

/** Monta e entrega o aviso da decisão. `origem` = https://<entidade>.confluir.online. */
async function entregarAvisoAvaliacao(
  o: DadosAvisoAvaliacao,
  origem: string,
  amb: AmbienteAviso = {}
): Promise<ResultadoAviso> {
  const protocolo = o.protocolo == null ? "—" : String(o.protocolo)
  const link = `/portal/oposicao/comprovante/${o.opositorId}`
  const resumo = `Sua oposição à contribuição assistencial (protocolo ${protocolo}, campanha ${o.campanhaNome})`

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

  return entregarAvisoOposicao(
    {
      pessoa: o.pessoa,
      assunto: o.aprovada
        ? `Sua oposição foi aceita — protocolo ${protocolo}`
        : `Sua oposição não foi aceita — protocolo ${protocolo}`,
      texto: o.aprovada ? `${resumo} foi aceita.` : `${resumo} não foi aceita. Motivo: ${o.motivo ?? "não informado"}`,
      link,
      html,
      umaVez: false,
    },
    amb
  )
}

/**
 * Resultado da avaliação (A16/A58): aceita ou não aceita, com o motivo e o
 * caminho para discordar. Chamada por `avaliarOpositor` só quando a decisão
 * muda — salvar a mesma decisão de novo não repete o aviso. A decisão em
 * lote não passa por aqui: vai para a fila (`avisosAvaliacaoPendentes`).
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
    let campanhaNome = "—"
    if (o.campanhaId) {
      const admin = await createAdminClient()
      const { data } = await admin
        .from("oposicao_campanha")
        .select("nome")
        .eq("id", o.campanhaId)
        .eq("emp_proprietaria_id", await tenantAtual())
        .maybeSingle()
      campanhaNome = texto(data?.nome) ?? campanhaNome
    }
    const origem = await origemAtual().catch(() => "")
    const r = await entregarAvisoAvaliacao({ ...o, campanhaNome }, origem)
    await registrarEvento(o.opositorId, "aviso_avaliacao", descreverEntrega(r), null, null)
  })
}

export type ResultadoAvisosAvaliacao = {
  /** Na fila antes desta volta. */
  pendentes: number
  avisados: number
  porEmail: number
  falhas: number
  /** Ficaram para a próxima volta (limite de tempo ou de quantidade). */
  restantes: number
  erro?: string
}

/** Quantos avisos da fila saem por volta e por entidade (a rota roda a cada 15 min). */
const AVISOS_POR_VOLTA = 300

/**
 * Fila do aviso das decisões em lote (onda 2): roda FORA de requisição, na
 * rota /api/oposicao/tick, entidade por entidade. Manda o aviso da decisão
 * ATUAL (se alguém re-decidiu no meio, vale a nova), cinco por vez, até
 * `AVISOS_POR_VOLTA` ou o limite de tempo, e tira a marca de cada um. O envio
 * fica na trilha (`aviso_avaliacao`), como no aviso individual.
 */
export async function avisosAvaliacaoPendentes(amb: {
  client: SupabaseClient
  tenantId: string
  contexto: ContextoEmail
  /** Date.now() a partir do qual não começa outro grupo. */
  ate: number
}): Promise<ResultadoAvisosAvaliacao> {
  const { client, tenantId, contexto } = amb
  const vazio: ResultadoAvisosAvaliacao = { pendentes: 0, avisados: 0, porEmail: 0, falhas: 0, restantes: 0 }
  const { data, count, error } = await client
    .from("oposicao_opositor")
    .select("id, situacao, reprovacao_motivo, cpf, email, nome_completo, filiacao_id, protocolo, campanha_id", {
      count: "exact",
    })
    .eq("emp_proprietaria_id", tenantId)
    .not("aviso_avaliacao_pendente_em", "is", null)
    .order("aviso_avaliacao_pendente_em")
    .limit(AVISOS_POR_VOLTA)
  if (error) return { ...vazio, erro: esquemaAusente(error) ? "sem a fila de avisos da oposição" : error.message }
  const fila = data ?? []
  const resultado: ResultadoAvisosAvaliacao = { ...vazio, pendentes: count ?? fila.length }
  if (fila.length === 0) return resultado

  const campanhaIds = [...new Set(fila.map((p) => texto(p.campanha_id)).filter((v): v is string => Boolean(v)))]
  const nomeCampanha = new Map<string, string>()
  if (campanhaIds.length) {
    const { data: cs } = await client.from("oposicao_campanha").select("id, nome").in("id", campanhaIds)
    for (const c of cs ?? []) nomeCampanha.set(String(c.id), texto(c.nome) ?? "—")
  }

  let feitos = 0
  for (let i = 0; i < fila.length && Date.now() < amb.ate; i += 5) {
    await Promise.all(
      fila.slice(i, i + 5).map(async (p) => {
        const id = String(p.id)
        const situacao = texto(p.situacao)
        const limpar = () =>
          client
            .from("oposicao_opositor")
            .update({ aviso_avaliacao_pendente_em: null })
            .eq("id", id)
            .eq("emp_proprietaria_id", tenantId)
        // Voltou a não avaliada (ou outra situação) depois do lote: nada a avisar.
        if (situacao !== "aprovada" && situacao !== "reprovada") {
          await limpar()
          return
        }
        try {
          const r = await entregarAvisoAvaliacao(
            {
              opositorId: id,
              aprovada: situacao === "aprovada",
              motivo: texto(p.reprovacao_motivo),
              protocolo: p.protocolo == null ? null : Number(p.protocolo),
              campanhaNome: nomeCampanha.get(String(p.campanha_id)) ?? "—",
              pessoa: {
                cpf: texto(p.cpf),
                nome: texto(p.nome_completo),
                email: texto(p.email)?.trim() ?? null,
                filiado: Boolean(p.filiacao_id),
              },
            },
            contexto.origem,
            { client, tenantId, contexto }
          )
          if (r) resultado.avisados++
          else resultado.falhas++
          if (r === "email") resultado.porEmail++
          await client.from("oposicao_eventos").insert({
            opositor_id: id,
            campanha_id: texto(p.campanha_id),
            evento: "aviso_avaliacao",
            detalhe: descreverEntrega(r),
            emp_proprietaria_id: tenantId,
          })
        } catch (e) {
          console.error("aviso da avaliação em lote:", e)
          resultado.falhas++
        }
        // Sai da fila mesmo com falha no envio: a falha fica na trilha, e
        // tentar de novo a cada 15 min repetiria o aviso a quem recebeu.
        await limpar()
      })
    )
    feitos += 5
  }
  resultado.restantes = Math.max(0, resultado.pendentes - Math.min(feitos, fila.length))
  return resultado
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
