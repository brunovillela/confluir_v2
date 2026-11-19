import "server-only"

import { createHash, randomBytes } from "node:crypto"

import { valor } from "@/lib/congressos/config"
import { codigoValido } from "@/lib/congressos/codigo-sala"
import { lerQr } from "@/lib/congressos/credenciamento"
import {
  calcularLimiar,
  codigoMocao,
  podeAssinar,
  tiposDeMocao,
  type Limiar,
  type MeioAssinatura,
  type NivelProva,
  type RegraLocal,
  type Resposta,
} from "@/lib/congressos/mocoes"
import { normalizarDireitos } from "@/lib/congressos/regras"
import { type Congresso } from "@/lib/db/congressos"
import { dadosDoDia, sessaoAtual, type DadosDoDia } from "@/lib/db/congressos-dia"
import { hashToken } from "@/lib/db/congressos-inscricao"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Congressos — moções com assinatura digital (Fase 4).
 *
 * A pessoa assina pelo link pessoal (sem conta), na estação da mesa (com o
 * crachá) ou a mesa lança a assinatura do papel. Cada assinatura grava o hash
 * do texto lido, o papel e a base daquele instante e a prova de onde a pessoa
 * estava. O texto congela na primeira assinatura: mudar cria versão nova e as
 * assinaturas da anterior deixam de contar. O limiar é gravado no protocolo.
 * Regras puras em src/lib/congressos/mocoes.ts.
 */

export type SituacaoMocao = "coleta" | "protocolada" | "habilitada" | "nao_habilitada" | "aprovada" | "rejeitada" | "retirada"

export const ROTULO_SITUACAO_MOCAO: Record<SituacaoMocao, string> = {
  coleta: "Coletando assinaturas",
  protocolada: "Protocolada, aguardando a comissão",
  habilitada: "Habilitada para a plenária",
  nao_habilitada: "Não habilitada",
  aprovada: "Aprovada",
  rejeitada: "Rejeitada",
  retirada: "Retirada",
}

export type Mocao = {
  id: string
  numero: number
  codigo: string
  tipo: string | null
  titulo: string
  destinatario: string | null
  texto: string
  versao: number
  textoHash: string
  unidadeId: string | null
  unidade: string | null
  proponenteId: string | null
  proponenteNome: string | null
  situacao: SituacaoMocao
  protocoladaEm: string | null
  limiarGravado: Limiar | null
  decisaoMotivo: string | null
  createdAt: string
}

export type Assinatura = {
  id: string
  participanteId: string
  nome: string
  versao: number
  textoHash: string
  papel: string | null
  unidadeId: string | null
  unidade: string | null
  meio: MeioAssinatura
  modalidade: "presencial" | "distancia"
  nivel: NivelProva | null
  createdAt: string
  retiradaEm: string | null
}

export type Autor = { nome: string; usuarioId?: string | null }
type Contexto = { c: Congresso; tenantId: string; autor: Autor }
export type { Contexto as ContextoMocao }

const sha = (t: string) => createHash("sha256").update(t).digest("hex")
const agoraIso = () => new Date().toISOString()

export function regrasDasMocoes(c: Congresso) {
  return {
    habilitacao: valor<string>(c.config, "mocoes.habilitacao") ?? "assinaturas",
    numero: Number(valor(c.config, "mocoes.minimo_numero") ?? 0),
    percentual: Number(valor(c.config, "mocoes.minimo_percentual") ?? 0),
    percentualDe: (valor<string>(c.config, "mocoes.percentual_de") ?? "congresso") as "congresso" | "base_origem",
    combinacao: (valor<string>(c.config, "mocoes.combinacao") ?? "ou") as "ou" | "e",
    denominador: (valor<string>(c.config, "mocoes.denominador") ?? "credenciados") as "credenciados" | "confirmados",
    aceiteComissao: valor<boolean>(c.config, "mocoes.aceite_comissao") === true,
    meio: (valor<string>(c.config, "mocoes.meio") ?? "ambos") as "ambos" | "eletronico" | "papel",
    retirar: valor<boolean>(c.config, "mocoes.retirar") !== false,
    prazo: (valor<string | null>(c.config, "mocoes.prazo") as string | null) ?? null,
    nomesVisiveis: (valor<string>(c.config, "mocoes.nomes_visiveis") ?? "credenciados") as "comissao" | "credenciados" | "publico",
    tipos: tiposDeMocao(valor<string>(c.config, "mocoes.tipos") as string),
    quemApresenta: (valor<string>(c.config, "mocoes.quem_apresenta") ?? "participantes") as "participantes" | "comissao",
    regraLocal: (valor<string>(c.config, "local.assinatura_mocao") ?? "so_local") as RegraLocal,
    provaExigida: (valor<string>(c.config, "local.prova_assinatura") ?? "C") as NivelProva,
  }
}
export type RegrasMocoes = ReturnType<typeof regrasDasMocoes>

export const EXPLICA_LOCAL: Record<RegraLocal, string> = {
  so_local: "Só vale a assinatura de quem está no local do congresso.",
  local_ou_distancia: "Vale a assinatura no local e a distância.",
  distancia_autorizados: "A distância, só quem foi credenciado nessa modalidade.",
  so_distancia: "Assinatura a distância.",
}
export const EXPLICA_NOMES: Record<RegrasMocoes["nomesVisiveis"], string> = {
  comissao: "Os nomes de quem assina ficam visíveis só para a comissão organizadora.",
  credenciados: "Os nomes de quem assina ficam visíveis para os credenciados, como na folha de papel.",
  publico: "Os nomes de quem assina ficam públicos, junto com a moção.",
}

// ── Leitura ─────────────────────────────────────────────────────────────────

const CAMPOS =
  "id, numero, codigo, tipo, titulo, destinatario, texto, versao, texto_hash, unidade_id, proponente_id, proponente_nome, situacao, protocolada_em, limiar, decisao_motivo, created_at, unidade:congresso_unidades(nome)"

function paraMocao(r: Record<string, unknown>): Mocao {
  const u = (Array.isArray(r.unidade) ? r.unidade[0] : r.unidade) as { nome: string } | null
  return {
    id: r.id as string,
    numero: r.numero as number,
    codigo: r.codigo as string,
    tipo: (r.tipo as string | null) ?? null,
    titulo: r.titulo as string,
    destinatario: (r.destinatario as string | null) ?? null,
    texto: r.texto as string,
    versao: r.versao as number,
    textoHash: r.texto_hash as string,
    unidadeId: (r.unidade_id as string | null) ?? null,
    unidade: u?.nome ?? null,
    proponenteId: (r.proponente_id as string | null) ?? null,
    proponenteNome: (r.proponente_nome as string | null) ?? null,
    situacao: r.situacao as SituacaoMocao,
    protocoladaEm: (r.protocolada_em as string | null) ?? null,
    limiarGravado: (r.limiar as Limiar | null) ?? null,
    decisaoMotivo: (r.decisao_motivo as string | null) ?? null,
    createdAt: r.created_at as string,
  }
}

async function lerMocoes(tenantId: string, congressoId: string): Promise<Mocao[]> {
  const admin = await createAdminClient()
  const { data } = await admin.from("congresso_mocoes").select(CAMPOS).eq("emp_proprietaria_id", tenantId).eq("congresso_id", congressoId).order("numero")
  return (data ?? []).map(paraMocao)
}

async function lerMocao(tenantId: string, filtro: { id?: string; codigo?: string; congressoId?: string }): Promise<Mocao | null> {
  const admin = await createAdminClient()
  let q = admin.from("congresso_mocoes").select(CAMPOS).eq("emp_proprietaria_id", tenantId)
  if (filtro.id) q = q.eq("id", filtro.id)
  if (filtro.codigo) q = q.eq("codigo", filtro.codigo)
  if (filtro.congressoId) q = q.eq("congresso_id", filtro.congressoId)
  const { data } = await q.maybeSingle()
  return data ? paraMocao(data) : null
}

async function lerAssinaturas(tenantId: string, congressoId: string, mocaoId?: string): Promise<(Assinatura & { mocaoId: string })[]> {
  const admin = await createAdminClient()
  let q = admin
    .from("congresso_mocao_assinaturas")
    .select(
      "id, mocao_id, participante_id, versao, texto_hash, papel, unidade_id, meio, modalidade, nivel, created_at, retirada_em, participante:congresso_participantes(nome, nome_social), unidade:congresso_unidades(nome)"
    )
    .eq("emp_proprietaria_id", tenantId)
    .eq("congresso_id", congressoId)
  if (mocaoId) q = q.eq("mocao_id", mocaoId)
  const { data } = await q.order("created_at").limit(5000)
  return (data ?? []).map((r) => {
    const p = (Array.isArray(r.participante) ? r.participante[0] : r.participante) as { nome: string; nome_social: string | null } | null
    const u = (Array.isArray(r.unidade) ? r.unidade[0] : r.unidade) as { nome: string } | null
    return {
      id: r.id as string,
      mocaoId: r.mocao_id as string,
      participanteId: r.participante_id as string,
      nome: p?.nome_social ?? p?.nome ?? "—",
      versao: r.versao as number,
      textoHash: r.texto_hash as string,
      papel: (r.papel as string | null) ?? null,
      unidadeId: (r.unidade_id as string | null) ?? null,
      unidade: u?.nome ?? null,
      meio: r.meio as MeioAssinatura,
      modalidade: r.modalidade as "presencial" | "distancia",
      nivel: (r.nivel as NivelProva | null) ?? null,
      createdAt: r.created_at as string,
      retiradaEm: (r.retirada_em as string | null) ?? null,
    }
  })
}

// ── Quem pode assinar (denominador) ─────────────────────────────────────────

type Pessoa = DadosDoDia["participantes"][number]

/** Quem tem direito de assinar agora: papel que assina, em exercício (titular não substituído ou suplente que assumiu). */
function aptos(d: DadosDoDia) {
  const substituidos = new Set(d.trocas.map((t) => t.titularId))
  const assumiram = new Set(d.trocas.map((t) => t.suplenteId))
  const info = new Map<string, { direito: boolean; emExercicio: boolean; categoria: string | null; papel: string | null }>()
  for (const p of d.participantes) {
    const papel = p.papelId ? d.papelPorId.get(p.papelId) : undefined
    const dir = papel ? normalizarDireitos(papel.categoria, papel.direitos) : null
    const valida = p.situacao === "confirmado" || p.situacao === "inscrito"
    const emExercicio = valida && (dir?.voto_so_substituindo ? assumiram.has(p.id) : !substituidos.has(p.id))
    info.set(p.id, { direito: !!dir?.assinar_mocao && valida, emExercicio, categoria: papel?.categoria ?? null, papel: papel?.nome ?? null })
  }
  return info
}

function contarLimiar(c: Congresso, m: Mocao, d: DadosDoDia, assinaturas: Assinatura[]): Limiar {
  const r = regrasDasMocoes(c)
  const info = aptos(d)
  const conta = (p: Pessoa) => {
    const i = info.get(p.id)
    if (!i?.direito || !i.emExercicio) return false
    return r.denominador === "credenciados" ? !!p.credenciadoEm : p.situacao === "confirmado"
  }
  const elegiveis = d.participantes.filter(conta)
  const elegiveisIds = new Set(elegiveis.map((p) => p.id))
  const validas = assinaturas.filter((a) => a.versao === m.versao && !a.retiradaEm && elegiveisIds.has(a.participanteId))
  return calcularLimiar({
    numero: r.numero,
    percentual: r.percentual,
    combinacao: r.combinacao,
    percentualDe: r.percentualDe,
    denominadorCongresso: elegiveis.length,
    denominadorBase: m.unidadeId ? elegiveis.filter((p) => p.unidadeId === m.unidadeId).length : null,
    validas: validas.length,
    validasDaBase: m.unidadeId ? validas.filter((a) => a.unidadeId === m.unidadeId).length : 0,
  })
}

export type LinhaMocao = Mocao & { assinaturasValidas: number; limiar: Limiar }

export async function listarMocoes(c: Congresso): Promise<{ mocoes: LinhaMocao[]; regras: RegrasMocoes }> {
  const emp = await tenantAtual()
  const [mocoes, assinaturas, d] = await Promise.all([lerMocoes(emp, c.id), lerAssinaturas(emp, c.id), dadosDoDia(c.id)])
  return {
    regras: regrasDasMocoes(c),
    mocoes: mocoes.map((m) => {
      const daMocao = assinaturas.filter((a) => a.mocaoId === m.id)
      const limiar = m.limiarGravado && m.situacao !== "coleta" ? m.limiarGravado : contarLimiar(c, m, d, daMocao)
      return { ...m, assinaturasValidas: daMocao.filter((a) => a.versao === m.versao && !a.retiradaEm).length, limiar }
    }),
  }
}

export type DadosMocao = {
  mocao: Mocao
  assinaturas: Assinatura[]
  limiar: Limiar
  regras: RegrasMocoes
  eventos: { acao: string; detalhe: Record<string, unknown>; autor: string | null; createdAt: string }[]
}

export async function dadosDaMocao(c: Congresso, id: string): Promise<DadosMocao | null> {
  const emp = await tenantAtual()
  const m = await lerMocao(emp, { id, congressoId: c.id })
  if (!m) return null
  const admin = await createAdminClient()
  const [assinaturas, d, { data: ev }] = await Promise.all([
    lerAssinaturas(emp, c.id, id),
    dadosDoDia(c.id),
    admin.from("congresso_mocao_eventos").select("acao, detalhe, autor, created_at").eq("emp_proprietaria_id", emp).eq("mocao_id", id).order("created_at"),
  ])
  return {
    mocao: m,
    assinaturas,
    limiar: m.limiarGravado && m.situacao !== "coleta" ? m.limiarGravado : contarLimiar(c, m, d, assinaturas),
    regras: regrasDasMocoes(c),
    eventos: (ev ?? []).map((e) => ({ acao: e.acao as string, detalhe: (e.detalhe as Record<string, unknown>) ?? {}, autor: (e.autor as string | null) ?? null, createdAt: e.created_at as string })),
  }
}

async function evento(ctx: Contexto, mocaoId: string, acao: string, detalhe: Record<string, unknown> = {}) {
  const admin = await createAdminClient()
  await admin.from("congresso_mocao_eventos").insert({ emp_proprietaria_id: ctx.tenantId, congresso_id: ctx.c.id, mocao_id: mocaoId, acao, detalhe, autor: ctx.autor.nome })
}

// ── Criar e alterar ─────────────────────────────────────────────────────────

export async function criarMocao(
  ctx: Contexto,
  dados: { tipo: string | null; titulo: string; destinatario: string | null; texto: string; unidadeId: string | null; proponenteId: string | null }
): Promise<{ erro?: string; id?: string; codigo?: string; numero?: number }> {
  const titulo = dados.titulo.trim()
  const texto = dados.texto.trim()
  if (titulo.length < 3) return { erro: "Dê um título à moção." }
  if (texto.length < 20) return { erro: "Escreva o texto da moção." }
  const r = regrasDasMocoes(ctx.c)
  if (r.prazo && Date.now() > Date.parse(r.prazo)) return { erro: "O prazo das moções já passou." }
  const admin = await createAdminClient()
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    const { data: ult } = await admin
      .from("congresso_mocoes")
      .select("numero")
      .eq("emp_proprietaria_id", ctx.tenantId)
      .eq("congresso_id", ctx.c.id)
      .order("numero", { ascending: false })
      .limit(1)
    const numero = ((ult?.[0]?.numero as number | undefined) ?? 0) + 1
    const codigo = codigoMocao(randomBytes(8))
    const { data, error } = await admin
      .from("congresso_mocoes")
      .insert({
        emp_proprietaria_id: ctx.tenantId,
        congresso_id: ctx.c.id,
        numero,
        codigo,
        tipo: dados.tipo,
        titulo,
        destinatario: dados.destinatario?.trim() || null,
        texto,
        texto_hash: sha(texto),
        unidade_id: dados.unidadeId,
        proponente_id: dados.proponenteId,
        proponente_nome: ctx.autor.nome,
      })
      .select("id")
      .single()
    if (error) {
      if (error.code === "23505") continue
      return { erro: error.message }
    }
    await evento(ctx, data.id as string, "criada", { numero })
    return { id: data.id as string, codigo, numero }
  }
  return { erro: "Não foi possível numerar a moção agora. Tente de novo." }
}

/**
 * Altera a moção em coleta. Sem assinaturas, o texto muda no lugar; com
 * assinaturas, vira versão nova e as anteriores deixam de contar (aviso antes,
 * na tela).
 */
export async function alterarMocao(
  ctx: Contexto,
  id: string,
  dados: { tipo: string | null; titulo: string; destinatario: string | null; texto: string; unidadeId: string | null },
  restritoA?: { proponenteId: string }
): Promise<{ erro?: string; novaVersao?: boolean }> {
  const m = await lerMocao(ctx.tenantId, { id, congressoId: ctx.c.id })
  if (!m) return { erro: "Moção não encontrada." }
  if (restritoA && m.proponenteId !== restritoA.proponenteId) return { erro: "Só quem apresentou altera a moção." }
  if (m.situacao !== "coleta") return { erro: "A moção já foi protocolada e não muda mais." }
  const texto = dados.texto.trim()
  if (texto.length < 20) return { erro: "Escreva o texto da moção." }
  const admin = await createAdminClient()
  const { count } = await admin
    .from("congresso_mocao_assinaturas")
    .select("id", { count: "exact", head: true })
    .eq("emp_proprietaria_id", ctx.tenantId)
    .eq("mocao_id", id)
    .eq("versao", m.versao)
    .is("retirada_em", null)
  const textoMudou = texto !== m.texto || dados.titulo.trim() !== m.titulo || (dados.destinatario?.trim() || null) !== m.destinatario
  const novaVersao = textoMudou && (count ?? 0) > 0
  const { error } = await admin
    .from("congresso_mocoes")
    .update({
      tipo: dados.tipo,
      titulo: dados.titulo.trim(),
      destinatario: dados.destinatario?.trim() || null,
      texto,
      texto_hash: sha(texto),
      unidade_id: dados.unidadeId,
      versao: novaVersao ? m.versao + 1 : m.versao,
      updated_at: agoraIso(),
    })
    .eq("emp_proprietaria_id", ctx.tenantId)
    .eq("id", id)
  if (error) return { erro: error.message }
  await evento(ctx, id, novaVersao ? "nova_versao" : "alterada", novaVersao ? { versao: m.versao + 1, assinaturasZeradas: count } : {})
  return { novaVersao }
}

// ── Assinar ─────────────────────────────────────────────────────────────────

export type SituacaoPessoa = {
  participanteId: string
  nome: string
  credenciado: boolean
  jaAssinou: Assinatura | null
  resposta: Resposta
}

/** Presença em curso na sessão atual (nível B). */
async function presenteAgora(tenantId: string, d: DadosDoDia, participanteId: string): Promise<boolean> {
  const sessao = sessaoAtual(d.sessoes)
  if (!sessao) return false
  const admin = await createAdminClient()
  const { data } = await admin
    .from("congresso_presencas")
    .select("id")
    .eq("emp_proprietaria_id", tenantId)
    .eq("sessao_id", sessao.id)
    .eq("participante_id", participanteId)
    .is("saida_em", null)
    .maybeSingle()
  return !!data
}

/** Código da sala vigente (nível C), lido do QR do telão ("CGRS:sessao:codigo"). */
async function codigoDaSalaConfere(c: Congresso, tenantId: string, texto: string | null): Promise<boolean> {
  if (!texto) return false
  const qr = lerQr(texto)
  const admin = await createAdminClient()
  const periodo = Number(valor(c.config, "local.codigo_segundos") ?? 20)
  // Digitado do telão: só as letras, sem a sessão — confere nas salas com código ativo.
  if (!qr && /^[A-Za-z2-9]{6}$/.test(texto.trim())) {
    const { data: salas } = await admin.from("congresso_sessoes").select("segredo").eq("emp_proprietaria_id", tenantId).eq("congresso_id", c.id).not("segredo", "is", null)
    return (salas ?? []).some((s) => codigoValido(s.segredo as string, periodo, texto.trim()))
  }
  if (!qr || qr.tipo !== "sala") return false
  const { data: s } = await admin
    .from("congresso_sessoes")
    .select("segredo, congresso_id")
    .eq("emp_proprietaria_id", tenantId)
    .eq("id", qr.sessaoId)
    .maybeSingle()
  if (!s?.segredo || s.congresso_id !== c.id) return false
  return codigoValido(s.segredo as string, periodo, qr.codigo)
}

async function avaliar(
  c: Congresso,
  tenantId: string,
  m: Mocao,
  d: DadosDoDia,
  participanteId: string,
  meio: MeioAssinatura,
  codigoSala: string | null
): Promise<{ resposta: Resposta; pessoa: Pessoa | null; info: ReturnType<typeof aptos> extends Map<string, infer V> ? V | undefined : never }> {
  const pessoa = d.participantes.find((p) => p.id === participanteId) ?? null
  const info = aptos(d).get(participanteId)
  const r = regrasDasMocoes(c)
  if (!pessoa) return { resposta: { pode: false, motivo: "Participante não encontrado.", nivel: null }, pessoa, info }
  const [presente, codigoOk] = await Promise.all([
    meio === "link" && r.provaExigida === "B" ? presenteAgora(tenantId, d, participanteId) : Promise.resolve(false),
    meio === "link" ? codigoDaSalaConfere(c, tenantId, codigoSala) : Promise.resolve(false),
  ])
  const resposta = podeAssinar({
    situacao: m.situacao,
    prazo: r.prazo,
    direito: !!info?.direito,
    categoria: info?.categoria ?? null,
    emExercicio: !!info?.emExercicio,
    credenciado: !!pessoa.credenciadoEm,
    modalidade: pessoa.modalidade,
    meio,
    meioPermitido: r.meio,
    regraLocal: r.regraLocal,
    provaExigida: r.provaExigida,
    presenteNaSessao: presente,
    codigoValido: codigoOk,
  })
  return { resposta, pessoa, info }
}

export async function situacaoDaPessoa(c: Congresso, tenantId: string, m: Mocao, participanteId: string): Promise<SituacaoPessoa> {
  const [d, assinaturas] = await Promise.all([dadosDoDia(c.id), lerAssinaturas(tenantId, c.id, m.id)])
  const { resposta, pessoa } = await avaliar(c, tenantId, m, d, participanteId, "link", null)
  return {
    participanteId,
    nome: pessoa ? (pessoa.nomeSocial ?? pessoa.nome) : "—",
    credenciado: !!pessoa?.credenciadoEm,
    jaAssinou: assinaturas.find((a) => a.participanteId === participanteId && a.versao === m.versao && !a.retiradaEm) ?? null,
    resposta,
  }
}

export async function assinar(
  ctx: Contexto,
  d: {
    mocaoId: string
    participanteId: string
    meio: MeioAssinatura
    /** Hash do texto que a pessoa leu na tela: se a moção mudou nesse meio-tempo, não assina. */
    textoHash: string | null
    codigoSala?: string | null
    ip?: string | null
    navegador?: string | null
  }
): Promise<{ erro?: string; precisaCodigo?: boolean; nome?: string }> {
  const m = await lerMocao(ctx.tenantId, { id: d.mocaoId, congressoId: ctx.c.id })
  if (!m) return { erro: "Moção não encontrada." }
  if (d.textoHash && d.textoHash !== m.textoHash) return { erro: "O texto da moção mudou enquanto você lia. Leia de novo antes de assinar." }
  const dia = await dadosDoDia(ctx.c.id)
  const { resposta, pessoa, info } = await avaliar(ctx.c, ctx.tenantId, m, dia, d.participanteId, d.meio, d.codigoSala ?? null)
  if (!resposta.pode || !pessoa) return { erro: resposta.motivo, precisaCodigo: resposta.precisaCodigo }
  const admin = await createAdminClient()
  const { error } = await admin.from("congresso_mocao_assinaturas").insert({
    emp_proprietaria_id: ctx.tenantId,
    congresso_id: ctx.c.id,
    mocao_id: m.id,
    participante_id: pessoa.id,
    versao: m.versao,
    texto_hash: m.textoHash,
    papel: info?.papel ?? null,
    categoria: info?.categoria ?? null,
    unidade_id: pessoa.unidadeId,
    meio: d.meio,
    modalidade: pessoa.modalidade,
    nivel: resposta.nivel,
    ip: d.ip ?? null,
    navegador: d.navegador?.slice(0, 300) ?? null,
    registrado_por: d.meio === "link" ? null : (ctx.autor.usuarioId ?? null),
  })
  if (error) return { erro: error.code === "23505" ? `${pessoa.nomeSocial ?? pessoa.nome} já assinou esta moção.` : error.message }
  return { nome: pessoa.nomeSocial ?? pessoa.nome }
}

export async function retirarAssinatura(ctx: Contexto, mocaoId: string, participanteId: string, pelaMesa: boolean): Promise<{ erro?: string }> {
  const m = await lerMocao(ctx.tenantId, { id: mocaoId, congressoId: ctx.c.id })
  if (!m) return { erro: "Moção não encontrada." }
  if (m.situacao !== "coleta") return { erro: "A moção já foi protocolada: a assinatura não pode mais ser retirada." }
  if (!pelaMesa && !regrasDasMocoes(ctx.c).retirar) return { erro: "O regimento não permite retirar a assinatura." }
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("congresso_mocao_assinaturas")
    .update({ retirada_em: agoraIso() })
    .eq("emp_proprietaria_id", ctx.tenantId)
    .eq("mocao_id", mocaoId)
    .eq("participante_id", participanteId)
    .eq("versao", m.versao)
    .is("retirada_em", null)
    .select("id")
  if (error) return { erro: error.message }
  if (!data?.length) return { erro: "Não há assinatura para retirar." }
  await evento(ctx, mocaoId, "assinatura_retirada", { participanteId, pelaMesa })
  return {}
}

// ── Protocolo, habilitação e retirada ───────────────────────────────────────

/**
 * Protocola: calcula e grava o limiar com os números daquele momento. Por
 * assinaturas, só protocola se atingiu; vai direto à plenária, salvo se a
 * comissão também precisa aceitar. Por voto no grupo ou aceite da comissão,
 * fica aguardando a decisão.
 */
export async function protocolar(ctx: Contexto, id: string, restritoA?: { proponenteId: string }): Promise<{ erro?: string; situacao?: SituacaoMocao }> {
  const m = await lerMocao(ctx.tenantId, { id, congressoId: ctx.c.id })
  if (!m) return { erro: "Moção não encontrada." }
  if (restritoA && m.proponenteId !== restritoA.proponenteId) return { erro: "Só quem apresentou protocola a moção." }
  if (m.situacao !== "coleta") return { erro: "A moção já foi protocolada." }
  const r = regrasDasMocoes(ctx.c)
  if (r.prazo && Date.now() > Date.parse(r.prazo) && restritoA) return { erro: "O prazo das moções já passou." }
  const [d, assinaturas] = await Promise.all([dadosDoDia(ctx.c.id), lerAssinaturas(ctx.tenantId, ctx.c.id, id)])
  const limiar = contarLimiar(ctx.c, m, d, assinaturas)
  if (r.habilitacao === "assinaturas" && !limiar.atingido) {
    const falta = limiar.alternativas.filter((a) => !a.atingido).map((a) => `${a.atual} de ${a.exigido} em ${a.rotulo}`)
    return { erro: `Ainda não atingiu o mínimo: ${falta.join(r.combinacao === "e" ? " e " : " ou ")}.${limiar.aviso ? ` ${limiar.aviso}` : ""}` }
  }
  const situacao: SituacaoMocao = r.habilitacao === "assinaturas" && !r.aceiteComissao ? "habilitada" : "protocolada"
  const admin = await createAdminClient()
  const { error } = await admin
    .from("congresso_mocoes")
    .update({ situacao, protocolada_em: agoraIso(), limiar: { ...limiar, calculadoEm: agoraIso() }, updated_at: agoraIso() })
    .eq("emp_proprietaria_id", ctx.tenantId)
    .eq("id", id)
    .eq("situacao", "coleta")
  if (error) return { erro: error.message }
  await evento(ctx, id, "protocolada", { situacao, limiar })
  return { situacao }
}

export async function decidirHabilitacao(ctx: Contexto, id: string, habilitar: boolean, motivo: string | null): Promise<{ erro?: string }> {
  const m = await lerMocao(ctx.tenantId, { id, congressoId: ctx.c.id })
  if (!m) return { erro: "Moção não encontrada." }
  if (!["protocolada", "habilitada", "nao_habilitada"].includes(m.situacao)) return { erro: "Só se decide a habilitação de moção protocolada e ainda não votada." }
  if (!habilitar && !motivo?.trim()) return { erro: "Diga o motivo da não habilitação." }
  const admin = await createAdminClient()
  const { error } = await admin
    .from("congresso_mocoes")
    .update({
      situacao: habilitar ? "habilitada" : "nao_habilitada",
      decisao_motivo: motivo?.trim() || null,
      decidida_por: ctx.autor.usuarioId ?? null,
      decidida_em: agoraIso(),
      updated_at: agoraIso(),
    })
    .eq("emp_proprietaria_id", ctx.tenantId)
    .eq("id", id)
  if (error) return { erro: error.message }
  await evento(ctx, id, habilitar ? "habilitada" : "nao_habilitada", { motivo })
  return {}
}

export async function retirarMocao(ctx: Contexto, id: string, motivo: string | null, restritoA?: { proponenteId: string }): Promise<{ erro?: string }> {
  const m = await lerMocao(ctx.tenantId, { id, congressoId: ctx.c.id })
  if (!m) return { erro: "Moção não encontrada." }
  if (restritoA && m.proponenteId !== restritoA.proponenteId) return { erro: "Só quem apresentou retira a moção." }
  if (["aprovada", "rejeitada", "retirada"].includes(m.situacao)) return { erro: "A moção não pode mais ser retirada." }
  const admin = await createAdminClient()
  const { error } = await admin.from("congresso_mocoes").update({ situacao: "retirada", decisao_motivo: motivo?.trim() || null, updated_at: agoraIso() }).eq("emp_proprietaria_id", ctx.tenantId).eq("id", id)
  if (error) return { erro: error.message }
  await evento(ctx, id, "retirada", { motivo })
  return {}
}

// ── Link pessoal e página pública ───────────────────────────────────────────

export type ParticipantePeloLink = { id: string; congressoId: string; nome: string; credenciado: boolean; propoe: boolean; unidadeId: string | null }

export async function participantePeloLink(token: string, tenantId: string): Promise<ParticipantePeloLink | null> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null
  const admin = await createAdminClient()
  const { data: p } = await admin
    .from("congresso_participantes")
    .select("id, congresso_id, nome, nome_social, situacao, credenciado_em, unidade_id, papel:congresso_papeis(categoria, direitos)")
    .eq("emp_proprietaria_id", tenantId)
    .eq("token_hash", hashToken(token))
    .maybeSingle()
  if (!p || p.situacao === "cancelado" || p.situacao === "recusado") return null
  const papel = (Array.isArray(p.papel) ? p.papel[0] : p.papel) as { categoria: string; direitos: unknown } | null
  const dir = papel ? normalizarDireitos(papel.categoria as never, papel.direitos as never) : null
  return {
    id: p.id as string,
    congressoId: p.congresso_id as string,
    nome: ((p.nome_social as string | null) ?? (p.nome as string)) as string,
    credenciado: !!p.credenciado_em,
    propoe: !!dir?.propor,
    unidadeId: (p.unidade_id as string | null) ?? null,
  }
}

export async function mocaoPorCodigo(tenantId: string, codigo: string): Promise<Mocao & { congressoId: string } | null> {
  if (!/^M[A-Z0-9]{7}$/.test(codigo)) return null
  const admin = await createAdminClient()
  const { data } = await admin.from("congresso_mocoes").select(`${CAMPOS}, congresso_id`).eq("emp_proprietaria_id", tenantId).eq("codigo", codigo).maybeSingle()
  return data ? { ...paraMocao(data), congressoId: data.congresso_id as string } : null
}

/** Progresso e (se a regra permitir a quem olha) os nomes de quem assinou. */
export async function progressoDaMocao(
  c: Congresso,
  tenantId: string,
  m: Mocao,
  quemOlha: "publico" | "credenciado" | "comissao"
): Promise<{ limiar: Limiar; total: number; nomes: string[] | null }> {
  const [d, assinaturas] = await Promise.all([dadosDoDia(c.id), lerAssinaturas(tenantId, c.id, m.id)])
  const atuais = assinaturas.filter((a) => a.versao === m.versao && !a.retiradaEm)
  const r = regrasDasMocoes(c)
  const podeVer =
    quemOlha === "comissao" || r.nomesVisiveis === "publico" || (r.nomesVisiveis === "credenciados" && quemOlha === "credenciado")
  return {
    limiar: m.limiarGravado && m.situacao !== "coleta" ? m.limiarGravado : contarLimiar(c, m, d, assinaturas),
    total: atuais.length,
    nomes: podeVer ? atuais.map((a) => a.nome).sort((a, b) => a.localeCompare(b, "pt-BR")) : null,
  }
}

/** Moções que a pessoa vê no link pessoal: em coleta ou já decididas. */
export async function mocoesParaParticipante(c: Congresso, tenantId: string, participanteId: string) {
  const [mocoes, assinaturas] = await Promise.all([lerMocoes(tenantId, c.id), lerAssinaturas(tenantId, c.id)])
  return mocoes
    .filter((m) => m.situacao !== "retirada")
    .map((m) => ({
      id: m.id,
      numero: m.numero,
      codigo: m.codigo,
      titulo: m.titulo,
      tipo: m.tipo,
      situacao: m.situacao,
      minha: m.proponenteId === participanteId,
      assinei: assinaturas.some((a) => a.mocaoId === m.id && a.participanteId === participanteId && a.versao === m.versao && !a.retiradaEm),
      total: assinaturas.filter((a) => a.mocaoId === m.id && a.versao === m.versao && !a.retiradaEm).length,
    }))
}

// ── Verificação pública ─────────────────────────────────────────────────────

export type VerificacaoMocao = {
  codigo: string
  numero: number
  titulo: string
  congresso: string
  situacao: SituacaoMocao
  versao: number
  textoHash: string
  assinaturas: number
  protocoladaEm: string | null
}

export async function verificarMocao(codigo: string): Promise<VerificacaoMocao | null> {
  const c = codigo.trim().toUpperCase()
  if (!/^M[A-Z0-9]{7}$/.test(c)) return null
  const tenantId = await tenantAtual()
  const admin = await createAdminClient()
  const { data: m } = await admin
    .from("congresso_mocoes")
    .select("id, numero, codigo, titulo, situacao, versao, texto_hash, protocolada_em, congresso:congressos(nome, edicao)")
    .eq("emp_proprietaria_id", tenantId)
    .eq("codigo", c)
    .maybeSingle()
  if (!m) return null
  const { count } = await admin
    .from("congresso_mocao_assinaturas")
    .select("id", { count: "exact", head: true })
    .eq("emp_proprietaria_id", tenantId)
    .eq("mocao_id", m.id)
    .eq("versao", m.versao)
    .is("retirada_em", null)
  const cg = (Array.isArray(m.congresso) ? m.congresso[0] : m.congresso) as { nome: string; edicao: number | null } | null
  return {
    codigo: m.codigo as string,
    numero: m.numero as number,
    titulo: m.titulo as string,
    congresso: cg ? `${cg.edicao ? `${cg.edicao}º ` : ""}${cg.nome}` : "Congresso",
    situacao: m.situacao as SituacaoMocao,
    versao: m.versao as number,
    textoHash: m.texto_hash as string,
    assinaturas: count ?? 0,
    protocoladaEm: (m.protocolada_em as string | null) ?? null,
  }
}

export async function mocoesDaPlenaria(c: Congresso): Promise<Mocao[]> {
  const emp = await tenantAtual()
  return (await lerMocoes(emp, c.id)).filter((m) => ["habilitada", "aprovada", "rejeitada"].includes(m.situacao))
}
