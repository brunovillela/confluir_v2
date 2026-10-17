import "server-only"

import { colunasHorario, janelaDaAssembleia } from "@/lib/db/assembleias-horarios"
import { lerEmLotes, texto } from "@/lib/db/comum"
import { escopoAptos, filtroAptos } from "@/lib/db/votacao-escopo"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"
import { semAcento } from "@/lib/texto"
import { canalDoApto, ROTULOS_CANAL } from "@/lib/votacao-canais"

/**
 * PÁGINA DA ASSEMBLEIA (reorganização de 17/10/2026): quem votou, quem falta e
 * os votos por hora. Tudo sai da PARTICIPAÇÃO (o apto) — nunca do voto.
 *
 * O apto da rodada vale em todas as assembleias dela. Com uma assembleia só na
 * rodada, todo votante é dela; com várias, votou NESTA quem votou dentro da
 * janela dela (a mesma régua do relatório de votantes).
 */

type Contexto = {
  emp: string
  escopo: string
  inicio: number | null
  termino: number | null
  /** A rodada tem outras assembleias: votantes filtrados pela janela. */
  varias: boolean
}

async function contexto(assembleiaId: string): Promise<Contexto | null> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data } = await admin
    .from("voto_assembleias")
    .select("id, data_inicio, data_termino, rod_assembleia_id" + (await colunasHorario()))
    .eq("id", assembleiaId)
    .eq("emp_proprietaria_id", emp)
    .maybeSingle()
  if (!data) return null
  const a = data as unknown as Record<string, unknown>
  const rodadaId = texto(a.rod_assembleia_id)
  const [{ data: rod }, { count }] = await Promise.all([
    rodadaId
      ? admin.from("voto_rod_assembleias").select("termino").eq("id", rodadaId).maybeSingle()
      : Promise.resolve({ data: null }),
    rodadaId
      ? admin.from("voto_assembleias").select("id", { count: "exact", head: true }).eq("rod_assembleia_id", rodadaId)
      : Promise.resolve({ count: 1 }),
  ])
  const janela = janelaDaAssembleia(a, texto((rod as { termino?: unknown } | null)?.termino))
  return {
    emp,
    escopo: filtroAptos(await escopoAptos(assembleiaId)),
    inicio: janela.inicio,
    termino: janela.termino,
    varias: (count ?? 1) > 1,
  }
}

export type VotanteLinha = {
  id: string
  nome: string | null
  cpf: string | null
  matricula: string | null
  email: string | null
  /** Canal de acesso (link pessoal, código, portal, urna…); só de quem votou. */
  canal: string | null
  quando: string | null
}

export type ListaVotantes = {
  linhas: VotanteLinha[]
  total: number
  pagina: number
  totalPaginas: number
  votaram: number
  faltam: number
}

/** Quem votou (ou quem falta) nesta assembleia, com busca e paginação. */
export async function votantesDaAssembleia(
  assembleiaId: string,
  filtro: { situacao: "votaram" | "faltam"; busca?: string; pagina?: number; porPagina?: number }
): Promise<ListaVotantes | null> {
  const ctx = await contexto(assembleiaId)
  if (!ctx) return null
  const admin = await createAdminClient()
  const porPagina = filtro.porPagina && filtro.porPagina > 0 ? filtro.porPagina : 50
  const pagina = filtro.pagina && filtro.pagina > 0 ? filtro.pagina : 1

  // Recortes: votou (na janela, quando a rodada tem várias) ou ainda não votou.
  // Interface mínima: os genéricos do PostgrestFilterBuilder estouram a inferência.
  type Filtro = {
    not: (c: string, o: string, v: null) => Filtro
    is: (c: string, v: null) => Filtro
    gte: (c: string, v: string) => Filtro
    lte: (c: string, v: string) => Filtro
  }
  const votou = <T,>(q: T): T => {
    let r = (q as unknown as Filtro).not("hora_voto", "is", null)
    if (ctx.varias && ctx.inicio !== null) r = r.gte("hora_voto", new Date(ctx.inicio).toISOString())
    if (ctx.varias && ctx.termino !== null) r = r.lte("hora_voto", new Date(ctx.termino).toISOString())
    return r as unknown as T
  }
  const falta = <T,>(q: T): T => (q as unknown as Filtro).is("hora_voto", null) as unknown as T
  const base = (colunas: string, opcoes?: { count: "exact"; head?: boolean }) =>
    admin.from("voto_assembleias_aptos").select(colunas, opcoes).eq("emp_proprietaria_id", ctx.emp).or(ctx.escopo)

  const [{ count: votaram }, { count: faltam }] = await Promise.all([
    votou(base("id", { count: "exact", head: true })),
    falta(base("id", { count: "exact", head: true })),
  ])

  const ler = (colunas: string) => {
    let q = base(colunas, { count: "exact" })
    q = filtro.situacao === "votaram" ? votou(q) : falta(q)
    const termo = (filtro.busca ?? "").trim()
    if (termo) {
      const digitos = termo.replace(/\D/g, "")
      if (digitos.length >= 3 && /^[\d.\-\s/]+$/.test(termo)) {
        q = q.or(`cpf.like.%${digitos}%,matricula.like.%${digitos}%`)
      } else {
        for (const palavra of semAcento(termo).split(/\s+/).filter(Boolean)) {
          q = q.ilike("nome_completo_norm", `%${palavra.replace(/[%_\\]/g, "\\$&")}%`)
        }
      }
    }
    const de = (pagina - 1) * porPagina
    return (
      filtro.situacao === "votaram"
        ? q.order("hora_voto", { ascending: false }).order("id")
        : q.order("nome_completo", { ascending: true, nullsFirst: false }).order("id")
    ).range(de, de + porPagina - 1)
  }
  let r = await ler("id, nome_completo, cpf, matricula, email_corporativo, hora_voto, acesso_canal, comprovante_canal")
  if (r.error) r = await ler("id, nome_completo, cpf, matricula, email_corporativo, hora_voto")
  const linhas = ((r.data ?? []) as unknown as Record<string, unknown>[]).map((l) => ({
    id: String(l.id),
    nome: texto(l.nome_completo),
    cpf: texto(l.cpf),
    matricula: texto(l.matricula),
    email: texto(l.email_corporativo),
    canal: l.hora_voto
      ? ROTULOS_CANAL[canalDoApto({ acesso_canal: texto(l.acesso_canal), comprovante_canal: texto(l.comprovante_canal) })]
      : null,
    quando: texto(l.hora_voto),
  }))
  const total = r.count ?? 0
  return {
    linhas,
    total,
    pagina,
    totalPaginas: Math.max(1, Math.ceil(total / porPagina)),
    votaram: votaram ?? 0,
    faltam: faltam ?? 0,
  }
}

export type VotosPorFaixa = { inicio: string; horas: number; votos: number }[]

/**
 * Votos por faixa de horário, da abertura ao último voto (ou ao fim): mostra
 * quando a base vota — para marcar lembretes. Faixas de 1 h; numa janela longa,
 * maiores, para caber em ~36 barras.
 */
export async function votosPorHora(assembleiaId: string): Promise<VotosPorFaixa> {
  const ctx = await contexto(assembleiaId)
  if (!ctx) return []
  const admin = await createAdminClient()
  const horas = await lerEmLotes<{ hora_voto: string }>((de, ate) => {
    let q = admin
      .from("voto_assembleias_aptos")
      .select("id, hora_voto")
      .eq("emp_proprietaria_id", ctx.emp)
      .or(ctx.escopo)
      .not("hora_voto", "is", null)
    if (ctx.varias && ctx.inicio !== null) q = q.gte("hora_voto", new Date(ctx.inicio).toISOString())
    if (ctx.varias && ctx.termino !== null) q = q.lte("hora_voto", new Date(ctx.termino).toISOString())
    return q.order("id").range(de, ate)
  }).catch(() => [])
  if (horas.length === 0) return []
  const tempos = horas.map((h) => Date.parse(h.hora_voto)).filter((t) => !Number.isNaN(t))
  const H = 3600_000
  const inicio = Math.floor((ctx.inicio ?? Math.min(...tempos)) / H) * H
  const fim = Math.max(...tempos, Math.min(ctx.termino ?? 0, Date.now()))
  const faixa = Math.max(1, Math.ceil((fim - inicio) / H / 36))
  const n = Math.max(1, Math.ceil((fim - inicio + 1) / (faixa * H)))
  const contagem = new Array<number>(n).fill(0)
  for (const t of tempos) {
    const i = Math.floor((t - inicio) / (faixa * H))
    if (i >= 0 && i < n) contagem[i]++
  }
  return contagem.map((votos, i) => ({ inicio: new Date(inicio + i * faixa * H).toISOString(), horas: faixa, votos }))
}
