import "server-only"

import {
  AJUSTE_POR_CHAVE,
  aplicarMudancas,
  descreverValor,
  normalizarConfig,
  valor,
  type ConfigCongresso,
} from "@/lib/congressos/config"
import {
  alocarPorOrdem,
  configCopiada,
  configDoModelo,
  conferirConsistencia,
  conferirCotaGenero,
  DIREITOS_PADRAO,
  limparCpf,
  MODELOS,
  normalizarDireitos,
  vagasDaBase,
  type Alerta,
  type CategoriaPapel,
  type Direitos,
} from "@/lib/congressos/regras"
import { esquemaAusente, lerEmLotes, nomesDosUsuarios } from "@/lib/db/comum"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Congressos e conferências — leitura e escrita (Fase 1: base, configuração,
 * papéis, delegações, programa e participantes).
 *
 * As regras ficam em src/lib/congressos (puras e testadas); aqui só se lê e
 * grava. Toda escrita filtra pelo tenant, como no resto do painel.
 * Plano: docs/plano-congressos.md e docs/plano-congressos-configuracao.md.
 */

export type ModoCongresso = "promove" | "participa"
export type SituacaoCongresso = "preparacao" | "inscricoes" | "em_andamento" | "encerrado" | "cancelado"

export const SITUACOES_CONGRESSO: { valor: SituacaoCongresso; rotulo: string }[] = [
  { valor: "preparacao", rotulo: "Em preparação" },
  { valor: "inscricoes", rotulo: "Inscrições abertas" },
  { valor: "em_andamento", rotulo: "Em andamento" },
  { valor: "encerrado", rotulo: "Encerrado" },
  { valor: "cancelado", rotulo: "Cancelado" },
]

export type TipoUnidade = "base" | "entidade" | "segmento" | "ramo" | "delegacao"

export const TIPOS_UNIDADE: { valor: TipoUnidade; rotulo: string; plural: string }[] = [
  { valor: "base", rotulo: "Base", plural: "Bases" },
  { valor: "entidade", rotulo: "Entidade", plural: "Entidades" },
  { valor: "segmento", rotulo: "Segmento", plural: "Segmentos" },
  { valor: "ramo", rotulo: "Ramo", plural: "Ramos" },
  { valor: "delegacao", rotulo: "Delegação", plural: "Delegações" },
]

export type TipoSessao =
  | "credenciamento"
  | "plenaria"
  | "mesa_debate"
  | "grupo"
  | "setorial"
  | "atividade_conjunta"
  | "cultural"
  | "eleicao"
  | "outra"

export const TIPOS_SESSAO: { valor: TipoSessao; rotulo: string }[] = [
  { valor: "credenciamento", rotulo: "Credenciamento" },
  { valor: "plenaria", rotulo: "Plenária" },
  { valor: "mesa_debate", rotulo: "Mesa de debate" },
  { valor: "grupo", rotulo: "Grupo de trabalho" },
  { valor: "setorial", rotulo: "Setorial" },
  { valor: "atividade_conjunta", rotulo: "Atividade conjunta" },
  { valor: "cultural", rotulo: "Cultural" },
  { valor: "eleicao", rotulo: "Eleição" },
  { valor: "outra", rotulo: "Outra" },
]

export type SituacaoParticipante = "inscrito" | "confirmado" | "lista_espera" | "recusado" | "cancelado"

export const SITUACOES_PARTICIPANTE: { valor: SituacaoParticipante; rotulo: string }[] = [
  { valor: "inscrito", rotulo: "Inscrito" },
  { valor: "confirmado", rotulo: "Confirmado" },
  { valor: "lista_espera", rotulo: "Lista de espera" },
  { valor: "recusado", rotulo: "Recusado" },
  { valor: "cancelado", rotulo: "Cancelado" },
]

export const ROTULO_ORIGEM_PARTICIPANTE: Record<string, string> = {
  manual: "Lançado pela comissão",
  nato: "Nato",
  inscricao: "Inscrição",
  planilha: "Planilha",
  indicacao: "Indicação",
  ata: "Ata de eleição",
  copia: "Edição anterior",
}

export type CongressoLinha = {
  id: string
  nome: string
  edicao: number | null
  modo: ModoCongresso
  situacao: SituacaoCongresso
  eventoId: string | null
  eventoTitulo: string | null
  inicio: string | null
  termino: string | null
  participantes: number
}

export type Congresso = CongressoLinha & {
  tema: string | null
  local: string | null
  etapaAnteriorId: string | null
  etapaAnteriorNome: string | null
  etapaSeguinteId: string | null
  etapaSeguinteNome: string | null
  config: ConfigCongresso
  configVersao: number
  regimentoAprovadoEm: string | null
  criadoPorNome: string | null
  createdAt: string
}

export type Papel = {
  id: string
  nome: string
  categoria: CategoriaPapel
  cor: string | null
  ordem: number
  direitos: Direitos
}

export type Unidade = {
  id: string
  tipo: TipoUnidade
  nome: string
  limite_delegados: number | null
  socios: number | null
  observacao: string | null
  ordem: number
}

export type Eixo = { id: string; nome: string; descricao: string | null; ordem: number }
export type Grupo = { id: string; nome: string; eixoId: string | null; sala: string | null; vagas: number | null; ordem: number }
export type Sessao = {
  id: string
  tipo: TipoSessao
  titulo: string
  inicio: string | null
  fim: string | null
  grupoId: string | null
  eixoId: string | null
  local: string | null
}

export type Participante = {
  id: string
  nome: string
  nomeSocial: string | null
  cpf: string | null
  email: string | null
  telefone: string | null
  genero: string | null
  filiacaoId: string | null
  usuarioId: string | null
  papelId: string | null
  unidadeId: string | null
  grupoId: string | null
  titularId: string | null
  situacao: SituacaoParticipante
  origem: string
  inscritoEm: string
  acessibilidade: string | null
  observacao: string | null
}

export type VersaoConfig = {
  versao: number
  motivo: string | null
  deliberacao: string | null
  autor: string | null
  createdAt: string
}

export type HistoricoItem = { acao: string; detalhe: Record<string, unknown>; autor: string | null; createdAt: string }

const t = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null)
const n = (v: unknown): number | null => (v === null || v === undefined || v === "" ? null : Number(v))

// ── Leitura ──────────────────────────────────────────────────────────────────

async function eventosPorId(ids: string[]): Promise<Map<string, { titulo: string | null; inicio: string | null; termino: string | null; local: string | null }>> {
  const mapa = new Map<string, { titulo: string | null; inicio: string | null; termino: string | null; local: string | null }>()
  if (!ids.length) return mapa
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data } = await admin
    .from("eventos")
    .select("id, titulo, inicio, termino, local")
    .eq("emp_proprietaria_id", emp)
    .in("id", ids)
  for (const e of data ?? []) {
    mapa.set(e.id as string, { titulo: t(e.titulo), inicio: t(e.inicio), termino: t(e.termino), local: t(e.local) })
  }
  return mapa
}

export async function listarCongressos(): Promise<{ ativo: boolean; congressos: CongressoLinha[] }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data, error } = await admin
    .from("congressos")
    .select("id, nome, edicao, modo, situacao, evento_id, created_at")
    .eq("emp_proprietaria_id", emp)
    .order("created_at", { ascending: false })
  if (error) {
    if (esquemaAusente(error)) return { ativo: false, congressos: [] }
    throw new Error(`Falha ao listar congressos: ${error.message}`)
  }
  const linhas = data ?? []
  const eventos = await eventosPorId(linhas.map((c) => c.evento_id).filter((v): v is string => !!v))
  const contagem = new Map<string, number>()
  if (linhas.length) {
    const parts = await lerEmLotes<{ congresso_id: string }>((de, ate) =>
      admin
        .from("congresso_participantes")
        .select("congresso_id")
        .eq("emp_proprietaria_id", emp)
        .in("congresso_id", linhas.map((c) => c.id as string))
        .neq("situacao", "cancelado")
        .order("id")
        .range(de, ate)
    )
    for (const p of parts) contagem.set(p.congresso_id, (contagem.get(p.congresso_id) ?? 0) + 1)
  }
  const congressos = linhas.map((c) => {
    const ev = c.evento_id ? eventos.get(c.evento_id as string) : undefined
    return {
      id: c.id as string,
      nome: c.nome as string,
      edicao: n(c.edicao),
      modo: c.modo as ModoCongresso,
      situacao: c.situacao as SituacaoCongresso,
      eventoId: t(c.evento_id),
      eventoTitulo: ev?.titulo ?? null,
      inicio: ev?.inicio ?? null,
      termino: ev?.termino ?? null,
      participantes: contagem.get(c.id as string) ?? 0,
    }
  })
  congressos.sort((a, b) => (b.inicio ?? "").localeCompare(a.inicio ?? ""))
  return { ativo: true, congressos }
}

export async function obterCongresso(id: string): Promise<Congresso | null> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data: c } = await admin
    .from("congressos")
    .select("*")
    .eq("emp_proprietaria_id", emp)
    .eq("id", id)
    .maybeSingle()
  if (!c) return null
  const [eventos, nomes, contagem, etapas] = await Promise.all([
    eventosPorId(c.evento_id ? [c.evento_id as string] : []),
    nomesDosUsuarios(c.criado_por ? [c.criado_por as string] : []),
    admin
      .from("congresso_participantes")
      .select("id", { count: "exact", head: true })
      .eq("emp_proprietaria_id", emp)
      .eq("congresso_id", id)
      .neq("situacao", "cancelado"),
    admin
      .from("congressos")
      .select("id, nome, edicao")
      .eq("emp_proprietaria_id", emp)
      .in("id", [c.etapa_anterior_id, c.etapa_seguinte_id].filter((v): v is string => !!v).concat(["00000000-0000-0000-0000-000000000000"])),
  ])
  const ev = c.evento_id ? eventos.get(c.evento_id as string) : undefined
  const nomeEtapa = (eid: unknown) => {
    const e = (etapas.data ?? []).find((x) => x.id === eid)
    return e ? `${e.nome}${e.edicao ? ` (${e.edicao}ª)` : ""}` : null
  }
  return {
    id: c.id as string,
    nome: c.nome as string,
    edicao: n(c.edicao),
    modo: c.modo as ModoCongresso,
    situacao: c.situacao as SituacaoCongresso,
    eventoId: t(c.evento_id),
    eventoTitulo: ev?.titulo ?? null,
    inicio: ev?.inicio ?? null,
    termino: ev?.termino ?? null,
    local: ev?.local ?? null,
    participantes: contagem.count ?? 0,
    tema: t(c.tema),
    etapaAnteriorId: t(c.etapa_anterior_id),
    etapaAnteriorNome: nomeEtapa(c.etapa_anterior_id),
    etapaSeguinteId: t(c.etapa_seguinte_id),
    etapaSeguinteNome: nomeEtapa(c.etapa_seguinte_id) ?? t(c.etapa_seguinte_nome),
    config: normalizarConfig(c.config),
    configVersao: Number(c.config_versao ?? 1),
    regimentoAprovadoEm: t(c.regimento_aprovado_em),
    criadoPorNome: c.criado_por ? (nomes.get(c.criado_por as string) ?? null) : null,
    createdAt: c.created_at as string,
  }
}

export async function listarPapeis(congressoId: string): Promise<Papel[]> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data } = await admin
    .from("congresso_papeis")
    .select("id, nome, categoria, cor, ordem, direitos")
    .eq("emp_proprietaria_id", emp)
    .eq("congresso_id", congressoId)
    .order("ordem")
    .order("nome")
  return (data ?? []).map((p) => ({
    id: p.id as string,
    nome: p.nome as string,
    categoria: p.categoria as CategoriaPapel,
    cor: t(p.cor),
    ordem: Number(p.ordem ?? 0),
    direitos: normalizarDireitos(p.categoria as CategoriaPapel, p.direitos),
  }))
}

export async function listarUnidades(congressoId: string): Promise<Unidade[]> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data } = await admin
    .from("congresso_unidades")
    .select("id, tipo, nome, limite_delegados, socios, observacao, ordem")
    .eq("emp_proprietaria_id", emp)
    .eq("congresso_id", congressoId)
    .order("ordem")
    .order("nome")
  return (data ?? []).map((u) => ({
    id: u.id as string,
    tipo: u.tipo as TipoUnidade,
    nome: u.nome as string,
    limite_delegados: n(u.limite_delegados),
    socios: n(u.socios),
    observacao: t(u.observacao),
    ordem: Number(u.ordem ?? 0),
  }))
}

export async function listarPrograma(congressoId: string): Promise<{ eixos: Eixo[]; grupos: Grupo[]; sessoes: Sessao[] }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const [e, g, s] = await Promise.all([
    admin.from("congresso_eixos").select("id, nome, descricao, ordem").eq("emp_proprietaria_id", emp).eq("congresso_id", congressoId).order("ordem").order("nome"),
    admin.from("congresso_grupos").select("id, nome, eixo_id, sala, vagas, ordem").eq("emp_proprietaria_id", emp).eq("congresso_id", congressoId).order("ordem").order("nome"),
    admin.from("congresso_sessoes").select("id, tipo, titulo, inicio, fim, grupo_id, eixo_id, local").eq("emp_proprietaria_id", emp).eq("congresso_id", congressoId).order("inicio", { nullsFirst: false }),
  ])
  return {
    eixos: (e.data ?? []).map((x) => ({ id: x.id as string, nome: x.nome as string, descricao: t(x.descricao), ordem: Number(x.ordem ?? 0) })),
    grupos: (g.data ?? []).map((x) => ({ id: x.id as string, nome: x.nome as string, eixoId: t(x.eixo_id), sala: t(x.sala), vagas: n(x.vagas), ordem: Number(x.ordem ?? 0) })),
    sessoes: (s.data ?? []).map((x) => ({
      id: x.id as string,
      tipo: x.tipo as TipoSessao,
      titulo: x.titulo as string,
      inicio: t(x.inicio),
      fim: t(x.fim),
      grupoId: t(x.grupo_id),
      eixoId: t(x.eixo_id),
      local: t(x.local),
    })),
  }
}

const CAMPOS_PARTICIPANTE =
  "id, nome, nome_social, cpf, email, telefone, genero, filiacao_id, usuario_id, papel_id, unidade_id, grupo_id, titular_id, situacao, origem, inscrito_em, acessibilidade, observacao"

function mapParticipante(p: Record<string, unknown>): Participante {
  return {
    id: p.id as string,
    nome: p.nome as string,
    nomeSocial: t(p.nome_social),
    cpf: t(p.cpf),
    email: t(p.email),
    telefone: t(p.telefone),
    genero: t(p.genero),
    filiacaoId: t(p.filiacao_id),
    usuarioId: t(p.usuario_id),
    papelId: t(p.papel_id),
    unidadeId: t(p.unidade_id),
    grupoId: t(p.grupo_id),
    titularId: t(p.titular_id),
    situacao: p.situacao as SituacaoParticipante,
    origem: (p.origem as string) ?? "manual",
    inscritoEm: p.inscrito_em as string,
    acessibilidade: t(p.acessibilidade),
    observacao: t(p.observacao),
  }
}

export async function listarParticipantes(congressoId: string): Promise<Participante[]> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const linhas = await lerEmLotes<Record<string, unknown>>((de, ate) =>
    admin
      .from("congresso_participantes")
      .select(CAMPOS_PARTICIPANTE)
      .eq("emp_proprietaria_id", emp)
      .eq("congresso_id", congressoId)
      .order("inscrito_em")
      .order("id")
      .range(de, ate)
  )
  return linhas.map(mapParticipante)
}

export async function obterParticipante(congressoId: string, id: string): Promise<Participante | null> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data } = await admin
    .from("congresso_participantes")
    .select(CAMPOS_PARTICIPANTE)
    .eq("emp_proprietaria_id", emp)
    .eq("congresso_id", congressoId)
    .eq("id", id)
    .maybeSingle()
  return data ? mapParticipante(data) : null
}

export async function historicoDoParticipante(id: string): Promise<HistoricoItem[]> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data } = await admin
    .from("congresso_participante_historico")
    .select("acao, detalhe, autor_id, created_at")
    .eq("emp_proprietaria_id", emp)
    .eq("participante_id", id)
    .order("created_at", { ascending: false })
  const nomes = await nomesDosUsuarios((data ?? []).map((h) => h.autor_id).filter((v): v is string => !!v))
  return (data ?? []).map((h) => ({
    acao: h.acao as string,
    detalhe: (h.detalhe as Record<string, unknown>) ?? {},
    autor: h.autor_id ? (nomes.get(h.autor_id as string) ?? null) : null,
    createdAt: h.created_at as string,
  }))
}

export async function versoesDaConfig(congressoId: string): Promise<VersaoConfig[]> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data } = await admin
    .from("congresso_config_versoes")
    .select("versao, motivo, deliberacao, autor_id, created_at")
    .eq("emp_proprietaria_id", emp)
    .eq("congresso_id", congressoId)
    .order("versao", { ascending: false })
    .limit(50)
  const nomes = await nomesDosUsuarios((data ?? []).map((v) => v.autor_id).filter((v): v is string => !!v))
  return (data ?? []).map((v) => ({
    versao: Number(v.versao),
    motivo: t(v.motivo),
    deliberacao: t(v.deliberacao),
    autor: v.autor_id ? (nomes.get(v.autor_id as string) ?? null) : null,
    createdAt: v.created_at as string,
  }))
}

/** Eventos e congressos para os seletores do formulário de criação. */
export async function opcoesNovoCongresso(): Promise<{
  eventos: { id: string; titulo: string; inicio: string | null; usado: boolean }[]
  congressos: { id: string; nome: string }[]
}> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const [ev, cg] = await Promise.all([
    admin.from("eventos").select("id, titulo, inicio").eq("emp_proprietaria_id", emp).order("inicio", { ascending: false, nullsFirst: false }).limit(200),
    admin.from("congressos").select("id, nome, edicao, evento_id").eq("emp_proprietaria_id", emp).order("created_at", { ascending: false }),
  ])
  const usados = new Set((cg.data ?? []).map((c) => c.evento_id).filter(Boolean))
  return {
    eventos: (ev.data ?? []).map((e) => ({
      id: e.id as string,
      titulo: t(e.titulo) ?? "(sem título)",
      inicio: t(e.inicio),
      usado: usados.has(e.id),
    })),
    congressos: (cg.data ?? []).map((c) => ({ id: c.id as string, nome: `${c.nome}${c.edicao ? ` (${c.edicao}ª)` : ""}` })),
  }
}

// ── Painel do congresso: números e alertas ───────────────────────────────────

export type LinhaUnidade = {
  unidade: Unidade
  vagas: number | null
  explicacao: string
  delegados: number
  listaEspera: number
  natos: number
  cota: string | null
  cotaOk: boolean | null
}

export type PainelCongresso = {
  porPapel: { papel: string; cor: string | null; total: number }[]
  porSituacao: Record<SituacaoParticipante, number>
  unidades: LinhaUnidade[]
  semBase: number
  cotaTotal: { ok: boolean; mensagem: string } | null
  alertas: Alerta[]
  elegibilidade: { participanteId: string; nome: string; motivo: string }[]
}

/** Categorias que contam como delegado para vaga, cota e elegibilidade. */
const VOTANTES: CategoriaPapel[] = ["delegado", "nato"]

export async function painelDoCongresso(c: Congresso): Promise<PainelCongresso> {
  const [papeis, unidades, participantes, programa] = await Promise.all([
    listarPapeis(c.id),
    listarUnidades(c.id),
    listarParticipantes(c.id),
    listarPrograma(c.id),
  ])
  const papelPorId = new Map(papeis.map((p) => [p.id, p]))
  const ativos = participantes.filter((p) => p.situacao !== "cancelado" && p.situacao !== "recusado")
  const porSituacao = { inscrito: 0, confirmado: 0, lista_espera: 0, recusado: 0, cancelado: 0 } as Record<SituacaoParticipante, number>
  for (const p of participantes) porSituacao[p.situacao]++

  const porPapel = papeis.map((p) => ({ papel: p.nome, cor: p.cor, total: ativos.filter((a) => a.papelId === p.id).length }))
  const semPapel = ativos.filter((a) => !a.papelId).length
  if (semPapel) porPapel.push({ papel: "Sem papel", cor: null, total: semPapel })

  const ehDelegado = (p: Participante) => {
    const papel = p.papelId ? papelPorId.get(p.papelId) : undefined
    return !!papel && VOTANTES.includes(papel.categoria)
  }
  const ocupaVaga = (p: Participante) => {
    const papel = p.papelId ? papelPorId.get(p.papelId) : undefined
    return !!papel && papel.direitos.ocupa_vaga
  }

  const linhas: LinhaUnidade[] = unidades.map((u) => {
    const { vagas, explicacao } = vagasDaBase(c.config, u)
    const daBase = ativos.filter((p) => p.unidadeId === u.id)
    const delegadosConf = daBase.filter((p) => ehDelegado(p) && p.situacao !== "lista_espera")
    const cota = conferirCotaGenero(c.config, delegadosConf.map((p) => p.genero))
    return {
      unidade: u,
      vagas,
      explicacao,
      delegados: daBase.filter((p) => ocupaVaga(p) && p.situacao !== "lista_espera").length,
      listaEspera: daBase.filter((p) => p.situacao === "lista_espera").length,
      natos: daBase.filter((p) => papelPorId.get(p.papelId ?? "")?.categoria === "nato").length,
      cota: cota && valor(c.config, "cotas.onde") === "por_base" ? cota.mensagem : null,
      cotaOk: cota && valor(c.config, "cotas.onde") === "por_base" ? cota.ok : null,
    }
  })

  const delegadosTodos = ativos.filter((p) => ehDelegado(p) && p.situacao !== "lista_espera")
  const cotaTot = conferirCotaGenero(c.config, delegadosTodos.map((p) => p.genero))

  const alertas = conferirConsistencia({
    config: c.config,
    eventoInicio: c.inicio,
    eventoTermino: c.termino,
    papeis,
    unidades,
    grupos: programa.grupos,
    temParticipanteSemBase: delegadosTodos.some((p) => !p.unidadeId && ocupaVaga(p)),
  })
  if (!c.eventoId && c.modo === "promove") {
    alertas.unshift({ nivel: "aviso", mensagem: "O congresso ainda não está ligado a um evento: sem página, agenda nem datas.", secao: "geral" })
  }
  for (const l of linhas) {
    if (l.vagas !== null && l.delegados > l.vagas) {
      alertas.push({ nivel: "erro", mensagem: `${l.unidade.nome}: ${l.delegados} delegados para ${l.vagas} vaga(s).`, secao: "delegacao" })
    }
  }

  return {
    porPapel,
    porSituacao,
    unidades: linhas,
    semBase: delegadosTodos.filter((p) => !p.unidadeId && ocupaVaga(p)).length,
    cotaTotal: cotaTot && valor(c.config, "cotas.onde") === "total" ? { ok: cotaTot.ok, mensagem: cotaTot.mensagem } : null,
    alertas,
    elegibilidade: await conferirElegibilidade(c.config, delegadosTodos),
  }
}

/** Delegados que não atendem à exigência de filiação (a comissão decide). */
async function conferirElegibilidade(
  config: ConfigCongresso,
  delegados: Participante[]
): Promise<{ participanteId: string; nome: string; motivo: string }[]> {
  const exige = valor<string>(config, "elegibilidade.filiacao")
  if (exige === "nao" || !delegados.length) return []
  const ids = delegados.map((d) => d.filiacaoId).filter((v): v is string => !!v)
  const condicao = new Map<string, string | null>()
  if (ids.length) {
    const admin = await createAdminClient()
    const emp = await tenantAtual()
    for (let i = 0; i < ids.length; i += 200) {
      const { data } = await admin
        .from("filiacoes")
        .select("id, filiacao_condicao")
        .eq("emp_proprietaria_id", emp)
        .in("id", ids.slice(i, i + 200))
      for (const f of data ?? []) condicao.set(f.id as string, t(f.filiacao_condicao))
    }
  }
  const r: { participanteId: string; nome: string; motivo: string }[] = []
  for (const d of delegados) {
    if (!d.filiacaoId) {
      r.push({ participanteId: d.id, nome: d.nomeSocial ?? d.nome, motivo: "Sem ficha de filiado vinculada." })
      continue
    }
    const cond = condicao.get(d.filiacaoId)
    if (cond !== "Ativo") {
      r.push({ participanteId: d.id, nome: d.nomeSocial ?? d.nome, motivo: `Filiação ${cond ? `"${cond}"` : "não encontrada"}.` })
    }
  }
  return r
}

// ── Escrita ──────────────────────────────────────────────────────────────────

async function registrarHistorico(
  congressoId: string,
  participanteId: string | null,
  acao: string,
  detalhe: Record<string, unknown>,
  autorId: string
) {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  await admin.from("congresso_participante_historico").insert({
    emp_proprietaria_id: emp,
    congresso_id: congressoId,
    participante_id: participanteId,
    acao,
    detalhe,
    autor_id: autorId,
  })
}

export async function criarCongresso(dados: {
  nome: string
  edicao: number | null
  tema: string | null
  modo: ModoCongresso
  eventoId: string | null
  partida: { tipo: "modelo"; modeloId: string } | { tipo: "copia"; congressoId: string }
  autorId: string
}): Promise<{ id?: string; erro?: string }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()

  let config: ConfigCongresso
  let papeis: { nome: string; categoria: CategoriaPapel; cor: string | null; ordem: number; direitos: Direitos }[]
  let unidades: Omit<Unidade, "id">[] = []
  let eixos: Omit<Eixo, "id">[] = []
  if (dados.partida.tipo === "copia") {
    const origem = await obterCongresso(dados.partida.congressoId)
    if (!origem) return { erro: "Congresso de origem não encontrado." }
    config = configCopiada(origem.config)
    papeis = (await listarPapeis(origem.id)).map((p) => ({ nome: p.nome, categoria: p.categoria, cor: p.cor, ordem: p.ordem, direitos: p.direitos }))
    unidades = (await listarUnidades(origem.id)).map((u) => ({
      tipo: u.tipo,
      nome: u.nome,
      limite_delegados: u.limite_delegados,
      socios: u.socios,
      observacao: u.observacao,
      ordem: u.ordem,
    }))
    eixos = (await listarPrograma(origem.id)).eixos.map((e) => ({ nome: e.nome, descricao: e.descricao, ordem: e.ordem }))
  } else {
    const modelo = MODELOS.find((m) => m.id === (dados.partida as { modeloId: string }).modeloId)
    if (!modelo) return { erro: "Escolha um modelo." }
    config = configDoModelo(modelo.id)
    papeis = modelo.papeis.map((p, i) => ({
      nome: p.nome,
      categoria: p.categoria,
      cor: p.cor,
      ordem: i,
      direitos: { ...DIREITOS_PADRAO[p.categoria], ...(p.direitos ?? {}) },
    }))
  }

  const { data, error } = await admin
    .from("congressos")
    .insert({
      emp_proprietaria_id: emp,
      nome: dados.nome,
      edicao: dados.edicao,
      tema: dados.tema,
      modo: dados.modo,
      evento_id: dados.eventoId,
      config,
      config_versao: 1,
      criado_por: dados.autorId,
    })
    .select("id")
    .single()
  if (error || !data) return { erro: `Não foi possível criar o congresso: ${error?.message ?? "sem retorno"}` }
  const id = data.id as string

  await admin.from("congresso_config_versoes").insert({
    emp_proprietaria_id: emp,
    congresso_id: id,
    versao: 1,
    config,
    motivo:
      dados.partida.tipo === "copia"
        ? "Configuração copiada da edição anterior."
        : `Configuração inicial pelo modelo "${MODELOS.find((m) => m.id === config.modelo)?.nome ?? config.modelo}".`,
    autor_id: dados.autorId,
  })
  if (papeis.length) {
    await admin.from("congresso_papeis").insert(papeis.map((p) => ({ ...p, emp_proprietaria_id: emp, congresso_id: id })))
  }
  if (unidades.length) {
    await admin.from("congresso_unidades").insert(unidades.map((u) => ({ ...u, emp_proprietaria_id: emp, congresso_id: id })))
  }
  if (eixos.length) {
    await admin.from("congresso_eixos").insert(eixos.map((e) => ({ ...e, emp_proprietaria_id: emp, congresso_id: id })))
  }
  return { id }
}

export async function atualizarCongresso(
  id: string,
  dados: {
    nome: string
    edicao: number | null
    tema: string | null
    modo: ModoCongresso
    situacao: SituacaoCongresso
    eventoId: string | null
    etapaAnteriorId: string | null
    etapaSeguinteId: string | null
    etapaSeguinteNome: string | null
  }
): Promise<{ erro?: string }> {
  if (dados.etapaAnteriorId === id || dados.etapaSeguinteId === id) {
    return { erro: "O congresso não pode ser etapa de si mesmo." }
  }
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { error } = await admin
    .from("congressos")
    .update({
      nome: dados.nome,
      edicao: dados.edicao,
      tema: dados.tema,
      modo: dados.modo,
      situacao: dados.situacao,
      evento_id: dados.eventoId,
      etapa_anterior_id: dados.etapaAnteriorId,
      etapa_seguinte_id: dados.etapaSeguinteId,
      etapa_seguinte_nome: dados.etapaSeguinteId ? null : dados.etapaSeguinteNome,
      updated_at: new Date().toISOString(),
    })
    .eq("emp_proprietaria_id", emp)
    .eq("id", id)
  if (error) return { erro: `Não foi possível salvar: ${error.message}` }
  return {}
}

/**
 * Grava uma nova versão da configuração. Depois da aprovação do regimento,
 * com a trava ligada, exige a deliberação que autorizou a mudança.
 */
export async function salvarConfig(
  c: Congresso,
  brutos: Record<string, unknown>,
  artigos: Record<string, string>,
  motivo: string | null,
  deliberacao: string | null,
  autorId: string
): Promise<{ erro?: string; ok?: string }> {
  const { config, alteradas } = aplicarMudancas(c.config, brutos, artigos)
  if (!alteradas.length) return { ok: "Nada mudou." }
  const travado = !!c.regimentoAprovadoEm && valor(c.config, "regimento.trava") === "trava"
  if (travado && !deliberacao) {
    return { erro: "O regimento já foi aprovado: informe a deliberação da plenária que autorizou a mudança." }
  }
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const versao = c.configVersao + 1
  const resumo = alteradas
    .map((k) => {
      const a = AJUSTE_POR_CHAVE.get(k)!
      return `${a.rotulo}: ${descreverValor(a, config.valores[k])}`
    })
    .join("; ")
  const { error: e1 } = await admin.from("congresso_config_versoes").insert({
    emp_proprietaria_id: emp,
    congresso_id: c.id,
    versao,
    config,
    motivo: motivo ? `${motivo} — ${resumo}` : resumo,
    deliberacao,
    autor_id: autorId,
  })
  if (e1) {
    if (e1.code === "23505") return { erro: "Outra pessoa salvou a configuração ao mesmo tempo. Recarregue a página." }
    return { erro: `Não foi possível salvar: ${e1.message}` }
  }
  const { error: e2 } = await admin
    .from("congressos")
    .update({ config, config_versao: versao, updated_at: new Date().toISOString() })
    .eq("emp_proprietaria_id", emp)
    .eq("id", c.id)
  if (e2) return { erro: `Não foi possível salvar: ${e2.message}` }
  return { ok: `${alteradas.length} ajuste(s) salvo(s) na versão ${versao}.` }
}

export async function marcarRegimentoAprovado(c: Congresso, aprovado: boolean): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { error } = await admin
    .from("congressos")
    .update({ regimento_aprovado_em: aprovado ? new Date().toISOString() : null, updated_at: new Date().toISOString() })
    .eq("emp_proprietaria_id", emp)
    .eq("id", c.id)
  return error ? { erro: error.message } : {}
}

// Papéis

export async function salvarPapel(
  congressoId: string,
  id: string | null,
  dados: { nome: string; categoria: CategoriaPapel; cor: string | null; ordem: number; direitos: Direitos }
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const linha = { ...dados, updated_at: new Date().toISOString() }
  const { error } = id
    ? await admin.from("congresso_papeis").update(linha).eq("emp_proprietaria_id", emp).eq("congresso_id", congressoId).eq("id", id)
    : await admin.from("congresso_papeis").insert({ ...dados, emp_proprietaria_id: emp, congresso_id: congressoId })
  if (error) return { erro: error.code === "23505" ? "Já existe um papel com esse nome." : error.message }
  return {}
}

export async function removerPapel(congressoId: string, id: string): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { count } = await admin
    .from("congresso_participantes")
    .select("id", { count: "exact", head: true })
    .eq("emp_proprietaria_id", emp)
    .eq("papel_id", id)
  if (count) return { erro: `${count} participante(s) têm esse papel. Troque o papel deles antes de remover.` }
  const { error } = await admin.from("congresso_papeis").delete().eq("emp_proprietaria_id", emp).eq("congresso_id", congressoId).eq("id", id)
  return error ? { erro: error.message } : {}
}

// Unidades

export async function salvarUnidade(
  congressoId: string,
  id: string | null,
  dados: Omit<Unidade, "id">
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { error } = id
    ? await admin.from("congresso_unidades").update({ ...dados, updated_at: new Date().toISOString() }).eq("emp_proprietaria_id", emp).eq("congresso_id", congressoId).eq("id", id)
    : await admin.from("congresso_unidades").insert({ ...dados, emp_proprietaria_id: emp, congresso_id: congressoId })
  if (error) return { erro: error.code === "23505" ? "Já existe uma unidade com esse nome." : error.message }
  return {}
}

export async function removerUnidade(congressoId: string, id: string): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { count } = await admin
    .from("congresso_participantes")
    .select("id", { count: "exact", head: true })
    .eq("emp_proprietaria_id", emp)
    .eq("unidade_id", id)
    .neq("situacao", "cancelado")
  if (count) return { erro: `${count} participante(s) estão nessa unidade. Mude-os antes de remover.` }
  const { error } = await admin.from("congresso_unidades").delete().eq("emp_proprietaria_id", emp).eq("congresso_id", congressoId).eq("id", id)
  return error ? { erro: error.message } : {}
}

// Programa

export async function salvarEixo(congressoId: string, id: string | null, dados: { nome: string; descricao: string | null; ordem: number }) {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { error } = id
    ? await admin.from("congresso_eixos").update({ ...dados, updated_at: new Date().toISOString() }).eq("emp_proprietaria_id", emp).eq("congresso_id", congressoId).eq("id", id)
    : await admin.from("congresso_eixos").insert({ ...dados, emp_proprietaria_id: emp, congresso_id: congressoId })
  return error ? { erro: error.message } : {}
}

export async function salvarGrupo(
  congressoId: string,
  id: string | null,
  dados: { nome: string; eixo_id: string | null; sala: string | null; vagas: number | null; ordem: number }
) {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { error } = id
    ? await admin.from("congresso_grupos").update({ ...dados, updated_at: new Date().toISOString() }).eq("emp_proprietaria_id", emp).eq("congresso_id", congressoId).eq("id", id)
    : await admin.from("congresso_grupos").insert({ ...dados, emp_proprietaria_id: emp, congresso_id: congressoId })
  return error ? { erro: error.message } : {}
}

export async function salvarSessao(
  congressoId: string,
  id: string | null,
  dados: { tipo: TipoSessao; titulo: string; inicio: string | null; fim: string | null; grupo_id: string | null; eixo_id: string | null; local: string | null }
) {
  if (dados.inicio && dados.fim && dados.fim < dados.inicio) return { erro: "O fim não pode ser antes do início." }
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { error } = id
    ? await admin.from("congresso_sessoes").update({ ...dados, updated_at: new Date().toISOString() }).eq("emp_proprietaria_id", emp).eq("congresso_id", congressoId).eq("id", id)
    : await admin.from("congresso_sessoes").insert({ ...dados, emp_proprietaria_id: emp, congresso_id: congressoId })
  return error ? { erro: error.message } : {}
}

export async function removerDoPrograma(
  congressoId: string,
  tabela: "congresso_eixos" | "congresso_grupos" | "congresso_sessoes",
  id: string
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  if (tabela === "congresso_grupos") {
    const { count } = await admin
      .from("congresso_participantes")
      .select("id", { count: "exact", head: true })
      .eq("emp_proprietaria_id", emp)
      .eq("grupo_id", id)
      .neq("situacao", "cancelado")
    if (count) return { erro: `${count} participante(s) estão nesse grupo. Mude-os antes de remover.` }
  }
  const { error } = await admin.from(tabela).delete().eq("emp_proprietaria_id", emp).eq("congresso_id", congressoId).eq("id", id)
  return error ? { erro: error.message } : {}
}

// Participantes

export type DadosParticipante = {
  nome: string
  nomeSocial: string | null
  cpf: string | null
  email: string | null
  telefone: string | null
  genero: string | null
  filiacaoId: string | null
  usuarioId?: string | null
  papelId: string | null
  unidadeId: string | null
  grupoId: string | null
  titularId: string | null
  acessibilidade: string | null
  observacao: string | null
  origem?: string
  situacao?: SituacaoParticipante
}

/** Dados de um filiado para preencher a pessoa a partir da ficha. */
export async function dadosDoFiliado(filiacaoId: string): Promise<{ nome: string; cpf: string | null; genero: string | null } | null> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data } = await admin
    .from("filiacoes")
    .select("nome_completo, cpf, sexo")
    .eq("emp_proprietaria_id", emp)
    .eq("id", filiacaoId)
    .maybeSingle()
  if (!data) return null
  return { nome: t(data.nome_completo) ?? "(sem nome)", cpf: limparCpf(data.cpf as string | null), genero: t(data.sexo) }
}

function linhaParticipante(d: DadosParticipante) {
  return {
    nome: d.nome,
    nome_social: d.nomeSocial,
    cpf: d.cpf,
    email: d.email,
    telefone: d.telefone,
    genero: d.genero,
    filiacao_id: d.filiacaoId,
    papel_id: d.papelId,
    unidade_id: d.unidadeId,
    grupo_id: d.grupoId,
    titular_id: d.titularId,
    acessibilidade: d.acessibilidade,
    observacao: d.observacao,
  }
}

function erroDuplicado(e: { code?: string; message: string }): string {
  if (e.code === "23505") {
    return e.message.includes("filiacao") ? "Esse filiado já está no congresso." : "Já há uma pessoa com esse CPF no congresso."
  }
  return e.message
}

export async function adicionarParticipante(
  congressoId: string,
  d: DadosParticipante,
  autorId: string
): Promise<{ id?: string; erro?: string }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data, error } = await admin
    .from("congresso_participantes")
    .insert({
      ...linhaParticipante(d),
      usuario_id: d.usuarioId ?? null,
      emp_proprietaria_id: emp,
      congresso_id: congressoId,
      origem: d.origem ?? "manual",
      situacao: d.situacao ?? "inscrito",
    })
    .select("id")
    .single()
  if (error || !data) return { erro: error ? erroDuplicado(error) : "Sem retorno do banco." }
  await registrarHistorico(congressoId, data.id as string, "inscricao", { origem: d.origem ?? "manual", papel_id: d.papelId, unidade_id: d.unidadeId }, autorId)
  return { id: data.id as string }
}

export async function atualizarParticipante(
  congressoId: string,
  id: string,
  d: DadosParticipante,
  autorId: string
): Promise<{ erro?: string }> {
  const antes = await obterParticipante(congressoId, id)
  if (!antes) return { erro: "Participante não encontrado." }
  if (d.titularId === id) return { erro: "A pessoa não pode ser suplente de si mesma." }
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { error } = await admin
    .from("congresso_participantes")
    .update({ ...linhaParticipante(d), updated_at: new Date().toISOString() })
    .eq("emp_proprietaria_id", emp)
    .eq("congresso_id", congressoId)
    .eq("id", id)
  if (error) return { erro: erroDuplicado(error) }
  const mudou: Record<string, unknown> = {}
  if (antes.papelId !== d.papelId) mudou.papel = { de: antes.papelId, para: d.papelId }
  if (antes.unidadeId !== d.unidadeId) mudou.unidade = { de: antes.unidadeId, para: d.unidadeId }
  if (antes.grupoId !== d.grupoId) mudou.grupo = { de: antes.grupoId, para: d.grupoId }
  if (antes.titularId !== d.titularId) mudou.titular = { de: antes.titularId, para: d.titularId }
  await registrarHistorico(congressoId, id, "edicao", mudou, autorId)
  return {}
}

export async function mudarSituacao(
  congressoId: string,
  id: string,
  situacao: SituacaoParticipante,
  motivo: string | null,
  autorId: string
): Promise<{ erro?: string }> {
  const antes = await obterParticipante(congressoId, id)
  if (!antes) return { erro: "Participante não encontrado." }
  if (antes.situacao === situacao) return {}
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { error } = await admin
    .from("congresso_participantes")
    .update({ situacao, updated_at: new Date().toISOString() })
    .eq("emp_proprietaria_id", emp)
    .eq("congresso_id", congressoId)
    .eq("id", id)
  if (error) return { erro: error.message }
  await registrarHistorico(congressoId, id, "situacao", { de: antes.situacao, para: situacao, motivo }, autorId)
  return {}
}

/**
 * Traz a diretoria em exercício como delegados natos. Quem já está no
 * congresso (mesmo CPF ou mesma ficha de filiado) não é duplicado.
 */
export async function importarNatosDaDiretoria(
  congressoId: string,
  papelId: string,
  autorId: string
): Promise<{ erro?: string; ok?: string }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data: mandatos } = await admin
    .from("diretoria_mandatos")
    .select("id, data_inicio, data_termino")
    .eq("emp_proprietaria_id", emp)
    .order("data_inicio", { ascending: false, nullsFirst: false })
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date())
  const vigente =
    (mandatos ?? []).find(
      (m) => (!m.data_inicio || (m.data_inicio as string) <= hoje) && (!m.data_termino || (m.data_termino as string) >= hoje)
    ) ?? (mandatos ?? [])[0]
  if (!vigente) return { erro: "Nenhum mandato da diretoria cadastrado." }
  const { data: integrantes, error } = await admin
    .from("diretoria_integrantes")
    .select("id, nome, cpf, email, filiacao_id, situacao")
    .eq("mandato_id", vigente.id)
  if (error) return { erro: error.message }
  const emExercicio = (integrantes ?? []).filter((i) => (i.situacao ?? "exercicio") === "exercicio")
  const existentes = await listarParticipantes(congressoId)
  const cpfs = new Set(existentes.map((p) => p.cpf).filter(Boolean))
  const fichas = new Set(existentes.map((p) => p.filiacaoId).filter(Boolean))
  let novos = 0
  let jaEstavam = 0
  for (const i of emExercicio) {
    const cpf = limparCpf(i.cpf as string | null)
    const ficha = t(i.filiacao_id)
    if ((cpf && cpfs.has(cpf)) || (ficha && fichas.has(ficha))) {
      jaEstavam++
      continue
    }
    const r = await adicionarParticipante(
      congressoId,
      {
        nome: t(i.nome) ?? "(sem nome)",
        nomeSocial: null,
        cpf,
        email: t(i.email),
        telefone: null,
        genero: null,
        filiacaoId: ficha,
        papelId,
        unidadeId: null,
        grupoId: null,
        titularId: null,
        acessibilidade: null,
        observacao: null,
        origem: "nato",
        situacao: "confirmado",
      },
      autorId
    )
    if (!r.erro) {
      novos++
      if (cpf) cpfs.add(cpf)
      if (ficha) fichas.add(ficha)
    }
  }
  if (!novos && !jaEstavam) return { erro: "A diretoria vigente não tem integrantes em exercício." }
  return { ok: `${novos} diretor(es) incluído(s) como natos${jaEstavam ? `; ${jaEstavam} já estavam no congresso` : ""}.` }
}

/**
 * Reaplica a ordem de inscrição em todas as bases: quem está dentro do limite
 * fica confirmado, quem passa vai para a lista de espera (ou é recusado,
 * conforme a configuração). Só vale quando a forma é "ordem de inscrição".
 */
export async function aplicarOrdemDeInscricao(c: Congresso, autorId: string): Promise<{ erro?: string; ok?: string }> {
  if (valor(c.config, "delegacao.forma") !== "ordem_inscricao") {
    return { erro: "A delegação não é definida por ordem de inscrição nesta configuração." }
  }
  const excedente = valor<string>(c.config, "delegacao.lista_espera")
  if (excedente === "comissao") return { erro: "Pela configuração, quem passa do limite é decidido pela comissão, caso a caso." }
  const [papeis, unidades, participantes] = await Promise.all([listarPapeis(c.id), listarUnidades(c.id), listarParticipantes(c.id)])
  const papel = new Map(papeis.map((p) => [p.id, p]))
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  let mudancas = 0
  for (const u of unidades) {
    const { vagas } = vagasDaBase(c.config, u)
    const daBase = participantes.filter((p) => p.unidadeId === u.id)
    const alocacao = alocarPorOrdem(
      daBase.map((p) => ({
        id: p.id,
        inscrito_em: p.inscritoEm,
        situacao: p.situacao,
        ocupaVaga: !!p.papelId && !!papel.get(p.papelId)?.direitos.ocupa_vaga,
      })),
      vagas,
      excedente === "recusa" ? "recusa" : "lista_espera"
    )
    for (const a of alocacao) {
      const atual = daBase.find((p) => p.id === a.id)!
      if (atual.situacao === a.situacao) continue
      await admin
        .from("congresso_participantes")
        .update({ situacao: a.situacao, updated_at: new Date().toISOString() })
        .eq("emp_proprietaria_id", emp)
        .eq("id", a.id)
      await registrarHistorico(
        c.id,
        a.id,
        "ordem_inscricao",
        { de: atual.situacao, para: a.situacao, base: u.nome, vagas, posicao_espera: a.posicao },
        autorId
      )
      mudancas++
    }
  }
  return { ok: mudancas ? `${mudancas} situação(ões) atualizada(s) pela ordem de inscrição.` : "Tudo já estava de acordo com a ordem de inscrição." }
}

