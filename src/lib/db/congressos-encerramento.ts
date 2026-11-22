import "server-only"

import { randomBytes } from "node:crypto"

import { valor } from "@/lib/congressos/config"
import {
  codigoCertificado,
  conferirChapa,
  direitoAoCertificado,
  dividirVagas,
  eleitosDaChapa,
  frequencia,
  janelaDeChapas,
  lembrar,
  ROTULO_SITUACAO_RESOLUCAO,
  type DestinoResolucao,
  type SituacaoResolucao,
} from "@/lib/congressos/encerramento"
import { normalizarDireitos } from "@/lib/congressos/regras"
import { lerEmLotes } from "@/lib/db/comum"
import { listarPrograma, obterCongresso, type Congresso } from "@/lib/db/congressos"
import { dadosDoDia, type DadosDoDia } from "@/lib/db/congressos-dia"
import { gravarImportacao } from "@/lib/db/congressos-inscricao"
import { novasPropostas, type ContextoRelatoria } from "@/lib/db/congressos-relatoria"
import { registrarEvento } from "@/lib/db/negociacoes"
import { criarOficio } from "@/lib/db/oficios"
import { FECHO_PADRAO, SAUDACAO_PADRAO } from "@/lib/oficios-constantes"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Congressos — encerramento (Fase 6): resoluções com acompanhamento, eleição
 * da delegação para a etapa seguinte, certificados e a memória do que já foi
 * decidido. Regras puras em src/lib/congressos/encerramento.ts.
 */

type Contexto = ContextoRelatoria
const agoraIso = () => new Date().toISOString()
const hojeIso = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })
const nomeCongresso = (c: { nome: string; edicao: number | null }) => `${c.edicao ? `${c.edicao}º ` : ""}${c.nome}`

// ── Resoluções ──────────────────────────────────────────────────────────────

export type Resolucao = {
  id: string
  numero: number
  propostaId: string | null
  propostaNumero: number | null
  mocaoId: string | null
  mocaoNumero: number | null
  eixoId: string | null
  titulo: string | null
  texto: string
  reservada: boolean
  destino: DestinoResolucao
  responsavel: string | null
  prazo: string | null
  situacao: SituacaoResolucao
  negociacaoId: string | null
  oficioId: string | null
  destinatario: string | null
  createdAt: string
  updatedAt: string | null
}

const CAMPOS_RESOLUCAO =
  "id, numero, proposta_id, mocao_id, eixo_id, titulo, texto, reservada, destino, responsavel, prazo, situacao, negociacao_id, oficio_id, created_at, updated_at, proposta:congresso_propostas(numero), mocao:congresso_mocoes(numero, destinatario)"

function um<T>(v: unknown): T | null {
  return (Array.isArray(v) ? v[0] : v) as T | null
}

function paraResolucao(r: Record<string, unknown>): Resolucao {
  const p = um<{ numero: number }>(r.proposta)
  const m = um<{ numero: number; destinatario: string | null }>(r.mocao)
  return {
    id: r.id as string,
    numero: r.numero as number,
    propostaId: (r.proposta_id as string | null) ?? null,
    propostaNumero: p?.numero ?? null,
    mocaoId: (r.mocao_id as string | null) ?? null,
    mocaoNumero: m?.numero ?? null,
    eixoId: (r.eixo_id as string | null) ?? null,
    titulo: (r.titulo as string | null) ?? null,
    texto: r.texto as string,
    reservada: r.reservada === true,
    destino: r.destino as DestinoResolucao,
    responsavel: (r.responsavel as string | null) ?? null,
    prazo: (r.prazo as string | null) ?? null,
    situacao: r.situacao as SituacaoResolucao,
    negociacaoId: (r.negociacao_id as string | null) ?? null,
    oficioId: (r.oficio_id as string | null) ?? null,
    destinatario: m?.destinatario ?? null,
    createdAt: r.created_at as string,
    updatedAt: (r.updated_at as string | null) ?? null,
  }
}

export async function listarResolucoes(c: Congresso, opcoes: { tenantId?: string; publicas?: boolean } = {}): Promise<Resolucao[]> {
  const emp = opcoes.tenantId ?? (await tenantAtual())
  const admin = await createAdminClient()
  const linhas = await lerEmLotes<Record<string, unknown>>((de, ate) => {
    let q = admin.from("congresso_resolucoes").select(CAMPOS_RESOLUCAO).eq("emp_proprietaria_id", emp).eq("congresso_id", c.id)
    if (opcoes.publicas) q = q.eq("reservada", false)
    return q.order("numero").range(de, ate)
  })
  return linhas.map(paraResolucao)
}

async function lerResolucao(ctx: Contexto, id: string): Promise<Resolucao | null> {
  const admin = await createAdminClient()
  const { data } = await admin.from("congresso_resolucoes").select(CAMPOS_RESOLUCAO).eq("emp_proprietaria_id", ctx.tenantId).eq("congresso_id", ctx.c.id).eq("id", id).maybeSingle()
  return data ? paraResolucao(data) : null
}

async function eventoResolucao(ctx: Contexto, resolucaoId: string, acao: string, detalhe: string | null, situacao: SituacaoResolucao | null = null) {
  const admin = await createAdminClient()
  await admin.from("congresso_resolucao_eventos").insert({
    emp_proprietaria_id: ctx.tenantId,
    congresso_id: ctx.c.id,
    resolucao_id: resolucaoId,
    acao,
    detalhe,
    situacao,
    autor: ctx.autor.nome,
  })
}

export type EventoResolucao = { acao: string; situacao: string | null; detalhe: string | null; autor: string | null; createdAt: string }

export async function eventosDasResolucoes(c: Congresso): Promise<Map<string, EventoResolucao[]>> {
  const emp = await tenantAtual()
  const admin = await createAdminClient()
  const linhas = await lerEmLotes<Record<string, unknown>>((de, ate) =>
    admin
      .from("congresso_resolucao_eventos")
      .select("resolucao_id, acao, situacao, detalhe, autor, created_at")
      .eq("emp_proprietaria_id", emp)
      .eq("congresso_id", c.id)
      .order("created_at")
      .range(de, ate)
  )
  const m = new Map<string, EventoResolucao[]>()
  for (const e of linhas) {
    const k = e.resolucao_id as string
    m.set(k, [
      ...(m.get(k) ?? []),
      { acao: e.acao as string, situacao: (e.situacao as string | null) ?? null, detalhe: (e.detalhe as string | null) ?? null, autor: (e.autor as string | null) ?? null, createdAt: e.created_at as string },
    ])
  }
  return m
}

/**
 * Gera as resoluções do que a plenária aprovou (propostas e moções) e ainda
 * não virou resolução. O texto é congelado; a numeração segue a dos eixos.
 */
export async function gerarResolucoes(ctx: Contexto): Promise<{ erro?: string; criadas: number }> {
  const admin = await createAdminClient()
  const [{ data: ps }, { data: ms }, { data: ja }, programa] = await Promise.all([
    admin.from("congresso_propostas").select("id, numero, eixo_id, texto").eq("emp_proprietaria_id", ctx.tenantId).eq("congresso_id", ctx.c.id).eq("situacao", "aprovada"),
    admin.from("congresso_mocoes").select("id, numero, tipo, titulo, texto, destinatario").eq("emp_proprietaria_id", ctx.tenantId).eq("congresso_id", ctx.c.id).eq("situacao", "aprovada"),
    admin.from("congresso_resolucoes").select("numero, proposta_id, mocao_id").eq("emp_proprietaria_id", ctx.tenantId).eq("congresso_id", ctx.c.id),
    listarPrograma(ctx.c.id),
  ])
  const feitasP = new Set((ja ?? []).map((r) => r.proposta_id as string | null).filter(Boolean))
  const feitasM = new Set((ja ?? []).map((r) => r.mocao_id as string | null).filter(Boolean))
  const ordemEixo = new Map(programa.eixos.map((e, i) => [e.id, i]))
  const propostas = (ps ?? [])
    .filter((p) => !feitasP.has(p.id as string))
    .sort((a, b) => (ordemEixo.get(a.eixo_id as string) ?? 999) - (ordemEixo.get(b.eixo_id as string) ?? 999) || (a.numero as number) - (b.numero as number))
  const mocoes = (ms ?? []).filter((m) => !feitasM.has(m.id as string)).sort((a, b) => (a.numero as number) - (b.numero as number))
  if (!propostas.length && !mocoes.length) return { criadas: 0, erro: feitasP.size || feitasM.size ? undefined : "Ainda não há propostas nem moções aprovadas na plenária." }
  let numero = Math.max(0, ...(ja ?? []).map((r) => r.numero as number))
  const linhas = [
    ...propostas.map((p) => ({ proposta_id: p.id, eixo_id: p.eixo_id, titulo: null, texto: p.texto, destino: "registro" })),
    ...mocoes.map((m) => ({
      mocao_id: m.id,
      eixo_id: null,
      titulo: `Moção${m.tipo ? ` de ${String(m.tipo).toLowerCase()}` : ""}: ${m.titulo}`,
      texto: m.texto,
      destino: m.destinatario ? "oficio" : "registro",
    })),
  ].map((l) => ({ ...l, numero: ++numero, emp_proprietaria_id: ctx.tenantId, congresso_id: ctx.c.id }))
  const { data, error } = await admin.from("congresso_resolucoes").insert(linhas).select("id")
  if (error) return { erro: error.code === "23505" ? "Outra pessoa gerou as resoluções agora. Recarregue a página." : error.message, criadas: 0 }
  await admin.from("congresso_resolucao_eventos").insert(
    (data ?? []).map((r) => ({ emp_proprietaria_id: ctx.tenantId, congresso_id: ctx.c.id, resolucao_id: r.id, acao: "gerada", autor: ctx.autor.nome }))
  )
  return { criadas: data?.length ?? 0 }
}

/** Resolução avulsa (ex.: o Plano de luta da atividade conjunta). */
export async function novaResolucao(ctx: Contexto, d: { titulo: string | null; texto: string; eixoId: string | null; reservada: boolean }): Promise<{ erro?: string }> {
  const texto = d.texto.trim()
  if (texto.length < 5) return { erro: "Escreva o texto da resolução." }
  const admin = await createAdminClient()
  for (let t = 0; t < 4; t++) {
    const { data: ult } = await admin.from("congresso_resolucoes").select("numero").eq("emp_proprietaria_id", ctx.tenantId).eq("congresso_id", ctx.c.id).order("numero", { ascending: false }).limit(1)
    const { data, error } = await admin
      .from("congresso_resolucoes")
      .insert({
        emp_proprietaria_id: ctx.tenantId,
        congresso_id: ctx.c.id,
        numero: ((ult?.[0]?.numero as number | undefined) ?? 0) + 1,
        titulo: d.titulo?.trim() || null,
        texto,
        eixo_id: d.eixoId,
        reservada: d.reservada,
      })
      .select("id")
      .single()
    if (error?.code === "23505") continue
    if (error) return { erro: error.message }
    await eventoResolucao(ctx, data.id as string, "gerada", "Registrada à mão")
    return {}
  }
  return { erro: "Não foi possível numerar agora. Tente de novo." }
}

/** Reservada, destino, responsável, prazo e situação; cada mudança fica no acompanhamento. */
export async function atualizarResolucao(
  ctx: Contexto,
  id: string,
  d: { reservada?: boolean; destino?: DestinoResolucao; responsavel?: string | null; prazo?: string | null; situacao?: SituacaoResolucao; nota?: string | null }
): Promise<{ erro?: string }> {
  const r = await lerResolucao(ctx, id)
  if (!r) return { erro: "Resolução não encontrada." }
  const upd: Record<string, unknown> = { updated_at: agoraIso() }
  const mudou: string[] = []
  if (d.reservada !== undefined && d.reservada !== r.reservada) {
    upd.reservada = d.reservada
    mudou.push(d.reservada ? "marcada como reservada" : "deixou de ser reservada")
  }
  if (d.destino && d.destino !== r.destino) {
    upd.destino = d.destino
    mudou.push(`destino: ${d.destino}`)
  }
  if (d.responsavel !== undefined && (d.responsavel?.trim() || null) !== r.responsavel) {
    upd.responsavel = d.responsavel?.trim() || null
    mudou.push(`responsável: ${upd.responsavel ?? "—"}`)
  }
  if (d.prazo !== undefined && (d.prazo || null) !== r.prazo) {
    upd.prazo = d.prazo || null
    mudou.push(`prazo: ${upd.prazo ?? "—"}`)
  }
  if (d.situacao && d.situacao !== r.situacao) upd.situacao = d.situacao
  const nota = d.nota?.trim() || null
  if (Object.keys(upd).length === 1 && !nota) return {}
  const admin = await createAdminClient()
  const { error } = await admin.from("congresso_resolucoes").update(upd).eq("emp_proprietaria_id", ctx.tenantId).eq("id", id)
  if (error) return { erro: error.message }
  if (d.situacao && d.situacao !== r.situacao) await eventoResolucao(ctx, id, "situacao", nota, d.situacao)
  else if (nota) await eventoResolucao(ctx, id, "nota", nota)
  if (mudou.length) await eventoResolucao(ctx, id, "alterada", mudou.join("; "))
  return {}
}

/** Liga a resolução a uma negociação: vira acontecimento na linha do tempo dela. */
export async function vincularNegociacao(ctx: Contexto, id: string, negociacaoId: string, usuarioId: string): Promise<{ erro?: string }> {
  const r = await lerResolucao(ctx, id)
  if (!r) return { erro: "Resolução não encontrada." }
  if (r.negociacaoId === negociacaoId) return {}
  const ev = await registrarEvento(
    negociacaoId,
    {
      data: hojeIso(),
      tipo: "outro",
      titulo: `Resolução ${r.numero} do ${nomeCongresso(ctx.c)}`,
      descricao: r.reservada ? `${r.titulo ? `${r.titulo}\n` : ""}(resolução reservada: o texto está no congresso)` : `${r.titulo ? `${r.titulo}\n` : ""}${r.texto}`,
    },
    usuarioId
  )
  if (ev.erro) return ev
  const admin = await createAdminClient()
  await admin
    .from("congresso_resolucoes")
    .update({ negociacao_id: negociacaoId, destino: "pauta_act", situacao: r.situacao === "a_encaminhar" ? "em_andamento" : r.situacao, updated_at: agoraIso() })
    .eq("emp_proprietaria_id", ctx.tenantId)
    .eq("id", id)
  await eventoResolucao(ctx, id, "negociacao", "Levada à negociação do acordo coletivo", r.situacao === "a_encaminhar" ? "em_andamento" : null)
  return {}
}

/** Moção aprovada → rascunho de ofício ao destinatário, em Ferramentas › Ofícios. */
export async function gerarOficioDaResolucao(ctx: Contexto, id: string, usuarioId: string): Promise<{ erro?: string; oficioId?: string }> {
  const r = await lerResolucao(ctx, id)
  if (!r) return { erro: "Resolução não encontrada." }
  if (r.oficioId) return { oficioId: r.oficioId }
  const corpo =
    `Encaminhamos a ${r.titulo ? r.titulo.charAt(0).toLowerCase() + r.titulo.slice(1) : `resolução ${r.numero}`}, aprovada pela plenária do ${nomeCongresso(ctx.c)}:\n\n${r.texto}`
  const o = await criarOficio(
    {
      tipo: "manual",
      data: hojeIso(),
      sede_id: null,
      destinatario_empresa_id: null,
      destinatario_texto: r.destinatario,
      aos_cuidados: null,
      assunto: r.titulo ?? `Resolução ${r.numero} do ${nomeCongresso(ctx.c)}`,
      corpo,
      saudacao: SAUDACAO_PADRAO,
      fecho: FECHO_PADRAO,
      assinante_integrante_id: null,
      coassinantes: [],
      departamento_id: null,
    },
    usuarioId
  )
  if (o.erro || !o.id) return { erro: o.erro ?? "Não foi possível criar o ofício." }
  const admin = await createAdminClient()
  await admin
    .from("congresso_resolucoes")
    .update({ oficio_id: o.id, destino: "oficio", situacao: r.situacao === "a_encaminhar" ? "em_andamento" : r.situacao, updated_at: agoraIso() })
    .eq("emp_proprietaria_id", ctx.tenantId)
    .eq("id", id)
  await eventoResolucao(ctx, id, "oficio", "Rascunho de ofício criado", r.situacao === "a_encaminhar" ? "em_andamento" : null)
  return { oficioId: o.id }
}

// ── Memória: o que já foi decidido ──────────────────────────────────────────

export type Lembrete = { fonte: string; texto: string; nota: number; link: string | null; reservada?: boolean }

/** Resoluções de outros congressos e cláusulas dos acordos vigentes, para comparar. */
export async function fontesDaMemoria(c: Congresso): Promise<{ fonte: string; texto: string; link: string | null; reservada?: boolean }[]> {
  const emp = await tenantAtual()
  const admin = await createAdminClient()
  const hoje = hojeIso()
  const [{ data: rs }, { data: acordos }] = await Promise.all([
    admin
      .from("congresso_resolucoes")
      .select("numero, titulo, texto, reservada, congresso:congressos(id, nome, edicao)")
      .eq("emp_proprietaria_id", emp)
      .neq("congresso_id", c.id)
      .limit(3000),
    admin.from("acordo_coletivo").select("id, titulo, vigencia_inicio, vigencia_fim, situacao").eq("emp_proprietaria_id", emp).or(`vigencia_fim.gte.${hoje},situacao.eq.vigente`).limit(10),
  ])
  const fontes: { fonte: string; texto: string; link: string | null; reservada?: boolean }[] = (rs ?? []).map((r) => {
    const cg = um<{ id: string; nome: string; edicao: number | null }>(r.congresso)
    return {
      fonte: `Resolução ${r.numero} do ${cg ? nomeCongresso(cg) : "congresso anterior"}`,
      texto: `${r.titulo ?? ""} ${r.texto}`,
      link: cg ? `/painel/representacao/congressos/${cg.id}/resolucoes` : null,
      reservada: r.reservada === true,
    }
  })
  const ids = (acordos ?? []).map((a) => a.id as string)
  if (ids.length) {
    const titulo = new Map((acordos ?? []).map((a) => [a.id as string, (a.titulo as string | null) ?? "Acordo vigente"]))
    const clausulas = await lerEmLotes<Record<string, unknown>>((de, ate) =>
      admin.from("acordo_clausulas").select("acordo_id, numero, titulo, texto").eq("emp_proprietaria_id", emp).in("acordo_id", ids).range(de, ate)
    )
    for (const cl of clausulas) {
      fontes.push({
        fonte: `${titulo.get(cl.acordo_id as string)} · cláusula ${cl.numero ?? "?"}${cl.titulo ? ` (${cl.titulo})` : ""}`,
        texto: `${cl.titulo ?? ""} ${cl.texto ?? ""}`,
        link: `/painel/representacao/acordos/${cl.acordo_id}`,
      })
    }
  }
  return fontes
}

/** Para cada texto, as decisões anteriores e cláusulas parecidas (sem IA). */
export async function memoriaDosTextos(c: Congresso, textos: { id: string; texto: string }[]): Promise<Map<string, Lembrete[]>> {
  const fontes = await fontesDaMemoria(c)
  const saida = new Map<string, Lembrete[]>()
  if (!fontes.length) return saida
  const candidatos = fontes.map((f) => ({ item: f, texto: f.texto }))
  for (const t of textos) {
    const achados = lembrar(t.texto, candidatos)
    if (achados.length)
      saida.set(
        t.id,
        achados.map((a) => ({ fonte: a.item.fonte, texto: a.item.texto.trim().slice(0, 400), nota: a.nota, link: a.item.link, reservada: a.item.reservada }))
      )
  }
  return saida
}

// ── Eleição da delegação ────────────────────────────────────────────────────

export function regrasDaEleicao(c: Congresso) {
  return {
    ha: valor<boolean>(c.config, "eleicao.ha") === true,
    vagas: Number(valor(c.config, "eleicao.vagas") ?? 18),
    suplentes: Number(valor(c.config, "eleicao.suplentes") ?? 0),
    criterio: (valor<string>(c.config, "eleicao.criterio") ?? "maioria") as "maioria" | "proporcional",
    completa: valor<boolean>(c.config, "eleicao.chapa_completa") !== false,
    quemCompoe: (valor<string>(c.config, "eleicao.quem_compoe") ?? "delegados_credenciados") as string,
    inicio: (valor<string | null>(c.config, "eleicao.inscricao_inicio") as string | null) ?? null,
    fim: (valor<string | null>(c.config, "eleicao.inscricao_fim") as string | null) ?? null,
  }
}
export type RegrasEleicao = ReturnType<typeof regrasDaEleicao>

export type MembroChapa = { id: string; participanteId: string; nome: string; base: string | null; condicao: "titular" | "suplente"; ordem: number; eleito: boolean | null }
export type Chapa = {
  id: string
  numero: number
  nome: string
  situacao: "inscrita" | "homologada" | "impugnada" | "retirada"
  motivo: string | null
  votos: number | null
  vagasTitulares: number | null
  vagasSuplentes: number | null
  inscritaEm: string
  inscritaPor: string | null
  membros: MembroChapa[]
}

function podeCompor(regra: string, d: DadosDoDia) {
  return (p: DadosDoDia["participantes"][number]) => {
    const valida = p.situacao === "confirmado" || p.situacao === "inscrito"
    if (!valida) return false
    if (regra === "participantes") return true
    if (!p.credenciadoEm) return false
    if (regra === "credenciados") return true
    const papel = p.papelId ? d.papelPorId.get(p.papelId) : undefined
    const dir = papel ? normalizarDireitos(papel.categoria, papel.direitos) : null
    return !!dir?.candidatar
  }
}

export type DadosEleicao = {
  regras: RegrasEleicao
  chapas: Chapa[]
  janela: { aberta: boolean; motivo?: string }
  candidatos: { id: string; nome: string; base: string | null; podeCompor: boolean; chapa: number | null }[]
  apurada: boolean
}

export async function dadosDaEleicao(c: Congresso): Promise<DadosEleicao> {
  const emp = await tenantAtual()
  const admin = await createAdminClient()
  const regras = regrasDaEleicao(c)
  const [d, { data: chs }, { data: ms }] = await Promise.all([
    dadosDoDia(c.id),
    admin
      .from("congresso_chapas")
      .select("id, numero, nome, situacao, motivo, votos, vagas_titulares, vagas_suplentes, inscrita_em, inscrita_por")
      .eq("emp_proprietaria_id", emp)
      .eq("congresso_id", c.id)
      .order("numero"),
    admin.from("congresso_chapa_membros").select("id, chapa_id, participante_id, unidade_id, condicao, ordem, eleito").eq("emp_proprietaria_id", emp).eq("congresso_id", c.id),
  ])
  const pessoa = new Map(d.participantes.map((p) => [p.id, p]))
  const base = new Map(d.unidades.map((u) => [u.id, u.nome]))
  const chapas: Chapa[] = (chs ?? []).map((ch) => ({
    id: ch.id as string,
    numero: ch.numero as number,
    nome: ch.nome as string,
    situacao: ch.situacao as Chapa["situacao"],
    motivo: (ch.motivo as string | null) ?? null,
    votos: (ch.votos as number | null) ?? null,
    vagasTitulares: (ch.vagas_titulares as number | null) ?? null,
    vagasSuplentes: (ch.vagas_suplentes as number | null) ?? null,
    inscritaEm: ch.inscrita_em as string,
    inscritaPor: (ch.inscrita_por as string | null) ?? null,
    membros: (ms ?? [])
      .filter((m) => m.chapa_id === ch.id)
      .map((m) => {
        const p = pessoa.get(m.participante_id as string)
        return {
          id: m.id as string,
          participanteId: m.participante_id as string,
          nome: p ? (p.nomeSocial ?? p.nome) : "—",
          base: m.unidade_id ? (base.get(m.unidade_id as string) ?? null) : null,
          condicao: m.condicao as "titular" | "suplente",
          ordem: m.ordem as number,
          eleito: (m.eleito as boolean | null) ?? null,
        }
      })
      .sort((a, b) => (a.condicao === b.condicao ? a.ordem - b.ordem : a.condicao === "titular" ? -1 : 1)),
  }))
  const ativa = chapas.filter((ch) => ch.situacao !== "retirada" && ch.situacao !== "impugnada")
  const naChapa = new Map(ativa.flatMap((ch) => ch.membros.map((m) => [m.participanteId, ch.numero] as const)))
  const pode = podeCompor(regras.quemCompoe, d)
  return {
    regras,
    chapas,
    janela: janelaDeChapas(regras.inicio, regras.fim),
    candidatos: d.participantes
      .filter((p) => p.situacao === "confirmado" || p.situacao === "inscrito")
      .map((p) => ({ id: p.id, nome: p.nomeSocial ?? p.nome, base: p.unidadeId ? (base.get(p.unidadeId) ?? null) : null, podeCompor: pode(p), chapa: naChapa.get(p.id) ?? null }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    apurada: chapas.some((ch) => ch.vagasTitulares !== null),
  }
}

/** Inscreve a chapa com a hora da inscrição, conferindo tamanho, quem pode compor e a janela. */
export async function inscreverChapa(
  ctx: Contexto,
  d: { nome: string; membros: { participanteId: string; condicao: "titular" | "suplente" }[] }
): Promise<{ erro?: string; numero?: number; problemas?: string[] }> {
  const e = await dadosDaEleicao(ctx.c)
  if (!e.regras.ha) return { erro: "A configuração não prevê eleição de delegação neste congresso." }
  if (!e.janela.aberta) return { erro: e.janela.motivo }
  if (e.apurada) return { erro: "A eleição já foi apurada." }
  const nome = d.nome.trim()
  if (nome.length < 2) return { erro: "Dê um nome à chapa." }
  const cand = new Map(e.candidatos.map((x) => [x.id, x]))
  const conferencia = conferirChapa({
    membros: d.membros.map((m) => {
      const x = cand.get(m.participanteId)
      return { participanteId: m.participanteId, nome: x?.nome ?? "Participante", condicao: m.condicao, podeCompor: !!x?.podeCompor, outraChapa: x?.chapa ? String(x.chapa) : null }
    }),
    vagas: e.regras.vagas,
    suplentes: e.regras.suplentes,
    completa: e.regras.completa,
  })
  if (!conferencia.ok) return { erro: "A chapa não pode ser inscrita assim.", problemas: conferencia.problemas }
  const admin = await createAdminClient()
  const { data: unidades } = await admin
    .from("congresso_participantes")
    .select("id, unidade_id")
    .eq("emp_proprietaria_id", ctx.tenantId)
    .in("id", d.membros.map((m) => m.participanteId))
  const unidade = new Map((unidades ?? []).map((u) => [u.id as string, (u.unidade_id as string | null) ?? null]))
  for (let t = 0; t < 4; t++) {
    const numero = Math.max(0, ...e.chapas.map((ch) => ch.numero)) + 1 + t
    const { data: ch, error } = await admin
      .from("congresso_chapas")
      .insert({ emp_proprietaria_id: ctx.tenantId, congresso_id: ctx.c.id, numero, nome, inscrita_por: ctx.autor.nome })
      .select("id, numero")
      .single()
    if (error?.code === "23505") continue
    if (error) return { erro: error.message }
    const ordem = { titular: 0, suplente: 0 }
    const { error: e2 } = await admin.from("congresso_chapa_membros").insert(
      d.membros.map((m) => ({
        emp_proprietaria_id: ctx.tenantId,
        congresso_id: ctx.c.id,
        chapa_id: ch.id,
        participante_id: m.participanteId,
        unidade_id: unidade.get(m.participanteId) ?? null,
        condicao: m.condicao,
        ordem: ++ordem[m.condicao],
      }))
    )
    if (e2) {
      await admin.from("congresso_chapas").delete().eq("id", ch.id)
      return { erro: e2.message }
    }
    return { numero: ch.numero as number }
  }
  return { erro: "Não foi possível numerar a chapa agora. Tente de novo." }
}

export async function situacaoDaChapa(ctx: Contexto, chapaId: string, situacao: Chapa["situacao"], motivo: string | null): Promise<{ erro?: string }> {
  if ((situacao === "impugnada" || situacao === "retirada") && !motivo?.trim()) return { erro: "Informe o motivo." }
  const admin = await createAdminClient()
  const { data: apurada } = await admin.from("congresso_chapas").select("id").eq("emp_proprietaria_id", ctx.tenantId).eq("congresso_id", ctx.c.id).not("vagas_titulares", "is", null).limit(1)
  if (apurada?.length) return { erro: "A eleição já foi apurada: desfaça a apuração antes." }
  const { error } = await admin
    .from("congresso_chapas")
    .update({ situacao, motivo: motivo?.trim() || null, updated_at: agoraIso() })
    .eq("emp_proprietaria_id", ctx.tenantId)
    .eq("congresso_id", ctx.c.id)
    .eq("id", chapaId)
  return error ? { erro: error.message } : {}
}

/** Lança os votos, divide as vagas e marca os eleitos. Empate não grava eleitos. */
export async function apurarEleicao(ctx: Contexto, votos: Record<string, number>): Promise<{ erro?: string; aviso?: string }> {
  const e = await dadosDaEleicao(ctx.c)
  const concorrem = e.chapas.filter((ch) => ch.situacao === "inscrita" || ch.situacao === "homologada")
  if (!concorrem.length) return { erro: "Nenhuma chapa concorrendo." }
  const lista = concorrem.map((ch) => ({ id: ch.id, votos: Math.max(0, Math.floor(Number(votos[ch.id] ?? 0))), inscritaEm: ch.inscritaEm }))
  const tit = dividirVagas(lista, e.regras.vagas, e.regras.criterio)
  if (tit.empate && e.regras.criterio === "maioria") return { erro: tit.aviso }
  const sup = e.regras.suplentes > 0 ? dividirVagas(lista, e.regras.suplentes, e.regras.criterio) : { vagas: new Map<string, number>(), empate: false }
  const admin = await createAdminClient()
  for (const ch of concorrem) {
    const vt = tit.vagas.get(ch.id) ?? 0
    const vs = sup.vagas.get(ch.id) ?? 0
    await admin
      .from("congresso_chapas")
      .update({ votos: lista.find((l) => l.id === ch.id)!.votos, vagas_titulares: vt, vagas_suplentes: vs, updated_at: agoraIso() })
      .eq("emp_proprietaria_id", ctx.tenantId)
      .eq("id", ch.id)
    const eleitos = eleitosDaChapa(ch.membros, vt, vs)
    for (const m of ch.membros)
      await admin.from("congresso_chapa_membros").update({ eleito: eleitos.has(m.participanteId) }).eq("emp_proprietaria_id", ctx.tenantId).eq("id", m.id)
  }
  return { aviso: tit.aviso }
}

export async function desfazerApuracao(ctx: Contexto): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  await admin.from("congresso_chapas").update({ votos: null, vagas_titulares: null, vagas_suplentes: null, updated_at: agoraIso() }).eq("emp_proprietaria_id", ctx.tenantId).eq("congresso_id", ctx.c.id)
  await admin.from("congresso_chapa_membros").update({ eleito: null }).eq("emp_proprietaria_id", ctx.tenantId).eq("congresso_id", ctx.c.id)
  return {}
}

/**
 * Leva à etapa seguinte (congresso cadastrado como etapa seguinte): os eleitos
 * entram como participantes (titulares e suplentes) e as resoluções marcadas
 * "Levar à etapa seguinte" entram como propostas de origem "etapa anterior".
 */
export async function enviarAEtapaSeguinte(ctx: Contexto, usuarioId: string): Promise<{ erro?: string; ok?: string }> {
  if (!ctx.c.etapaSeguinteId) return { erro: "Cadastre o congresso da etapa seguinte na aba Geral para enviar." }
  const destino = await obterCongresso(ctx.c.etapaSeguinteId)
  if (!destino) return { erro: "O congresso da etapa seguinte não foi encontrado." }
  const e = await dadosDaEleicao(ctx.c)
  const d = await dadosDoDia(ctx.c.id)
  const pessoa = new Map(d.participantes.map((p) => [p.id, p]))
  const eleitos = e.chapas.flatMap((ch) => ch.membros.filter((m) => m.eleito)).map((m) => ({ m, p: pessoa.get(m.participanteId) }))
  const partes: string[] = []
  if (eleitos.length) {
    const r = await gravarImportacao(
      destino.id,
      eleitos.map(({ m, p }, i) => ({
        linha: i + 1,
        nome: p?.nome ?? m.nome,
        cpf: p?.cpf ?? null,
        email: p?.email ?? null,
        telefone: p?.telefone ?? null,
        genero: p?.genero ?? null,
        base: m.base,
        papel: m.condicao === "titular" ? "delegado titular" : "suplente",
      })),
      { papelId: null, unidadeId: null },
      "planilha",
      usuarioId
    )
    partes.push(r.erro ? `Eleitos: ${r.erro}` : `Eleitos: ${r.ok}`)
  }
  const resolucoes = (await listarResolucoes(ctx.c)).filter((r) => r.destino === "etapa_seguinte")
  if (resolucoes.length) {
    const r = await novasPropostas(
      { c: destino, tenantId: ctx.tenantId, autor: ctx.autor },
      { textos: resolucoes.map((x) => x.texto), eixoId: null, origem: "etapa_anterior", origemDescricao: `Aprovada no ${nomeCongresso(ctx.c)}`, abrangencia: null, situacao: "entregue" }
    )
    partes.push(r.erro ? `Propostas: ${r.erro}` : `${r.criadas} proposta(s) levadas ao caderno da etapa seguinte.`)
    for (const x of resolucoes) if (x.situacao === "a_encaminhar") await atualizarResolucao(ctx, x.id, { situacao: "cumprida", nota: `Levada ao ${nomeCongresso(destino)}` })
  }
  if (!partes.length) return { erro: "Não há eleitos nem resoluções marcadas para levar à etapa seguinte." }
  return { ok: partes.join(" ") }
}

// ── Certificados ────────────────────────────────────────────────────────────

export type LinhaCertificado = {
  participanteId: string
  nome: string
  papel: string | null
  base: string | null
  credenciado: boolean
  presencas: number
  frequencia: number | null
  direito: { tem: boolean; motivo?: string }
  certificado: { id: string; codigo: string; emitidoEm: string } | null
}

export async function dadosDosCertificados(c: Congresso, tenantId?: string): Promise<{ linhas: LinhaCertificado[]; sessoesRealizadas: number; regra: string; minimo: number }> {
  const emp = tenantId ?? (await tenantAtual())
  const admin = await createAdminClient()
  const [d, presencas, { data: certs }] = await Promise.all([
    dadosDoDia(c.id),
    lerEmLotes<Record<string, unknown>>((de, ate) =>
      admin.from("congresso_presencas").select("participante_id, sessao_id").eq("emp_proprietaria_id", emp).eq("congresso_id", c.id).range(de, ate)
    ),
    admin.from("congresso_certificados").select("id, participante_id, codigo, emitido_em").eq("emp_proprietaria_id", emp).eq("congresso_id", c.id).is("revogado_em", null),
  ])
  const porSessao = valor<boolean>(c.config, "presenca.por_sessao") !== false
  const realizadas = new Set(presencas.map((p) => p.sessao_id as string))
  const porPessoa = new Map<string, Set<string>>()
  for (const p of presencas) {
    const k = p.participante_id as string
    if (!porPessoa.has(k)) porPessoa.set(k, new Set())
    porPessoa.get(k)!.add(p.sessao_id as string)
  }
  const regra = (valor<string>(c.config, "encerramento.certificado") as string) ?? "todos"
  const minimo = Number(valor(c.config, "presenca.frequencia_certificado") ?? 75)
  const cert = new Map((certs ?? []).map((x) => [x.participante_id as string, { id: x.id as string, codigo: x.codigo as string, emitidoEm: x.emitido_em as string }]))
  const base = new Map(d.unidades.map((u) => [u.id, u.nome]))
  const linhas = d.participantes
    .filter((p) => p.situacao === "confirmado" || p.situacao === "inscrito")
    .map((p) => {
      const n = porPessoa.get(p.id)?.size ?? 0
      const freq = porSessao && realizadas.size ? frequencia(n, realizadas.size) : null
      return {
        participanteId: p.id,
        nome: p.nomeSocial ?? p.nome,
        papel: p.papelId ? (d.papelPorId.get(p.papelId)?.nome ?? null) : null,
        base: p.unidadeId ? (base.get(p.unidadeId) ?? null) : null,
        credenciado: !!p.credenciadoEm,
        presencas: n,
        frequencia: freq,
        direito: direitoAoCertificado({ credenciado: !!p.credenciadoEm, frequencia: freq, minimo, regra }),
        certificado: cert.get(p.id) ?? null,
      }
    })
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
  return { linhas, sessoesRealizadas: realizadas.size, regra, minimo }
}

async function inserirCertificados(ctx: Contexto, linhas: LinhaCertificado[]): Promise<number> {
  if (!linhas.length) return 0
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("congresso_certificados")
    .insert(
      linhas.map((l) => ({
        emp_proprietaria_id: ctx.tenantId,
        congresso_id: ctx.c.id,
        participante_id: l.participanteId,
        codigo: codigoCertificado(randomBytes(8)),
        nome: l.nome,
        condicao: [l.papel, l.base].filter(Boolean).join(" · ") || "Participante",
        frequencia: l.frequencia,
        emitido_por: ctx.autor.nome,
      }))
    )
    .select("id")
  if (error) throw new Error(error.code === "23505" ? "Outra pessoa emitiu certificados agora. Recarregue a página." : error.message)
  return data?.length ?? 0
}

/** Emite o certificado de quem tem direito e ainda não tem. */
export async function emitirCertificados(ctx: Contexto): Promise<{ erro?: string; emitidos: number }> {
  const d = await dadosDosCertificados(ctx.c, ctx.tenantId)
  if (d.regra === "nao") return { erro: "Este congresso não emite certificado.", emitidos: 0 }
  try {
    return { emitidos: await inserirCertificados(ctx, d.linhas.filter((l) => l.direito.tem && !l.certificado)) }
  } catch (e) {
    return { erro: (e as Error).message, emitidos: 0 }
  }
}

export async function revogarCertificado(ctx: Contexto, id: string, motivo: string): Promise<{ erro?: string }> {
  if (motivo.trim().length < 3) return { erro: "Informe o motivo." }
  const admin = await createAdminClient()
  const { error } = await admin
    .from("congresso_certificados")
    .update({ revogado_em: agoraIso(), revogado_motivo: motivo.trim() })
    .eq("emp_proprietaria_id", ctx.tenantId)
    .eq("congresso_id", ctx.c.id)
    .eq("id", id)
    .is("revogado_em", null)
  return error ? { erro: error.message } : {}
}

export type Certificado = { id: string; codigo: string; nome: string; condicao: string; frequencia: number | null; emitidoEm: string; participanteId: string }

export async function certificadosValidos(c: Congresso, tenantId?: string, participanteId?: string): Promise<Certificado[]> {
  const emp = tenantId ?? (await tenantAtual())
  const admin = await createAdminClient()
  let q = admin
    .from("congresso_certificados")
    .select("id, codigo, nome, condicao, frequencia, emitido_em, participante_id")
    .eq("emp_proprietaria_id", emp)
    .eq("congresso_id", c.id)
    .is("revogado_em", null)
  if (participanteId) q = q.eq("participante_id", participanteId)
  const { data } = await q.order("nome")
  return (data ?? []).map((x) => ({
    id: x.id as string,
    codigo: x.codigo as string,
    nome: x.nome as string,
    condicao: x.condicao as string,
    frequencia: x.frequencia === null ? null : Number(x.frequencia),
    emitidoEm: x.emitido_em as string,
    participanteId: x.participante_id as string,
  }))
}

/**
 * Certificado pelo link pessoal: devolve o emitido ou, quando o congresso já
 * encerrou e a pessoa tem direito, emite na hora (regra "todos" ou "a pedido").
 */
export async function certificadoPeloLink(c: Congresso & { encerradoEm?: string | null }, tenantId: string, participanteId: string): Promise<{ certificado?: Certificado; motivo?: string }> {
  const [atual] = await certificadosValidos(c, tenantId, participanteId)
  if (atual) return { certificado: atual }
  const enc = await encerramento(c.id, tenantId)
  if (!enc.encerradoEm) return { motivo: "O certificado sai depois do encerramento do congresso." }
  const d = await dadosDosCertificados(c, tenantId)
  const linha = d.linhas.find((l) => l.participanteId === participanteId)
  if (!linha) return { motivo: "Participação não encontrada." }
  if (!linha.direito.tem) return { motivo: linha.direito.motivo }
  try {
    await inserirCertificados({ c, tenantId, autor: { nome: "Link pessoal" } }, [linha])
  } catch {
    // outra aba emitiu ao mesmo tempo: basta ler de novo
  }
  const [novo] = await certificadosValidos(c, tenantId, participanteId)
  return novo ? { certificado: novo } : { motivo: "Não foi possível emitir agora. Tente de novo." }
}

export type VerificacaoCertificado = { codigo: string; nome: string; condicao: string; frequencia: number | null; congresso: string; emitidoEm: string; revogado: boolean; motivo: string | null }

export async function verificarCertificado(codigo: string): Promise<VerificacaoCertificado | null> {
  const c = codigo.trim().toUpperCase()
  if (!/^C[A-Z0-9]{7}$/.test(c)) return null
  const tenantId = await tenantAtual()
  const admin = await createAdminClient()
  const { data } = await admin
    .from("congresso_certificados")
    .select("codigo, nome, condicao, frequencia, emitido_em, revogado_em, revogado_motivo, congresso:congressos(nome, edicao)")
    .eq("emp_proprietaria_id", tenantId)
    .eq("codigo", c)
    .maybeSingle()
  if (!data) return null
  const cg = um<{ nome: string; edicao: number | null }>(data.congresso)
  return {
    codigo: data.codigo as string,
    nome: data.nome as string,
    condicao: data.condicao as string,
    frequencia: data.frequencia === null ? null : Number(data.frequencia),
    congresso: cg ? nomeCongresso(cg) : "Congresso",
    emitidoEm: data.emitido_em as string,
    revogado: !!data.revogado_em,
    motivo: (data.revogado_motivo as string | null) ?? null,
  }
}

// ── Encerrar ────────────────────────────────────────────────────────────────

export async function encerramento(congressoId: string, tenantId?: string): Promise<{ encerradoEm: string | null; encerradoPor: string | null }> {
  const emp = tenantId ?? (await tenantAtual())
  const admin = await createAdminClient()
  const { data } = await admin.from("congressos").select("encerrado_em, encerrado_por").eq("emp_proprietaria_id", emp).eq("id", congressoId).maybeSingle()
  return { encerradoEm: (data?.encerrado_em as string | null) ?? null, encerradoPor: (data?.encerrado_por as string | null) ?? null }
}

/** Encerra: gera as resoluções que faltam e libera relatório e certificados. */
export async function encerrarCongresso(ctx: Contexto): Promise<{ erro?: string; ok?: string }> {
  const g = await gerarResolucoes(ctx)
  const admin = await createAdminClient()
  const { error } = await admin
    .from("congressos")
    .update({ situacao: "encerrado", encerrado_em: agoraIso(), encerrado_por: ctx.autor.nome, updated_at: agoraIso() })
    .eq("emp_proprietaria_id", ctx.tenantId)
    .eq("id", ctx.c.id)
  if (error) return { erro: error.message }
  return { ok: `Congresso encerrado.${g.criadas ? ` ${g.criadas} resolução(ões) gerada(s).` : ""}` }
}

export async function reabrirCongresso(ctx: Contexto): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin
    .from("congressos")
    .update({ situacao: "em_andamento", encerrado_em: null, encerrado_por: null, updated_at: agoraIso() })
    .eq("emp_proprietaria_id", ctx.tenantId)
    .eq("id", ctx.c.id)
  return error ? { erro: error.message } : {}
}

// ── Indicadores ─────────────────────────────────────────────────────────────

export type Indicadores = {
  inscritos: number
  credenciados: number
  porCategoria: { categoria: string; inscritos: number; credenciados: number }[]
  porBase: { base: string; inscritos: number; credenciados: number }[]
  porGenero: { genero: string; credenciados: number }[]
  sessoes: { titulo: string; presentes: number }[]
  propostas: { total: number; porSituacao: Record<string, number>; porOrigem: Record<string, number> }
  mocoes: { total: number; aprovadas: number; assinaturas: number; porMeio: Record<string, number> }
  resolucoes: { total: number; reservadas: number; porSituacao: Record<string, number> }
}

export async function indicadoresDoCongresso(c: Congresso): Promise<Indicadores> {
  const emp = await tenantAtual()
  const admin = await createAdminClient()
  const [d, presencas, { data: ps }, { data: ms }, { data: ass }, { data: rs }] = await Promise.all([
    dadosDoDia(c.id),
    lerEmLotes<Record<string, unknown>>((de, ate) => admin.from("congresso_presencas").select("participante_id, sessao_id").eq("emp_proprietaria_id", emp).eq("congresso_id", c.id).range(de, ate)),
    admin.from("congresso_propostas").select("situacao, origem").eq("emp_proprietaria_id", emp).eq("congresso_id", c.id).limit(5000),
    admin.from("congresso_mocoes").select("id, situacao, versao").eq("emp_proprietaria_id", emp).eq("congresso_id", c.id),
    admin.from("congresso_mocao_assinaturas").select("mocao_id, versao, meio").eq("emp_proprietaria_id", emp).eq("congresso_id", c.id).is("retirada_em", null).limit(20000),
    admin.from("congresso_resolucoes").select("situacao, reservada").eq("emp_proprietaria_id", emp).eq("congresso_id", c.id),
  ])
  const validos = d.participantes.filter((p) => p.situacao === "confirmado" || p.situacao === "inscrito")
  const agrupar = <K extends string>(itens: { k: K; cred: boolean }[]) => {
    const m = new Map<K, { inscritos: number; credenciados: number }>()
    for (const i of itens) {
      const x = m.get(i.k) ?? { inscritos: 0, credenciados: 0 }
      x.inscritos++
      if (i.cred) x.credenciados++
      m.set(i.k, x)
    }
    return [...m.entries()]
  }
  const base = new Map(d.unidades.map((u) => [u.id, u.nome]))
  const conta = (xs: { [k: string]: unknown }[] | null | undefined, campo: string) => {
    const m: Record<string, number> = {}
    for (const x of xs ?? []) m[String(x[campo])] = (m[String(x[campo])] ?? 0) + 1
    return m
  }
  const versao = new Map((ms ?? []).map((m) => [m.id as string, m.versao as number]))
  const assValidas = (ass ?? []).filter((a) => versao.get(a.mocao_id as string) === a.versao)
  const porSessao = new Map<string, Set<string>>()
  for (const p of presencas) {
    const k = p.sessao_id as string
    if (!porSessao.has(k)) porSessao.set(k, new Set())
    porSessao.get(k)!.add(p.participante_id as string)
  }
  return {
    inscritos: validos.length,
    credenciados: validos.filter((p) => p.credenciadoEm).length,
    porCategoria: agrupar(validos.map((p) => ({ k: (p.papelId ? d.papelPorId.get(p.papelId)?.nome : null) ?? "Sem papel", cred: !!p.credenciadoEm }))).map(([categoria, v]) => ({ categoria, ...v })),
    porBase: agrupar(validos.map((p) => ({ k: (p.unidadeId ? base.get(p.unidadeId) : null) ?? "Sem base", cred: !!p.credenciadoEm })))
      .map(([b, v]) => ({ base: b, ...v }))
      .sort((a, b) => b.inscritos - a.inscritos),
    porGenero: agrupar(validos.filter((p) => p.credenciadoEm).map((p) => ({ k: p.genero || "Não informado", cred: true }))).map(([genero, v]) => ({ genero, credenciados: v.credenciados })),
    sessoes: d.sessoes.map((s) => ({ titulo: s.titulo, presentes: porSessao.get(s.id)?.size ?? 0 })),
    propostas: { total: ps?.length ?? 0, porSituacao: conta(ps, "situacao"), porOrigem: conta(ps, "origem") },
    mocoes: { total: ms?.length ?? 0, aprovadas: (ms ?? []).filter((m) => m.situacao === "aprovada").length, assinaturas: assValidas.length, porMeio: conta(assValidas, "meio") },
    resolucoes: { total: rs?.length ?? 0, reservadas: (rs ?? []).filter((r) => r.reservada).length, porSituacao: conta(rs, "situacao") },
  }
}

export { ROTULO_SITUACAO_RESOLUCAO }
