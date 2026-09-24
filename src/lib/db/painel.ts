import "server-only"
import { tenantAtual } from "@/lib/tenant"

import { obterOrganizacao } from "@/lib/db/organizacao"
import { createAdminClient } from "@/lib/supabase/admin"
import { VINCULOS_DO_QUADRO } from "@/lib/vinculos-instituicao"

/**
 * Dados da home do painel: aniversariantes da equipe (funcionários e
 * diretores — `usuarios.vinculo_instituicao`), aniversários de emprego
 * (vínculos do sindicato em `vinculos_trabalhistas`) e a agenda do dia.
 */

export type AniversarianteEquipe = {
  id: string
  nome: string | null
  /** "Funcionário(a)" | "Diretor(a)" */
  vinculo: string
}

export type AniversarioEmprego = {
  usuarioId: string
  nome: string | null
  cargo: string | null
  admissao: string
  /** Tempo de casa completado hoje, em anos. */
  anos: number
}

export type EventoDoDia = {
  id: string
  atividade: string | null
  local: string | null
  inicio: string | null
  termino: string | null
  dia_todo: boolean | null
  tipo: string | null
  /** Assembleia: as empresas cuja base vota (fonte pagadora da campanha). */
  empresas?: string[]
}

export type AusenciaDoDia = {
  id: string
  nome: string | null
  /** Tipo da ausência: o motivo registrado (lista) ou, sem ele, o vínculo. */
  tipo: string
  motivo: string | null
  /** Último dia da ausência. */
  termino: string | null
  /** Primeiro dia de volta ao trabalho (dia seguinte ao término). */
  retorno: string | null
}

export type TarefaPendente = {
  id: string
  nome: string | null
  descricao: string | null
  situacao: string | null
  prazo: string | null
  responsavel: string | null
}

export type Noticia = {
  /** id na tabela `noticias` (leitura interna) — null para manchete externa (RSS). */
  id: string | null
  titulo: string
  /** Link externo (fallback RSS) — null para notícia interna. */
  url: string | null
  data: string | null
}

export type ResumoPainel = {
  hoje: string
  aniversariantes: AniversarianteEquipe[]
  aniversariosEmprego: AniversarioEmprego[]
  agenda: EventoDoDia[]
  ausencias: AusenciaDoDia[]
  tarefas: TarefaPendente[]
}

/** Data de hoje em America/Sao_Paulo (o servidor pode estar em UTC). */
function hojeSaoPaulo(): { dia: number; mes: number; ano: number; rotulo: string; iso: string } {
  const partes = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "numeric",
    month: "numeric",
    year: "numeric",
  }).formatToParts(new Date())
  const valor = (tipo: string) =>
    Number(partes.find((p) => p.type === tipo)?.value)
  const dia = valor("day")
  const mes = valor("month")
  const ano = valor("year")
  return {
    dia,
    mes,
    ano,
    rotulo: `${String(dia).padStart(2, "0")}/${String(mes).padStart(2, "0")}`,
    iso: `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`,
  }
}

/**
 * @param usuarioId Demandas em aberto só aparecem para quem está nelas:
 * o demandante (`criado_por`) ou o demandado (`membro_responsavel_id`).
 * Antes o bloco mostrava as demandas de todo mundo para todo mundo.
 */
export async function resumoPainel(usuarioId: string): Promise<ResumoPainel> {
  const admin = await createAdminClient()
  const hoje = hojeSaoPaulo()

  // Janela do dia em São Paulo (UTC-3) para a agenda (timestamps em UTC).
  const inicioDia = `${hoje.iso}T00:00:00-03:00`
  const fimDia = `${hoje.iso}T23:59:59-03:00`

  const [
    aniversariantesRes,
    vinculosRes,
    agendaRes,
    ausenciasRes,
    tarefasRes,
  ] = await Promise.all([
    // Só o quadro DESTA entidade: sem o filtro por tenant o painel mostrava
    // funcionários e diretores de outros sindicatos.
    admin
      .from("usuarios")
      .select("id, nome_completo, nome_guerra, vinculo_instituicao")
      .eq("emp_proprietaria_id", await tenantAtual())
      .in("vinculo_instituicao", [...VINCULOS_DO_QUADRO])
      .eq("nascimento_dia", hoje.dia)
      .eq("nascimento_mes", hoje.mes)
      .not("inativo", "is", true)
      .not("deletado", "is", true)
      .order("nome_completo", { ascending: true }),
    // ~50 vínculos — o filtro por dia/mês da admissão é feito em memória.
    admin
      .from("vinculos_trabalhistas")
      .select("trabalhador_id, cargo, contrato_admissao")
      .eq("empregador_id", await tenantAtual())
      .is("contrato_demissao", null)
      .not("contrato_admissao", "is", null)
      .not("trabalhador_id", "is", null),
    admin
      .from("agenda")
      .select("id, atividade, local, inicio, termino, dia_todo, tipo, assembleia_id")
      .eq("emp_proprietaria_id", await tenantAtual())
      .or(
        `and(inicio.gte.${inicioDia},inicio.lte.${fimDia}),and(inicio.lt.${inicioDia},termino.gte.${inicioDia})`
      )
      .order("inicio", { ascending: true })
      .limit(15),
    // Ausentes hoje (dado migrado tem linhas sem datas — exigem início)
    admin
      .from("pessoal_ausencias")
      .select("id, motivo, inicio, termino, funcionario_id, atestado_id, ferias_id")
      .eq("emp_proprietaria_id", await tenantAtual())
      .or(
        `and(inicio.lte.${hoje.iso},termino.gte.${hoje.iso}),and(inicio.eq.${hoje.iso},termino.is.null)`
      )
      .order("termino", { ascending: true })
      .limit(15),
    // Tarefas pendentes (demandas do Bubble: situação ≠ Feito)
    admin
      .from("demandas")
      .select("id, nome, descricao, situacao, prazo, membro_responsavel_id")
      .eq("emp_proprietaria_id", await tenantAtual())
      .or("situacao.neq.Feito,situacao.is.null")
      .or(`membro_responsavel_id.eq.${usuarioId},criado_por.eq.${usuarioId}`)
      .order("prazo", { ascending: true, nullsFirst: false })
      .limit(8),
  ])

  const aniversariantes: AniversarianteEquipe[] = (
    aniversariantesRes.data ?? []
  ).map((u) => ({
    id: u.id,
    nome: u.nome_completo ?? u.nome_guerra,
    vinculo: u.vinculo_instituicao as string,
  }))

  // Aniversário de emprego: admissão no mesmo dia/mês (anos > 0), uma
  // entrada por pessoa (dado migrado tem vínculos duplicados).
  const porPessoa = new Map<string, { cargo: string | null; admissao: string }>()
  for (const v of vinculosRes.data ?? []) {
    const adm = v.contrato_admissao as string
    const [ano, mes, dia] = adm.slice(0, 10).split("-").map(Number)
    if (dia !== hoje.dia || mes !== hoje.mes) continue
    if (hoje.ano - ano <= 0) continue
    const atual = porPessoa.get(v.trabalhador_id)
    // Fica com a admissão mais antiga (maior tempo de casa)
    if (!atual || adm < atual.admissao) {
      porPessoa.set(v.trabalhador_id, { cargo: v.cargo, admissao: adm })
    }
  }
  let aniversariosEmprego: AniversarioEmprego[] = []
  if (porPessoa.size > 0) {
    const { data: usuarios } = await admin
      .from("usuarios")
      .select("id, nome_completo, nome_guerra")
      .in("id", [...porPessoa.keys()])
    aniversariosEmprego = [...porPessoa.entries()]
      .map(([usuarioId, v]) => {
        const u = (usuarios ?? []).find((x) => x.id === usuarioId)
        return {
          usuarioId,
          nome: u?.nome_completo ?? u?.nome_guerra ?? null,
          cargo: v.cargo,
          admissao: v.admissao,
          anos: hoje.ano - Number(v.admissao.slice(0, 4)),
        }
      })
      .sort((a, b) => (a.nome ?? "").localeCompare(b.nome ?? "", "pt-BR"))
  }

  // Nomes dos ausentes e dos responsáveis pelas tarefas num lote só
  const idsUsuarios = [
    ...new Set(
      [
        ...(ausenciasRes.data ?? []).map((a) => a.funcionario_id),
        ...(tarefasRes.data ?? []).map((t) => t.membro_responsavel_id),
      ].filter((v): v is string => Boolean(v))
    ),
  ]
  const nomesUsuarios = new Map<string, string>()
  if (idsUsuarios.length > 0) {
    const { data } = await admin
      .from("usuarios")
      .select("id, nome_completo, nome_guerra")
      .in("id", idsUsuarios)
    for (const u of data ?? []) {
      const nome = u.nome_completo ?? u.nome_guerra
      if (nome) nomesUsuarios.set(u.id, nome)
    }
  }

  // Assembleia na agenda: quais empresas têm base votando (é o que a equipe
  // pergunta primeiro ao ver "Assembleia" no dia).
  const empresasPorEvento = await empresasDasAssembleias(
    (agendaRes.data ?? []).map((e) => ({
      id: String(e.id),
      assembleiaId: (e.assembleia_id as string | null) ?? null,
    }))
  )

  return {
    hoje: hoje.rotulo,
    aniversariantes,
    aniversariosEmprego,
    agenda: (agendaRes.data ?? []).map((e) => ({
      id: String(e.id),
      atividade: (e.atividade as string | null) ?? null,
      local: (e.local as string | null) ?? null,
      inicio: (e.inicio as string | null) ?? null,
      termino: (e.termino as string | null) ?? null,
      dia_todo: (e.dia_todo as boolean | null) ?? null,
      tipo: (e.tipo as string | null) ?? null,
      empresas: empresasPorEvento.get(String(e.id)) ?? [],
    })),
    ausencias: (ausenciasRes.data ?? []).map((a) => ({
      id: a.id,
      nome: a.funcionario_id
        ? (nomesUsuarios.get(a.funcionario_id) ?? null)
        : null,
      // O motivo É o tipo (lista do Bubble: falta justificada, afastamento
      // médico, férias, compensação…). Só quando ele vem vazio é que o
      // vínculo com atestado ou férias diz o que foi.
      tipo:
        a.motivo?.trim() ||
        (a.atestado_id ? "Afastamento médico" : a.ferias_id ? "Férias" : "Ausência"),
      motivo: a.motivo,
      termino: a.termino,
      retorno: diaSeguinte(a.termino as string | null),
    })),
    tarefas: (tarefasRes.data ?? []).map((t) => ({
      id: t.id,
      nome: t.nome,
      descricao: t.descricao,
      situacao: t.situacao,
      prazo: t.prazo,
      responsavel: t.membro_responsavel_id
        ? (nomesUsuarios.get(t.membro_responsavel_id) ?? null)
        : null,
    })),
  }
}

// ── Notícias do site institucional ─────────────────────────────────────────
//
// As URLs (página HTML e feed RSS) vêm da configuração da organização
// (`empresa.noticias_url` / `noticias_feed_url`), nunca hardcoded — cada
// tenant aponta para o seu próprio site. Sem URL configurada, o widget fica
// só com a tabela `noticias`.

/** Cache POR TENANT: um único cache servia o site de um tenant a todos. */
const cacheNoticias = new Map<string, { expira: number; noticias: Noticia[] }>()

function decodificarEntidades(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x([0-9a-f]+);/gi, (_, n) =>
      String.fromCodePoint(parseInt(n, 16))
    )
    .trim()
}

/** Data do RSS → 'DD/MM'. */
function dataCurta(pubDate: string | null): string | null {
  if (!pubDate) return null
  const d = new Date(pubDate)
  if (Number.isNaN(d.getTime())) return null
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
  }).format(d)
}

export type NoticiaCompleta = {
  id: string
  manchete: string | null
  noticia: string | null
  imagem: string | null
  created_at: string | null
}

/** Notícia da tabela `noticias` (página de leitura). */
export async function buscarNoticia(
  id: string
): Promise<NoticiaCompleta | null> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("noticias")
    .select("id, manchete, noticia, imagem, created_at")
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  return (data as NoticiaCompleta) ?? null
}

/**
 * Últimas notícias — resumo do dia. Fonte primária: tabela `noticias`
 * (manchete clicável abre a leitura interna). Enquanto a tabela estiver
 * vazia (carga do Bubble pendente), cai para o feed RSS do site
 * institucional (manchetes com link externo). Cache 30 min.
 */
export async function ultimasNoticias(limite = 6): Promise<Noticia[]> {
  const admin = await createAdminClient()
  const tenant = await tenantAtual()
  const { data: daTabela } = await admin
    .from("noticias")
    .select("id, manchete, created_at")
    .eq("emp_proprietaria_id", tenant)
    .order("created_at", { ascending: false, nullsFirst: false })
    .limit(limite)
  const internas = (daTabela ?? []).filter((n) => n.manchete)
  if (internas.length > 0) {
    return internas.map((n) => ({
      id: n.id,
      titulo: n.manchete as string,
      url: null,
      data: dataCurta(n.created_at),
    }))
  }

  const emCache = cacheNoticias.get(tenant)
  if (emCache && emCache.expira > Date.now()) {
    return emCache.noticias.slice(0, limite)
  }

  // URLs de notícias configuradas pela organização (multitenant).
  const org = await obterOrganizacao()
  const urlNoticias = org?.noticiasUrl ?? null
  const urlFeed = org?.noticiasFeedUrl ?? null
  if (!urlNoticias && !urlFeed) return []

  const cabecalhos = {
    "User-Agent": "Mozilla/5.0 (compatible; ConfluirPainel/1.0)",
  }
  let noticias: Noticia[] = []

  if (urlNoticias) {
    try {
      const r = await fetch(urlNoticias, {
        headers: cabecalhos,
        cache: "no-store",
      })
      if (r.ok) {
        const html = await r.text()
        const artigos = html.match(/<article[\s\S]*?<\/article>/g) ?? []
        for (const artigo of artigos) {
          const link = /<a\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/.exec(artigo)
          if (!link) continue
          const titulo = decodificarEntidades(link[2].replace(/<[^>]+>/g, ""))
          if (!titulo) continue
          noticias.push({ id: null, titulo, url: link[1], data: null })
        }
      }
    } catch {
      // site fora do ar — tenta o feed abaixo
    }
  }

  if (urlFeed && noticias.length === 0) {
    try {
      const r = await fetch(urlFeed, { headers: cabecalhos, cache: "no-store" })
      if (r.ok) {
        const xml = await r.text()
        const itens = xml.match(/<item>[\s\S]*?<\/item>/g) ?? []
        noticias = itens.flatMap((item) => {
          const titulo = /<title>([\s\S]*?)<\/title>/.exec(item)?.[1]
          const url = /<link>([\s\S]*?)<\/link>/.exec(item)?.[1]
          const data = /<pubDate>([\s\S]*?)<\/pubDate>/.exec(item)?.[1] ?? null
          if (!titulo || !url) return []
          return [
            {
              id: null,
              titulo: decodificarEntidades(titulo),
              url: url.trim(),
              data: dataCurta(data),
            },
          ]
        })
      }
    } catch {
      // sem notícias desta vez — o card mostra o aviso
    }
  }

  if (noticias.length > 0) {
    cacheNoticias.set(tenant, { expira: Date.now() + 30 * 60_000, noticias })
  }
  return noticias.slice(0, limite)
}

/** '2026-09-25' → '2026-09-26' (primeiro dia de volta ao trabalho). */
function diaSeguinte(iso: string | null): string | null {
  const dia = (iso ?? "").slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return null
  const d = new Date(`${dia}T12:00:00-03:00`)
  d.setDate(d.getDate() + 1)
  return d.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })
}

/**
 * Empresas cuja base vota em cada evento de assembleia da agenda: a empresa
 * da própria assembleia, a da rodada e as fontes pagadoras da campanha.
 */
async function empresasDasAssembleias(
  eventos: { id: string; assembleiaId: string | null }[]
): Promise<Map<string, string[]>> {
  const porEvento = new Map<string, string[]>()
  const comAssembleia = eventos.filter((e) => e.assembleiaId)
  if (comAssembleia.length === 0) return porEvento

  const admin = await createAdminClient()
  const { data: assembleias, error } = await admin
    .from("voto_assembleias")
    .select("id, empresa_id, campanha_id, rod_assembleia_id")
    .in("id", comAssembleia.map((e) => e.assembleiaId as string))
  if (error) return porEvento

  // Empresa da rodada e campanha da rodada (quando a assembleia não traz).
  const rodadaIds = [
    ...new Set(
      (assembleias ?? [])
        .map((a) => a.rod_assembleia_id as string | null)
        .filter((v): v is string => Boolean(v))
    ),
  ]
  const rodadas = new Map<string, { empresa: string | null; campanha: string | null }>()
  if (rodadaIds.length > 0) {
    const { data } = await admin
      .from("voto_rod_assembleias")
      .select("id, empresa_id, campanha_id")
      .in("id", rodadaIds)
    for (const r of data ?? []) {
      rodadas.set(String(r.id), {
        empresa: (r.empresa_id as string | null) ?? null,
        campanha: (r.campanha_id as string | null) ?? null,
      })
    }
  }

  // Fontes pagadoras das campanhas envolvidas.
  const campanhaIds = [
    ...new Set(
      (assembleias ?? []).flatMap((a) => {
        const daRodada = a.rod_assembleia_id
          ? rodadas.get(String(a.rod_assembleia_id))?.campanha
          : null
        return [(a.campanha_id as string | null) ?? null, daRodada ?? null]
      }).filter((v): v is string => Boolean(v))
    ),
  ]
  const fontesPorCampanha = new Map<string, string[]>()
  if (campanhaIds.length > 0) {
    const { data } = await admin
      .from("voto_campanha_fontes")
      .select("campanha_id, empresa_id")
      .in("campanha_id", campanhaIds)
    for (const v of data ?? []) {
      const lista = fontesPorCampanha.get(String(v.campanha_id)) ?? []
      if (v.empresa_id) lista.push(String(v.empresa_id))
      fontesPorCampanha.set(String(v.campanha_id), lista)
    }
  }

  // Nomes de todas as empresas citadas, num lote só.
  const idsEmpresa = new Set<string>()
  const porAssembleia = new Map<string, string[]>()
  for (const a of assembleias ?? []) {
    const daRodada = a.rod_assembleia_id ? rodadas.get(String(a.rod_assembleia_id)) : null
    const campanha = (a.campanha_id as string | null) ?? daRodada?.campanha ?? null
    const ids = [
      (a.empresa_id as string | null) ?? null,
      daRodada?.empresa ?? null,
      ...(campanha ? (fontesPorCampanha.get(campanha) ?? []) : []),
    ].filter((v): v is string => Boolean(v))
    const unicos = [...new Set(ids)]
    unicos.forEach((id) => idsEmpresa.add(id))
    porAssembleia.set(String(a.id), unicos)
  }
  const nomes = new Map<string, string>()
  if (idsEmpresa.size > 0) {
    const { data } = await admin
      .from("empresa")
      .select("id, nome_fantasia, nome_razao")
      .in("id", [...idsEmpresa])
    for (const e of data ?? []) {
      const nome = (e.nome_fantasia as string | null)?.trim() || (e.nome_razao as string | null)?.trim()
      if (nome) nomes.set(String(e.id), nome)
    }
  }

  for (const e of comAssembleia) {
    const ids = porAssembleia.get(String(e.assembleiaId)) ?? []
    const lista = ids.map((id) => nomes.get(id)).filter((n): n is string => Boolean(n))
    if (lista.length > 0) porEvento.set(e.id, [...new Set(lista)].sort())
  }
  return porEvento
}
