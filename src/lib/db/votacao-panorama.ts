import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import { derivarModalidade, type Modalidade, type SituacaoJanela } from "@/lib/assembleias-constantes"
import { colunasHorario, janelaDaAssembleia, situacaoDaAssembleia } from "@/lib/db/assembleias-horarios"
import { texto } from "@/lib/db/comum"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"
import { SEM_FONTE } from "@/lib/votacao-navegacao"

/**
 * PANORAMA DAS VOTAÇÕES (reorganização de 17/10/2026): rodadas com situação,
 * participação e resultado — a base da página da campanha (linha do tempo), da
 * fonte pagadora (campanhas e gráfico de participação) e do painel geral.
 *
 * Participação é contagem no banco (aptos e quem votou na rodada). Resultado só
 * das assembleias com a apuração ENCERRADA (o snapshot voto_resultado_final) —
 * nunca resultado parcial.
 */

export type SituacaoRodada = "sem_assembleia" | "agendada" | "em_votacao" | "a_apurar" | "apurada"

export const ROTULO_SITUACAO_RODADA: Record<SituacaoRodada, string> = {
  sem_assembleia: "Sem assembleia",
  agendada: "Agendada",
  em_votacao: "Em votação",
  a_apurar: "A apurar",
  apurada: "Apurada",
}

/**
 * Situação da rodada a partir das assembleias dela: sem assembleia; apurada
 * (todas com a apuração encerrada); em votação (alguma aberta); a apurar
 * (alguma encerrada sem apuração); senão agendada. A marca
 * voto_rod_assembleias.apuracao_encerrada não serve: o encerramento é por
 * assembleia e ela nunca é preenchida.
 */
export function situacaoDaRodada(assembleias: { situacao: SituacaoJanela; apuracaoEncerrada: boolean }[]): SituacaoRodada {
  if (assembleias.length === 0) return "sem_assembleia"
  if (assembleias.every((a) => a.apuracaoEncerrada)) return "apurada"
  if (assembleias.some((a) => a.situacao === "aberta")) return "em_votacao"
  if (assembleias.some((a) => a.situacao === "encerrada" && !a.apuracaoEncerrada)) return "a_apurar"
  return "agendada"
}

export type ResultadoPergunta = {
  pergunta: string | null
  opcoes: { texto: string | null; votos: number }[]
  branco: number
  nulo: number
  total: number
}

export type AssembleiaPanorama = {
  id: string
  nome: string | null
  modalidade: Modalidade
  situacao: SituacaoJanela
  inicio: number | null
  fim: number | null
  apuracaoEncerrada: boolean
}

export type RodadaPanorama = {
  id: string
  nome: string | null
  campanhaId: string | null
  inicio: string | null
  termino: string | null
  situacao: SituacaoRodada
  /** Próxima abertura (ms), se ainda há assembleia por abrir. */
  abreEm: number | null
  /** Fim da última janela (ms). */
  fimEm: number | null
  assembleias: AssembleiaPanorama[]
  aptos: number
  votaram: number
  perguntas: number
  /** Só com apuração encerrada (soma das assembleias apuradas da rodada). */
  resultado: ResultadoPergunta[] | null
}

type RodadaBruta = { id: string; nome_assembleia: string | null; campanha_id: string | null; inicio: string | null; termino: string | null }

const COLUNAS_RODADA = "id, nome_assembleia, campanha_id, inicio, termino"

async function ambiente(): Promise<{ admin: SupabaseClient; emp: string }> {
  return { admin: await createAdminClient(), emp: await tenantAtual() }
}

/** Situação, participação e resultado de cada rodada (consultas em lote). */
export async function panoramaRodadas(rodadas: RodadaBruta[]): Promise<RodadaPanorama[]> {
  if (rodadas.length === 0) return []
  const { admin, emp } = await ambiente()
  const ids = rodadas.map((r) => r.id)
  const agora = Date.now()

  const [{ data: brutas }, { data: perguntas }, contagens] = await Promise.all([
    admin
      .from("voto_assembleias")
      .select(
        "id, nome_assembleia, online, urnas_de_votacao, data_inicio, data_termino, apuracao_encerrada, rod_assembleia_id" +
          (await colunasHorario())
      )
      .eq("emp_proprietaria_id", emp)
      .in("rod_assembleia_id", ids),
    admin.from("voto_assembleias_perguntas").select("id, pergunta, ordem, rod_assembleia_id").in("rod_assembleia_id", ids),
    Promise.all(
      ids.map(async (id) => {
        const base = () =>
          admin
            .from("voto_assembleias_aptos")
            .select("id", { count: "exact", head: true })
            .eq("emp_proprietaria_id", emp)
            .eq("rod_assembleia_id", id)
        const [{ count: aptos }, { count: votaram }] = await Promise.all([base(), base().not("hora_voto", "is", null)])
        return [id, { aptos: aptos ?? 0, votaram: votaram ?? 0 }] as const
      })
    ),
  ])
  const porContagem = new Map(contagens)
  const termino = new Map(rodadas.map((r) => [r.id, r.termino]))

  const assPorRodada = new Map<string, AssembleiaPanorama[]>()
  for (const a of (brutas ?? []) as unknown as Record<string, unknown>[]) {
    const rid = String(a.rod_assembleia_id)
    const janela = janelaDaAssembleia(a, termino.get(rid) ?? null)
    const lista = assPorRodada.get(rid) ?? []
    lista.push({
      id: String(a.id),
      nome: texto(a.nome_assembleia),
      modalidade: derivarModalidade(a),
      situacao: situacaoDaAssembleia(a, termino.get(rid) ?? null, agora),
      inicio: janela.inicio,
      fim: janela.termino,
      apuracaoEncerrada: a.apuracao_encerrada === true,
    })
    assPorRodada.set(rid, lista)
  }

  // Resultado: snapshot das apuradas, somado por opção na rodada.
  const apuradas = [...assPorRodada.values()].flat().filter((a) => a.apuracaoEncerrada).map((a) => a.id)
  const rodadaDaAssembleia = new Map([...assPorRodada.entries()].flatMap(([rid, l]) => l.map((a) => [a.id, rid] as const)))
  const resultadoPorRodada = new Map<string, Map<string, ResultadoPergunta & { ordem: number }>>()
  if (apuradas.length) {
    const pIds = (perguntas ?? []).map((p) => String(p.id))
    const [{ data: snap }, { data: opcoes }] = await Promise.all([
      admin
        .from("voto_resultado_final")
        .select("assembleia_id, pergunta_id, opcao_id, tipo, quantidade")
        .eq("emp_proprietaria_id", emp)
        .in("assembleia_id", apuradas),
      pIds.length
        ? admin.from("voto_opcoes_resposta").select("id, opcao_resposta, pergunta_id").in("pergunta_id", pIds)
        : Promise.resolve({ data: [] as { id: string; opcao_resposta: string | null; pergunta_id: string }[] }),
    ])
    const textoOpcao = new Map((opcoes ?? []).map((o) => [String(o.id), texto(o.opcao_resposta)]))
    const pergunta = new Map((perguntas ?? []).map((p) => [String(p.id), p]))
    for (const linha of snap ?? []) {
      const rid = rodadaDaAssembleia.get(String(linha.assembleia_id))
      const p = pergunta.get(String(linha.pergunta_id))
      if (!rid || !p) continue
      const doRodada = resultadoPorRodada.get(rid) ?? new Map()
      const r = doRodada.get(String(p.id)) ?? {
        pergunta: texto(p.pergunta),
        opcoes: [],
        branco: 0,
        nulo: 0,
        total: 0,
        ordem: typeof p.ordem === "number" ? p.ordem : 0,
      }
      const q = typeof linha.quantidade === "number" ? linha.quantidade : 0
      if (linha.tipo === "branco") r.branco += q
      else if (linha.tipo === "nulo") r.nulo += q
      else {
        const t = textoOpcao.get(String(linha.opcao_id)) ?? null
        const o = r.opcoes.find((x: { texto: string | null }) => x.texto === t)
        if (o) o.votos += q
        else r.opcoes.push({ texto: t, votos: q })
      }
      r.total += q
      doRodada.set(String(p.id), r)
      resultadoPorRodada.set(rid, doRodada)
    }
  }

  const perguntasPorRodada = new Map<string, number>()
  for (const p of perguntas ?? []) {
    const k = String(p.rod_assembleia_id)
    perguntasPorRodada.set(k, (perguntasPorRodada.get(k) ?? 0) + 1)
  }

  return rodadas.map((r) => {
    const ass = (assPorRodada.get(r.id) ?? []).sort((x, y) => (x.inicio ?? 0) - (y.inicio ?? 0))
    const situacao = situacaoDaRodada(ass)
    const porAbrir = ass.filter((a) => a.situacao === "antes" && a.inicio !== null).map((a) => a.inicio as number)
    const fins = ass.map((a) => a.fim).filter((f): f is number => f !== null)
    const res = resultadoPorRodada.get(r.id)
    const c = porContagem.get(r.id) ?? { aptos: 0, votaram: 0 }
    return {
      id: r.id,
      nome: r.nome_assembleia,
      campanhaId: r.campanha_id,
      inicio: r.inicio,
      termino: r.termino,
      situacao,
      abreEm: porAbrir.length ? Math.min(...porAbrir) : null,
      fimEm: fins.length ? Math.max(...fins) : null,
      assembleias: ass,
      aptos: c.aptos,
      votaram: c.votaram,
      perguntas: perguntasPorRodada.get(r.id) ?? 0,
      resultado: res
        ? [...res.values()]
            .sort((x, y) => x.ordem - y.ordem)
            .map((p) => ({
              pergunta: p.pergunta,
              opcoes: p.opcoes.sort((x, y) => y.votos - x.votos),
              branco: p.branco,
              nulo: p.nulo,
              total: p.total,
            }))
        : null,
    }
  })
}

const porData = (x: { inicio: string | null; nome: string | null }, y: { inicio: string | null; nome: string | null }) =>
  (x.inicio ?? "").localeCompare(y.inicio ?? "") || (x.nome ?? "").localeCompare(y.nome ?? "", "pt-BR")

/** Linha do tempo da campanha: as rodadas em ordem, com situação e resultado. */
export async function panoramaDaCampanha(campanhaId: string): Promise<RodadaPanorama[]> {
  const { admin, emp } = await ambiente()
  const { data } = await admin
    .from("voto_rod_assembleias")
    .select(COLUNAS_RODADA)
    .eq("emp_proprietaria_id", emp)
    .eq("campanha_id", campanhaId)
  return (await panoramaRodadas((data ?? []) as RodadaBruta[])).sort((x, y) =>
    porData({ inicio: x.inicio, nome: x.nome }, { inicio: y.inicio, nome: y.nome })
  )
}

// ── Fonte pagadora ──────────────────────────────────────────────────────────

export type CampanhaDaFonte = {
  id: string
  tema: string | null
  finalizada: boolean
  criadaEm: string | null
  /** As outras fontes da campanha (o selo "também: X"). */
  outrasFontes: { id: string; nome: string | null }[]
  rodadas: RodadaPanorama[]
}

export type PanoramaFonte = {
  fonte: { id: string; nome: string; cnpj: string | null; grupo: { id: string; nome: string } | null } | null
  campanhas: CampanhaDaFonte[]
  /** Só em "Sem fonte pagadora": rodadas que nem campanha têm (legado). */
  rodadasSemCampanha: RodadaPanorama[]
}

const nomeEmpresa = (e: { nome_fantasia?: string | null; nome_razao?: string | null } | null | undefined) =>
  e?.nome_fantasia?.trim() || e?.nome_razao?.trim() || null

export async function panoramaDaFonte(fonteId: string): Promise<PanoramaFonte | null> {
  const { admin, emp } = await ambiente()
  const [{ data: vinculos }, { data: campanhas }] = await Promise.all([
    admin.from("voto_campanha_fontes").select("campanha_id, empresa_id, empresa:empresa_id (nome_fantasia, nome_razao)"),
    admin.from("voto_campanha").select("id, tema, finalizado, created_at").eq("emp_proprietaria_id", emp),
  ])
  const doTenant = new Set((campanhas ?? []).map((c) => String(c.id)))
  const fontesPorCampanha = new Map<string, { id: string; nome: string | null }[]>()
  for (const v of vinculos ?? []) {
    if (!doTenant.has(String(v.campanha_id))) continue
    const l = fontesPorCampanha.get(String(v.campanha_id)) ?? []
    l.push({ id: String(v.empresa_id), nome: nomeEmpresa(v.empresa as unknown as { nome_fantasia: string | null; nome_razao: string | null }) })
    fontesPorCampanha.set(String(v.campanha_id), l)
  }

  let fonte: PanoramaFonte["fonte"] = null
  let alvo: typeof campanhas = []
  if (fonteId === SEM_FONTE) {
    alvo = (campanhas ?? []).filter((c) => !fontesPorCampanha.has(String(c.id)))
  } else {
    const { data: e } = await admin.from("empresa").select("id, nome_fantasia, nome_razao, cnpj_cpf").eq("id", fonteId).maybeSingle()
    if (!e) return null
    const { gruposPorFonte } = await import("@/lib/db/grupos-empresariais")
    const grupo = (await gruposPorFonte().catch(() => new Map())).get(fonteId) ?? null
    fonte = { id: String(e.id), nome: nomeEmpresa(e) ?? "(sem nome)", cnpj: texto(e.cnpj_cpf), grupo }
    alvo = (campanhas ?? []).filter((c) => (fontesPorCampanha.get(String(c.id)) ?? []).some((f) => f.id === fonteId))
  }

  const campanhaIds = (alvo ?? []).map((c) => String(c.id))
  let qr = admin.from("voto_rod_assembleias").select(COLUNAS_RODADA).eq("emp_proprietaria_id", emp)
  qr = fonteId === SEM_FONTE
    ? campanhaIds.length
      ? qr.or(`campanha_id.is.null,campanha_id.in.(${campanhaIds.join(",")})`)
      : qr.is("campanha_id", null)
    : qr.in("campanha_id", campanhaIds.length ? campanhaIds : ["00000000-0000-0000-0000-000000000000"])
  const { data: rodadasBrutas } = await qr
  const rodadas = await panoramaRodadas((rodadasBrutas ?? []) as RodadaBruta[])

  return {
    fonte,
    campanhas: (alvo ?? [])
      .map((c) => ({
        id: String(c.id),
        tema: texto(c.tema),
        finalizada: c.finalizado === true,
        criadaEm: texto(c.created_at),
        outrasFontes: (fontesPorCampanha.get(String(c.id)) ?? []).filter((f) => f.id !== fonteId),
        rodadas: rodadas.filter((r) => r.campanhaId === String(c.id)).sort(porData),
      }))
      .sort((x, y) => {
        const ux = x.rodadas.at(-1)?.inicio ?? x.criadaEm ?? ""
        const uy = y.rodadas.at(-1)?.inicio ?? y.criadaEm ?? ""
        return uy.localeCompare(ux)
      }),
    rodadasSemCampanha: fonteId === SEM_FONTE ? rodadas.filter((r) => !r.campanhaId).sort(porData).reverse() : [],
  }
}

/** Participação (votaram/aptos) em %, ou null sem aptos. */
export function participacao(r: { aptos: number; votaram: number }): number | null {
  return r.aptos > 0 ? Math.round((r.votaram / r.aptos) * 100) : null
}

/** A opção mais votada da primeira pergunta ("Aprovo — 62%"). */
export function resumoResultado(r: RodadaPanorama): string | null {
  const p = r.resultado?.[0]
  const top = p?.opcoes[0]
  if (!p || !top || p.total <= 0) return null
  return `${top.texto ?? "Opção"} — ${Math.round((top.votos / p.total) * 100)}%`
}
