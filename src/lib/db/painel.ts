import "server-only"
import { tenantAtual } from "@/lib/tenant"

import { obterOrganizacao } from "@/lib/db/organizacao"
import { createAdminClient } from "@/lib/supabase/admin"

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
}

export type AusenciaDoDia = {
  id: string
  nome: string | null
  motivo: string | null
  /** Último dia da ausência (retorno previsto no dia seguinte). */
  termino: string | null
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

export async function resumoPainel(): Promise<ResumoPainel> {
  const admin = await createAdminClient()
  const hoje = hojeSaoPaulo()

  // Janela do dia em São Paulo (UTC-3) para a agenda (timestamps em UTC).
  const inicioDia = `${hoje.iso}T00:00:00-03:00`
  const fimDia = `${hoje.iso}T23:59:59-03:00`

  const [aniversariantesRes, vinculosRes, agendaRes, ausenciasRes, tarefasRes] =
    await Promise.all([
    admin
      .from("usuarios")
      .select("id, nome_completo, nome_guerra, vinculo_instituicao")
      .in("vinculo_instituicao", ["Funcionário(a)", "Diretor(a)"])
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
      .select("id, atividade, local, inicio, termino, dia_todo, tipo")
      .eq("emp_proprietaria_id", await tenantAtual())
      .or(
        `and(inicio.gte.${inicioDia},inicio.lte.${fimDia}),and(inicio.lt.${inicioDia},termino.gte.${inicioDia})`
      )
      .order("inicio", { ascending: true })
      .limit(15),
    // Ausentes hoje (dado migrado tem linhas sem datas — exigem início)
    admin
      .from("pessoal_ausencias")
      .select("id, motivo, inicio, termino, funcionario_id")
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

  return {
    hoje: hoje.rotulo,
    aniversariantes,
    aniversariosEmprego,
    agenda: (agendaRes.data ?? []) as EventoDoDia[],
    ausencias: (ausenciasRes.data ?? []).map((a) => ({
      id: a.id,
      nome: a.funcionario_id
        ? (nomesUsuarios.get(a.funcionario_id) ?? null)
        : null,
      motivo: a.motivo,
      termino: a.termino,
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

let cacheNoticias: { expira: number; noticias: Noticia[] } | null = null

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
  const { data: daTabela } = await admin
    .from("noticias")
    .select("id, manchete, created_at")
    .eq("emp_proprietaria_id", await tenantAtual())
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

  if (cacheNoticias && cacheNoticias.expira > Date.now()) {
    return cacheNoticias.noticias.slice(0, limite)
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
    cacheNoticias = { expira: Date.now() + 30 * 60_000, noticias }
  }
  return noticias.slice(0, limite)
}
