import "server-only"

import { temVotoOnline } from "@/lib/assembleias-constantes"
import { hojeSP, texto } from "@/lib/db/comum"
import { aptosDuplicados } from "@/lib/db/aptos-duplicados"
import { gruposPorFonte } from "@/lib/db/grupos-empresariais"
import { panoramaRodadas, participacao, type RodadaPanorama } from "@/lib/db/votacao-panorama"
import { janelasOnline, semLinkDasRodadas, semLinkUrgente, type RodadaSemLink } from "@/lib/db/votacao-sem-link"
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

type RodadaBruta = { id: string; nome_assembleia: string | null; campanha_id: string | null; inicio: string | null; termino: string | null }

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
    admin.from("voto_rod_assembleias").select("id, nome_assembleia, campanha_id, inicio, termino").eq("emp_proprietaria_id", emp),
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
  const recentes = rodadas.filter((r) => !r.termino || r.termino >= limitePassado || (r.inicio ?? "") >= hoje)
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
    .filter((r) => (r.situacao === "apurada" || r.situacao === "a_apurar") && r.aptos > 0)
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
  for (const r of panorama) {
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
      if (a.situacao === "encerrada" && !a.apuracaoEncerrada && (a.fim ?? 0) >= agoraMs - 60 * DIA) {
        alertas.push({
          tom: "aviso",
          texto: `${r.nome ?? "Rodada"} · ${a.nome ?? "assembleia"}: encerrada e a apuração ainda não foi encerrada.`,
          rotulo: "Apurar",
          href: `/painel/representacao/votacoes/assembleias/${a.id}?${fonte ? `fonte=${fonte}&` : ""}aba=apuracao`,
        })
      }
    }
  }
  // Envio automático desligado em rodada online que abre em até 72 h.
  const janelas = await janelasOnline({ client: admin, emp }).catch(() => [])
  for (const j of janelas) {
    if (j.aberta || j.abreEm === null || j.abreEm - agoraMs > 3 * DIA || j.avisoAutoHoras !== null) continue
    const r = panorama.find((p) => p.id === j.rodadaId)
    alertas.push({
      tom: "aviso",
      texto: `${j.rodadaNome ?? "Rodada"} abre em até 72 h com o envio automático dos links desligado.`,
      rotulo: "Divulgação",
      href: rodadaHref({ id: j.rodadaId }, r ? fonteDe(r) : null, "divulgacao"),
    })
  }
  // Repetidos nas listas das rodadas por vir ou abertas.
  const ativas = panorama.filter((r) => r.situacao === "em_votacao" || r.situacao === "agendada")
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

export type OrdemFontes = "nome" | "ultima" | "proxima" | "campanhas"

export type LinhaFonte = {
  id: string
  nome: string
  cnpj: string | null
  grupo: { id: string; nome: string } | null
  campanhas: number
  abertas: number
  /** Data (AAAA-MM-DD) do fim da última rodada já passada. */
  ultima: string | null
  ultimaRodadaId: string | null
  /** Data de início da próxima rodada (ou de uma em curso). */
  proxima: string | null
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
  const hoje = hojeSP()
  const em7 = new Date(Date.now() + 7 * DIA).toISOString().slice(0, 10)
  const grupos = await gruposPorFonte().catch(() => new Map<string, { id: string; nome: string }>())
  const rodadasPorCampanha = new Map<string, RodadaBruta[]>()
  for (const r of rodadas) if (r.campanha_id) rodadasPorCampanha.set(r.campanha_id, [...(rodadasPorCampanha.get(r.campanha_id) ?? []), r])

  type Acum = LinhaFonte & { _ultimaData: string; _temas: string }
  const porFonte = new Map<string, Acum>()
  const acumular = (id: string, nome: string, cnpj: string | null, c: (typeof campanhas)[number]) => {
    const a: Acum =
      porFonte.get(id) ??
      ({ id, nome, cnpj, grupo: grupos.get(id) ?? null, campanhas: 0, abertas: 0, ultima: null, ultimaRodadaId: null, proxima: null, participacaoUltima: null, aptosUltima: null, anos: [], _ultimaData: "", _temas: "" } as Acum)
    a.campanhas++
    a._temas += " " + semAcento(c.tema ?? "").toLowerCase()
    if (!c.finalizada) a.abertas++
    for (const r of rodadasPorCampanha.get(c.id) ?? []) {
      const fim = r.termino ?? r.inicio
      if (fim && fim < hoje && fim > a._ultimaData) {
        a._ultimaData = fim
        a.ultima = fim
        a.ultimaRodadaId = r.id
      }
      const ini = r.inicio
      if (ini && (r.termino ?? ini) >= hoje && (!a.proxima || ini < a.proxima)) a.proxima = ini
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
    if (f.em7dias && !(l.proxima && l.proxima <= em7)) return false
    return true
  })
  const ordem = f.ordem ?? "proxima"
  lista.sort((x, y) => {
    if (x.id === SEM_FONTE) return 1
    if (y.id === SEM_FONTE) return -1
    if (ordem === "nome") return x.nome.localeCompare(y.nome, "pt-BR")
    if (ordem === "campanhas") return y.campanhas - x.campanhas
    if (ordem === "ultima") return (y.ultima ?? "").localeCompare(x.ultima ?? "")
    // próxima primeiro; sem próxima, pela última
    if (x.proxima && y.proxima) return x.proxima.localeCompare(y.proxima)
    if (x.proxima) return -1
    if (y.proxima) return 1
    return (y.ultima ?? "").localeCompare(x.ultima ?? "")
  })

  const porPagina = f.porPagina && f.porPagina > 0 ? f.porPagina : 20
  const total = lista.length
  const totalPaginas = Math.max(1, Math.ceil(total / porPagina))
  const pagina = Math.min(Math.max(1, f.pagina ?? 1), totalPaginas)
  lista = lista.slice((pagina - 1) * porPagina, pagina * porPagina)

  // Participação da última rodada só das fontes desta página (contagens no banco).
  await Promise.all(
    lista.map(async (l) => {
      if (!l.ultimaRodadaId) return
      const q = () =>
        admin.from("voto_assembleias_aptos").select("id", { count: "exact", head: true }).eq("emp_proprietaria_id", emp).eq("rod_assembleia_id", l.ultimaRodadaId as string)
      const [{ count: aptos }, { count: votaram }] = await Promise.all([q(), q().not("hora_voto", "is", null)])
      l.aptosUltima = aptos ?? 0
      l.participacaoUltima = aptos ? Math.round(((votaram ?? 0) / aptos) * 100) : null
    })
  )

  const anos = [...new Set([...porFonte.values()].flatMap((l) => l.anos))].sort().reverse()
  const listaGrupos = [...new Map([...grupos.values()].map((g) => [g.id, g])).values()].sort((x, y) => x.nome.localeCompare(y.nome, "pt-BR"))
  return {
    linhas: lista.map((l) => {
      const c: Partial<Acum> = { ...l }
      delete c._ultimaData
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
