import "server-only"

import { temVotoOnline } from "@/lib/assembleias-constantes"
import { janelaDaAssembleia, situacaoDaAssembleia } from "@/lib/db/assembleias-horarios"
import { hojeSP, texto } from "@/lib/db/comum"
import { aptosDuplicados } from "@/lib/db/aptos-duplicados"
import { gruposPorFonte } from "@/lib/db/grupos-empresariais"
import { panoramaRodadas, participacao, temParticipacao, type RodadaPanorama } from "@/lib/db/votacao-panorama"
import { janelasOnline, semLinkDasRodadas, semLinkUrgente, type RodadaSemLink } from "@/lib/db/votacao-sem-link"
import { linkNaoUsadoDasRodadas } from "@/lib/db/votacao-link-nao-usado"
import { entregaRuimDasRodadas } from "@/lib/db/votacao-teste-entrega"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"
import { semAcento } from "@/lib/texto"
import { SEM_FONTE } from "@/lib/votacao-navegacao"

/**
 * PAINEL GERAL DAS VOTAÇÕES (reorganização de 17/10/2026): indicadores,
 * alertas que levam direto ao lugar, "agora e a seguir" e a lista das fontes
 * pagadoras com campanhas. Nada de resultado aqui — só participação.
 */

const DIA = 86_400_000

type RodadaBruta = {
  id: string
  nome_assembleia: string | null
  campanha_id: string | null
  inicio: string | null
  termino: string | null
  bubble_id: string | null
}

export type ItemAgora = {
  assembleiaId: string
  assembleiaNome: string | null
  rodada: RodadaPanorama
  campanhaTema: string | null
  fonteId: string | null
  fonteNome: string | null
  inicio: number | null
  fim: number | null
  aberta: boolean
}

export type AlertaPainel = { tom: "erro" | "aviso"; texto: string; rotulo: string; href: string }

export type PainelVotacoes = {
  indicadores: {
    campanhasAbertas: number
    rodadasEmCurso: number
    abertasAgora: number
    proximos7dias: number
    participacaoMedia: number | null
    semLink: number
  }
  agora: ItemAgora[]
  alertas: AlertaPainel[]
}

/** Contexto comum: campanhas, vínculos de fonte e nomes. */
async function base() {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const [{ data: campanhas }, { data: vinculos }, { data: rodadas }] = await Promise.all([
    admin.from("voto_campanha").select("id, tema, finalizado, created_at").eq("emp_proprietaria_id", emp),
    admin.from("voto_campanha_fontes").select("campanha_id, empresa_id, empresa:empresa_id (nome_fantasia, nome_razao, cnpj_cpf)"),
    admin.from("voto_rod_assembleias").select("id, nome_assembleia, campanha_id, inicio, termino, bubble_id").eq("emp_proprietaria_id", emp),
  ])
  const doTenant = new Set((campanhas ?? []).map((c) => String(c.id)))
  const fontesPorCampanha = new Map<string, { id: string; nome: string; cnpj: string | null }[]>()
  for (const v of vinculos ?? []) {
    if (!doTenant.has(String(v.campanha_id))) continue
    const e = v.empresa as unknown as { nome_fantasia: string | null; nome_razao: string | null; cnpj_cpf: string | null } | null
    const l = fontesPorCampanha.get(String(v.campanha_id)) ?? []
    l.push({ id: String(v.empresa_id), nome: e?.nome_fantasia?.trim() || e?.nome_razao?.trim() || "(sem nome)", cnpj: texto(e?.cnpj_cpf) })
    fontesPorCampanha.set(String(v.campanha_id), l)
  }
  return {
    admin,
    emp,
    campanhas: (campanhas ?? []).map((c) => ({ id: String(c.id), tema: texto(c.tema), finalizada: c.finalizado === true, criadaEm: texto(c.created_at) })),
    fontesPorCampanha,
    rodadas: (rodadas ?? []) as RodadaBruta[],
  }
}

export async function painelVotacoes(): Promise<PainelVotacoes> {
  const { admin, emp, campanhas, fontesPorCampanha, rodadas } = await base()
  const hoje = hojeSP()
  const agoraMs = Date.now()
  const limitePassado = new Date(agoraMs - 60 * DIA).toISOString().slice(0, 10)
  // Rodadas recentes ou por vir (termino nos últimos 60 dias, futuro ou sem término).
  // Recentes ou por vir — e TODAS as que nasceram aqui (o alerta delas não
  // tem prazo; o legado do Bubble nunca alerta).
  const recentes = rodadas.filter((r) => !r.bubble_id || !r.termino || r.termino >= limitePassado || (r.inicio ?? "") >= hoje)
  const panorama = await panoramaRodadas(recentes)
  const campanhaPorId = new Map(campanhas.map((c) => [c.id, c]))

  const agora: ItemAgora[] = []
  for (const r of panorama) {
    const fonte = r.campanhaId ? fontesPorCampanha.get(r.campanhaId)?.[0] ?? null : null
    for (const a of r.assembleias) {
      if (a.apuracaoEncerrada) continue
      const aberta = a.situacao === "aberta"
      const breve = a.situacao === "antes" && a.inicio !== null && a.inicio - agoraMs <= 7 * DIA
      if (!aberta && !breve) continue
      agora.push({
        assembleiaId: a.id,
        assembleiaNome: a.nome,
        rodada: r,
        campanhaTema: r.campanhaId ? campanhaPorId.get(r.campanhaId)?.tema ?? null : null,
        fonteId: fonte?.id ?? null,
        fonteNome: fonte?.nome ?? null,
        inicio: a.inicio,
        fim: a.fim,
        aberta,
      })
    }
  }
  agora.sort((x, y) => Number(y.aberta) - Number(x.aberta) || (x.aberta ? (x.fim ?? 0) - (y.fim ?? 0) : (x.inicio ?? 0) - (y.inicio ?? 0)))

  // Participação média das últimas 5 rodadas realizadas.
  const realizadas = panorama
    .filter(temParticipacao)
    .sort((x, y) => (y.fimEm ?? 0) - (x.fimEm ?? 0))
    .slice(0, 5)
  const media = realizadas.length
    ? Math.round(realizadas.reduce((s, r) => s + (participacao(r) ?? 0), 0) / realizadas.length)
    : null

  // Alertas.
  const alertas: AlertaPainel[] = []
  const fonteDe = (r: RodadaPanorama) => (r.campanhaId ? fontesPorCampanha.get(r.campanhaId)?.[0]?.id ?? null : SEM_FONTE)
  const rodadaHref = (r: { id: string }, fonte: string | null, aba?: string) => {
    const q = new URLSearchParams()
    if (fonte) q.set("fonte", fonte)
    if (aba) q.set("aba", aba)
    const s = q.toString()
    return `/painel/representacao/votacoes/rodadas/${r.id}${s ? `?${s}` : ""}`
  }
  const semLink: RodadaSemLink[] = await semLinkDasRodadas()
  for (const s of semLink.filter((x) => semLinkUrgente(x))) {
    const r = panorama.find((p) => p.id === s.rodadaId)
    alertas.push({
      tom: s.aberta ? "erro" : "aviso",
      texto: `${s.rodadaNome ?? "Rodada"}: ${s.semLink.toLocaleString("pt-BR")} apto(s) sem link pessoal de voto ${s.aberta ? "com a votação aberta" : "a menos de 48 h da abertura"}.`,
      rotulo: "Ver aptos",
      href: `${rodadaHref({ id: s.rodadaId }, r ? fonteDe(r) : null, "aptos")}&link=sem_link`,
    })
  }
  // Link pessoal entregue e não usado: os votos entram pelo código (21/10/2026).
  for (const l of await linkNaoUsadoDasRodadas()) {
    const r = panorama.find((p) => p.id === l.rodadaId)
    alertas.push({
      tom: "erro",
      texto: `${l.rodadaNome ?? "Rodada"}: ${l.peloCodigo.toLocaleString("pt-BR")} de ${l.votantes.toLocaleString("pt-BR")} votos entraram pelo código por e-mail — o link pessoal${l.dominio ? ` (@${l.dominio})` : ""} não está chegando a quem vota.`,
      rotulo: "Ver rodada",
      href: rodadaHref({ id: l.rodadaId }, r ? fonteDe(r) : null),
    })
  }
  // E-mail corporativo que não chega a quem vota (teste de entrega, 22/10/2026).
  for (const e of await entregaRuimDasRodadas()) {
    const r = panorama.find((p) => p.id === e.rodadaId)
    alertas.push({
      tom: "aviso",
      texto: `${e.rodadaNome ?? "Rodada"}: o e-mail de @${e.dominio} não está chegando a quem vota (${e.motivo === "aviso_previo" ? "aviso prévio desta rodada" : "votação anterior"}) — divulgue o pré-cadastro.`,
      rotulo: "Divulgação",
      href: rodadaHref({ id: e.rodadaId }, r ? fonteDe(r) : null, "divulgacao"),
    })
  }
  // Alertas só do que nasceu no Confluir (regra de 18/10/2026): o legado do
  // Bubble tem 52 assembleias encerradas e nunca apuradas aqui, que não pedem ação.
  for (const r of panorama) {
    if (r.legado) continue
    const fonte = fonteDe(r)
    const perto = r.abreEm !== null && r.abreEm - agoraMs <= 7 * DIA
    if (perto && r.assembleias.length === 0) {
      alertas.push({ tom: "aviso", texto: `${r.nome ?? "Rodada"} não tem assembleia.`, rotulo: "Abrir", href: rodadaHref(r, fonte) })
    } else if (perto && r.perguntas === 0) {
      alertas.push({ tom: "aviso", texto: `${r.nome ?? "Rodada"} abre em breve sem perguntas.`, rotulo: "Cadastrar", href: rodadaHref(r, fonte, "perguntas") })
    } else if (perto && r.aptos === 0) {
      alertas.push({ tom: "aviso", texto: `${r.nome ?? "Rodada"} abre em breve sem aptos.`, rotulo: "Importar", href: rodadaHref(r, fonte, "aptos") })
    }
    for (const a of r.assembleias) {
      if (!a.legado && a.situacao === "encerrada" && !a.apuracaoEncerrada) {
        alertas.push({
          tom: "aviso",
          texto: `${r.nome ?? "Rodada"} · ${a.nome ?? "assembleia"}: encerrada e a apuração ainda não foi encerrada.`,
          rotulo: "Apurar",
          href: `/painel/representacao/votacoes/assembleias/${a.id}?${fonte ? `fonte=${fonte}&` : ""}aba=apuracao`,
        })
      }
    }
  }
  // Não há votação sem fonte pagadora (regra de 17/10/2026): campanha com
  // rodada por vir ou em votação e sem fonte vinculada.
  const avisadas = new Set<string>()
  for (const r of panorama) {
    if (r.legado || !r.campanhaId || avisadas.has(r.campanhaId) || fontesPorCampanha.has(r.campanhaId)) continue
    if (r.situacao !== "agendada" && r.situacao !== "em_votacao") continue
    avisadas.add(r.campanhaId)
    alertas.push({
      tom: "erro",
      texto: `A campanha "${campanhaPorId.get(r.campanhaId)?.tema ?? "sem tema"}" tem votação ${r.situacao === "em_votacao" ? "aberta" : "marcada"} e está sem fonte pagadora.`,
      rotulo: "Vincular a fonte",
      href: `/painel/representacao/votacoes/campanhas/${r.campanhaId}`,
    })
  }
  // Envio automático desligado em rodada online que abre em até 72 h.
  const janelas = await janelasOnline({ client: admin, emp }).catch(() => [])
  for (const j of janelas) {
    if (j.aberta || j.abreEm === null || j.abreEm - agoraMs > 3 * DIA || j.avisoAutoHoras !== null) continue
    const r = panorama.find((p) => p.id === j.rodadaId)
    if (r?.legado) continue
    alertas.push({
      tom: "aviso",
      texto: `${j.rodadaNome ?? "Rodada"} abre em até 72 h com o envio automático dos links desligado.`,
      rotulo: "Divulgação",
      href: rodadaHref({ id: j.rodadaId }, r ? fonteDe(r) : null, "divulgacao"),
    })
  }
  // Repetidos nas listas das rodadas por vir ou abertas.
  const ativas = panorama.filter((r) => !r.legado && (r.situacao === "em_votacao" || r.situacao === "agendada"))
  const repetidos = await Promise.all(ativas.map(async (r) => [r, (await aptosDuplicados(r.id)).length] as const))
  for (const [r, n] of repetidos) {
    if (n > 0) {
      alertas.push({ tom: "aviso", texto: `${r.nome ?? "Rodada"}: ${n} pessoa(s) repetida(s) na lista de aptos.`, rotulo: "Unificar", href: rodadaHref(r, fonteDe(r), "aptos") })
    }
  }
  // Voto em separado sem decisão.
  const { data: separados } = await admin
    .from("voto_em_separado")
    .select("assembleia_id")
    .eq("emp_proprietaria_id", emp)
    .eq("status", "pendente")
    .not("votou_em", "is", null)
  const porAssembleia = new Map<string, number>()
  for (const s of separados ?? []) porAssembleia.set(String(s.assembleia_id), (porAssembleia.get(String(s.assembleia_id)) ?? 0) + 1)
  for (const [assembleiaId, n] of porAssembleia) {
    alertas.push({
      tom: "aviso",
      texto: `${n} voto(s) em separado sem decisão.`,
      rotulo: "Decidir",
      href: `/painel/representacao/votacoes/assembleias/${assembleiaId}?aba=apuracao`,
    })
  }

  return {
    indicadores: {
      campanhasAbertas: campanhas.filter((c) => !c.finalizada).length,
      rodadasEmCurso: panorama.filter((r) => r.situacao === "em_votacao").length,
      abertasAgora: agora.filter((a) => a.aberta).length,
      proximos7dias: agora.filter((a) => !a.aberta).length,
      participacaoMedia: media,
      semLink: semLink.filter((x) => semLinkUrgente(x)).reduce((s, x) => s + x.semLink, 0),
    },
    agora,
    alertas: alertas.sort((x, y) => (x.tom === y.tom ? 0 : x.tom === "erro" ? -1 : 1)),
  }
}

// ── Fontes pagadoras ────────────────────────────────────────────────────────

export type OrdemFontes = "nome" | "campanhas" | "proxima" | "ultima" | "participacao"

/** Sentido padrão de cada coluna (clicar de novo inverte). */
export const SENTIDO_PADRAO: Record<OrdemFontes, "asc" | "desc"> = {
  nome: "asc",
  campanhas: "desc",
  proxima: "asc",
  ultima: "desc",
  participacao: "desc",
}

export type LinhaFonte = {
  id: string
  nome: string
  cnpj: string | null
  grupo: { id: string; nome: string } | null
  campanhas: number
  abertas: number
  /** Fim (ISO) da última votação já encerrada. */
  ultima: string | null
  ultimaRodadaId: string | null
  /** Abertura (ISO) da próxima votação. */
  proxima: string | null
  /** Alguma assembleia da fonte está em votação agora. */
  emCurso: boolean
  participacaoUltima: number | null
  aptosUltima: number | null
  anos: string[]
}

export type FiltrosFontes = {
  busca?: string
  grupo?: string
  situacao?: "abertas" | "encerradas" | ""
  ano?: string
  em7dias?: boolean
  ordem?: OrdemFontes
  /** Sentido; sem ele, o padrão da coluna. */
  dir?: "asc" | "desc"
  pagina?: number
  porPagina?: number
}

export async function listarFontesVotacao(f: FiltrosFontes): Promise<{
  linhas: LinhaFonte[]
  total: number
  pagina: number
  totalPaginas: number
  grupos: { id: string; nome: string }[]
  anos: string[]
}> {
  const { campanhas, fontesPorCampanha, rodadas, admin, emp } = await base()
  const grupos = await gruposPorFonte().catch(() => new Map<string, { id: string; nome: string }>())
  const rodadasPorCampanha = new Map<string, RodadaBruta[]>()
  for (const r of rodadas) if (r.campanha_id) rodadasPorCampanha.set(r.campanha_id, [...(rodadasPorCampanha.get(r.campanha_id) ?? []), r])

  // Próxima e última votação pelas ASSEMBLEIAS (o período da rodada pode ir
  // além da votação: a Light House votou em 23/09 numa rodada até 22/10).
  // Rodada sem assembleia (legado) cai nas datas dela.
  const agoraMs = Date.now()
  const terminoRodada = new Map(rodadas.map((r) => [r.id, r.termino]))
  const sonda = await admin.from("voto_assembleias").select("hora_inicio").limit(1)
  const { data: brutas } = await admin
    .from("voto_assembleias")
    .select("id, rod_assembleia_id, data_inicio, data_termino" + (sonda.error ? "" : ", hora_inicio, hora_termino"))
    .eq("emp_proprietaria_id", emp)
    .not("rod_assembleia_id", "is", null)
  type Janelas = { inicios: number[]; fins: number[]; aberta: boolean }
  const janelasPorRodada = new Map<string, Janelas>()
  for (const a of (brutas ?? []) as unknown as Record<string, unknown>[]) {
    const rid = String(a.rod_assembleia_id)
    const j = janelaDaAssembleia(a, terminoRodada.get(rid) ?? null)
    const item = janelasPorRodada.get(rid) ?? { inicios: [], fins: [], aberta: false }
    if (j.inicio !== null) item.inicios.push(j.inicio)
    if (j.termino !== null) item.fins.push(j.termino)
    if (situacaoDaAssembleia(a, terminoRodada.get(rid) ?? null, agoraMs) === "aberta") item.aberta = true
    janelasPorRodada.set(rid, item)
  }
  const meiaNoite = (d: string | null, fim: boolean) => (d ? Date.parse(`${d.slice(0, 10)}T${fim ? "23:59:59" : "00:00:00"}-03:00`) : null)

  type Acum = LinhaFonte & { _ultimaMs: number; _proximaMs: number; _temas: string }
  const porFonte = new Map<string, Acum>()
  const acumular = (id: string, nome: string, cnpj: string | null, c: (typeof campanhas)[number]) => {
    const a: Acum =
      porFonte.get(id) ??
      ({ id, nome, cnpj, grupo: grupos.get(id) ?? null, campanhas: 0, abertas: 0, ultima: null, ultimaRodadaId: null, proxima: null, emCurso: false, participacaoUltima: null, aptosUltima: null, anos: [], _ultimaMs: 0, _proximaMs: 0, _temas: "" } as Acum)
    a.campanhas++
    a._temas += " " + semAcento(c.tema ?? "").toLowerCase()
    if (!c.finalizada) a.abertas++
    for (const r of rodadasPorCampanha.get(c.id) ?? []) {
      const j = janelasPorRodada.get(r.id)
      const fins = j?.fins.length ? j.fins : [meiaNoite(r.termino ?? r.inicio, true)].filter((x): x is number => x !== null)
      const inicios = j?.inicios.length ? j.inicios : [meiaNoite(r.inicio, false)].filter((x): x is number => x !== null)
      if (j?.aberta) a.emCurso = true
      for (const fim of fins) {
        if (fim < agoraMs && fim > a._ultimaMs) {
          a._ultimaMs = fim
          a.ultima = new Date(fim).toISOString()
          a.ultimaRodadaId = r.id
        }
      }
      for (const ini of inicios) {
        if (ini > agoraMs && (!a._proximaMs || ini < a._proximaMs)) {
          a._proximaMs = ini
          a.proxima = new Date(ini).toISOString()
        }
      }
      const ano = (r.inicio ?? "").slice(0, 4)
      if (ano && !a.anos.includes(ano)) a.anos.push(ano)
    }
    const anoCampanha = (c.criadaEm ?? "").slice(0, 4)
    if (anoCampanha && !a.anos.includes(anoCampanha) && !(rodadasPorCampanha.get(c.id) ?? []).length) a.anos.push(anoCampanha)
    porFonte.set(id, a)
  }
  for (const c of campanhas) {
    const fontes = fontesPorCampanha.get(c.id)
    if (fontes?.length) for (const fo of fontes) acumular(fo.id, fo.nome, fo.cnpj, c)
    else acumular(SEM_FONTE, "Sem fonte pagadora", null, c)
  }

  const termo = semAcento((f.busca ?? "").trim()).toLowerCase()
  const digitos = (f.busca ?? "").replace(/\D/g, "")
  let lista = [...porFonte.values()].filter((l) => {
    // Busca pelo nome ou CNPJ da fonte, ou pelo tema de uma campanha dela.
    if (
      termo &&
      !semAcento(l.nome).toLowerCase().includes(termo) &&
      !l._temas.includes(termo) &&
      !(digitos.length >= 3 && (l.cnpj ?? "").replace(/\D/g, "").includes(digitos))
    )
      return false
    if (f.grupo && l.grupo?.id !== f.grupo) return false
    if (f.situacao === "abertas" && l.abertas === 0) return false
    if (f.situacao === "encerradas" && l.abertas > 0) return false
    if (f.ano && !l.anos.includes(f.ano)) return false
    if (f.em7dias && !l.emCurso && !(l._proximaMs && l._proximaMs <= agoraMs + 7 * DIA)) return false
    return true
  })
  const ordem = f.ordem ?? "proxima"
  const sentido = f.dir ?? SENTIDO_PADRAO[ordem]
  const s = sentido === "asc" ? 1 : -1

  // Participação da última rodada (contagens no banco): de todas as fontes
  // quando a ordem é por ela; senão, só das desta página (mais adiante).
  const calcularParticipacao = (alvo: Acum[]) =>
    Promise.all(
      alvo.map(async (l) => {
        if (!l.ultimaRodadaId) return
        const q = () =>
          admin.from("voto_assembleias_aptos").select("id", { count: "exact", head: true }).eq("emp_proprietaria_id", emp).eq("rod_assembleia_id", l.ultimaRodadaId as string)
        const [{ count: aptos }, { count: votaram }] = await Promise.all([q(), q().not("hora_voto", "is", null)])
        l.aptosUltima = aptos ?? 0
        // Encerrada sem nenhum voto registrado = legado do Bubble (não guardava quem votou).
        l.participacaoUltima = aptos && votaram ? Math.round((votaram / aptos) * 100) : null
      })
    )
  if (ordem === "participacao") await calcularParticipacao(lista)

  // Vazio (sem data, sem participação) vai sempre para o fim, nos dois sentidos.
  const porNumero = (a: number | null, b: number | null) => (a === null || a === 0 ? (b === null || b === 0 ? 0 : 1) : b === null || b === 0 ? -1 : s * (a - b))
  lista.sort((x, y) => {
    if (x.id === SEM_FONTE) return 1
    if (y.id === SEM_FONTE) return -1
    let r = 0
    if (ordem === "nome") r = s * x.nome.localeCompare(y.nome, "pt-BR")
    else if (ordem === "campanhas") r = s * (x.campanhas - y.campanhas)
    else if (ordem === "ultima") r = porNumero(x._ultimaMs, y._ultimaMs)
    else if (ordem === "participacao") r = porNumero(x.participacaoUltima, y.participacaoUltima)
    else {
      // em votação primeiro; depois a próxima; sem próxima, pela última
      if (x.emCurso !== y.emCurso) return x.emCurso ? -1 : 1
      r = porNumero(x._proximaMs, y._proximaMs)
      // empate (sem próxima): a votação mais recente primeiro, nos dois sentidos
      if (r === 0) r = y._ultimaMs - x._ultimaMs
    }
    return r || x.nome.localeCompare(y.nome, "pt-BR")
  })

  const porPagina = f.porPagina && f.porPagina > 0 ? f.porPagina : 20
  const total = lista.length
  const totalPaginas = Math.max(1, Math.ceil(total / porPagina))
  const pagina = Math.min(Math.max(1, f.pagina ?? 1), totalPaginas)
  lista = lista.slice((pagina - 1) * porPagina, pagina * porPagina)
  if (ordem !== "participacao") await calcularParticipacao(lista)

  const anos = [...new Set([...porFonte.values()].flatMap((l) => l.anos))].sort().reverse()
  const listaGrupos = [...new Map([...grupos.values()].map((g) => [g.id, g])).values()].sort((x, y) => x.nome.localeCompare(y.nome, "pt-BR"))
  return {
    linhas: lista.map((l) => {
      const c: Partial<Acum> = { ...l }
      delete c._ultimaMs
      delete c._proximaMs
      delete c._temas
      return c as LinhaFonte
    }),
    total,
    pagina,
    totalPaginas,
    grupos: listaGrupos,
    anos,
  }
}

/** Para o "Agora e a seguir": a assembleia tem voto pela internet? */
export function ehOnline(m: Parameters<typeof temVotoOnline>[0]): boolean {
  return temVotoOnline(m)
}
