import "server-only"

import { valor } from "@/lib/congressos/config"
import {
  apurarSimples,
  classificarPriorizacao,
  OPCOES_SIMPLES,
  ordenarFila,
  podeInscrever,
  podeVotar,
  ROTULO_FALA,
  segundosDaFala,
  type Canal,
  type ItemPriorizacao,
  type Prova,
  type RegraLocal,
  type RespostaVoto,
  type TipoFala,
} from "@/lib/congressos/ao-vivo"
import { normalizarDireitos } from "@/lib/congressos/regras"
import { type Congresso } from "@/lib/db/congressos"
import { dadosDoDia, painelDoDia, sessaoAtual, type DadosDoDia } from "@/lib/db/congressos-dia"
import { codigoDaSalaConfere, participantePeloLink, presenteAgora } from "@/lib/db/congressos-mocoes"
import { registrarVotacao, type ContextoRelatoria } from "@/lib/db/congressos-relatoria"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Congressos — plenária ao vivo (Fase 7): votação eletrônica aberta pela
 * mesa, voto pelo link pessoal ou na estação da mesa, fila de fala com
 * cronômetro e o estado que o telão e os celulares consultam.
 *
 * Carga: com ~260 celulares consultando a cada poucos segundos, o estado é
 * montado uma vez e guardado em memória por 2 s por congresso (e por 60 s o
 * link pessoal já conferido). Sigilo: o voto secreto é gravado pela função
 * congresso_votar, sem pessoa e sem hora (ADR 0021).
 */

type Contexto = ContextoRelatoria
const agoraIso = () => new Date().toISOString()

// ── Caches curtos (por instância) ───────────────────────────────────────────

type Entrada<T> = { ate: number; valor: Promise<T>; pronto?: T; refazendo?: boolean }

/**
 * Cache curto por instância. Com `servirVencido` (só o estado da plenária),
 * vencido há pouco (até 5× o prazo) entrega o valor anterior e refaz em
 * segundo plano: com centenas de celulares
 * consultando, ninguém espera a leitura do banco a cada renovação.
 */
function cacheCurto<T>(ms: number, servirVencido = false) {
  const m = new Map<string, Entrada<T>>()
  const buscar = (chave: string, fn: () => Promise<T>, agora: number) => {
    const valor = fn().then(
      (v) => {
        m.set(chave, { ate: Date.now() + ms, valor: Promise.resolve(v), pronto: v })
        return v
      },
      (erro) => {
        m.delete(chave)
        throw erro
      }
    )
    m.set(chave, { ate: agora + ms, valor })
    return valor
  }
  return {
    obter(chave: string, fn: () => Promise<T>): Promise<T> {
      const agora = Date.now()
      const e = m.get(chave)
      if (e && e.ate > agora) return e.valor
      if (servirVencido && e && e.pronto !== undefined && agora - e.ate < ms * 5) {
        if (!e.refazendo) {
          e.refazendo = true
          fn().then(
            (v) => m.set(chave, { ate: Date.now() + ms, valor: Promise.resolve(v), pronto: v }),
            () => {
              e.refazendo = false
            }
          )
        }
        return Promise.resolve(e.pronto)
      }
      if (m.size > 500) for (const [k, v] of m) if (v.ate + ms * 5 <= agora) m.delete(k)
      return buscar(chave, fn, agora)
    },
    apagar(chave: string) {
      m.delete(chave)
    },
  }
}

const cacheEstado = cacheCurto<EstadoPlenaria>(2000, true)
const cacheDia = cacheCurto<DadosDoDia>(5000)

function dia(c: Congresso) {
  return cacheDia.obter(c.id, () => dadosDoDia(c.id))
}

/** Depois de cada ato da mesa ou voto, o estado desta instância é refeito na próxima consulta. */
function mudou(c: Congresso) {
  cacheEstado.apagar(c.id)
}

// ── Regras ──────────────────────────────────────────────────────────────────

export function regrasAoVivo(c: Congresso) {
  return {
    votoEletronico: (valor<string>(c.config, "plenaria.voto_eletronico") ?? "nao") as "nao" | "secreto" | "aberto" | "mesa_escolhe",
    parcialVisivel: valor<boolean>(c.config, "plenaria.parcial_visivel") === true,
    tempoFala: Number(valor(c.config, "plenaria.tempo_fala") ?? 3),
    tempoQuestao: Number(valor(c.config, "plenaria.tempo_questao") ?? 1),
    oradores: Number(valor(c.config, "plenaria.oradores") ?? 3),
    declaracoes: Number(valor(c.config, "plenaria.declaracao_voto_max") ?? 2),
    falaPeloLink: valor<boolean>(c.config, "plenaria.fala_pelo_link") !== false,
    regraLocal: ((valor<string>(c.config, "local.voto_plenaria") as string) ?? "so_local") as RegraLocal,
    prova: ((valor<string>(c.config, "local.prova_voto") as string) ?? "B") as Prova,
  }
}

// ── Leitura e estado ────────────────────────────────────────────────────────

export type VotacaoVivo = {
  id: string
  titulo: string
  tipo: "simples" | "priorizacao"
  sigilo: "aberta" | "secreta"
  itens: ItemPriorizacao[]
  maximoEscolhas: number | null
  propostaIds: string[]
  mocaoIds: string[]
  baseVotantes: number | null
  abertaEm: string
  fechadaEm: string | null
  canceladaEm: string | null
  resultado: Record<string, unknown> | null
  votaram: number
}

export type Fala = {
  id: string
  participanteId: string | null
  nome: string
  tipo: TipoFala
  assunto: string | null
  situacao: "inscrita" | "falando" | "concluida" | "cancelada"
  ordem: number
  segundos: number
  inicioEm: string | null
  pausadaEm: string | null
  pausadoMs: number
}

export type EstadoPlenaria = {
  sessao: { id: string; titulo: string } | null
  assunto: string | null
  inscricoesAbertas: boolean
  rodadaDesde: string | null
  votacao: VotacaoVivo | null
  parcial: { opcao: string; rotulo: string; votos: number }[] | null
  falando: Fala | null
  fila: Fala[]
  geradoEm: string
}

const CAMPOS_VOTACAO = "id, titulo, tipo, sigilo, itens, maximo_escolhas, proposta_ids, mocao_ids, base_votantes, aberta_em, fechada_em, cancelada_em, resultado"
const CAMPOS_FALA = "id, participante_id, nome, tipo, assunto, situacao, ordem, segundos, inicio_em, pausada_em, pausado_ms"

function paraVotacao(r: Record<string, unknown>, votaram: number): VotacaoVivo {
  return {
    id: r.id as string,
    titulo: r.titulo as string,
    tipo: r.tipo as VotacaoVivo["tipo"],
    sigilo: r.sigilo as VotacaoVivo["sigilo"],
    itens: (r.itens as ItemPriorizacao[]) ?? [],
    maximoEscolhas: (r.maximo_escolhas as number | null) ?? null,
    propostaIds: (r.proposta_ids as string[]) ?? [],
    mocaoIds: (r.mocao_ids as string[]) ?? [],
    baseVotantes: (r.base_votantes as number | null) ?? null,
    abertaEm: r.aberta_em as string,
    fechadaEm: (r.fechada_em as string | null) ?? null,
    canceladaEm: (r.cancelada_em as string | null) ?? null,
    resultado: (r.resultado as Record<string, unknown> | null) ?? null,
    votaram,
  }
}

function paraFala(r: Record<string, unknown>): Fala {
  return {
    id: r.id as string,
    participanteId: (r.participante_id as string | null) ?? null,
    nome: r.nome as string,
    tipo: r.tipo as TipoFala,
    assunto: (r.assunto as string | null) ?? null,
    situacao: r.situacao as Fala["situacao"],
    ordem: r.ordem as number,
    segundos: r.segundos as number,
    inicioEm: (r.inicio_em as string | null) ?? null,
    pausadaEm: (r.pausada_em as string | null) ?? null,
    pausadoMs: (r.pausado_ms as number) ?? 0,
  }
}

const rotuloOpcao = (v: VotacaoVivo, chave: string) =>
  v.tipo === "simples" ? (OPCOES_SIMPLES.find((o) => o.chave === chave)?.rotulo ?? chave) : (v.itens.find((i) => i.chave === chave)?.rotulo ?? chave)

async function montarEstado(c: Congresso, tenantId: string): Promise<EstadoPlenaria> {
  const admin = await createAdminClient()
  const desde = new Date(Date.now() - 15 * 60_000).toISOString()
  const [{ data: est }, { data: vs }, { data: fs }] = await Promise.all([
    admin.from("congresso_plenaria_estado").select("sessao_id, inscricoes_abertas, assunto, rodada_desde, sessao:congresso_sessoes(id, titulo)").eq("emp_proprietaria_id", tenantId).eq("congresso_id", c.id).maybeSingle(),
    // A aberta, ou a última fechada há pouco (o telão mostra o resultado).
    admin
      .from("congresso_votacoes_vivo")
      .select(CAMPOS_VOTACAO)
      .eq("emp_proprietaria_id", tenantId)
      .eq("congresso_id", c.id)
      .is("cancelada_em", null)
      .or(`fechada_em.is.null,fechada_em.gte.${desde}`)
      .order("aberta_em", { ascending: false })
      .limit(1),
    admin.from("congresso_falas").select(CAMPOS_FALA).eq("emp_proprietaria_id", tenantId).eq("congresso_id", c.id).in("situacao", ["inscrita", "falando"]).order("ordem"),
  ])
  let votacao: VotacaoVivo | null = null
  let parcial: EstadoPlenaria["parcial"] = null
  const v = vs?.[0]
  if (v) {
    const { count } = await admin.from("congresso_voto_participacoes").select("id", { count: "exact", head: true }).eq("emp_proprietaria_id", tenantId).eq("votacao_vivo_id", v.id)
    votacao = paraVotacao(v, count ?? 0)
    if (!votacao.fechadaEm && regrasAoVivo(c).parcialVisivel) {
      const { data: votos } = await admin.from("congresso_votos_vivo").select("opcao").eq("emp_proprietaria_id", tenantId).eq("votacao_vivo_id", v.id).limit(20000)
      const conta = new Map<string, number>()
      for (const x of votos ?? []) conta.set(x.opcao as string, (conta.get(x.opcao as string) ?? 0) + 1)
      const chaves = votacao.tipo === "simples" ? OPCOES_SIMPLES.map((o) => o.chave as string) : votacao.itens.map((i) => i.chave)
      parcial = chaves.map((k) => ({ opcao: k, rotulo: rotuloOpcao(votacao!, k), votos: conta.get(k) ?? 0 }))
    }
  }
  const falas = (fs ?? []).map(paraFala)
  const sessao = (Array.isArray(est?.sessao) ? est?.sessao[0] : est?.sessao) as { id: string; titulo: string } | null | undefined
  return {
    sessao: sessao ? { id: sessao.id, titulo: sessao.titulo } : null,
    assunto: (est?.assunto as string | null) ?? null,
    inscricoesAbertas: est ? est.inscricoes_abertas !== false : true,
    rodadaDesde: (est?.rodada_desde as string | null) ?? null,
    votacao,
    parcial,
    falando: falas.find((f) => f.situacao === "falando") ?? null,
    fila: ordenarFila(falas),
    geradoEm: agoraIso(),
  }
}

/** Estado da plenária (telão, celulares, mesa), guardado 2 s por instância. */
export function estadoDaPlenaria(c: Congresso, tenantId: string): Promise<EstadoPlenaria> {
  return cacheEstado.obter(c.id, () => montarEstado(c, tenantId))
}

/** Sem cache: a mesa vê o efeito do próprio ato na hora. */
export async function estadoDaMesa(c: Congresso, tenantId: string): Promise<EstadoPlenaria> {
  mudou(c)
  return estadoDaPlenaria(c, tenantId)
}

// ── Mesa: estado da sessão ──────────────────────────────────────────────────

async function gravarEstado(ctx: Contexto, d: { sessaoId?: string | null; inscricoesAbertas?: boolean; assunto?: string | null; novaRodada?: boolean }) {
  const admin = await createAdminClient()
  const linha: Record<string, unknown> = { congresso_id: ctx.c.id, emp_proprietaria_id: ctx.tenantId, atualizado_em: agoraIso() }
  if (d.sessaoId !== undefined) linha.sessao_id = d.sessaoId
  if (d.inscricoesAbertas !== undefined) linha.inscricoes_abertas = d.inscricoesAbertas
  if (d.assunto !== undefined) linha.assunto = d.assunto?.trim() || null
  if (d.novaRodada) linha.rodada_desde = agoraIso()
  const { error } = await admin.from("congresso_plenaria_estado").upsert(linha, { onConflict: "congresso_id" })
  mudou(ctx.c)
  return error ? { erro: error.message } : {}
}

export function definirSessaoEAssunto(ctx: Contexto, d: { sessaoId: string | null; assunto: string | null }) {
  return gravarEstado(ctx, d)
}

export function abrirInscricoes(ctx: Contexto, abertas: boolean) {
  return gravarEstado(ctx, { inscricoesAbertas: abertas })
}

/** Nova rodada (novo assunto): cancela quem ainda está na fila e reabre as inscrições. */
export async function novaRodada(ctx: Contexto, assunto: string | null): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  await admin
    .from("congresso_falas")
    .update({ situacao: "cancelada", fim_em: agoraIso() })
    .eq("emp_proprietaria_id", ctx.tenantId)
    .eq("congresso_id", ctx.c.id)
    .eq("situacao", "inscrita")
  return gravarEstado(ctx, { assunto, inscricoesAbertas: true, novaRodada: true })
}

// ── Fila de fala ────────────────────────────────────────────────────────────

/** Inscreve na fila (pela mesa ou pelo link pessoal), com as regras de oradores e declarações. */
export async function inscreverFala(
  ctx: Contexto,
  d: { participanteId: string | null; nome: string; tipo: TipoFala; assunto: string | null },
  peloLink = false
): Promise<{ erro?: string; posicao?: number }> {
  const r = regrasAoVivo(ctx.c)
  if (peloLink && !r.falaPeloLink) return { erro: "Neste congresso, a inscrição para falar é feita na mesa." }
  if (!(d.tipo in ROTULO_FALA)) return { erro: "Tipo de fala inválido." }
  const nome = d.nome.trim()
  if (nome.length < 2) return { erro: "Informe o nome de quem vai falar." }
  const estado = await estadoDaMesa(ctx.c, ctx.tenantId)
  const admin = await createAdminClient()
  const { data: rodada } = await admin
    .from("congresso_falas")
    .select("tipo, situacao, participante_id, nome")
    .eq("emp_proprietaria_id", ctx.tenantId)
    .eq("congresso_id", ctx.c.id)
    .neq("situacao", "cancelada")
    .gte("inscrita_em", estado.rodadaDesde ?? "1970-01-01")
  const daRodada = rodada ?? []
  const jaNaFila = daRodada.some(
    (f) => f.tipo === d.tipo && f.situacao === "inscrita" && (d.participanteId ? f.participante_id === d.participanteId : String(f.nome).toLowerCase() === nome.toLowerCase())
  )
  const pode = podeInscrever({
    tipo: d.tipo,
    inscricoesAbertas: estado.inscricoesAbertas,
    oradoresNaRodada: daRodada.filter((f) => ["fala", "a_favor", "contra"].includes(f.tipo as string)).length,
    maxOradores: r.oradores,
    declaracoesNaRodada: daRodada.filter((f) => f.tipo === "declaracao_voto").length,
    maxDeclaracoes: r.declaracoes,
    jaNaFila,
  })
  if (!pode.pode) return { erro: pode.motivo }
  const { data: ult } = await admin.from("congresso_falas").select("ordem").eq("emp_proprietaria_id", ctx.tenantId).eq("congresso_id", ctx.c.id).order("ordem", { ascending: false }).limit(1)
  const { data: nova, error } = await admin
    .from("congresso_falas")
    .insert({
      emp_proprietaria_id: ctx.tenantId,
      congresso_id: ctx.c.id,
      sessao_id: estado.sessao?.id ?? null,
      participante_id: d.participanteId,
      nome,
      tipo: d.tipo,
      assunto: d.assunto?.trim() || estado.assunto,
      ordem: ((ult?.[0]?.ordem as number | undefined) ?? 0) + 1,
      segundos: segundosDaFala(d.tipo, r.tempoFala, r.tempoQuestao),
      inscrita_por: peloLink ? "Link pessoal" : ctx.autor.nome,
    })
    .select("id")
    .single()
  if (error) return { erro: error.message }
  mudou(ctx.c)
  const fila = (await estadoDaMesa(ctx.c, ctx.tenantId)).fila
  return { posicao: fila.findIndex((f) => f.id === nova.id) + 1 }
}

async function lerFala(ctx: Contexto, id: string): Promise<Fala | null> {
  const admin = await createAdminClient()
  const { data } = await admin.from("congresso_falas").select(CAMPOS_FALA).eq("emp_proprietaria_id", ctx.tenantId).eq("congresso_id", ctx.c.id).eq("id", id).maybeSingle()
  return data ? paraFala(data) : null
}

async function concluirFalando(ctx: Contexto) {
  const admin = await createAdminClient()
  await admin.from("congresso_falas").update({ situacao: "concluida", fim_em: agoraIso() }).eq("emp_proprietaria_id", ctx.tenantId).eq("congresso_id", ctx.c.id).eq("situacao", "falando")
}

/** Encerra quem está falando e chama a próxima pessoa da fila (ou a escolhida), com o relógio correndo. */
export async function chamarFala(ctx: Contexto, id?: string): Promise<{ erro?: string; nome?: string }> {
  const estado = await estadoDaMesa(ctx.c, ctx.tenantId)
  const proxima = id ? estado.fila.find((f) => f.id === id) : estado.fila[0]
  await concluirFalando(ctx)
  if (!proxima) {
    mudou(ctx.c)
    return { erro: "A fila está vazia." }
  }
  const admin = await createAdminClient()
  const { error } = await admin
    .from("congresso_falas")
    .update({ situacao: "falando", inicio_em: agoraIso(), pausada_em: null, pausado_ms: 0 })
    .eq("emp_proprietaria_id", ctx.tenantId)
    .eq("id", proxima.id)
    .eq("situacao", "inscrita")
  mudou(ctx.c)
  return error ? { erro: error.message } : { nome: proxima.nome }
}

export async function pausarFala(ctx: Contexto, id: string): Promise<{ erro?: string }> {
  const f = await lerFala(ctx, id)
  if (!f || f.situacao !== "falando") return { erro: "Ninguém falando com este registro." }
  const admin = await createAdminClient()
  const upd = f.pausadaEm
    ? { pausada_em: null, pausado_ms: f.pausadoMs + (Date.now() - Date.parse(f.pausadaEm)) }
    : { pausada_em: agoraIso() }
  const { error } = await admin.from("congresso_falas").update(upd).eq("emp_proprietaria_id", ctx.tenantId).eq("id", id)
  mudou(ctx.c)
  return error ? { erro: error.message } : {}
}

/** Mais tempo para quem fala (a mesa concede). */
export async function acrescentarTempo(ctx: Contexto, id: string, segundos: number): Promise<{ erro?: string }> {
  const f = await lerFala(ctx, id)
  if (!f || f.situacao !== "falando") return { erro: "Ninguém falando com este registro." }
  const admin = await createAdminClient()
  const { error } = await admin.from("congresso_falas").update({ segundos: f.segundos + Math.max(1, Math.min(600, Math.round(segundos))) }).eq("emp_proprietaria_id", ctx.tenantId).eq("id", id)
  mudou(ctx.c)
  return error ? { erro: error.message } : {}
}

export async function encerrarFala(ctx: Contexto): Promise<{ erro?: string }> {
  await concluirFalando(ctx)
  mudou(ctx.c)
  return {}
}

export async function cancelarFala(ctx: Contexto, id: string, participanteId?: string): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  let q = admin.from("congresso_falas").update({ situacao: "cancelada", fim_em: agoraIso() }).eq("emp_proprietaria_id", ctx.tenantId).eq("congresso_id", ctx.c.id).eq("id", id).eq("situacao", "inscrita")
  if (participanteId) q = q.eq("participante_id", participanteId)
  const { error } = await q
  mudou(ctx.c)
  return error ? { erro: error.message } : {}
}

// ── Votação eletrônica ──────────────────────────────────────────────────────

/**
 * Abre uma votação eletrônica. Simples: propostas da pauta ou moções
 * habilitadas (uma ou em bloco). Priorização: itens (propostas ou texto
 * livre) e quantos cada pessoa escolhe.
 */
export async function abrirVotacao(
  ctx: Contexto,
  d: {
    tipo: "simples" | "priorizacao"
    sigilo: "aberta" | "secreta"
    titulo?: string | null
    propostaIds?: string[]
    mocaoIds?: string[]
    itens?: ItemPriorizacao[]
    maximoEscolhas?: number | null
  }
): Promise<{ erro?: string; id?: string }> {
  const r = regrasAoVivo(ctx.c)
  if (r.votoEletronico === "nao") return { erro: "A configuração deste congresso não prevê votação eletrônica." }
  if (r.votoEletronico === "secreto" && d.sigilo !== "secreta") return { erro: "Neste congresso a votação eletrônica é secreta." }
  if (r.votoEletronico === "aberto" && d.sigilo !== "aberta") return { erro: "Neste congresso a votação eletrônica é aberta (nominal)." }
  const admin = await createAdminClient()
  const propostaIds = [...new Set(d.propostaIds ?? [])]
  const mocaoIds = [...new Set(d.mocaoIds ?? [])]
  let titulo = d.titulo?.trim() || ""
  let itens: ItemPriorizacao[] = []
  if (d.tipo === "simples") {
    if (!propostaIds.length && !mocaoIds.length && !titulo) return { erro: "Escolha o que será votado ou dê um título à votação." }
    if (propostaIds.length && mocaoIds.length) return { erro: "Vote propostas e moções separadamente." }
    if (propostaIds.length) {
      const { data: ps } = await admin.from("congresso_propostas").select("id, numero, situacao").eq("emp_proprietaria_id", ctx.tenantId).eq("congresso_id", ctx.c.id).in("id", propostaIds)
      const fora = (ps ?? []).find((p) => p.situacao !== "plenaria")
      if ((ps ?? []).length !== propostaIds.length || fora) return { erro: fora ? `A proposta ${fora.numero} não está na pauta da plenária.` : "Proposta não encontrada." }
      if (!titulo) titulo = ps!.length === 1 ? `Proposta ${ps![0].numero}` : `Bloco de ${ps!.length} propostas`
    }
    if (mocaoIds.length) {
      const { data: ms } = await admin.from("congresso_mocoes").select("id, numero, situacao, titulo").eq("emp_proprietaria_id", ctx.tenantId).eq("congresso_id", ctx.c.id).in("id", mocaoIds)
      const fora = (ms ?? []).find((m) => m.situacao !== "habilitada")
      if ((ms ?? []).length !== mocaoIds.length || fora) return { erro: fora ? `A moção ${fora.numero} não está habilitada.` : "Moção não encontrada." }
      if (!titulo) titulo = ms!.length === 1 ? `Moção ${ms![0].numero}: ${ms![0].titulo}` : `Bloco de ${ms!.length} moções`
    }
  } else {
    itens = (d.itens ?? []).map((i, k) => ({ chave: i.chave || `i${k + 1}`, rotulo: i.rotulo.trim() })).filter((i) => i.rotulo.length > 0)
    if (propostaIds.length) {
      const { data: ps } = await admin.from("congresso_propostas").select("id, numero, texto").eq("emp_proprietaria_id", ctx.tenantId).eq("congresso_id", ctx.c.id).in("id", propostaIds)
      itens = [...itens, ...(ps ?? []).sort((a, b) => (a.numero as number) - (b.numero as number)).map((p) => ({ chave: p.id as string, rotulo: `${p.numero}. ${String(p.texto).slice(0, 140)}` }))]
    }
    if (itens.length < 2) return { erro: "A priorização precisa de ao menos dois itens." }
    if (!titulo) titulo = "Priorização"
  }
  const maximo = d.tipo === "priorizacao" ? Math.max(1, Math.min(itens.length, Number(d.maximoEscolhas ?? 1))) : null
  const pd = await painelDoDia(ctx.c).catch(() => null)
  const estado = await estadoDaMesa(ctx.c, ctx.tenantId)
  const { data, error } = await admin
    .from("congresso_votacoes_vivo")
    .insert({
      emp_proprietaria_id: ctx.tenantId,
      congresso_id: ctx.c.id,
      sessao_id: estado.sessao?.id ?? pd?.sessao?.id ?? null,
      titulo,
      tipo: d.tipo,
      sigilo: d.sigilo,
      proposta_ids: d.tipo === "simples" ? propostaIds : [],
      mocao_ids: mocaoIds,
      itens,
      maximo_escolhas: maximo,
      base_votantes: pd?.emExercicio ?? null,
      aberta_por: ctx.autor.nome,
    })
    .select("id")
    .single()
  mudou(ctx.c)
  if (error) return { erro: error.code === "23505" ? "Já há uma votação aberta: feche-a antes de abrir outra." : error.message }
  return { id: data.id as string }
}

async function lerVotacao(ctx: { c: Congresso; tenantId: string }, id: string): Promise<VotacaoVivo | null> {
  const admin = await createAdminClient()
  const { data } = await admin.from("congresso_votacoes_vivo").select(CAMPOS_VOTACAO).eq("emp_proprietaria_id", ctx.tenantId).eq("congresso_id", ctx.c.id).eq("id", id).maybeSingle()
  if (!data) return null
  const { count } = await admin.from("congresso_voto_participacoes").select("id", { count: "exact", head: true }).eq("emp_proprietaria_id", ctx.tenantId).eq("votacao_vivo_id", id)
  return paraVotacao(data, count ?? 0)
}

/** Fecha a votação, conta e — na simples com item — registra o resultado na pauta pela maioria configurada. */
export async function fecharVotacao(ctx: Contexto, id: string): Promise<{ erro?: string; resumo?: string }> {
  const v = await lerVotacao(ctx, id)
  if (!v) return { erro: "Votação não encontrada." }
  if (v.fechadaEm || v.canceladaEm) return { erro: "Esta votação já foi encerrada." }
  const admin = await createAdminClient()
  const { error: e1 } = await admin
    .from("congresso_votacoes_vivo")
    .update({ fechada_em: agoraIso(), fechada_por: ctx.autor.nome })
    .eq("emp_proprietaria_id", ctx.tenantId)
    .eq("id", id)
    .is("fechada_em", null)
  if (e1) return { erro: e1.message }
  const { data: votos } = await admin.from("congresso_votos_vivo").select("opcao").eq("emp_proprietaria_id", ctx.tenantId).eq("votacao_vivo_id", id).limit(50000)
  let resultado: Record<string, unknown>
  let resumo: string
  if (v.tipo === "simples") {
    const placar = apurarSimples(votos ?? [])
    resultado = { ...placar, votaram: v.votaram }
    resumo = `${placar.aFavor} a favor, ${placar.contra} contra, ${placar.abstencao} abstenção(ões).`
    if (v.propostaIds.length || v.mocaoIds.length) {
      const r = await registrarVotacao(ctx, {
        propostaIds: v.propostaIds,
        mocaoIds: v.mocaoIds,
        forma: "eletronica",
        aFavor: placar.aFavor,
        contra: placar.contra,
        abstencao: placar.abstencao,
        observacao: `Votação eletrônica ${v.sigilo === "secreta" ? "secreta" : "aberta"}: ${v.votaram} votante(s).`,
      })
      if (r.erro) resumo += ` Não registrado na pauta: ${r.erro}`
      else {
        resultado = { ...resultado, resultado: r.resultado, explicacao: r.explicacao }
        resumo = r.explicacao ?? resumo
        const { data: ult } = await admin.from("congresso_votacoes").select("id").eq("emp_proprietaria_id", ctx.tenantId).eq("congresso_id", ctx.c.id).order("created_at", { ascending: false }).limit(1)
        if (ult?.[0]) await admin.from("congresso_votacoes_vivo").update({ votacao_id: ult[0].id }).eq("emp_proprietaria_id", ctx.tenantId).eq("id", id)
      }
    }
  } else {
    const ranking = classificarPriorizacao(v.itens, votos ?? [])
    resultado = { ranking, votaram: v.votaram }
    resumo = `Priorização com ${v.votaram} votante(s): ${ranking.slice(0, 3).map((x) => `${x.posicao}º ${x.rotulo.slice(0, 40)}`).join("; ")}.`
  }
  await admin.from("congresso_votacoes_vivo").update({ resultado }).eq("emp_proprietaria_id", ctx.tenantId).eq("id", id)
  mudou(ctx.c)
  return { resumo }
}

export async function cancelarVotacao(ctx: Contexto, id: string): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin
    .from("congresso_votacoes_vivo")
    .update({ cancelada_em: agoraIso(), fechada_por: ctx.autor.nome })
    .eq("emp_proprietaria_id", ctx.tenantId)
    .eq("congresso_id", ctx.c.id)
    .eq("id", id)
    .is("fechada_em", null)
  mudou(ctx.c)
  return error ? { erro: error.message } : {}
}

export type VotoNominal = { nome: string; opcoes: string[]; canal: string }

/** Na votação aberta (nominal), quem votou o quê. Na secreta, só quem votou. */
export async function votosDaVotacao(c: Congresso, tenantId: string, id: string): Promise<{ votacao: VotacaoVivo | null; nominais: VotoNominal[]; votantes: { nome: string; canal: string }[] }> {
  const v = await lerVotacao({ c, tenantId }, id)
  if (!v) return { votacao: null, nominais: [], votantes: [] }
  const admin = await createAdminClient()
  const d = await dia(c)
  const nome = new Map(d.participantes.map((p) => [p.id, p.nomeSocial ?? p.nome]))
  const { data: parts } = await admin.from("congresso_voto_participacoes").select("participante_id, canal").eq("emp_proprietaria_id", tenantId).eq("votacao_vivo_id", id).limit(5000)
  const votantes = (parts ?? []).map((p) => ({ nome: nome.get(p.participante_id as string) ?? "—", canal: p.canal as string })).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
  if (v.sigilo !== "aberta") return { votacao: v, nominais: [], votantes }
  const { data: votos } = await admin.from("congresso_votos_vivo").select("participante_id, opcao").eq("emp_proprietaria_id", tenantId).eq("votacao_vivo_id", id).limit(50000)
  const canal = new Map((parts ?? []).map((p) => [p.participante_id as string, p.canal as string]))
  const porPessoa = new Map<string, string[]>()
  for (const x of votos ?? []) porPessoa.set(x.participante_id as string, [...(porPessoa.get(x.participante_id as string) ?? []), rotuloOpcao(v, x.opcao as string)])
  const nominais = [...porPessoa.entries()]
    .map(([pid, opcoes]) => ({ nome: nome.get(pid) ?? "—", opcoes, canal: canal.get(pid) ?? "" }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
  return { votacao: v, nominais, votantes }
}

// ── Voto ────────────────────────────────────────────────────────────────────

function infoDaPessoa(d: DadosDoDia, participanteId: string) {
  const p = d.participantes.find((x) => x.id === participanteId)
  if (!p) return null
  const papel = p.papelId ? d.papelPorId.get(p.papelId) : undefined
  const dir = papel ? normalizarDireitos(papel.categoria, papel.direitos) : null
  const valida = p.situacao === "confirmado" || p.situacao === "inscrito"
  const substituido = d.trocas.some((t) => t.titularId === p.id)
  const assumiu = d.trocas.some((t) => t.suplenteId === p.id)
  return {
    p,
    nome: p.nomeSocial ?? p.nome,
    votoPlenaria: valida && !!dir?.voto_plenaria,
    votoSoSubstituindo: valida && !!dir?.voto_so_substituindo,
    emExercicio: valida && (dir?.voto_so_substituindo ? assumiu : !substituido),
    categoria: papel?.categoria ?? null,
  }
}

/** Pode votar agora (sem gravar)? A tela mostra o motivo em vez de um botão que não funciona. */
export async function avaliarVoto(
  c: Congresso,
  tenantId: string,
  participanteId: string,
  canal: Canal,
  codigoSala: string | null = null
): Promise<RespostaVoto & { votacao: VotacaoVivo | null; nome?: string }> {
  const [estado, d] = await Promise.all([estadoDaPlenaria(c, tenantId), dia(c)])
  const v = estado.votacao && !estado.votacao.fechadaEm ? estado.votacao : null
  const info = infoDaPessoa(d, participanteId)
  if (!info) return { pode: false, motivo: "Participante não encontrado.", nivel: null, votacao: v }
  const r = regrasAoVivo(c)
  const [presente, codigoOk] = await Promise.all([
    canal === "link" && r.prova === "B" ? presenteAgora(tenantId, d, participanteId, estado.sessao?.id ?? sessaoAtual(d.sessoes)?.id) : Promise.resolve(false),
    canal === "link" && codigoSala ? codigoDaSalaConfere(c, tenantId, codigoSala) : Promise.resolve(false),
  ])
  const resposta = podeVotar({
    aberta: !!v,
    votoPlenaria: info.votoPlenaria,
    categoria: info.categoria,
    votoSoSubstituindo: info.votoSoSubstituindo,
    emExercicio: info.emExercicio,
    credenciado: !!info.p.credenciadoEm,
    modalidade: info.p.modalidade,
    canal,
    regraLocal: r.regraLocal,
    provaExigida: r.prova,
    presenteNaSessao: presente,
    codigoValido: codigoOk,
  })
  return { ...resposta, votacao: v, nome: info.nome }
}

const MENSAGEM: Record<string, string> = {
  ja_votou: "Seu voto já foi registrado nesta votação.",
  encerrada: "A votação foi encerrada.",
  nao_encontrada: "Votação não encontrada.",
  sem_opcao: "Escolha uma opção.",
  opcao_invalida: "Escolha uma única opção.",
  escolhas_demais: "Você marcou mais itens do que o permitido.",
}

/** Grava o voto (uma pessoa, um voto, qualquer canal). Na secreta, o voto vai sem a pessoa. */
export async function votar(
  c: Congresso,
  tenantId: string,
  participanteId: string,
  d: { votacaoId: string; opcoes: string[]; canal: Canal; codigoSala?: string | null }
): Promise<{ erro?: string; ok?: string; precisaCodigo?: boolean }> {
  const a = await avaliarVoto(c, tenantId, participanteId, d.canal, d.codigoSala ?? null)
  if (!a.votacao || a.votacao.id !== d.votacaoId) return { erro: "Esta votação não está mais aberta." }
  if (!a.pode) return { erro: a.motivo, precisaCodigo: a.precisaCodigo }
  const v = a.votacao
  const validas = v.tipo === "simples" ? OPCOES_SIMPLES.map((o) => o.chave as string) : v.itens.map((i) => i.chave)
  const opcoes = [...new Set(d.opcoes)].filter((o) => validas.includes(o))
  if (!opcoes.length || opcoes.length !== new Set(d.opcoes).size) return { erro: "Escolha uma opção válida." }
  const admin = await createAdminClient()
  const { data, error } = await admin.rpc("congresso_votar", {
    p_emp: tenantId,
    p_votacao: v.id,
    p_participante: participanteId,
    p_canal: d.canal,
    p_nivel: a.nivel,
    p_opcoes: opcoes,
  })
  if (error) return { erro: "Não foi possível registrar o voto agora. Tente de novo." }
  if (data !== "ok") return { erro: MENSAGEM[String(data)] ?? "Não foi possível registrar o voto." }
  mudou(c)
  return { ok: v.sigilo === "secreta" ? "Voto registrado. Ele é secreto: ninguém vê em quem você votou." : "Voto registrado (votação aberta: o seu voto é nominal)." }
}

export async function jaVotou(tenantId: string, votacaoId: string, participanteId: string): Promise<boolean> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("congresso_voto_participacoes")
    .select("id")
    .eq("emp_proprietaria_id", tenantId)
    .eq("votacao_vivo_id", votacaoId)
    .eq("participante_id", participanteId)
    .maybeSingle()
  return !!data
}

/** Histórico das votações eletrônicas do congresso (mesa e relatório). */
export async function listarVotacoesVivo(c: Congresso, tenantId: string): Promise<VotacaoVivo[]> {
  const admin = await createAdminClient()
  const { data } = await admin.from("congresso_votacoes_vivo").select(CAMPOS_VOTACAO).eq("emp_proprietaria_id", tenantId).eq("congresso_id", c.id).order("aberta_em", { ascending: false }).limit(200)
  return (data ?? []).map((r) => paraVotacao(r, Number((r.resultado as { votaram?: number } | null)?.votaram ?? 0)))
}

// ── Link pessoal (conferido uma vez por minuto) ─────────────────────────────

type DoLink = { id: string; congressoId: string; nome: string; credenciado: boolean } | null
const cacheLink = cacheCurto<DoLink>(60_000)

/** O participante do link pessoal, guardado 60 s por instância (o celular consulta a cada poucos segundos). */
export function participanteDoLink(token: string, tenantId: string): Promise<DoLink> {
  return cacheLink.obter(`${tenantId}:${token}`, async () => {
    const p = await participantePeloLink(token, tenantId)
    return p ? { id: p.id, congressoId: p.congressoId, nome: p.nome, credenciado: p.credenciado } : null
  })
}
