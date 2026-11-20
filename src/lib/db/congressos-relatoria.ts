import "server-only"

import { valor } from "@/lib/congressos/config"
import {
  abrangencias,
  classificarApreciacao,
  conferirCotas,
  destinoPelosGrupos,
  grupoTravado,
  podeNovaNoGrupo,
  resultadoPlenaria,
  type FormaVotacao,
  type Maioria,
  type MinimoGrupos,
  type ResultadoApreciacao,
  type ResultadoPlenaria,
} from "@/lib/congressos/relatoria"
import { lerEmLotes } from "@/lib/db/comum"
import { listarParticipantes, listarPrograma, type Congresso, type Eixo, type Grupo } from "@/lib/db/congressos"
import { hashToken } from "@/lib/db/congressos-inscricao"
import { painelDoDia } from "@/lib/db/congressos-dia"
import { mocoesDaPlenaria, type Mocao } from "@/lib/db/congressos-mocoes"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Congressos — relatoria e plenária (Fase 3): propostas com versões (texto
 * nunca é sobrescrito), apontamentos e emendas dos grupos, apreciação no
 * grupo, entrega do relatório, funções de coordenação e relatoria, fusão de
 * propostas com origem rastreável e o resultado das votações da plenária.
 *
 * A relatoria do grupo pode operar pelo link pessoal (sem conta): as funções
 * que recebem `tenantId` explícito servem a esse caminho. Regras puras em
 * src/lib/congressos/relatoria.ts.
 */

export type SituacaoProposta = "em_debate" | "entregue" | "fundida" | "plenaria" | "aprovada" | "rejeitada" | "retirada" | "anais"
export type OrigemProposta = "caderno" | "etapa_anterior" | "documento" | "grupo" | "plenaria" | "fusao"
export type TipoApontamento = "apontamento" | "acrescimo" | "supressao" | "alteracao" | "dissenso"
export type FuncaoGrupo = "coordenacao" | "relatoria" | "relatoria_adjunta"

export const ROTULO_SITUACAO_PROPOSTA: Record<SituacaoProposta, string> = {
  em_debate: "Em debate",
  entregue: "Entregue pelo grupo",
  fundida: "Fundida em outra",
  plenaria: "Na pauta da plenária",
  aprovada: "Aprovada",
  rejeitada: "Rejeitada",
  retirada: "Retirada",
  anais: "Só aos anais",
}

export const ROTULO_ORIGEM_PROPOSTA: Record<OrigemProposta, string> = {
  caderno: "Caderno de teses",
  etapa_anterior: "Etapa anterior",
  documento: "Documento",
  grupo: "Nova no grupo",
  plenaria: "Nova em plenária",
  fusao: "Fusão",
}

export const ROTULO_APONTAMENTO: Record<TipoApontamento, string> = {
  apontamento: "Apontamento",
  acrescimo: "Acréscimo",
  supressao: "Supressão",
  alteracao: "Alteração",
  dissenso: "Dissenso",
}

export const ROTULO_FUNCAO: Record<FuncaoGrupo, string> = {
  coordenacao: "Coordenação",
  relatoria: "Relatoria",
  relatoria_adjunta: "Relatoria adjunta",
}

/** Quem registra: relator pelo link pessoal (só nome) ou usuário do painel. */
export type Autor = { nome: string; usuarioId?: string | null }

export type Proposta = {
  id: string
  numero: number
  eixoId: string | null
  grupoId: string | null
  origem: OrigemProposta
  origemDescricao: string | null
  abrangencia: string | null
  texto: string
  versao: number
  situacao: SituacaoProposta
  classificacao: "consenso" | "debate" | null
  fundidaEm: string | null
  ordem: number
  destaquePor: string | null
  destaqueEm: string | null
  criadaPor: string | null
  createdAt: string
}

export type Apontamento = {
  id: string
  grupoId: string | null
  propostaId: string | null
  tipo: TipoApontamento
  texto: string
  autor: string | null
  retiradoEm: string | null
  createdAt: string
}

export type Apreciacao = {
  id: string
  grupoId: string
  propostaId: string
  aFavor: number
  contra: number
  abstencao: number
  resultado: ResultadoApreciacao
}

export type FuncaoNoGrupo = { id: string; grupoId: string; participanteId: string; funcao: FuncaoGrupo; escolha: "eleita" | "indicada"; nome: string }

export type Votacao = {
  id: string
  tipo: "proposta" | "bloco"
  forma: FormaVotacao
  aFavor: number | null
  contra: number | null
  abstencao: number | null
  maioria: string
  baseVotantes: number | null
  resultado: ResultadoPlenaria
  observacao: string | null
  createdAt: string
  propostaIds: string[]
  mocaoIds: string[]
}

const CAMPOS_PROPOSTA =
  "id, numero, eixo_id, grupo_id, origem, origem_descricao, abrangencia, texto, versao, situacao, classificacao, fundida_em, ordem, destaque_por, destaque_em, criada_por, created_at"

function paraProposta(r: Record<string, unknown>): Proposta {
  return {
    id: r.id as string,
    numero: r.numero as number,
    eixoId: (r.eixo_id as string | null) ?? null,
    grupoId: (r.grupo_id as string | null) ?? null,
    origem: r.origem as OrigemProposta,
    origemDescricao: (r.origem_descricao as string | null) ?? null,
    abrangencia: (r.abrangencia as string | null) ?? null,
    texto: r.texto as string,
    versao: r.versao as number,
    situacao: r.situacao as SituacaoProposta,
    classificacao: (r.classificacao as Proposta["classificacao"]) ?? null,
    fundidaEm: (r.fundida_em as string | null) ?? null,
    ordem: (r.ordem as number) ?? 0,
    destaquePor: (r.destaque_por as string | null) ?? null,
    destaqueEm: (r.destaque_em as string | null) ?? null,
    criadaPor: (r.criada_por as string | null) ?? null,
    createdAt: r.created_at as string,
  }
}

function paraApontamento(r: Record<string, unknown>): Apontamento {
  return {
    id: r.id as string,
    grupoId: (r.grupo_id as string | null) ?? null,
    propostaId: (r.proposta_id as string | null) ?? null,
    tipo: r.tipo as TipoApontamento,
    texto: r.texto as string,
    autor: (r.autor as string | null) ?? null,
    retiradoEm: (r.retirado_em as string | null) ?? null,
    createdAt: r.created_at as string,
  }
}

const agoraIso = () => new Date().toISOString()
const VOTADA: SituacaoProposta[] = ["aprovada", "rejeitada"]

/** Lê as regras da configuração que a relatoria usa. */
export function regrasDaRelatoria(c: Congresso) {
  return {
    novasGrupo: valor<string>(c.config, "propostas.novas_grupo") ?? "livres",
    novasGrupoMax: Number(valor(c.config, "propostas.novas_grupo_max") ?? 2),
    maxPorGrupo: Number(valor(c.config, "propostas.max_por_grupo") ?? 0),
    maxPorEixo: Number(valor(c.config, "propostas.max_por_eixo") ?? 0),
    trava: (valor<string | null>(c.config, "propostas.trava_relatorio") as string | null) ?? null,
    abrangencias: abrangencias(valor<string>(c.config, "propostas.abrangencias") as string),
    consensoDebate: valor<boolean>(c.config, "propostas.consenso_debate") !== false,
    haVotacao: valor<boolean>(c.config, "apreciacao.ha_votacao") === true,
    aprovaDireto: Number(valor(c.config, "apreciacao.aprova_direto") ?? 0),
    vencidaSobe: Number(valor(c.config, "apreciacao.vencida_sobe") ?? 0),
    minimoGrupos: (valor<string>(c.config, "apreciacao.minimo_grupos") ?? "um") as MinimoGrupos,
    maioria: (valor<string>(c.config, "plenaria.maioria") ?? "simples") as Maioria,
    semOposicao: valor<boolean>(c.config, "plenaria.sem_oposicao") !== false,
    emBloco: valor<boolean>(c.config, "plenaria.em_bloco") !== false,
    destaqueNome: valor<boolean>(c.config, "plenaria.destaque_nome") !== false,
    formaVoto: valor<string>(c.config, "plenaria.forma_voto") ?? "cracha",
    temGrupos: valor<boolean>(c.config, "programa.tem_grupos") !== false,
    funcoesGrupo: valor<string>(c.config, "programa.funcoes_grupo") ?? "eleitas",
  }
}
export type RegrasRelatoria = ReturnType<typeof regrasDaRelatoria>

// ── Leitura ─────────────────────────────────────────────────────────────────

async function lerPropostas(tenantId: string, congressoId: string): Promise<Proposta[]> {
  const admin = await createAdminClient()
  const linhas = await lerEmLotes<Record<string, unknown>>((de, ate) =>
    admin
      .from("congresso_propostas")
      .select(CAMPOS_PROPOSTA)
      .eq("emp_proprietaria_id", tenantId)
      .eq("congresso_id", congressoId)
      .order("numero")
      .range(de, ate)
  )
  return linhas.map(paraProposta)
}

async function lerApontamentos(tenantId: string, congressoId: string, grupoId?: string): Promise<Apontamento[]> {
  const admin = await createAdminClient()
  const linhas = await lerEmLotes<Record<string, unknown>>((de, ate) => {
    let q = admin
      .from("congresso_apontamentos")
      .select("id, grupo_id, proposta_id, tipo, texto, autor, retirado_em, created_at")
      .eq("emp_proprietaria_id", tenantId)
      .eq("congresso_id", congressoId)
    if (grupoId) q = q.eq("grupo_id", grupoId)
    return q.order("created_at").range(de, ate)
  })
  return linhas.map(paraApontamento)
}

async function lerApreciacoes(tenantId: string, congressoId: string): Promise<Apreciacao[]> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("congresso_apreciacoes")
    .select("id, grupo_id, proposta_id, a_favor, contra, abstencao, resultado")
    .eq("emp_proprietaria_id", tenantId)
    .eq("congresso_id", congressoId)
  return (data ?? []).map((r) => ({
    id: r.id as string,
    grupoId: r.grupo_id as string,
    propostaId: r.proposta_id as string,
    aFavor: r.a_favor as number,
    contra: r.contra as number,
    abstencao: r.abstencao as number,
    resultado: r.resultado as ResultadoApreciacao,
  }))
}

async function lerFuncoes(tenantId: string, congressoId: string): Promise<FuncaoNoGrupo[]> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("congresso_grupo_funcoes")
    .select("id, grupo_id, participante_id, funcao, escolha, participante:congresso_participantes(nome, nome_social)")
    .eq("emp_proprietaria_id", tenantId)
    .eq("congresso_id", congressoId)
  return (data ?? []).map((r) => {
    const p = (Array.isArray(r.participante) ? r.participante[0] : r.participante) as { nome: string; nome_social: string | null } | null
    return {
      id: r.id as string,
      grupoId: r.grupo_id as string,
      participanteId: r.participante_id as string,
      funcao: r.funcao as FuncaoGrupo,
      escolha: r.escolha as "eleita" | "indicada",
      nome: p?.nome_social ?? p?.nome ?? "—",
    }
  })
}

async function lerVotacoes(tenantId: string, congressoId: string): Promise<Votacao[]> {
  const admin = await createAdminClient()
  const [{ data: vs }, { data: itens }] = await Promise.all([
    admin
      .from("congresso_votacoes")
      .select("id, tipo, forma, a_favor, contra, abstencao, maioria, base_votantes, resultado, observacao, created_at")
      .eq("emp_proprietaria_id", tenantId)
      .eq("congresso_id", congressoId)
      .is("desfeita_em", null)
      .order("created_at"),
    admin.from("congresso_votacao_itens").select("votacao_id, proposta_id, mocao_id").eq("emp_proprietaria_id", tenantId).eq("congresso_id", congressoId),
  ])
  const porVotacao = new Map<string, string[]>()
  const mocoesPorVotacao = new Map<string, string[]>()
  for (const i of itens ?? []) {
    const k = i.votacao_id as string
    if (i.proposta_id) porVotacao.set(k, [...(porVotacao.get(k) ?? []), i.proposta_id as string])
    if (i.mocao_id) mocoesPorVotacao.set(k, [...(mocoesPorVotacao.get(k) ?? []), i.mocao_id as string])
  }
  return (vs ?? []).map((v) => ({
    id: v.id as string,
    tipo: v.tipo as Votacao["tipo"],
    forma: v.forma as FormaVotacao,
    aFavor: (v.a_favor as number | null) ?? null,
    contra: (v.contra as number | null) ?? null,
    abstencao: (v.abstencao as number | null) ?? null,
    maioria: v.maioria as string,
    baseVotantes: (v.base_votantes as number | null) ?? null,
    resultado: v.resultado as ResultadoPlenaria,
    observacao: (v.observacao as string | null) ?? null,
    createdAt: v.created_at as string,
    propostaIds: porVotacao.get(v.id as string) ?? [],
    mocaoIds: mocoesPorVotacao.get(v.id as string) ?? [],
  }))
}

export type DadosRelatoria = {
  eixos: Eixo[]
  grupos: (Grupo & { relatorioEntregueEm: string | null; relatorioEntreguePor: string | null })[]
  propostas: Proposta[]
  apontamentos: Apontamento[]
  apreciacoes: Apreciacao[]
  funcoes: FuncaoNoGrupo[]
  votacoes: Votacao[]
  regras: RegrasRelatoria
  alertasCota: string[]
}

async function gruposComEntrega(tenantId: string, congressoId: string, grupos: Grupo[]) {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("congresso_grupos")
    .select("id, relatorio_entregue_em, relatorio_entregue_por")
    .eq("emp_proprietaria_id", tenantId)
    .eq("congresso_id", congressoId)
  const m = new Map((data ?? []).map((g) => [g.id as string, g]))
  return grupos.map((g) => ({
    ...g,
    relatorioEntregueEm: (m.get(g.id)?.relatorio_entregue_em as string | null) ?? null,
    relatorioEntreguePor: (m.get(g.id)?.relatorio_entregue_por as string | null) ?? null,
  }))
}

export async function dadosDaRelatoria(c: Congresso): Promise<DadosRelatoria> {
  const emp = await tenantAtual()
  const [programa, propostas, apontamentos, apreciacoes, funcoes, votacoes] = await Promise.all([
    listarPrograma(c.id),
    lerPropostas(emp, c.id),
    lerApontamentos(emp, c.id),
    lerApreciacoes(emp, c.id),
    lerFuncoes(emp, c.id),
    lerVotacoes(emp, c.id),
  ])
  const regras = regrasDaRelatoria(c)
  const grupos = await gruposComEntrega(emp, c.id, programa.grupos)
  const nomeGrupo = new Map(grupos.map((g) => [g.id, g.nome]))
  const nomeEixo = new Map(programa.eixos.map((e) => [e.id, e.nome]))
  const alertasCota = conferirCotas(
    propostas
      .filter((p) => p.grupoId && p.origem === "grupo" && !["fundida", "retirada"].includes(p.situacao))
      .map((p) => ({ grupo: nomeGrupo.get(p.grupoId!) ?? "Grupo", eixo: p.eixoId ? (nomeEixo.get(p.eixoId) ?? null) : null })),
    { porGrupo: regras.maxPorGrupo, porEixo: regras.maxPorEixo }
  )
  return { eixos: programa.eixos, grupos, propostas, apontamentos, apreciacoes, funcoes, votacoes, regras, alertasCota }
}

export type DadosDoGrupo = {
  grupo: Grupo & { relatorioEntregueEm: string | null; relatorioEntreguePor: string | null }
  eixo: Eixo | null
  eixos: Eixo[]
  /** Propostas do eixo do grupo (caderno, etapas) e as novas do próprio grupo. */
  propostas: Proposta[]
  apontamentos: Apontamento[]
  apreciacoes: Apreciacao[]
  funcoes: FuncaoNoGrupo[]
  regras: RegrasRelatoria
  travado: { travado: boolean; motivo?: string }
  novas: { pode: boolean; motivo?: string; registradas: number }
}

async function montarGrupo(c: Congresso, tenantId: string, grupoId: string): Promise<DadosDoGrupo | null> {
  const programa = await programaPorTenant(tenantId, c.id)
  const g = programa.grupos.find((x) => x.id === grupoId)
  if (!g) return null
  const [grupos, propostas, apontamentos, apreciacoes, funcoes] = await Promise.all([
    gruposComEntrega(tenantId, c.id, [g]),
    lerPropostas(tenantId, c.id),
    lerApontamentos(tenantId, c.id, grupoId),
    lerApreciacoes(tenantId, c.id),
    lerFuncoes(tenantId, c.id),
  ])
  const grupo = grupos[0]
  const regras = regrasDaRelatoria(c)
  const doGrupo = propostas.filter(
    (p) =>
      p.situacao !== "fundida" &&
      p.situacao !== "retirada" &&
      (p.grupoId === grupoId || (!p.grupoId && (!g.eixoId || p.eixoId === g.eixoId)))
  )
  const novasRegistradas = propostas.filter((p) => p.grupoId === grupoId && p.origem === "grupo").length
  return {
    grupo,
    eixo: programa.eixos.find((e) => e.id === g.eixoId) ?? null,
    eixos: programa.eixos,
    propostas: doGrupo,
    apontamentos: apontamentos.filter((a) => !a.retiradoEm),
    apreciacoes: apreciacoes.filter((a) => a.grupoId === grupoId),
    funcoes: funcoes.filter((f) => f.grupoId === grupoId),
    regras,
    travado: grupoTravado({ trava: regras.trava, entregueEm: grupo.relatorioEntregueEm }),
    novas: { ...podeNovaNoGrupo(regras.novasGrupo, regras.novasGrupoMax, novasRegistradas), registradas: novasRegistradas },
  }
}

/** listarPrograma usa o tenant da sessão; o caminho do link pessoal passa o tenant. */
async function programaPorTenant(tenantId: string, congressoId: string): Promise<{ eixos: Eixo[]; grupos: Grupo[] }> {
  const admin = await createAdminClient()
  const [{ data: eixos }, { data: grupos }] = await Promise.all([
    admin.from("congresso_eixos").select("id, nome, descricao, ordem").eq("emp_proprietaria_id", tenantId).eq("congresso_id", congressoId).order("ordem"),
    admin.from("congresso_grupos").select("id, nome, eixo_id, sala, vagas, ordem").eq("emp_proprietaria_id", tenantId).eq("congresso_id", congressoId).order("ordem"),
  ])
  return {
    eixos: (eixos ?? []).map((e) => ({ id: e.id as string, nome: e.nome as string, descricao: (e.descricao as string | null) ?? null, ordem: e.ordem as number })),
    grupos: (grupos ?? []).map((g) => ({
      id: g.id as string,
      nome: g.nome as string,
      eixoId: (g.eixo_id as string | null) ?? null,
      sala: (g.sala as string | null) ?? null,
      vagas: (g.vagas as number | null) ?? null,
      ordem: g.ordem as number,
    })),
  }
}

export async function dadosDoGrupo(c: Congresso, grupoId: string): Promise<DadosDoGrupo | null> {
  return montarGrupo(c, await tenantAtual(), grupoId)
}

// ── Relatoria pelo link pessoal ─────────────────────────────────────────────

export type AcessoRelatoria = {
  tenantId: string
  congresso: Congresso
  participanteId: string
  nome: string
  grupos: { id: string; nome: string; funcao: FuncaoGrupo }[]
}

/**
 * Quem tem função no grupo (coordenação ou relatoria) opera a relatoria pelo
 * link pessoal. Devolve null se o link não vale ou se a pessoa não tem função.
 */
export async function acessoDeRelatoria(
  token: string,
  tenantId: string,
  carregarCongresso: (id: string, tenantId: string) => Promise<Congresso | null>
): Promise<AcessoRelatoria | null> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null
  const admin = await createAdminClient()
  const { data: p } = await admin
    .from("congresso_participantes")
    .select("id, congresso_id, nome, nome_social, situacao")
    .eq("emp_proprietaria_id", tenantId)
    .eq("token_hash", hashToken(token))
    .maybeSingle()
  if (!p || p.situacao === "cancelado" || p.situacao === "recusado") return null
  const { data: fs } = await admin
    .from("congresso_grupo_funcoes")
    .select("grupo_id, funcao, grupo:congresso_grupos(nome)")
    .eq("emp_proprietaria_id", tenantId)
    .eq("participante_id", p.id)
  if (!fs?.length) return null
  const c = await carregarCongresso(p.congresso_id as string, tenantId)
  if (!c) return null
  return {
    tenantId,
    congresso: c,
    participanteId: p.id as string,
    nome: ((p.nome_social as string | null) ?? (p.nome as string)) as string,
    grupos: fs.map((f) => {
      const g = (Array.isArray(f.grupo) ? f.grupo[0] : f.grupo) as { nome: string } | null
      return { id: f.grupo_id as string, nome: g?.nome ?? "Grupo", funcao: f.funcao as FuncaoGrupo }
    }),
  }
}

export async function dadosDoGrupoPorLink(acesso: AcessoRelatoria, grupoId: string): Promise<DadosDoGrupo | null> {
  if (!acesso.grupos.some((g) => g.id === grupoId)) return null
  return montarGrupo(acesso.congresso, acesso.tenantId, grupoId)
}

// ── Escrita: grupo ──────────────────────────────────────────────────────────

type Contexto = { c: Congresso; tenantId: string; autor: Autor }

async function travaDoGrupo(ctx: Contexto, grupoId: string): Promise<string | null> {
  const admin = await createAdminClient()
  const { data: g } = await admin
    .from("congresso_grupos")
    .select("relatorio_entregue_em")
    .eq("emp_proprietaria_id", ctx.tenantId)
    .eq("congresso_id", ctx.c.id)
    .eq("id", grupoId)
    .maybeSingle()
  if (!g) return "Grupo não encontrado."
  const t = grupoTravado({ trava: regrasDaRelatoria(ctx.c).trava, entregueEm: (g.relatorio_entregue_em as string | null) ?? null })
  return t.travado ? (t.motivo ?? "Grupo travado.") : null
}

async function proximoNumero(tenantId: string, congressoId: string): Promise<number> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("congresso_propostas")
    .select("numero")
    .eq("emp_proprietaria_id", tenantId)
    .eq("congresso_id", congressoId)
    .order("numero", { ascending: false })
    .limit(1)
  return ((data?.[0]?.numero as number | undefined) ?? 0) + 1
}

/** Insere a proposta e a versão 1. Tenta de novo se dois registrarem o mesmo número ao mesmo tempo. */
async function inserirProposta(
  ctx: Contexto,
  dados: { texto: string; eixoId: string | null; grupoId: string | null; origem: OrigemProposta; origemDescricao: string | null; abrangencia: string | null; situacao?: SituacaoProposta }
): Promise<{ id?: string; numero?: number; erro?: string }> {
  const r = await inserirPropostas(ctx, { ...dados, textos: [dados.texto] })
  return r.erro ? { erro: r.erro } : { id: r.criadas[0]?.id, numero: r.criadas[0]?.numero }
}

/**
 * Insere várias propostas de uma vez (numeração seguida) e a versão 1 de cada,
 * em duas idas ao banco — o caderno de teses chega a centenas de itens. Tenta
 * de novo se outra pessoa numerou ao mesmo tempo.
 */
async function inserirPropostas(
  ctx: Contexto,
  dados: { textos: string[]; eixoId: string | null; grupoId: string | null; origem: OrigemProposta; origemDescricao: string | null; abrangencia: string | null; situacao?: SituacaoProposta }
): Promise<{ criadas: { id: string; numero: number }[]; erro?: string }> {
  const textos = dados.textos.map((t) => t.trim())
  if (!textos.length || textos.some((t) => t.length < 5)) return { criadas: [], erro: "Escreva o texto da proposta." }
  const admin = await createAdminClient()
  for (let tentativa = 0; tentativa < 4; tentativa++) {
    const primeiro = await proximoNumero(ctx.tenantId, ctx.c.id)
    const { data, error } = await admin
      .from("congresso_propostas")
      .insert(
        textos.map((texto, i) => ({
          emp_proprietaria_id: ctx.tenantId,
          congresso_id: ctx.c.id,
          numero: primeiro + i,
          eixo_id: dados.eixoId,
          grupo_id: dados.grupoId,
          origem: dados.origem,
          origem_descricao: dados.origemDescricao,
          abrangencia: dados.abrangencia,
          texto,
          situacao: dados.situacao ?? "em_debate",
          ordem: primeiro + i,
          criada_por: ctx.autor.nome,
        }))
      )
      .select("id, numero, texto")
    if (error) {
      if (error.code === "23505") continue
      return { criadas: [], erro: error.message }
    }
    const linhas = (data ?? []).map((d) => ({ id: d.id as string, numero: d.numero as number, texto: d.texto as string })).sort((a, b) => a.numero - b.numero)
    await admin.from("congresso_proposta_versoes").insert(
      linhas.map((l) => ({
        emp_proprietaria_id: ctx.tenantId,
        congresso_id: ctx.c.id,
        proposta_id: l.id,
        versao: 1,
        texto: l.texto,
        motivo: dados.origem === "fusao" ? "fusao" : "criada",
        autor: ctx.autor.nome,
      }))
    )
    return { criadas: linhas.map(({ id, numero }) => ({ id, numero })) }
  }
  return { criadas: [], erro: "Não foi possível numerar as propostas agora. Tente de novo." }
}

/** Proposta nova registrada pela relatoria do grupo (respeita a regra de propostas novas e a trava). */
export async function novaPropostaNoGrupo(
  ctx: Contexto,
  grupoId: string,
  dados: { texto: string; abrangencia: string | null }
): Promise<{ erro?: string; numero?: number }> {
  const trava = await travaDoGrupo(ctx, grupoId)
  if (trava) return { erro: trava }
  const g = await montarGrupo(ctx.c, ctx.tenantId, grupoId)
  if (!g) return { erro: "Grupo não encontrado." }
  if (!g.novas.pode) return { erro: g.novas.motivo }
  return inserirProposta(ctx, { texto: dados.texto, eixoId: g.grupo.eixoId, grupoId, origem: "grupo", origemDescricao: null, abrangencia: dados.abrangencia })
}

/** Caderno de teses, etapa anterior ou documento: várias de uma vez (comissão/relatoria). */
export async function novasPropostas(
  ctx: Contexto,
  dados: { textos: string[]; eixoId: string | null; origem: OrigemProposta; origemDescricao: string | null; abrangencia: string | null; situacao?: SituacaoProposta }
): Promise<{ erro?: string; criadas: number }> {
  const r = await inserirPropostas(ctx, { ...dados, grupoId: null })
  return r.erro ? { erro: r.erro, criadas: 0 } : { criadas: r.criadas.length }
}

async function lerProposta(ctx: Contexto, id: string): Promise<Proposta | null> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("congresso_propostas")
    .select(CAMPOS_PROPOSTA)
    .eq("emp_proprietaria_id", ctx.tenantId)
    .eq("congresso_id", ctx.c.id)
    .eq("id", id)
    .maybeSingle()
  return data ? paraProposta(data) : null
}

/** Nova versão do texto. Texto já votado não muda; o grupo só altera a sua proposta antes da trava. */
export async function novaVersao(
  ctx: Contexto,
  propostaId: string,
  texto: string,
  motivo: "grupo" | "consolidacao" | "plenaria" | "correcao" | "redacao_ia",
  grupoId?: string
): Promise<{ erro?: string }> {
  const p = await lerProposta(ctx, propostaId)
  if (!p) return { erro: "Proposta não encontrada." }
  if (VOTADA.includes(p.situacao)) return { erro: "Proposta já votada: o texto não muda mais." }
  if (p.situacao === "fundida") return { erro: "Proposta fundida em outra: altere a proposta resultante." }
  if (grupoId) {
    if (p.grupoId !== grupoId) return { erro: "O grupo só altera o texto das propostas que ele criou. Para as demais, registre um apontamento." }
    const trava = await travaDoGrupo(ctx, grupoId)
    if (trava) return { erro: trava }
  }
  const t = texto.trim()
  if (t.length < 5) return { erro: "Escreva o texto da proposta." }
  if (t === p.texto) return {}
  const admin = await createAdminClient()
  const versao = p.versao + 1
  const { error } = await admin.from("congresso_proposta_versoes").insert({
    emp_proprietaria_id: ctx.tenantId,
    congresso_id: ctx.c.id,
    proposta_id: p.id,
    versao,
    texto: t,
    motivo,
    autor: ctx.autor.nome,
  })
  if (error) return { erro: error.code === "23505" ? "Outra pessoa alterou o texto agora. Recarregue e confira." : error.message }
  await admin
    .from("congresso_propostas")
    .update({ texto: t, versao, updated_at: agoraIso() })
    .eq("emp_proprietaria_id", ctx.tenantId)
    .eq("id", p.id)
    .eq("versao", p.versao)
  return {}
}

export async function registrarApontamento(
  ctx: Contexto,
  grupoId: string,
  dados: { propostaId: string | null; tipo: TipoApontamento; texto: string }
): Promise<{ erro?: string }> {
  const trava = await travaDoGrupo(ctx, grupoId)
  if (trava) return { erro: trava }
  const texto = dados.texto.trim()
  if (texto.length < 2) return { erro: "Escreva o apontamento." }
  if (dados.propostaId) {
    const p = await lerProposta(ctx, dados.propostaId)
    if (!p) return { erro: "Proposta não encontrada." }
  }
  const admin = await createAdminClient()
  const { error } = await admin.from("congresso_apontamentos").insert({
    emp_proprietaria_id: ctx.tenantId,
    congresso_id: ctx.c.id,
    grupo_id: grupoId,
    proposta_id: dados.propostaId,
    tipo: dados.tipo,
    texto,
    autor: ctx.autor.nome,
  })
  return error ? { erro: error.message } : {}
}

export async function retirarApontamento(ctx: Contexto, grupoId: string, id: string): Promise<{ erro?: string }> {
  const trava = await travaDoGrupo(ctx, grupoId)
  if (trava) return { erro: trava }
  const admin = await createAdminClient()
  const { error } = await admin
    .from("congresso_apontamentos")
    .update({ retirado_em: agoraIso() })
    .eq("emp_proprietaria_id", ctx.tenantId)
    .eq("congresso_id", ctx.c.id)
    .eq("grupo_id", grupoId)
    .eq("id", id)
  return error ? { erro: error.message } : {}
}

export async function salvarApreciacao(
  ctx: Contexto,
  grupoId: string,
  propostaId: string,
  contagem: { aFavor: number; contra: number; abstencao: number }
): Promise<{ erro?: string; resultado?: ResultadoApreciacao; explicacao?: string }> {
  const regras = regrasDaRelatoria(ctx.c)
  if (!regras.haVotacao) return { erro: "A configuração deste congresso não prevê votação nos grupos." }
  const trava = await travaDoGrupo(ctx, grupoId)
  if (trava) return { erro: trava }
  if ([contagem.aFavor, contagem.contra, contagem.abstencao].some((n) => !Number.isInteger(n) || n < 0)) return { erro: "Informe números inteiros." }
  const r = classificarApreciacao(contagem, { aprovaDireto: regras.aprovaDireto, vencidaSobe: regras.vencidaSobe })
  const admin = await createAdminClient()
  const { error } = await admin.from("congresso_apreciacoes").upsert(
    {
      emp_proprietaria_id: ctx.tenantId,
      congresso_id: ctx.c.id,
      grupo_id: grupoId,
      proposta_id: propostaId,
      a_favor: contagem.aFavor,
      contra: contagem.contra,
      abstencao: contagem.abstencao,
      resultado: r.resultado,
      autor: ctx.autor.nome,
      updated_at: agoraIso(),
    },
    { onConflict: "grupo_id,proposta_id" }
  )
  return error ? { erro: error.message } : r
}

/** Entrega o relatório: o grupo trava e as propostas novas dele passam a "entregue". */
export async function entregarRelatorio(ctx: Contexto, grupoId: string): Promise<{ erro?: string }> {
  const trava = await travaDoGrupo(ctx, grupoId)
  if (trava && !/horário/.test(trava)) return { erro: trava }
  const admin = await createAdminClient()
  const { error } = await admin
    .from("congresso_grupos")
    .update({ relatorio_entregue_em: agoraIso(), relatorio_entregue_por: ctx.autor.nome })
    .eq("emp_proprietaria_id", ctx.tenantId)
    .eq("congresso_id", ctx.c.id)
    .eq("id", grupoId)
    .is("relatorio_entregue_em", null)
  if (error) return { erro: error.message }
  await admin
    .from("congresso_propostas")
    .update({ situacao: "entregue", updated_at: agoraIso() })
    .eq("emp_proprietaria_id", ctx.tenantId)
    .eq("congresso_id", ctx.c.id)
    .eq("grupo_id", grupoId)
    .eq("situacao", "em_debate")
  return {}
}

/** Reabre o relatório (só pelo painel), para correção combinada com a relatoria. */
export async function reabrirRelatorio(ctx: Contexto, grupoId: string): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin
    .from("congresso_grupos")
    .update({ relatorio_entregue_em: null, relatorio_entregue_por: null })
    .eq("emp_proprietaria_id", ctx.tenantId)
    .eq("congresso_id", ctx.c.id)
    .eq("id", grupoId)
  if (error) return { erro: error.message }
  await admin
    .from("congresso_propostas")
    .update({ situacao: "em_debate", updated_at: agoraIso() })
    .eq("emp_proprietaria_id", ctx.tenantId)
    .eq("congresso_id", ctx.c.id)
    .eq("grupo_id", grupoId)
    .eq("situacao", "entregue")
  return {}
}

// ── Funções no grupo ────────────────────────────────────────────────────────

export async function definirFuncao(
  ctx: Contexto,
  grupoId: string,
  participanteId: string,
  funcao: FuncaoGrupo,
  escolha: "eleita" | "indicada"
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { data: p } = await admin
    .from("congresso_participantes")
    .select("id, situacao")
    .eq("emp_proprietaria_id", ctx.tenantId)
    .eq("congresso_id", ctx.c.id)
    .eq("id", participanteId)
    .maybeSingle()
  if (!p) return { erro: "Participante não encontrado." }
  if (p.situacao === "cancelado" || p.situacao === "recusado") return { erro: "Participante com inscrição cancelada ou recusada." }
  const { error } = await admin.from("congresso_grupo_funcoes").upsert(
    { emp_proprietaria_id: ctx.tenantId, congresso_id: ctx.c.id, grupo_id: grupoId, participante_id: participanteId, funcao, escolha },
    { onConflict: "grupo_id,participante_id,funcao" }
  )
  return error ? { erro: error.message } : {}
}

export async function removerFuncao(ctx: Contexto, id: string): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin.from("congresso_grupo_funcoes").delete().eq("emp_proprietaria_id", ctx.tenantId).eq("congresso_id", ctx.c.id).eq("id", id)
  return error ? { erro: error.message } : {}
}

/** Participantes que podem receber função (para a escolha na tela). */
export async function opcoesDeFuncao(congressoId: string): Promise<{ id: string; nome: string; grupoId: string | null }[]> {
  const ps = await listarParticipantes(congressoId)
  return ps
    .filter((p) => p.situacao !== "cancelado" && p.situacao !== "recusado")
    .map((p) => ({ id: p.id, nome: p.nomeSocial ?? p.nome, grupoId: p.grupoId }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
}

// ── Consolidação ────────────────────────────────────────────────────────────

/** Funde propostas num texto único; as de origem ficam "fundidas", com o vínculo guardado. */
export async function fundirPropostas(
  ctx: Contexto,
  ids: string[],
  dados: { texto: string; eixoId: string | null; abrangencia: string | null }
): Promise<{ erro?: string; numero?: number }> {
  const unicos = [...new Set(ids)]
  if (unicos.length < 2) return { erro: "Escolha ao menos duas propostas para fundir." }
  const origens = (await Promise.all(unicos.map((id) => lerProposta(ctx, id)))).filter((p): p is Proposta => !!p)
  if (origens.length !== unicos.length) return { erro: "Proposta não encontrada." }
  const invalida = origens.find((p) => VOTADA.includes(p.situacao) || p.situacao === "fundida" || p.situacao === "retirada")
  if (invalida) return { erro: `A proposta ${invalida.numero} não pode ser fundida (${ROTULO_SITUACAO_PROPOSTA[invalida.situacao].toLowerCase()}).` }
  const nova = await inserirProposta(ctx, {
    texto: dados.texto,
    eixoId: dados.eixoId,
    grupoId: null,
    origem: "fusao",
    origemDescricao: `Fusão das propostas ${origens.map((p) => p.numero).join(", ")}`,
    abrangencia: dados.abrangencia,
    situacao: "entregue",
  })
  if (nova.erro || !nova.id) return { erro: nova.erro }
  const admin = await createAdminClient()
  await admin.from("congresso_proposta_origens").insert(
    origens.map((o) => ({ emp_proprietaria_id: ctx.tenantId, congresso_id: ctx.c.id, proposta_id: nova.id, origem_id: o.id }))
  )
  await admin
    .from("congresso_propostas")
    .update({ situacao: "fundida", fundida_em: nova.id, updated_at: agoraIso() })
    .eq("emp_proprietaria_id", ctx.tenantId)
    .in("id", origens.map((o) => o.id))
  return { numero: nova.numero }
}

/** Desfaz uma fusão ainda não votada: as origens voltam a "entregue" e a fundida é retirada. */
export async function desfazerFusao(ctx: Contexto, propostaId: string): Promise<{ erro?: string }> {
  const p = await lerProposta(ctx, propostaId)
  if (!p || p.origem !== "fusao") return { erro: "Esta proposta não nasceu de uma fusão." }
  if (VOTADA.includes(p.situacao)) return { erro: "A fusão já foi votada e não pode ser desfeita." }
  const admin = await createAdminClient()
  await admin
    .from("congresso_propostas")
    .update({ situacao: "entregue", fundida_em: null, updated_at: agoraIso() })
    .eq("emp_proprietaria_id", ctx.tenantId)
    .eq("fundida_em", p.id)
  await admin
    .from("congresso_propostas")
    .update({ situacao: "retirada", updated_at: agoraIso() })
    .eq("emp_proprietaria_id", ctx.tenantId)
    .eq("id", p.id)
  return {}
}

const MUDANCA_LIVRE: SituacaoProposta[] = ["em_debate", "entregue", "plenaria", "anais", "retirada"]

/** Eixo, abrangência, consenso/debate, ordem e situação (sem passar por votação). */
export async function ajustarPropostas(
  ctx: Contexto,
  ids: string[],
  dados: { eixoId?: string | null; abrangencia?: string | null; classificacao?: "consenso" | "debate" | null; situacao?: SituacaoProposta; ordem?: number }
): Promise<{ erro?: string; alteradas?: number }> {
  if (!ids.length) return { erro: "Escolha ao menos uma proposta." }
  if (dados.situacao && !MUDANCA_LIVRE.includes(dados.situacao)) return { erro: "Aprovar ou rejeitar só pela votação da plenária." }
  const admin = await createAdminClient()
  const { data: atuais } = await admin
    .from("congresso_propostas")
    .select("id, numero, situacao")
    .eq("emp_proprietaria_id", ctx.tenantId)
    .eq("congresso_id", ctx.c.id)
    .in("id", ids)
  const bloqueada = (atuais ?? []).find((p) => VOTADA.includes(p.situacao as SituacaoProposta) || p.situacao === "fundida")
  if (bloqueada) return { erro: `A proposta ${bloqueada.numero} já foi ${bloqueada.situacao === "fundida" ? "fundida" : "votada"} e não muda.` }
  const upd: Record<string, unknown> = { updated_at: agoraIso() }
  if (dados.eixoId !== undefined) upd.eixo_id = dados.eixoId
  if (dados.abrangencia !== undefined) upd.abrangencia = dados.abrangencia
  if (dados.classificacao !== undefined) upd.classificacao = dados.classificacao
  if (dados.situacao) upd.situacao = dados.situacao
  if (dados.ordem !== undefined) upd.ordem = dados.ordem
  const { error } = await admin.from("congresso_propostas").update(upd).eq("emp_proprietaria_id", ctx.tenantId).eq("congresso_id", ctx.c.id).in("id", ids)
  return error ? { erro: error.message } : { alteradas: atuais?.length ?? 0 }
}

/**
 * Aplica a apreciação dos grupos às propostas ainda não decididas: aprovada
 * direto, à pauta da plenária ou rejeitada, pela regra configurada.
 */
export async function aplicarResultadoDosGrupos(ctx: Contexto): Promise<{ erro?: string; plenaria: number; aprovadas: number; rejeitadas: number }> {
  const regras = regrasDaRelatoria(ctx.c)
  const vazio = { plenaria: 0, aprovadas: 0, rejeitadas: 0 }
  if (!regras.haVotacao) return { erro: "A configuração não prevê votação nos grupos.", ...vazio }
  const [propostas, apreciacoes] = await Promise.all([lerPropostas(ctx.tenantId, ctx.c.id), lerApreciacoes(ctx.tenantId, ctx.c.id)])
  const porProposta = new Map<string, ResultadoApreciacao[]>()
  for (const a of apreciacoes) porProposta.set(a.propostaId, [...(porProposta.get(a.propostaId) ?? []), a.resultado])
  const alvo: Record<"plenaria" | "aprovada" | "rejeitada", string[]> = { plenaria: [], aprovada: [], rejeitada: [] }
  for (const p of propostas) {
    if (!["em_debate", "entregue"].includes(p.situacao)) continue
    const rs = porProposta.get(p.id)
    if (!rs?.length) continue
    const d = destinoPelosGrupos(rs, regras.minimoGrupos)
    if (d.destino !== "pendente") alvo[d.destino].push(p.id)
  }
  const admin = await createAdminClient()
  for (const [situacao, ids] of Object.entries(alvo)) {
    if (!ids.length) continue
    await admin.from("congresso_propostas").update({ situacao, updated_at: agoraIso() }).eq("emp_proprietaria_id", ctx.tenantId).in("id", ids)
  }
  return { plenaria: alvo.plenaria.length, aprovadas: alvo.aprovada.length, rejeitadas: alvo.rejeitada.length }
}

// ── Plenária ────────────────────────────────────────────────────────────────

export async function pedirDestaque(ctx: Contexto, propostaId: string, nome: string | null): Promise<{ erro?: string }> {
  const p = await lerProposta(ctx, propostaId)
  if (!p) return { erro: "Proposta não encontrada." }
  if (p.situacao !== "plenaria") return { erro: "Só se destaca proposta da pauta da plenária." }
  const regras = regrasDaRelatoria(ctx.c)
  if (regras.destaqueNome && !nome?.trim()) return { erro: "O regimento manda registrar quem pediu o destaque." }
  const admin = await createAdminClient()
  const { error } = await admin
    .from("congresso_propostas")
    .update({ destaque_por: nome?.trim() || "Plenária", destaque_em: agoraIso(), classificacao: "debate", updated_at: agoraIso() })
    .eq("emp_proprietaria_id", ctx.tenantId)
    .eq("id", propostaId)
  return error ? { erro: error.message } : {}
}

export async function retirarDestaque(ctx: Contexto, propostaId: string): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin
    .from("congresso_propostas")
    .update({ destaque_por: null, destaque_em: null, updated_at: agoraIso() })
    .eq("emp_proprietaria_id", ctx.tenantId)
    .eq("congresso_id", ctx.c.id)
    .eq("id", propostaId)
  return error ? { erro: error.message } : {}
}

export type DadosPlenaria = {
  propostas: Proposta[]
  mocoes: Mocao[]
  votacoes: Votacao[]
  eixos: Eixo[]
  grupos: Grupo[]
  regras: RegrasRelatoria
  emExercicio: number
  presentesVotantes: number
  sessao: { id: string; titulo: string } | null
}

export async function dadosDaPlenaria(c: Congresso, sessaoId?: string | null): Promise<DadosPlenaria> {
  const emp = await tenantAtual()
  const [programa, propostas, votacoes, dia, mocoes] = await Promise.all([
    listarPrograma(c.id),
    lerPropostas(emp, c.id),
    lerVotacoes(emp, c.id),
    painelDoDia(c, sessaoId).catch(() => null),
    mocoesDaPlenaria(c).catch(() => [] as Mocao[]),
  ])
  return {
    mocoes,
    propostas: propostas.filter((p) => ["plenaria", "aprovada", "rejeitada"].includes(p.situacao)).sort((a, b) => a.ordem - b.ordem || a.numero - b.numero),
    votacoes,
    eixos: programa.eixos,
    grupos: programa.grupos,
    regras: regrasDaRelatoria(c),
    emExercicio: dia?.emExercicio ?? 0,
    presentesVotantes: dia?.presentesVotantes ?? 0,
    sessao: dia?.sessao ? { id: dia.sessao.id, titulo: dia.sessao.titulo } : null,
  }
}

export async function registrarVotacao(
  ctx: Contexto,
  d: {
    propostaIds: string[]
    mocaoIds?: string[]
    forma: FormaVotacao
    aFavor?: number | null
    contra?: number | null
    abstencao?: number | null
    declarado?: ResultadoPlenaria | null
    sessaoId?: string | null
    observacao?: string | null
  }
): Promise<{ erro?: string; resultado?: ResultadoPlenaria; explicacao?: string }> {
  const ids = [...new Set(d.propostaIds)]
  const mocaoIds = [...new Set(d.mocaoIds ?? [])]
  if (!ids.length && !mocaoIds.length) return { erro: "Escolha o que foi votado." }
  if (ids.length && mocaoIds.length) return { erro: "Vote propostas e moções separadamente." }
  const regras = regrasDaRelatoria(ctx.c)
  if (ids.length + mocaoIds.length > 1 && !regras.emBloco) return { erro: "A configuração não prevê votação em bloco: vote uma a uma." }
  if (d.forma === "sem_oposicao" && !regras.semOposicao) return { erro: "A configuração não prevê aprovação sem oposição: registre a votação." }
  const admin = await createAdminClient()
  if (mocaoIds.length) {
    const { data: ms } = await admin
      .from("congresso_mocoes")
      .select("id, numero, situacao")
      .eq("emp_proprietaria_id", ctx.tenantId)
      .eq("congresso_id", ctx.c.id)
      .in("id", mocaoIds)
    if ((ms ?? []).length !== mocaoIds.length) return { erro: "Moção não encontrada." }
    const foraM = (ms ?? []).find((m) => m.situacao !== "habilitada")
    if (foraM) return { erro: `A moção ${foraM.numero} não está habilitada para a plenária.` }
  }
  const { data: ps } = ids.length
    ? await admin
        .from("congresso_propostas")
        .select("id, numero, situacao, destaque_por")
        .eq("emp_proprietaria_id", ctx.tenantId)
        .eq("congresso_id", ctx.c.id)
        .in("id", ids)
    : { data: [] as { id: string; numero: number; situacao: string; destaque_por: string | null }[] }
  if ((ps ?? []).length !== ids.length) return { erro: "Proposta não encontrada." }
  const fora = (ps ?? []).find((p) => p.situacao !== "plenaria")
  if (fora) return { erro: `A proposta ${fora.numero} não está na pauta da plenária.` }
  if (ids.length > 1) {
    const destacada = (ps ?? []).find((p) => p.destaque_por)
    if (destacada) return { erro: `A proposta ${destacada.numero} foi destacada: vote-a separadamente.` }
  }
  const dia = d.forma === "contagem" || d.forma === "urna" ? await painelDoDia(ctx.c, d.sessaoId).catch(() => null) : null
  const r = resultadoPlenaria({
    forma: d.forma,
    maioria: regras.maioria,
    aFavor: d.aFavor,
    contra: d.contra,
    abstencao: d.abstencao,
    credenciadosComVoto: dia?.emExercicio,
    declarado: d.declarado,
  })
  if (r.erro || !r.resultado) return { erro: r.erro }
  const { data: v, error } = await admin
    .from("congresso_votacoes")
    .insert({
      emp_proprietaria_id: ctx.tenantId,
      congresso_id: ctx.c.id,
      sessao_id: d.sessaoId ?? null,
      tipo: ids.length + mocaoIds.length > 1 ? "bloco" : "proposta",
      forma: d.forma,
      a_favor: d.aFavor ?? null,
      contra: d.contra ?? null,
      abstencao: d.abstencao ?? null,
      maioria: regras.maioria,
      base_votantes: dia?.emExercicio ?? null,
      resultado: r.resultado,
      observacao: d.observacao?.trim() || null,
      registrado_por: ctx.autor.usuarioId ?? null,
    })
    .select("id")
    .single()
  if (error) return { erro: error.message }
  await admin.from("congresso_votacao_itens").insert([
    ...ids.map((id) => ({ emp_proprietaria_id: ctx.tenantId, congresso_id: ctx.c.id, votacao_id: v.id, proposta_id: id })),
    ...mocaoIds.map((id) => ({ emp_proprietaria_id: ctx.tenantId, congresso_id: ctx.c.id, votacao_id: v.id, mocao_id: id })),
  ])
  if (r.resultado !== "empate") {
    if (ids.length) await admin.from("congresso_propostas").update({ situacao: r.resultado, updated_at: agoraIso() }).eq("emp_proprietaria_id", ctx.tenantId).in("id", ids)
    if (mocaoIds.length) {
      await admin.from("congresso_mocoes").update({ situacao: r.resultado, updated_at: agoraIso() }).eq("emp_proprietaria_id", ctx.tenantId).in("id", mocaoIds)
      await admin.from("congresso_mocao_eventos").insert(
        mocaoIds.map((id) => ({ emp_proprietaria_id: ctx.tenantId, congresso_id: ctx.c.id, mocao_id: id, acao: r.resultado, detalhe: { votacao: v.id }, autor: ctx.autor.nome }))
      )
    }
  }
  return { resultado: r.resultado, explicacao: r.explicacao }
}

/** Desfaz um lançamento errado: a votação fica marcada como desfeita e as propostas voltam à pauta. */
export async function desfazerVotacao(ctx: Contexto, votacaoId: string): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { data: v } = await admin
    .from("congresso_votacoes")
    .select("id, desfeita_em")
    .eq("emp_proprietaria_id", ctx.tenantId)
    .eq("congresso_id", ctx.c.id)
    .eq("id", votacaoId)
    .maybeSingle()
  if (!v || v.desfeita_em) return { erro: "Votação não encontrada." }
  const { data: itens } = await admin.from("congresso_votacao_itens").select("proposta_id, mocao_id").eq("emp_proprietaria_id", ctx.tenantId).eq("votacao_id", votacaoId)
  await admin.from("congresso_votacoes").update({ desfeita_em: agoraIso(), desfeita_por: ctx.autor.usuarioId ?? null }).eq("id", votacaoId)
  const ids = (itens ?? []).map((i) => i.proposta_id as string | null).filter((x): x is string => !!x)
  const mocaoIds = (itens ?? []).map((i) => i.mocao_id as string | null).filter((x): x is string => !!x)
  if (ids.length) await admin.from("congresso_propostas").update({ situacao: "plenaria", updated_at: agoraIso() }).eq("emp_proprietaria_id", ctx.tenantId).in("id", ids)
  if (mocaoIds.length) await admin.from("congresso_mocoes").update({ situacao: "habilitada", updated_at: agoraIso() }).eq("emp_proprietaria_id", ctx.tenantId).in("id", mocaoIds)
  return {}
}

// ── Rastro de uma proposta ──────────────────────────────────────────────────

export type RastroProposta = {
  proposta: Proposta
  versoes: { versao: number; texto: string; motivo: string; autor: string | null; createdAt: string }[]
  origens: Proposta[]
  fundidaEm: Proposta | null
  apontamentos: Apontamento[]
  apreciacoes: Apreciacao[]
  votacoes: Votacao[]
}

export async function rastroDaProposta(c: Congresso, propostaId: string): Promise<RastroProposta | null> {
  const emp = await tenantAtual()
  const admin = await createAdminClient()
  const { data: p } = await admin.from("congresso_propostas").select(CAMPOS_PROPOSTA).eq("emp_proprietaria_id", emp).eq("congresso_id", c.id).eq("id", propostaId).maybeSingle()
  if (!p) return null
  const proposta = paraProposta(p)
  const [{ data: vs }, { data: os }, apont, apre, vots] = await Promise.all([
    admin.from("congresso_proposta_versoes").select("versao, texto, motivo, autor, created_at").eq("emp_proprietaria_id", emp).eq("proposta_id", propostaId).order("versao"),
    admin.from("congresso_proposta_origens").select("origem_id").eq("emp_proprietaria_id", emp).eq("proposta_id", propostaId),
    lerApontamentos(emp, c.id),
    lerApreciacoes(emp, c.id),
    lerVotacoes(emp, c.id),
  ])
  const idsOrigem = (os ?? []).map((o) => o.origem_id as string)
  const ligadas = [...idsOrigem, ...(proposta.fundidaEm ? [proposta.fundidaEm] : [])]
  const { data: rel } = ligadas.length
    ? await admin.from("congresso_propostas").select(CAMPOS_PROPOSTA).eq("emp_proprietaria_id", emp).in("id", ligadas)
    : { data: [] as Record<string, unknown>[] }
  const relacionadas = (rel ?? []).map(paraProposta)
  // Apontamentos e apreciações das origens também contam a história da fusão.
  const daHistoria = new Set([propostaId, ...idsOrigem])
  return {
    proposta,
    versoes: (vs ?? []).map((v) => ({ versao: v.versao as number, texto: v.texto as string, motivo: v.motivo as string, autor: (v.autor as string | null) ?? null, createdAt: v.created_at as string })),
    origens: relacionadas.filter((r) => idsOrigem.includes(r.id)).sort((a, b) => a.numero - b.numero),
    fundidaEm: relacionadas.find((r) => r.id === proposta.fundidaEm) ?? null,
    apontamentos: apont.filter((a) => a.propostaId && daHistoria.has(a.propostaId)),
    apreciacoes: apre.filter((a) => daHistoria.has(a.propostaId)),
    votacoes: vots.filter((v) => v.propostaIds.includes(propostaId)),
  }
}

export type { Contexto as ContextoRelatoria }
