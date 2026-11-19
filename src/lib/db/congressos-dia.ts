import "server-only"

import { createHash, randomBytes } from "node:crypto"

import { valor } from "@/lib/congressos/config"
import { codigoAtual, codigoRecente, codigoValido, novaSemente } from "@/lib/congressos/codigo-sala"
import {
  calcularQuorum,
  conferirSubstituicao,
  emExercicio,
  lerQr,
  prazoCredenciamento,
  type PessoaTroca,
  type Quorum,
} from "@/lib/congressos/credenciamento"
import { normalizarDireitos, type CategoriaPapel } from "@/lib/congressos/regras"
import { lerEmLotes } from "@/lib/db/comum"
import {
  listarPapeis,
  listarParticipantes,
  listarPrograma,
  listarUnidades,
  registrarHistorico,
  type Congresso,
  type Papel,
  type Participante,
  type Sessao,
} from "@/lib/db/congressos"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"
import { semAcento } from "@/lib/texto"

/**
 * Congressos — o dia do evento (Fase 2): credenciamento, crachás, troca de
 * titular por suplente, presença por sessão, código da sala e quórum.
 *
 * Os códigos de crachá e de link pessoal só existem em claro no QR impresso
 * ou no link; aqui se guarda o hash. Regras puras em
 * src/lib/congressos/credenciamento.ts.
 */

const hash = (v: string) => createHash("sha256").update(v).digest("hex")
const agoraIso = () => new Date().toISOString()

export type Troca = { id: string; titularId: string; suplenteId: string; autorizadoPor: string | null; createdAt: string }

export type DadosDoDia = {
  papeis: Papel[]
  papelPorId: Map<string, Papel>
  unidades: { id: string; nome: string }[]
  participantes: Participante[]
  sessoes: Sessao[]
  grupos: { id: string; nome: string }[]
  trocas: Troca[]
}

export async function listarTrocas(congressoId: string): Promise<Troca[]> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data } = await admin
    .from("congresso_substituicoes")
    .select("id, titular_id, suplente_id, autorizado_por, created_at")
    .eq("emp_proprietaria_id", emp)
    .eq("congresso_id", congressoId)
    .is("desfeita_em", null)
  return (data ?? []).map((t) => ({
    id: t.id as string,
    titularId: t.titular_id as string,
    suplenteId: t.suplente_id as string,
    autorizadoPor: (t.autorizado_por as string | null) ?? null,
    createdAt: t.created_at as string,
  }))
}

export async function dadosDoDia(congressoId: string): Promise<DadosDoDia> {
  const [papeis, unidades, participantes, programa, trocas] = await Promise.all([
    listarPapeis(congressoId),
    listarUnidades(congressoId),
    listarParticipantes(congressoId),
    listarPrograma(congressoId),
    listarTrocas(congressoId),
  ])
  return {
    papeis,
    papelPorId: new Map(papeis.map((p) => [p.id, p])),
    unidades: unidades.map((u) => ({ id: u.id, nome: u.nome })),
    participantes,
    sessoes: programa.sessoes,
    grupos: programa.grupos.map((g) => ({ id: g.id, nome: g.nome })),
    trocas,
  }
}

// ── Mesa: encontrar a pessoa ─────────────────────────────────────────────────

export type PessoaMesa = {
  id: string
  nome: string
  nomeCivil: string
  cpf: string | null
  papel: string | null
  categoria: CategoriaPapel | null
  cor: string | null
  base: string | null
  grupo: string | null
  situacao: string
  credenciadoEm: string | null
  documentoConferido: boolean
  modalidade: string
  acessibilidade: string | null
  temCracha: boolean
  substituiu: string | null
  substituidoPor: string | null
  avisos: string[]
}

async function idsPorQr(congressoId: string, texto: string): Promise<string[] | null> {
  const qr = lerQr(texto)
  if (!qr || qr.tipo === "sala") return null
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  if (qr.tipo === "cracha") {
    const { data } = await admin
      .from("congresso_crachas")
      .select("participante_id, ativo")
      .eq("emp_proprietaria_id", emp)
      .eq("congresso_id", congressoId)
      .eq("codigo_hash", hash(qr.codigo))
      .maybeSingle()
    if (!data) return []
    if (!data.ativo) return ["inativo:" + (data.participante_id as string)]
    return [data.participante_id as string]
  }
  const { data } = await admin
    .from("congresso_participantes")
    .select("id")
    .eq("emp_proprietaria_id", emp)
    .eq("congresso_id", congressoId)
    .eq("token_hash", hash(qr.token))
    .maybeSingle()
  return data ? [data.id as string] : []
}

function montarPessoa(c: Congresso, d: DadosDoDia, p: Participante, comCracha: Set<string>): PessoaMesa {
  const papel = p.papelId ? d.papelPorId.get(p.papelId) : undefined
  const nomes = new Map(d.participantes.map((x) => [x.id, x.nomeSocial ?? x.nome]))
  const assumiu = d.trocas.find((t) => t.suplenteId === p.id)
  const saiu = d.trocas.find((t) => t.titularId === p.id)
  const avisos: string[] = []
  if (p.situacao === "lista_espera") avisos.push("Está na lista de espera: não ocupa vaga.")
  if (p.situacao === "inscrito") avisos.push("Inscrição ainda não confirmada pela comissão.")
  if (p.situacao === "cancelado" || p.situacao === "recusado") avisos.push("Inscrição cancelada ou recusada.")
  if (!p.credenciadoEm) {
    const prazo = prazoCredenciamento(c.config, papel?.categoria ?? null)
    if (prazo.motivo) avisos.push(prazo.motivo)
  }
  if (saiu) avisos.push(`Substituído por ${nomes.get(saiu.suplenteId) ?? "suplente"}.`)
  return {
    id: p.id,
    nome: p.nomeSocial ?? p.nome,
    nomeCivil: p.nome,
    cpf: p.cpf,
    papel: papel?.nome ?? null,
    categoria: papel?.categoria ?? null,
    cor: papel?.cor ?? null,
    base: p.unidadeId ? (d.unidades.find((u) => u.id === p.unidadeId)?.nome ?? null) : null,
    grupo: p.grupoId ? (d.grupos.find((g) => g.id === p.grupoId)?.nome ?? null) : null,
    situacao: p.situacao,
    credenciadoEm: p.credenciadoEm,
    documentoConferido: p.documentoConferido,
    modalidade: p.modalidade,
    acessibilidade: p.acessibilidade,
    temCracha: comCracha.has(p.id),
    substituiu: assumiu ? (nomes.get(assumiu.titularId) ?? null) : null,
    substituidoPor: saiu ? (nomes.get(saiu.suplenteId) ?? null) : null,
    avisos,
  }
}

async function comCrachaAtivo(congressoId: string): Promise<Set<string>> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const linhas = await lerEmLotes<{ participante_id: string }>((de, ate) =>
    admin
      .from("congresso_crachas")
      .select("participante_id")
      .eq("emp_proprietaria_id", emp)
      .eq("congresso_id", congressoId)
      .eq("ativo", true)
      .order("id")
      .range(de, ate)
  )
  return new Set(linhas.map((l) => l.participante_id))
}

/** Busca da mesa: QR (crachá ou link pessoal), CPF ou nome, sem acento. */
export async function buscarNaMesa(c: Congresso, termo: string): Promise<{ pessoas: PessoaMesa[]; aviso?: string }> {
  const t = termo.trim()
  if (t.length < 3) return { pessoas: [] }
  const [d, cracha] = await Promise.all([dadosDoDia(c.id), comCrachaAtivo(c.id)])
  const porQr = await idsPorQr(c.id, t)
  let achados: Participante[]
  let aviso: string | undefined
  if (porQr) {
    const inativo = porQr.find((x) => x.startsWith("inativo:"))
    if (inativo) aviso = "Este crachá foi substituído por outra via e não vale mais."
    const ids = porQr.map((x) => x.replace("inativo:", ""))
    achados = d.participantes.filter((p) => ids.includes(p.id))
    if (!achados.length) aviso = "QR não reconhecido neste congresso."
  } else {
    const digitos = t.replace(/\D/g, "")
    const n = semAcento(t)
    achados = d.participantes.filter((p) =>
      digitos.length >= 4 && digitos.length === t.replace(/[\s.-]/g, "").length
        ? (p.cpf ?? "").includes(digitos)
        : semAcento(`${p.nome} ${p.nomeSocial ?? ""}`).includes(n)
    )
  }
  return {
    pessoas: achados.slice(0, 20).map((p) => montarPessoa(c, d, p, cracha)),
    aviso,
  }
}

// ── Credenciar e crachá ──────────────────────────────────────────────────────

export type DadosCracha = {
  codigo: string
  nome: string
  papel: string | null
  cor: string | null
  base: string | null
  grupo: string | null
  via: number
}

async function emitirCracha(
  c: Congresso,
  p: Participante,
  d: DadosDoDia,
  autorId: string,
  motivo: string | null
): Promise<DadosCracha | { erro: string }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data: vias } = await admin
    .from("congresso_crachas")
    .select("id, via, ativo")
    .eq("emp_proprietaria_id", emp)
    .eq("participante_id", p.id)
  const ultima = Math.max(0, ...(vias ?? []).map((v) => Number(v.via)))
  const ativa = (vias ?? []).find((v) => v.ativo)
  if (ativa) {
    await admin
      .from("congresso_crachas")
      .update({ ativo: false, invalidado_em: agoraIso(), motivo: motivo ?? "Nova via" })
      .eq("emp_proprietaria_id", emp)
      .eq("id", ativa.id)
  }
  const codigo = randomBytes(12).toString("base64url")
  const { error } = await admin.from("congresso_crachas").insert({
    emp_proprietaria_id: emp,
    congresso_id: c.id,
    participante_id: p.id,
    via: ultima + 1,
    codigo_hash: hash(codigo),
    emitido_por: autorId,
    motivo,
  })
  if (error) return { erro: `Não foi possível emitir o crachá: ${error.message}` }
  const papel = p.papelId ? d.papelPorId.get(p.papelId) : undefined
  return {
    codigo,
    nome: p.nomeSocial ?? p.nome,
    papel: papel?.nome ?? null,
    cor: papel?.cor ?? null,
    base: p.unidadeId ? (d.unidades.find((u) => u.id === p.unidadeId)?.nome ?? null) : null,
    grupo: p.grupoId ? (d.grupos.find((g) => g.id === p.grupoId)?.nome ?? null) : null,
    via: ultima + 1,
  }
}

/**
 * Credencia a pessoa. Confere situação e prazo; fora do prazo, só com
 * justificativa quando a configuração permite. Emite o crachá se ainda não
 * houver um ativo (pré-impresso vale).
 */
export async function credenciar(
  c: Congresso,
  participanteId: string,
  opcoes: { documentoConferido: boolean; modalidade: "presencial" | "distancia"; justificativa: string | null },
  autorId: string
): Promise<{ erro?: string; cracha?: DadosCracha; jaTinhaCracha?: boolean }> {
  const d = await dadosDoDia(c.id)
  const p = d.participantes.find((x) => x.id === participanteId)
  if (!p) return { erro: "Participante não encontrado." }
  if (p.credenciadoEm) return { erro: "Esta pessoa já foi credenciada." }
  if (p.situacao !== "confirmado") {
    return { erro: p.situacao === "lista_espera" ? "Está na lista de espera: só credencia depois de confirmada." : "A inscrição não está confirmada." }
  }
  const papel = p.papelId ? d.papelPorId.get(p.papelId) : undefined
  const prazo = prazoCredenciamento(c.config, papel?.categoria ?? null)
  if (!prazo.permitido) return { erro: prazo.motivo }
  if (prazo.exigeJustificativa && !opcoes.justificativa?.trim()) return { erro: prazo.motivo }
  if (valor(c.config, "credenciamento.documento_foto") === true && !opcoes.documentoConferido && opcoes.modalidade === "presencial") {
    return { erro: "Confira o documento com foto antes de credenciar." }
  }
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { error } = await admin
    .from("congresso_participantes")
    .update({
      credenciado_em: agoraIso(),
      credenciado_por: autorId,
      documento_conferido: opcoes.documentoConferido,
      modalidade: opcoes.modalidade,
      updated_at: agoraIso(),
    })
    .eq("emp_proprietaria_id", emp)
    .eq("id", p.id)
    .is("credenciado_em", null)
  if (error) return { erro: error.message }
  await registrarHistorico(
    c.id,
    p.id,
    "credenciamento",
    { modalidade: opcoes.modalidade, documento: opcoes.documentoConferido, justificativa: opcoes.justificativa },
    autorId
  )
  if (opcoes.modalidade === "distancia") return {}
  const ativos = await comCrachaAtivo(c.id)
  if (ativos.has(p.id)) return { jaTinhaCracha: true }
  const cracha = await emitirCracha(c, p, d, autorId, null)
  if ("erro" in cracha) return { erro: cracha.erro }
  return { cracha }
}

export async function desfazerCredenciamento(c: Congresso, participanteId: string, motivo: string, autorId: string): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { error } = await admin
    .from("congresso_participantes")
    .update({ credenciado_em: null, credenciado_por: null, updated_at: agoraIso() })
    .eq("emp_proprietaria_id", emp)
    .eq("congresso_id", c.id)
    .eq("id", participanteId)
  if (error) return { erro: error.message }
  await registrarHistorico(c.id, participanteId, "credenciamento_desfeito", { motivo }, autorId)
  return {}
}

export async function segundaVia(c: Congresso, participanteId: string, motivo: string, autorId: string): Promise<{ erro?: string; cracha?: DadosCracha }> {
  if (valor(c.config, "credenciamento.segunda_via") === "proibida") {
    return { erro: "Pelo regimento, não há segunda via de crachá." }
  }
  const d = await dadosDoDia(c.id)
  const p = d.participantes.find((x) => x.id === participanteId)
  if (!p) return { erro: "Participante não encontrado." }
  const r = await emitirCracha(c, p, d, autorId, motivo || "Segunda via")
  if ("erro" in r) return { erro: r.erro }
  await registrarHistorico(c.id, p.id, "segunda_via", { via: r.via, motivo }, autorId)
  return { cracha: r }
}

/** Crachás para pré-impressão: confirmados presenciais ainda sem crachá ativo. */
export async function crachasEmLote(c: Congresso, autorId: string): Promise<{ crachas: DadosCracha[]; erro?: string }> {
  const [d, ativos] = await Promise.all([dadosDoDia(c.id), comCrachaAtivo(c.id)])
  const alvo = d.participantes
    .filter((p) => p.situacao === "confirmado" && p.modalidade === "presencial" && !ativos.has(p.id))
    .sort((a, b) => (a.nomeSocial ?? a.nome).localeCompare(b.nomeSocial ?? b.nome, "pt-BR"))
  const crachas: DadosCracha[] = []
  for (const p of alvo) {
    const r = await emitirCracha(c, p, d, autorId, "Pré-impressão")
    if ("erro" in r) return { crachas, erro: r.erro }
    crachas.push(r)
  }
  return { crachas }
}

// ── Troca de titular por suplente ────────────────────────────────────────────

function paraTroca(p: Participante, d: DadosDoDia): PessoaTroca {
  return {
    id: p.id,
    categoria: p.papelId ? (d.papelPorId.get(p.papelId)?.categoria ?? null) : null,
    unidadeId: p.unidadeId,
    titularId: p.titularId,
    credenciado: !!p.credenciadoEm,
    situacao: p.situacao,
    inscritoEm: p.inscritoEm,
  }
}

export async function substituir(
  c: Congresso,
  titularId: string,
  suplenteId: string,
  autorizadoPor: string | null,
  motivo: string | null,
  autorId: string
): Promise<{ erro?: string }> {
  const d = await dadosDoDia(c.id)
  const titular = d.participantes.find((p) => p.id === titularId)
  const suplente = d.participantes.find((p) => p.id === suplenteId)
  if (!titular || !suplente) return { erro: "Titular ou suplente não encontrado." }
  const r = conferirSubstituicao({
    config: c.config,
    titular: paraTroca(titular, d),
    suplente: paraTroca(suplente, d),
    suplentesDaBase: d.participantes.filter((p) => p.unidadeId === suplente.unidadeId).map((p) => paraTroca(p, d)).filter((p) => p.categoria === "suplente"),
    substituidos: new Set(d.trocas.map((t) => t.titularId)),
    assumiram: new Set(d.trocas.map((t) => t.suplenteId)),
    autorizadoPor,
  })
  if (!r.ok) return { erro: r.erro }
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { error } = await admin.from("congresso_substituicoes").insert({
    emp_proprietaria_id: emp,
    congresso_id: c.id,
    titular_id: titularId,
    suplente_id: suplenteId,
    autorizado_por: autorizadoPor,
    motivo,
    registrado_por: autorId,
  })
  if (error) return { erro: error.code === "23505" ? "Um dos dois já está em outra troca." : error.message }
  await registrarHistorico(c.id, suplenteId, "assumiu", { titular_id: titularId, autorizado_por: autorizadoPor, motivo }, autorId)
  await registrarHistorico(c.id, titularId, "substituido", { suplente_id: suplenteId, autorizado_por: autorizadoPor, motivo }, autorId)
  return {}
}

export async function desfazerTroca(c: Congresso, trocaId: string, autorId: string): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data, error } = await admin
    .from("congresso_substituicoes")
    .update({ desfeita_em: agoraIso(), desfeita_por: autorId })
    .eq("emp_proprietaria_id", emp)
    .eq("congresso_id", c.id)
    .eq("id", trocaId)
    .is("desfeita_em", null)
    .select("titular_id, suplente_id")
    .maybeSingle()
  if (error || !data) return { erro: error?.message ?? "Troca não encontrada." }
  await registrarHistorico(c.id, data.suplente_id as string, "troca_desfeita", { titular_id: data.titular_id }, autorId)
  return {}
}

// ── Presença ─────────────────────────────────────────────────────────────────

export type ResultadoPresenca = { erro?: string; nome?: string; jaEstava?: boolean; aviso?: string; participanteId?: string }

export async function registrarPresenca(
  c: Congresso,
  sessaoId: string,
  participanteId: string,
  meio: { metodo: "porta" | "chamada" | "estacao" | "virtual" | "papel" | "codigo_sala"; nivel: "A" | "B" | "C" | "D" | "E" },
  autorId: string | null,
  entradaEm?: string
): Promise<ResultadoPresenca> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data: p } = await admin
    .from("congresso_participantes")
    .select("id, nome, nome_social, credenciado_em, modalidade, situacao")
    .eq("emp_proprietaria_id", emp)
    .eq("congresso_id", c.id)
    .eq("id", participanteId)
    .maybeSingle()
  if (!p) return { erro: "Participante não encontrado." }
  const nome = (p.nome_social as string | null) ?? (p.nome as string)
  if (!p.credenciado_em) return { erro: `${nome} ainda não foi credenciado(a). Encaminhe à mesa de credenciamento.`, nome }
  if (meio.metodo !== "virtual" && p.modalidade === "distancia") {
    return { erro: `${nome} está credenciado(a) para participar a distância.`, nome }
  }
  // Horário do aparelho só vale para registro feito sem conexão, nas últimas 12 horas.
  let entrada = agoraIso()
  if (entradaEm) {
    const t = Date.parse(entradaEm)
    if (!Number.isNaN(t) && t <= Date.now() && Date.now() - t < 12 * 3600 * 1000) entrada = new Date(t).toISOString()
  }
  const { error } = await admin.from("congresso_presencas").insert({
    emp_proprietaria_id: emp,
    congresso_id: c.id,
    sessao_id: sessaoId,
    participante_id: participanteId,
    entrada_em: entrada,
    metodo: meio.metodo,
    nivel: meio.nivel,
    modalidade: p.modalidade,
    registrado_por: autorId,
  })
  if (error) {
    if (error.code !== "23505") return { erro: error.message, nome }
    // Já entrou nesta sessão: se tinha registrado saída, é a volta.
    const { data: voltou } = await admin
      .from("congresso_presencas")
      .update({ saida_em: null })
      .eq("emp_proprietaria_id", emp)
      .eq("sessao_id", sessaoId)
      .eq("participante_id", participanteId)
      .not("saida_em", "is", null)
      .select("id")
      .maybeSingle()
    return { nome, jaEstava: !voltou, participanteId }
  }
  return { nome, participanteId }
}

export async function presencaPorTexto(
  c: Congresso,
  sessaoId: string,
  texto: string,
  autorId: string,
  entradaEm?: string
): Promise<ResultadoPresenca & { candidatos?: PessoaMesa[] }> {
  const qr = lerQr(texto)
  if (qr) {
    const ids = await idsPorQr(c.id, texto)
    if (!ids?.length) return { erro: "QR não reconhecido neste congresso." }
    if (ids[0].startsWith("inativo:")) return { erro: "Este crachá foi substituído por outra via e não vale mais." }
    return registrarPresenca(c, sessaoId, ids[0], { metodo: "porta", nivel: "B" }, autorId, entradaEm)
  }
  const { pessoas } = await buscarNaMesa(c, texto)
  // Uma pessoa só, já credenciada: registra direto, sem o "Quem é?" — na fila
  // da porta, cada toque a menos conta.
  const credenciados = pessoas.filter((p) => p.credenciadoEm)
  if (pessoas.length === 1 && credenciados.length === 1) {
    return registrarPresenca(c, sessaoId, credenciados[0].id, { metodo: "porta", nivel: "B" }, autorId, entradaEm)
  }
  return { candidatos: pessoas }
}

export async function registrarSaida(c: Congresso, sessaoId: string, participanteId: string): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { error } = await admin
    .from("congresso_presencas")
    .update({ saida_em: agoraIso() })
    .eq("emp_proprietaria_id", emp)
    .eq("sessao_id", sessaoId)
    .eq("participante_id", participanteId)
    .is("saida_em", null)
  return error ? { erro: error.message } : {}
}

export async function presencasDaSessao(c: Congresso, sessaoId: string): Promise<Map<string, { entrada: string; saida: string | null; metodo: string; nivel: string }>> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const linhas = await lerEmLotes<Record<string, unknown>>((de, ate) =>
    admin
      .from("congresso_presencas")
      .select("participante_id, entrada_em, saida_em, metodo, nivel")
      .eq("emp_proprietaria_id", emp)
      .eq("congresso_id", c.id)
      .eq("sessao_id", sessaoId)
      .order("id")
      .range(de, ate)
  )
  return new Map(
    linhas.map((l) => [
      l.participante_id as string,
      { entrada: l.entrada_em as string, saida: (l.saida_em as string | null) ?? null, metodo: l.metodo as string, nivel: l.nivel as string },
    ])
  )
}

// ── Código da sala ───────────────────────────────────────────────────────────

async function sementeDaSessao(sessaoId: string, emp: string): Promise<string | null> {
  const admin = await createAdminClient()
  const { data } = await admin.from("congresso_sessoes").select("segredo").eq("emp_proprietaria_id", emp).eq("id", sessaoId).maybeSingle()
  if (!data) return null
  if (data.segredo) return data.segredo as string
  const semente = novaSemente()
  await admin.from("congresso_sessoes").update({ segredo: semente }).eq("emp_proprietaria_id", emp).eq("id", sessaoId).is("segredo", null)
  const { data: relido } = await admin.from("congresso_sessoes").select("segredo").eq("id", sessaoId).maybeSingle()
  return (relido?.segredo as string) ?? semente
}

export async function codigoDaSalaAgora(c: Congresso, sessaoId: string): Promise<{ texto: string; codigo: string; validoAte: number } | null> {
  const emp = await tenantAtual()
  const semente = await sementeDaSessao(sessaoId, emp)
  if (!semente) return null
  const periodo = Number(valor(c.config, "local.codigo_segundos") ?? 20)
  const { codigo, validoAte } = codigoAtual(semente, periodo)
  return { texto: `CGRS:${sessaoId}:${codigo}`, codigo, validoAte }
}

/**
 * Presença pelo código da sala, lido pelo próprio participante no celular, na
 * página do link pessoal (sem sessão: `tenantId` vem do subdomínio).
 */
export async function presencaPeloCodigoDaSala(tenantId: string, token: string, texto: string): Promise<ResultadoPresenca & { sessao?: string }> {
  const qr = lerQr(texto)
  if (!qr || qr.tipo !== "sala") return { erro: "Este não é o código de uma sala do congresso." }
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return { erro: "Link pessoal inválido." }
  const admin = await createAdminClient()
  const { data: p } = await admin
    .from("congresso_participantes")
    .select("id, congresso_id, nome, nome_social, credenciado_em, modalidade")
    .eq("emp_proprietaria_id", tenantId)
    .eq("token_hash", hash(token))
    .maybeSingle()
  if (!p) return { erro: "Link pessoal inválido." }
  const { data: s } = await admin
    .from("congresso_sessoes")
    .select("id, titulo, congresso_id, segredo")
    .eq("emp_proprietaria_id", tenantId)
    .eq("id", qr.sessaoId)
    .maybeSingle()
  if (!s || s.congresso_id !== p.congresso_id || !s.segredo) return { erro: "Este código não é de uma sala do seu congresso." }
  const { data: cg } = await admin.from("congressos").select("config").eq("id", p.congresso_id).single()
  const periodo = Number((cg?.config as { valores?: Record<string, unknown> })?.valores?.["local.codigo_segundos"] ?? 20)
  if (!codigoValido(s.segredo as string, periodo, qr.codigo)) {
    return codigoRecente(s.segredo as string, periodo, qr.codigo)
      ? { erro: "O código expirou. Leia de novo o código que está na tela agora." }
      : { erro: "O código não confere. Confira as letras na tela da sala e tente de novo." }
  }
  const nome = (p.nome_social as string | null) ?? (p.nome as string)
  if (!p.credenciado_em) return { erro: "Você ainda não foi credenciado(a). Procure a mesa de credenciamento." }
  if (p.modalidade === "distancia") return { erro: "Você está credenciado(a) para participar a distância." }
  const { error } = await admin.from("congresso_presencas").insert({
    emp_proprietaria_id: tenantId,
    congresso_id: p.congresso_id,
    sessao_id: s.id,
    participante_id: p.id,
    metodo: "codigo_sala",
    nivel: "C",
    modalidade: "presencial",
  })
  if (error && error.code !== "23505") return { erro: "Não foi possível registrar. Tente de novo." }
  return { nome, jaEstava: error?.code === "23505", sessao: s.titulo as string }
}

// ── Painel do dia ────────────────────────────────────────────────────────────

export type PainelDia = {
  inscritosConfirmados: number
  credenciados: number
  aDistancia: number
  porBase: { nome: string; confirmados: number; credenciados: number; emExercicio: number }[]
  emExercicio: number
  sessao: Sessao | null
  presentesNaSessao: number
  presentesVotantes: number
  quorum: Quorum
  trocas: { id: string; titular: string; suplente: string; autorizadoPor: string | null; quando: string }[]
}

/** Sessão em curso: a que começou e ainda não terminou; senão a próxima; senão a última. */
export function sessaoAtual(sessoes: Sessao[], agora = Date.now()): Sessao | null {
  const comHora = sessoes.filter((s) => s.inicio)
  const emCurso = comHora.find((s) => Date.parse(s.inicio!) <= agora && (!s.fim || Date.parse(s.fim) >= agora))
  if (emCurso) return emCurso
  const proxima = comHora.filter((s) => Date.parse(s.inicio!) > agora).sort((a, b) => a.inicio!.localeCompare(b.inicio!))[0]
  return proxima ?? comHora[comHora.length - 1] ?? sessoes[0] ?? null
}

export async function painelDoDia(c: Congresso, sessaoId?: string | null): Promise<PainelDia> {
  const d = await dadosDoDia(c.id)
  const sessao = (sessaoId ? d.sessoes.find((s) => s.id === sessaoId) : null) ?? sessaoAtual(d.sessoes)
  const presencas = sessao ? await presencasDaSessao(c, sessao.id) : new Map()
  const pessoas = d.participantes.map((p) => {
    const papel = p.papelId ? d.papelPorId.get(p.papelId) : undefined
    return {
      id: p.id,
      situacao: p.situacao,
      credenciado: !!p.credenciadoEm,
      categoria: papel?.categoria ?? null,
      direitos: papel ? normalizarDireitos(papel.categoria, papel.direitos) : null,
    }
  })
  const exercicio = emExercicio(pessoas, d.trocas)
  const presentesAgora = new Set([...presencas.entries()].filter(([, v]) => !v.saida).map(([k]) => k))
  const presentesVotantes = [...exercicio].filter((id) => presentesAgora.has(id)).length
  const nomes = new Map(d.participantes.map((p) => [p.id, p.nomeSocial ?? p.nome]))
  return {
    inscritosConfirmados: d.participantes.filter((p) => p.situacao === "confirmado").length,
    credenciados: d.participantes.filter((p) => p.credenciadoEm).length,
    aDistancia: d.participantes.filter((p) => p.credenciadoEm && p.modalidade === "distancia").length,
    porBase: d.unidades.map((u) => {
      const daBase = d.participantes.filter((p) => p.unidadeId === u.id)
      return {
        nome: u.nome,
        confirmados: daBase.filter((p) => p.situacao === "confirmado").length,
        credenciados: daBase.filter((p) => p.credenciadoEm).length,
        emExercicio: daBase.filter((p) => exercicio.has(p.id)).length,
      }
    }),
    emExercicio: exercicio.size,
    sessao,
    presentesNaSessao: presentesAgora.size,
    presentesVotantes,
    quorum: calcularQuorum(c.config, exercicio.size, presentesVotantes),
    trocas: d.trocas.map((t) => ({
      id: t.id,
      titular: nomes.get(t.titularId) ?? "—",
      suplente: nomes.get(t.suplenteId) ?? "—",
      autorizadoPor: t.autorizadoPor,
      quando: t.createdAt,
    })),
  }
}
