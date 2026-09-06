import "server-only"

import { esquemaAusente, nomesDosUsuarios } from "@/lib/db/comum"
import { createAdminClient } from "@/lib/supabase/admin"
import { createServiceClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"
import { type ConfigEventos, type ModoFoto } from "@/lib/eventos-constantes"

/**
 * Módulo Eventos — inscrição e confirmação de presença.
 *
 * A FOTO tem três modos, e é o modo que define o regime legal:
 *   • 'nenhuma'    — não se pede.
 *   • 'visual'     — a recepção confere com o olho humano (dado comum).
 *   • 'biometrica' — alimenta reconhecimento facial (DADO SENSÍVEL, art. 11).
 * É configuração POR TENANT porque muitas entidades não têm catraca. O evento
 * pode pedir menos que o tenant permite, nunca mais.
 *
 * SQL: supabase/eventos.sql e supabase/eventos-termo-foto.sql
 */

export type { ConfigEventos, ModoFoto } from "@/lib/eventos-constantes"

export type SituacaoEvento =
  | "rascunho"
  | "publicado"
  | "encerrado"
  | "cancelado"
  | "adiado"

export type SituacaoInscricao =
  | "pendente"
  | "confirmada"
  | "recusada"
  | "cancelada"
  | "lista_espera"

export const SITUACOES_EVENTO: { valor: SituacaoEvento; rotulo: string }[] = [
  { valor: "rascunho", rotulo: "Rascunho" },
  { valor: "publicado", rotulo: "Publicado" },
  { valor: "encerrado", rotulo: "Encerrado" },
  { valor: "adiado", rotulo: "Adiado" },
  { valor: "cancelado", rotulo: "Cancelado" },
]

export const SITUACOES_INSCRICAO: {
  valor: SituacaoInscricao
  rotulo: string
}[] = [
  { valor: "pendente", rotulo: "Pendente" },
  { valor: "confirmada", rotulo: "Confirmada" },
  { valor: "lista_espera", rotulo: "Lista de espera" },
  { valor: "recusada", rotulo: "Recusada" },
  { valor: "cancelada", rotulo: "Cancelada" },
]

const CONFIG_PADRAO: ConfigEventos = {
  modo_foto: "nenhuma",
  retencao_foto_dias: 30,
  controle_acesso_nome: null,
  controle_acesso_exclusao_manual: true,
}

export type Evento = {
  id: string
  slug: string
  titulo: string | null
  descricao: string | null
  card_url: string | null
  local: string | null
  endereco: string | null
  inicio: string | null
  termino: string | null
  lotacao_maxima: number | null
  overbooking_percentual: number
  inscricoes_abrem_em: string | null
  inscricoes_fecham_em: string | null
  limite_inscricoes: number | null
  cota_convidados: number | null
  exige_aprovacao: boolean
  confirma_filiado_automatico: boolean
  exige_foto: boolean
  exige_rsvp: boolean
  situacao: SituacaoEvento
  adiado_para: string | null
  motivo_situacao: string | null
  criadoPorNome: string | null
  created_at: string
}

export type DiaEvento = {
  id: string
  data: string
  hora_inicio: string | null
  hora_fim: string | null
  rotulo: string | null
  ordem: number
}

/**
 * Contas de lotação. `vagas` já inclui o overbooking; `excedeLotacao` avisa
 * quando os confirmados passaram da lotação REAL do local — que é limitada
 * pelas normas de prevenção e combate a incêndio e pânico e não pode ser
 * ultrapassada no dia.
 */
export type Capacidade = {
  lotacao: number | null
  overbookingPercentual: number
  vagas: number | null
  confirmadas: number
  pendentes: number
  listaEspera: number
  restantes: number | null
  lotado: boolean
  excedeLotacao: boolean
  /** Vagas guardadas para convidados lançados de dentro. */
  cotaConvidados: number
  convidadosConfirmados: number
  /** Quanto da cota ainda não foi usado. */
  cotaRestante: number
  /** O que o link público pode vender: vagas menos a cota. */
  vagasPublicas: number | null
  publicasRestantes: number | null
  lotadoPublico: boolean
}

// ── Configuração ─────────────────────────────────────────────────────────────

export async function obterConfig(): Promise<{
  ativo: boolean
  config: ConfigEventos
}> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data, error } = await admin
    .from("eventos_config")
    .select(
      "modo_foto, retencao_foto_dias, controle_acesso_nome, controle_acesso_exclusao_manual"
    )
    .eq("emp_proprietaria_id", emp)
    .maybeSingle()
  if (error) {
    if (esquemaAusente(error)) return { ativo: false, config: CONFIG_PADRAO }
    throw new Error(`Falha ao ler a configuração: ${error.message}`)
  }
  if (!data) return { ativo: true, config: CONFIG_PADRAO }
  return {
    ativo: true,
    config: {
      modo_foto: (data.modo_foto as ModoFoto) ?? "nenhuma",
      retencao_foto_dias: Number(data.retencao_foto_dias ?? 30),
      controle_acesso_nome: (data.controle_acesso_nome as string | null) ?? null,
      controle_acesso_exclusao_manual:
        data.controle_acesso_exclusao_manual !== false,
    },
  }
}

export type Termo = {
  id: string
  tipo: "inscricao" | "foto_visual" | "foto_biometrica"
  versao: number
  texto: string
}

/** Termos EM VIGOR do tenant — a inscrição guarda qual versão foi aceita. */
export async function termosEmVigor(): Promise<Termo[]> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data, error } = await admin
    .from("eventos_termos")
    .select("id, tipo, versao, texto")
    .eq("emp_proprietaria_id", emp)
    .eq("em_vigor", true)
    .order("versao", { ascending: false })
  if (error) return []
  return (data ?? []).map((t) => ({
    id: t.id as string,
    tipo: t.tipo as Termo["tipo"],
    versao: Number(t.versao ?? 1),
    texto: (t.texto as string) ?? "",
  }))
}

// ── Eventos ──────────────────────────────────────────────────────────────────

const CAMPOS_EVENTO =
  "id, slug, titulo, descricao, card_url, local, endereco, inicio, termino, lotacao_maxima, overbooking_percentual, inscricoes_abrem_em, inscricoes_fecham_em, limite_inscricoes, cota_convidados, exige_aprovacao, confirma_filiado_automatico, exige_foto, exige_rsvp, situacao, adiado_para, motivo_situacao, criado_por, created_at"

function mapEvento(e: Record<string, unknown>, nome: string | null): Evento {
  return {
    id: e.id as string,
    slug: (e.slug as string) ?? "",
    titulo: (e.titulo as string | null) ?? null,
    descricao: (e.descricao as string | null) ?? null,
    card_url: (e.card_url as string | null) ?? null,
    local: (e.local as string | null) ?? null,
    endereco: (e.endereco as string | null) ?? null,
    inicio: (e.inicio as string | null) ?? null,
    termino: (e.termino as string | null) ?? null,
    lotacao_maxima: (e.lotacao_maxima as number | null) ?? null,
    overbooking_percentual: Number(e.overbooking_percentual ?? 0),
    inscricoes_abrem_em: (e.inscricoes_abrem_em as string | null) ?? null,
    inscricoes_fecham_em: (e.inscricoes_fecham_em as string | null) ?? null,
    limite_inscricoes: (e.limite_inscricoes as number | null) ?? null,
    cota_convidados: (e.cota_convidados as number | null) ?? null,
    exige_aprovacao: e.exige_aprovacao === true,
    confirma_filiado_automatico: e.confirma_filiado_automatico !== false,
    exige_foto: e.exige_foto === true,
    exige_rsvp: e.exige_rsvp === true,
    situacao: (e.situacao as SituacaoEvento) ?? "rascunho",
    adiado_para: (e.adiado_para as string | null) ?? null,
    motivo_situacao: (e.motivo_situacao as string | null) ?? null,
    criadoPorNome: nome,
    created_at: e.created_at as string,
  }
}

export async function listarEventos(filtro: {
  situacao?: SituacaoEvento | "todos"
} = {}): Promise<{ ativo: boolean; eventos: Evento[] }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  let q = admin
    .from("eventos")
    .select(CAMPOS_EVENTO)
    .eq("emp_proprietaria_id", emp)
  if (filtro.situacao && filtro.situacao !== "todos") {
    q = q.eq("situacao", filtro.situacao)
  }
  const { data, error } = await q.order("inicio", {
    ascending: false,
    nullsFirst: false,
  })
  if (error) {
    if (esquemaAusente(error)) return { ativo: false, eventos: [] }
    throw new Error(`Falha ao listar eventos: ${error.message}`)
  }
  const linhas = data ?? []
  const nomes = await nomesDosUsuarios(
    linhas.map((e) => e.criado_por).filter((v): v is string => !!v)
  )
  return {
    ativo: true,
    eventos: linhas.map((e) =>
      mapEvento(e, e.criado_por ? (nomes.get(e.criado_por as string) ?? null) : null)
    ),
  }
}

export async function obterEvento(id: string): Promise<Evento | null> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data } = await admin
    .from("eventos")
    .select(CAMPOS_EVENTO)
    .eq("emp_proprietaria_id", emp)
    .eq("id", id)
    .maybeSingle()
  if (!data) return null
  const nomes = await nomesDosUsuarios(
    data.criado_por ? [data.criado_por as string] : []
  )
  return mapEvento(
    data,
    data.criado_por ? (nomes.get(data.criado_por as string) ?? null) : null
  )
}

/**
 * Evento pela URL pública. Usa SERVICE ROLE de propósito: a página
 * `/evento/<slug>` é aberta a quem não tem sessão, e o tenant vem do
 * subdomínio (header injetado pelo proxy), não de um JWT.
 */
export async function obterEventoPublico(
  slug: string,
  tenantId: string
): Promise<Evento | null> {
  const service = createServiceClient()
  const { data } = await service
    .from("eventos")
    .select(CAMPOS_EVENTO)
    .eq("emp_proprietaria_id", tenantId)
    .eq("slug", slug)
    .maybeSingle()
  if (!data) return null
  return mapEvento(data, null)
}

export async function listarDias(eventoId: string): Promise<DiaEvento[]> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data } = await admin
    .from("eventos_dias")
    .select("id, data, hora_inicio, hora_fim, rotulo, ordem")
    .eq("emp_proprietaria_id", emp)
    .eq("evento_id", eventoId)
    .order("ordem")
    .order("data")
  return (data ?? []).map((d) => ({
    id: d.id as string,
    data: d.data as string,
    hora_inicio: (d.hora_inicio as string | null) ?? null,
    hora_fim: (d.hora_fim as string | null) ?? null,
    rotulo: (d.rotulo as string | null) ?? null,
    ordem: Number(d.ordem ?? 0),
  }))
}

// ── Capacidade ───────────────────────────────────────────────────────────────

/** Vagas ofertadas = lotação + overbooking, arredondado para baixo. */
export function vagasOfertadas(
  lotacao: number | null,
  overbookingPercentual: number,
  limiteProprio: number | null
): number | null {
  if (lotacao === null) return limiteProprio
  const comOverbooking =
    lotacao + Math.floor((lotacao * (overbookingPercentual || 0)) / 100)
  if (limiteProprio === null) return comOverbooking
  return Math.min(comOverbooking, limiteProprio)
}

export async function capacidadeDoEvento(
  evento: Evento
): Promise<Capacidade> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data } = await admin
    .from("eventos_inscricoes")
    .select("situacao, reservada_por")
    .eq("emp_proprietaria_id", emp)
    .eq("evento_id", evento.id)

  const linhas = (data ?? []) as {
    situacao: string
    reservada_por: string | null
  }[]
  const confirmadas = linhas.filter((i) => i.situacao === "confirmada").length
  const pendentes = linhas.filter((i) => i.situacao === "pendente").length
  const listaEspera = linhas.filter((i) => i.situacao === "lista_espera").length
  const convidadosConfirmados = linhas.filter(
    (i) => i.situacao === "confirmada" && i.reservada_por !== null
  ).length

  const vagas = vagasOfertadas(
    evento.lotacao_maxima,
    evento.overbooking_percentual,
    evento.limite_inscricoes
  )
  const restantes = vagas === null ? null : Math.max(0, vagas - confirmadas)

  // A cota é uma reserva: o público não pode ocupá-la. Os convidados, em
  // compensação, podem transbordar para as vagas públicas que sobrarem — o
  // limite duro é sempre o total.
  const cotaConvidados = Math.max(0, evento.cota_convidados ?? 0)
  const cotaRestante = Math.max(0, cotaConvidados - convidadosConfirmados)
  const vagasPublicas = vagas === null ? null : Math.max(0, vagas - cotaRestante)
  const publicasUsadas = confirmadas - convidadosConfirmados
  // Duas travas, e vale a mais apertada: a reserva de convidados e o total.
  // Sem a segunda, uma cota já consumida pelos convidados devolveria ao
  // público vagas que o auditório não tem mais.
  const publicasRestantes =
    vagasPublicas === null
      ? null
      : Math.min(
          Math.max(0, vagasPublicas - publicasUsadas),
          restantes ?? Number.MAX_SAFE_INTEGER
        )

  return {
    lotacao: evento.lotacao_maxima,
    overbookingPercentual: evento.overbooking_percentual,
    vagas,
    confirmadas,
    pendentes,
    listaEspera,
    restantes,
    lotado: vagas !== null && confirmadas >= vagas,
    excedeLotacao:
      evento.lotacao_maxima !== null && confirmadas > evento.lotacao_maxima,
    cotaConvidados,
    convidadosConfirmados,
    cotaRestante,
    vagasPublicas,
    publicasRestantes,
    lotadoPublico:
      (vagas !== null && confirmadas >= vagas) ||
      (vagasPublicas !== null && publicasUsadas >= vagasPublicas),
  }
}

/**
 * As inscrições estão abertas? Reúne TODAS as travas num lugar só — situação
 * do evento, janela de datas e vagas — para a página pública e a validação da
 * action darem sempre a mesma resposta.
 */
export function inscricoesAbertas(
  evento: Evento,
  capacidade: Capacidade,
  agora = new Date()
): { aberta: boolean; motivo?: string } {
  if (evento.situacao === "cancelado") {
    return { aberta: false, motivo: "Este evento foi cancelado." }
  }
  if (evento.situacao === "adiado") {
    return {
      aberta: false,
      motivo: evento.adiado_para
        ? "Este evento foi adiado. As inscrições reabrem para a nova data."
        : "Este evento foi adiado e ainda não tem nova data.",
    }
  }
  if (evento.situacao !== "publicado") {
    return { aberta: false, motivo: "As inscrições ainda não estão abertas." }
  }
  if (evento.inscricoes_abrem_em && new Date(evento.inscricoes_abrem_em) > agora) {
    return { aberta: false, motivo: "As inscrições ainda não começaram." }
  }
  if (
    evento.inscricoes_fecham_em &&
    new Date(evento.inscricoes_fecham_em) < agora
  ) {
    return { aberta: false, motivo: "O prazo de inscrição terminou." }
  }
  // O público esbarra nas vagas PÚBLICAS: as guardadas para convidados não
  // estão à venda, mesmo quando ainda estão vazias.
  if (capacidade.lotadoPublico) {
    return { aberta: false, motivo: "As vagas se esgotaram." }
  }
  return { aberta: true }
}

// ── Inscrições ───────────────────────────────────────────────────────────────

export type Inscricao = {
  id: string
  evento_id: string
  titular_id: string | null
  titularNome: string | null
  reservada_por: string | null
  convidado_por: string | null
  nome: string | null
  cpf: string | null
  email: string | null
  telefone: string | null
  email_confirmado_em: string | null
  foto_url: string | null
  foto_expurgada_em: string | null
  situacao: SituacaoInscricao
  origem: string
  motivo: string | null
  rsvp_confirmado: boolean | null
  rsvp_enviado_em: string | null
  rsvp_respondido_em: string | null
  acesso_situacao: string
  anonimizada_em: string | null
  filiacao_id: string | null
  presencas: number
  created_at: string
}

const CAMPOS_INSCRICAO =
  "id, evento_id, titular_id, reservada_por, convidado_por, nome, cpf, email, telefone, email_confirmado_em, foto_url, foto_expurgada_em, situacao, origem, motivo, rsvp_confirmado, rsvp_enviado_em, rsvp_respondido_em, acesso_situacao, anonimizada_em, filiacao_id, created_at"

export async function listarInscricoes(filtro: {
  eventoId: string
  situacao?: SituacaoInscricao | "todas"
  busca?: string
}): Promise<Inscricao[]> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  let q = admin
    .from("eventos_inscricoes")
    .select(CAMPOS_INSCRICAO)
    .eq("emp_proprietaria_id", emp)
    .eq("evento_id", filtro.eventoId)
  if (filtro.situacao && filtro.situacao !== "todas") {
    q = q.eq("situacao", filtro.situacao)
  }
  const busca = (filtro.busca ?? "").trim()
  if (busca) {
    const digitos = busca.replace(/\D/g, "")
    q = q.or(
      [
        `nome.ilike.%${busca}%`,
        `email.ilike.%${busca}%`,
        digitos ? `cpf.like.%${digitos}%` : null,
      ]
        .filter(Boolean)
        .join(",")
    )
  }
  const { data, error } = await q.order("created_at", { ascending: false })
  if (error) {
    if (esquemaAusente(error)) return []
    throw new Error(`Falha ao listar inscrições: ${error.message}`)
  }
  const linhas = data ?? []

  // Presenças e nome do titular numa consulta cada, não uma por linha.
  const ids = linhas.map((i) => i.id as string)
  const presencas = await contarPresencas(ids)
  const titulares = new Map(
    linhas.map((i) => [i.id as string, (i.nome as string | null) ?? null])
  )

  return linhas.map((i) => ({
    id: i.id as string,
    evento_id: i.evento_id as string,
    titular_id: (i.titular_id as string | null) ?? null,
    titularNome: i.titular_id
      ? (titulares.get(i.titular_id as string) ?? null)
      : null,
    reservada_por: (i.reservada_por as string | null) ?? null,
    convidado_por: (i.convidado_por as string | null) ?? null,
    nome: (i.nome as string | null) ?? null,
    cpf: (i.cpf as string | null) ?? null,
    email: (i.email as string | null) ?? null,
    telefone: (i.telefone as string | null) ?? null,
    email_confirmado_em: (i.email_confirmado_em as string | null) ?? null,
    foto_url: (i.foto_url as string | null) ?? null,
    foto_expurgada_em: (i.foto_expurgada_em as string | null) ?? null,
    situacao: (i.situacao as SituacaoInscricao) ?? "pendente",
    origem: (i.origem as string) ?? "publica",
    motivo: (i.motivo as string | null) ?? null,
    rsvp_confirmado: (i.rsvp_confirmado as boolean | null) ?? null,
    rsvp_enviado_em: (i.rsvp_enviado_em as string | null) ?? null,
    rsvp_respondido_em: (i.rsvp_respondido_em as string | null) ?? null,
    acesso_situacao: (i.acesso_situacao as string) ?? "nao_aplica",
    anonimizada_em: (i.anonimizada_em as string | null) ?? null,
    filiacao_id: (i.filiacao_id as string | null) ?? null,
    presencas: presencas.get(i.id as string) ?? 0,
    created_at: i.created_at as string,
  }))
}

async function contarPresencas(
  inscricaoIds: string[]
): Promise<Map<string, number>> {
  const mapa = new Map<string, number>()
  if (inscricaoIds.length === 0) return mapa
  const admin = await createAdminClient()
  const { data } = await admin
    .from("eventos_presencas")
    .select("inscricao_id")
    .in("inscricao_id", inscricaoIds)
  for (const p of data ?? []) {
    const id = p.inscricao_id as string
    mapa.set(id, (mapa.get(id) ?? 0) + 1)
  }
  return mapa
}

/**
 * Indicadores do evento. `comparecimento` é sobre os CONFIRMADOS, não sobre os
 * inscritos — é o número que diz se o overbooking foi bem calibrado.
 */
export type IndicadoresEvento = {
  capacidade: Capacidade
  totalInscricoes: number
  convidados: number
  rsvpSim: number
  rsvpNao: number
  rsvpSemResposta: number
  /** Quantos já receberam a pergunta — habilita o "cobrar quem não respondeu". */
  rsvpEnviados: number
  presencasPorDia: { dia: DiaEvento; presentes: number }[]
  comparecimentoPercentual: number | null
}

export async function indicadoresDoEvento(
  evento: Evento
): Promise<IndicadoresEvento> {
  const [capacidade, dias, inscricoes] = await Promise.all([
    capacidadeDoEvento(evento),
    listarDias(evento.id),
    listarInscricoes({ eventoId: evento.id, situacao: "todas" }),
  ])

  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const presencasPorDia: { dia: DiaEvento; presentes: number }[] = []
  for (const dia of dias) {
    const { count } = await admin
      .from("eventos_presencas")
      .select("id", { count: "exact", head: true })
      .eq("emp_proprietaria_id", emp)
      .eq("dia_id", dia.id)
    presencasPorDia.push({ dia, presentes: count ?? 0 })
  }

  const confirmadas = inscricoes.filter((i) => i.situacao === "confirmada")
  const maiorPresenca = presencasPorDia.reduce(
    (m, p) => Math.max(m, p.presentes),
    0
  )

  return {
    capacidade,
    totalInscricoes: inscricoes.length,
    convidados: inscricoes.filter((i) => i.reservada_por !== null).length,
    rsvpSim: confirmadas.filter((i) => i.rsvp_confirmado === true).length,
    rsvpNao: confirmadas.filter((i) => i.rsvp_confirmado === false).length,
    rsvpSemResposta: confirmadas.filter((i) => i.rsvp_confirmado === null).length,
    rsvpEnviados: confirmadas.filter((i) => i.rsvp_enviado_em !== null).length,
    presencasPorDia,
    comparecimentoPercentual:
      confirmadas.length > 0
        ? Math.round((maiorPresenca / confirmadas.length) * 100)
        : null,
  }
}

/** URL assinada de um arquivo do bucket privado `eventos`. */
export async function urlArquivoEventos(
  caminho: string | null
): Promise<string | null> {
  if (!caminho) return null
  const admin = await createAdminClient()
  const { data } = await admin.storage
    .from("eventos")
    .createSignedUrl(caminho, 3600)
  return data?.signedUrl ?? null
}
