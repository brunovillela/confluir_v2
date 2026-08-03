import "server-only"
import { tenantAtual } from "@/lib/tenant"

import { gerarCodigoProcesso } from "@/lib/db/compras"
import { nomesDeEmpresas } from "@/lib/db/fontes"
import { criarNotificacao } from "@/lib/db/notificacoes"
import { formatarMoeda } from "@/lib/formato"
import { createAdminClient } from "@/lib/supabase/admin"
import {
  lerDirecao,
  lerOrdem,
  lerOrdemProcesso,
  statusFinaliza,
  type Direcao,
  type FiltroAndamento,
  type FiltroFiliacao,
  type FiltroNatureza,
  type FiltroSituacaoReembolso,
  type Ordem,
  type OrdemProcesso,
  type SituacaoReembolsoExibida,
} from "@/lib/juridico-constantes"

/**
 * Jurídico — Homologações de rescisão trabalhista.
 *
 * O sindicato homologa a rescisão do trabalhador (filiado ou não). Os 599
 * registros migrados do Bubble trazem data, motivo, empregador
 * (`fonte_pg_id` → empresa) e, quando filiado, `filiado_id` → filiacoes.
 * 460 são de não-filiados e vieram SEM nome/CPF (o legado não gravou); os
 * registros novos identificam o não-filiado por `trabalhador_nome`/`_cpf`
 * (colunas de supabase/juridico.sql).
 *
 * O parecer é um PDF no bucket privado `juridico`: `parecer_url` guarda o
 * CAMINHO e a URL assinada sai na hora da exibição. Compat: legado pode
 * trazer URL absoluta, tratada em `urlParecer`.
 */

/** PGRST205/42P01 = tabela ausente; PGRST204/42703 = coluna ausente. */
function esquemaAusente(erro: { code?: string } | null): boolean {
  return ["PGRST205", "42P01", "PGRST204", "42703"].includes(erro?.code ?? "")
}

const AVISO_SQL =
  "Jurídico ainda não configurado — rode supabase/juridico.sql no Supabase."

const COLUNAS =
  "id, data, data_demissao, motivo, fonte_pg_id, filiado_id, " +
  "trabalhador_nao_filiado, trabalhador_nome, trabalhador_cpf, parecer_url, " +
  "observacoes, registrado_por_id, created_at, updated_at"

// ── Tipos ────────────────────────────────────────────────────────────────

type LinhaBanco = {
  id: string
  data: string | null
  data_demissao: string | null
  motivo: string | null
  fonte_pg_id: string | null
  filiado_id: string | null
  trabalhador_nao_filiado: boolean | null
  trabalhador_nome: string | null
  trabalhador_cpf: string | null
  parecer_url: string | null
  observacoes: string | null
  registrado_por_id: string | null
  created_at: string | null
  updated_at: string | null
}

export type Homologacao = LinhaBanco & {
  /** Nome resolvido: filiacoes (filiado) ou trabalhador_nome (não-filiado). */
  trabalhador: string | null
  /** CPF resolvido (só dígitos): filiacoes ou trabalhador_cpf. */
  cpf: string | null
  /** É de filiado? (tem filiado_id) */
  filiado: boolean
  /** Nome do empregador (empresa.nome_fantasia/razão). */
  empregador: string | null
  /** Nome do usuário que registrou. */
  registradoPor: string | null
}

export type FiltrosHomologacao = {
  busca?: string
  ano?: string
  motivo?: string
  filiacao?: FiltroFiliacao
  fonteId?: string
}

// ── Resolução de nomes ─────────────────────────────────────────────────────

type DadosFiliacao = { nome: string | null; cpf: string | null }

async function dadosDeFiliacoes(
  ids: string[]
): Promise<Map<string, DadosFiliacao>> {
  const mapa = new Map<string, DadosFiliacao>()
  const unicos = [...new Set(ids.filter(Boolean))]
  if (unicos.length === 0) return mapa
  const admin = await createAdminClient()
  const { data } = await admin
    .from("filiacoes")
    .select("id, nome_completo, cpf")
    .in("id", unicos)
  for (const f of data ?? []) {
    mapa.set(f.id, { nome: f.nome_completo ?? null, cpf: f.cpf ?? null })
  }
  return mapa
}

async function nomesDeUsuarios(ids: string[]): Promise<Map<string, string>> {
  const nomes = new Map<string, string>()
  const unicos = [...new Set(ids.filter(Boolean))]
  if (unicos.length === 0) return nomes
  const admin = await createAdminClient()
  const { data } = await admin
    .from("usuarios")
    .select("id, nome_completo, nome_guerra")
    .in("id", unicos)
  for (const u of data ?? []) {
    const nome = [u.nome_completo, u.nome_guerra].find(
      (v): v is string => typeof v === "string" && v.trim() !== ""
    )
    if (nome) nomes.set(u.id, nome)
  }
  return nomes
}

/** Junta as linhas do banco com nomes de filiado, empregador e autor. */
async function enriquecer(linhas: LinhaBanco[]): Promise<Homologacao[]> {
  const [filiacoes, empresas, usuarios] = await Promise.all([
    dadosDeFiliacoes(linhas.map((l) => l.filiado_id ?? "")),
    nomesDeEmpresas([...new Set(linhas.map((l) => l.fonte_pg_id).filter((v): v is string => !!v))]),
    nomesDeUsuarios(linhas.map((l) => l.registrado_por_id ?? "")),
  ])

  return linhas.map((l) => {
    const fil = l.filiado_id ? filiacoes.get(l.filiado_id) : undefined
    return {
      ...l,
      trabalhador: fil?.nome ?? l.trabalhador_nome ?? null,
      cpf: fil?.cpf ?? l.trabalhador_cpf ?? null,
      filiado: Boolean(l.filiado_id),
      empregador: l.fonte_pg_id ? (empresas.get(l.fonte_pg_id) ?? null) : null,
      registradoPor: l.registrado_por_id
        ? (usuarios.get(l.registrado_por_id) ?? null)
        : null,
    }
  })
}

// ── Ordenação (em memória: a busca resolve nomes fora do banco) ──────────────

function ordenar(
  linhas: Homologacao[],
  ordem: Ordem,
  dir: Direcao
): Homologacao[] {
  const sinal = dir === "asc" ? 1 : -1
  const texto = (v: string | null) => (v ?? "").toLocaleLowerCase("pt-BR")
  return [...linhas].sort((a, b) => {
    let cmp = 0
    switch (ordem) {
      case "trabalhador":
        cmp = texto(a.trabalhador).localeCompare(texto(b.trabalhador), "pt-BR")
        break
      case "empregador":
        cmp = texto(a.empregador).localeCompare(texto(b.empregador), "pt-BR")
        break
      case "motivo":
        cmp = texto(a.motivo).localeCompare(texto(b.motivo), "pt-BR")
        break
      default:
        cmp = (a.data ?? "").localeCompare(b.data ?? "")
    }
    // Desempate estável por data desc, depois id.
    if (cmp === 0) cmp = (a.data ?? "").localeCompare(b.data ?? "") || a.id.localeCompare(b.id)
    return cmp * sinal
  })
}

// ── Listagem ────────────────────────────────────────────────────────────────

/**
 * Traz as homologações que casam com os filtros de banco (ano, motivo,
 * filiação, empregador), enriquece com nomes e aplica busca textual +
 * ordenação em memória. O teto de `limite` protege o PostgREST (1.000).
 */
async function consultar(
  filtros: FiltrosHomologacao,
  limite: number
): Promise<{ linhas: Homologacao[]; disponivel: boolean }> {
  const admin = await createAdminClient()
  let q = admin
    .from("juridico_homologacoes")
    .select(COLUNAS)
    .eq("emp_proprietaria_id", await tenantAtual())

  if (filtros.ano && /^\d{4}$/.test(filtros.ano)) {
    q = q.gte("data", `${filtros.ano}-01-01`).lte("data", `${filtros.ano}-12-31`)
  }
  if (filtros.motivo) q = q.eq("motivo", filtros.motivo)
  if (filtros.fonteId) q = q.eq("fonte_pg_id", filtros.fonteId)
  if (filtros.filiacao === "filiados") q = q.not("filiado_id", "is", null)
  if (filtros.filiacao === "nao_filiados") q = q.is("filiado_id", null)

  const { data, error } = await q
    .order("data", { ascending: false, nullsFirst: false })
    .limit(limite)
  if (error) {
    if (esquemaAusente(error)) return { linhas: [], disponivel: false }
    throw new Error(`Falha ao listar homologações: ${error.message}`)
  }

  let linhas = await enriquecer((data ?? []) as unknown as LinhaBanco[])

  const termo = filtros.busca?.trim().toLocaleLowerCase("pt-BR")
  if (termo) {
    const digitos = termo.replace(/\D/g, "")
    linhas = linhas.filter((l) => {
      const alvo = [l.trabalhador, l.empregador, l.motivo]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("pt-BR")
      const cpf = (l.cpf ?? "").replace(/\D/g, "")
      return alvo.includes(termo) || (digitos.length >= 3 && cpf.includes(digitos))
    })
  }
  return { linhas, disponivel: true }
}

export async function listarHomologacoes(opts: {
  filtros?: FiltrosHomologacao
  ordem?: string
  dir?: string
  limite?: number
}): Promise<{ linhas: Homologacao[]; disponivel: boolean }> {
  const { linhas, disponivel } = await consultar(
    opts.filtros ?? {},
    opts.limite ?? 500
  )
  return {
    linhas: ordenar(linhas, lerOrdem(opts.ordem), lerDirecao(opts.dir)),
    disponivel,
  }
}

export async function listarHomologacoesParaExportar(
  filtros: FiltrosHomologacao,
  ordem: Ordem,
  dir: Direcao
): Promise<Homologacao[]> {
  const { linhas } = await consultar(filtros, 1000)
  return ordenar(linhas, ordem, dir)
}

// ── Detalhe ─────────────────────────────────────────────────────────────────

export async function obterHomologacao(id: string): Promise<Homologacao | null> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("juridico_homologacoes")
    .select(COLUNAS)
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (error && !esquemaAusente(error)) {
    throw new Error(`Falha ao carregar homologação: ${error.message}`)
  }
  if (!data) return null
  const [enriquecida] = await enriquecer([data as unknown as LinhaBanco])
  return enriquecida
}

// ── Indicadores (hub) ────────────────────────────────────────────────────────

export type IndicadoresHomologacoes = {
  total: number
  noAno: number
  ano: number
  naoFiliados: number
  porMotivo: { motivo: string; total: number }[]
}

export async function indicadoresHomologacoes(): Promise<IndicadoresHomologacoes> {
  const admin = await createAdminClient()
  const ano = new Date().getFullYear()
  const emp = await tenantAtual()

  const base = () =>
    admin
      .from("juridico_homologacoes")
      .select("*", { count: "exact", head: true })
      .eq("emp_proprietaria_id", emp)

  const [tudo, doAno, semFiliado, comMotivo] = await Promise.all([
    base(),
    base().gte("data", `${ano}-01-01`).lte("data", `${ano}-12-31`),
    base().is("filiado_id", null),
    admin
      .from("juridico_homologacoes")
      .select("motivo")
      .eq("emp_proprietaria_id", await tenantAtual())
      .not("motivo", "is", null)
      .limit(1000),
  ])

  if (tudo.error && esquemaAusente(tudo.error)) {
    return { total: 0, noAno: 0, ano, naoFiliados: 0, porMotivo: [] }
  }

  const contagem = new Map<string, number>()
  for (const r of (comMotivo.data ?? []) as { motivo: string | null }[]) {
    if (!r.motivo) continue
    contagem.set(r.motivo, (contagem.get(r.motivo) ?? 0) + 1)
  }
  const porMotivo = [...contagem.entries()]
    .map(([motivo, total]) => ({ motivo, total }))
    .sort((a, b) => b.total - a.total)

  return {
    total: tudo.count ?? 0,
    noAno: doAno.count ?? 0,
    ano,
    naoFiliados: semFiliado.count ?? 0,
    porMotivo,
  }
}

// ── Escrita ──────────────────────────────────────────────────────────────────

export type DadosHomologacao = {
  data: string | null
  data_demissao: string | null
  motivo: string | null
  fonte_pg_id: string | null
  filiado_id: string | null
  trabalhador_nome: string | null
  trabalhador_cpf: string | null
  observacoes: string | null
}

/** Filiado e não-filiado são exclusivos: com filiado_id, zera os campos livres. */
function normalizar(dados: DadosHomologacao) {
  const temFiliado = Boolean(dados.filiado_id)
  return {
    data: dados.data,
    data_demissao: dados.data_demissao,
    motivo: dados.motivo,
    fonte_pg_id: dados.fonte_pg_id,
    filiado_id: dados.filiado_id,
    trabalhador_nao_filiado: temFiliado ? false : true,
    trabalhador_nome: temFiliado ? null : dados.trabalhador_nome,
    trabalhador_cpf: temFiliado ? null : dados.trabalhador_cpf,
    observacoes: dados.observacoes,
  }
}

export async function criarHomologacao(
  dados: DadosHomologacao,
  registradoPorId: string
): Promise<{ id?: string; erro?: string }> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("juridico_homologacoes")
    .insert({
      ...normalizar(dados),
      emp_proprietaria_id: await tenantAtual(),
      registrado_por_id: registradoPorId,
    })
    .select("id")
    .single()
  if (error) return { erro: esquemaAusente(error) ? AVISO_SQL : error.message }
  return { id: data.id }
}

export async function atualizarHomologacao(
  id: string,
  dados: DadosHomologacao
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin
    .from("juridico_homologacoes")
    .update({ ...normalizar(dados), updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: esquemaAusente(error) ? AVISO_SQL : error.message }
  return {}
}

// ── Parecer (PDF no bucket privado `juridico`) ───────────────────────────────

export async function gravarParecer(
  id: string,
  arquivo: File
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const caminho = `homologacoes/${id}/${Date.now()}-${arquivo.name.replace(/[^\w.-]/g, "_")}`
  const { error: erroUpload } = await admin.storage
    .from("juridico")
    .upload(caminho, arquivo, { contentType: arquivo.type, upsert: false })
  if (erroUpload) return { erro: `Falha no upload: ${erroUpload.message}` }

  const { error } = await admin
    .from("juridico_homologacoes")
    .update({ parecer_url: caminho, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: esquemaAusente(error) ? AVISO_SQL : error.message }
  return {}
}

/** URL assinada (1h) do parecer. Legado com URL absoluta passa direto. */
export async function urlParecer(caminho: string | null): Promise<string | null> {
  if (!caminho) return null
  if (/^(https?:)?\/\//.test(caminho)) {
    return caminho.startsWith("//") ? `https:${caminho}` : caminho
  }
  const admin = await createAdminClient()
  const { data } = await admin.storage
    .from("juridico")
    .createSignedUrl(caminho, 3600)
  return data?.signedUrl ?? null
}

// ===========================================================================
// PROCESSOS (registro simples)
// ===========================================================================

const AVISO_SQL_PROCESSOS =
  "Processos ainda não configurados — rode supabase/juridico-processos.sql no Supabase."

const COLUNAS_PROCESSO =
  "id, numero_processo, tipo, coletivo, status_processo, finalizado, " +
  "data_abertura, parte_assessorada, outras_partes, observacoes, " +
  "assessoria_id, responsavel_id, registrado_por_id, created_at, updated_at"

type LinhaProcessoBanco = {
  id: string
  numero_processo: string | null
  tipo: string | null
  coletivo: boolean | null
  status_processo: string | null
  finalizado: boolean | null
  data_abertura: string | null
  parte_assessorada: string | null
  outras_partes: string[] | null
  observacoes: string | null
  assessoria_id: string | null
  responsavel_id: string | null
  registrado_por_id: string | null
  created_at: string | null
  updated_at: string | null
}

export type FiliadoDoProcesso = { id: string; nome: string | null; cpf: string | null }

export type Processo = LinhaProcessoBanco & {
  /** Data usada na ordenação/exibição: abertura ou, na falta, cadastro. */
  dataReferencia: string | null
  responsavel: string | null
  registradoPor: string | null
  /** Nome do escritório responsável (empresa referida por assessoria_id). */
  escritorio: string | null
  filiados: FiliadoDoProcesso[]
}

export type FiltrosProcesso = {
  busca?: string
  tipo?: string
  status?: string
  andamento?: FiltroAndamento
  natureza?: FiltroNatureza
  filiadoId?: string
}

// ── Filiados vinculados (junção N:N já existente) ────────────────────────────

async function filiadosPorProcesso(
  processoIds: string[]
): Promise<Map<string, FiliadoDoProcesso[]>> {
  const mapa = new Map<string, FiliadoDoProcesso[]>()
  if (processoIds.length === 0) return mapa
  const admin = await createAdminClient()
  const { data } = await admin
    .from("juridico_processos_filiados")
    .select("processo_id, filiado_id")
    .in("processo_id", processoIds)
  const vinculos = (data ?? []) as { processo_id: string; filiado_id: string }[]

  const dados = await dadosDeFiliacoes(vinculos.map((v) => v.filiado_id))
  for (const v of vinculos) {
    const d = dados.get(v.filiado_id)
    const lista = mapa.get(v.processo_id) ?? []
    lista.push({ id: v.filiado_id, nome: d?.nome ?? null, cpf: d?.cpf ?? null })
    mapa.set(v.processo_id, lista)
  }
  return mapa
}

/** Substitui todos os filiados de um processo pela lista informada. */
async function gravarFiliadosDoProcesso(
  processoId: string,
  filiadoIds: string[]
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error: erroDel } = await admin
    .from("juridico_processos_filiados")
    .delete()
    .eq("processo_id", processoId)
  if (erroDel) {
    return { erro: esquemaAusente(erroDel) ? AVISO_SQL_PROCESSOS : erroDel.message }
  }
  const unicos = [...new Set(filiadoIds.filter(Boolean))]
  if (unicos.length === 0) return {}
  const { error } = await admin
    .from("juridico_processos_filiados")
    .insert(unicos.map((filiado_id) => ({ processo_id: processoId, filiado_id })))
  if (error) {
    return { erro: esquemaAusente(error) ? AVISO_SQL_PROCESSOS : error.message }
  }
  return {}
}

// ── Enriquecimento e ordenação ───────────────────────────────────────────────

async function enriquecerProcessos(
  linhas: LinhaProcessoBanco[]
): Promise<Processo[]> {
  const [usuarios, escritorios, filiados] = await Promise.all([
    nomesDeUsuarios(
      linhas.flatMap((l) =>
        [l.responsavel_id, l.registrado_por_id].filter(
          (v): v is string => !!v
        )
      )
    ),
    nomesDeEmpresas([
      ...new Set(
        linhas.map((l) => l.assessoria_id).filter((v): v is string => !!v)
      ),
    ]),
    filiadosPorProcesso(linhas.map((l) => l.id)),
  ])
  return linhas.map((l) => ({
    ...l,
    dataReferencia: l.data_abertura ?? l.created_at ?? null,
    responsavel: l.responsavel_id ? (usuarios.get(l.responsavel_id) ?? null) : null,
    registradoPor: l.registrado_por_id
      ? (usuarios.get(l.registrado_por_id) ?? null)
      : null,
    escritorio: l.assessoria_id ? (escritorios.get(l.assessoria_id) ?? null) : null,
    filiados: filiados.get(l.id) ?? [],
  }))
}

function ordenarProcessos(
  linhas: Processo[],
  ordem: OrdemProcesso,
  dir: Direcao
): Processo[] {
  const sinal = dir === "asc" ? 1 : -1
  const texto = (v: string | null) => (v ?? "").toLocaleLowerCase("pt-BR")
  return [...linhas].sort((a, b) => {
    let cmp = 0
    switch (ordem) {
      case "numero":
        cmp = texto(a.numero_processo).localeCompare(texto(b.numero_processo), "pt-BR", { numeric: true })
        break
      case "status":
        cmp = texto(a.status_processo).localeCompare(texto(b.status_processo), "pt-BR")
        break
      case "tipo":
        cmp = texto(a.tipo).localeCompare(texto(b.tipo), "pt-BR")
        break
      default:
        cmp = (a.dataReferencia ?? "").localeCompare(b.dataReferencia ?? "")
    }
    if (cmp === 0) {
      cmp =
        (a.dataReferencia ?? "").localeCompare(b.dataReferencia ?? "") ||
        a.id.localeCompare(b.id)
    }
    return cmp * sinal
  })
}

// ── Listagem ─────────────────────────────────────────────────────────────────

async function consultarProcessos(
  filtros: FiltrosProcesso,
  limite: number
): Promise<{ linhas: Processo[]; disponivel: boolean }> {
  const admin = await createAdminClient()

  // Filtro por filiado usa a junção: resolve os processo_ids primeiro.
  let idsPorFiliado: string[] | null = null
  if (filtros.filiadoId) {
    const { data, error } = await admin
      .from("juridico_processos_filiados")
      .select("processo_id")
      .eq("filiado_id", filtros.filiadoId)
    if (error && esquemaAusente(error)) return { linhas: [], disponivel: false }
    idsPorFiliado = [...new Set((data ?? []).map((r) => r.processo_id as string))]
    if (idsPorFiliado.length === 0) return { linhas: [], disponivel: true }
  }

  let q = admin
    .from("juridico_processos")
    .select(COLUNAS_PROCESSO)
    .eq("emp_proprietaria_id", await tenantAtual())

  if (idsPorFiliado) q = q.in("id", idsPorFiliado)
  if (filtros.tipo) q = q.eq("tipo", filtros.tipo)
  if (filtros.status) q = q.eq("status_processo", filtros.status)
  if (filtros.andamento === "abertos") q = q.not("finalizado", "is", true)
  if (filtros.andamento === "finalizados") q = q.eq("finalizado", true)
  if (filtros.natureza === "coletivo") q = q.eq("coletivo", true)
  if (filtros.natureza === "individual") q = q.not("coletivo", "is", true)

  const { data, error } = await q
    .order("data_abertura", { ascending: false, nullsFirst: false })
    .limit(limite)
  if (error) {
    if (esquemaAusente(error)) return { linhas: [], disponivel: false }
    throw new Error(`Falha ao listar processos: ${error.message}`)
  }

  let linhas = await enriquecerProcessos(
    (data ?? []) as unknown as LinhaProcessoBanco[]
  )

  const termo = filtros.busca?.trim().toLocaleLowerCase("pt-BR")
  if (termo) {
    const digitos = termo.replace(/\D/g, "")
    linhas = linhas.filter((l) => {
      const alvo = [
        l.numero_processo,
        l.tipo,
        l.status_processo,
        l.parte_assessorada,
        l.responsavel,
        ...(l.outras_partes ?? []),
        ...l.filiados.map((f) => f.nome),
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("pt-BR")
      const cpfs = l.filiados.map((f) => (f.cpf ?? "").replace(/\D/g, "")).join(" ")
      return alvo.includes(termo) || (digitos.length >= 3 && cpfs.includes(digitos))
    })
  }
  return { linhas, disponivel: true }
}

export async function listarProcessos(opts: {
  filtros?: FiltrosProcesso
  ordem?: string
  dir?: string
  limite?: number
}): Promise<{ linhas: Processo[]; disponivel: boolean }> {
  const { linhas, disponivel } = await consultarProcessos(
    opts.filtros ?? {},
    opts.limite ?? 500
  )
  return {
    linhas: ordenarProcessos(
      linhas,
      lerOrdemProcesso(opts.ordem),
      lerDirecao(opts.dir)
    ),
    disponivel,
  }
}

export async function listarProcessosParaExportar(
  filtros: FiltrosProcesso,
  ordem: OrdemProcesso,
  dir: Direcao
): Promise<Processo[]> {
  const { linhas } = await consultarProcessos(filtros, 1000)
  return ordenarProcessos(linhas, ordem, dir)
}

export async function obterProcesso(id: string): Promise<Processo | null> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("juridico_processos")
    .select(COLUNAS_PROCESSO)
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (error && !esquemaAusente(error)) {
    throw new Error(`Falha ao carregar processo: ${error.message}`)
  }
  if (!data) return null
  const [enriquecido] = await enriquecerProcessos([
    data as unknown as LinhaProcessoBanco,
  ])
  return enriquecido
}

// ── Indicadores (hub) ────────────────────────────────────────────────────────

export type IndicadoresProcessos = {
  disponivel: boolean
  total: number
  emAndamento: number
  finalizados: number
  coletivos: number
  porTipo: { tipo: string; total: number }[]
}

export async function indicadoresProcessos(): Promise<IndicadoresProcessos> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const base = () =>
    admin
      .from("juridico_processos")
      .select("*", { count: "exact", head: true })
      .eq("emp_proprietaria_id", emp)

  const [tudo, abertos, coletivos, tipos] = await Promise.all([
    base(),
    base().not("finalizado", "is", true),
    base().eq("coletivo", true),
    admin
      .from("juridico_processos")
      .select("tipo")
      .eq("emp_proprietaria_id", await tenantAtual())
      .not("tipo", "is", null)
      .limit(1000),
  ])

  if (tudo.error && esquemaAusente(tudo.error)) {
    return {
      disponivel: false,
      total: 0,
      emAndamento: 0,
      finalizados: 0,
      coletivos: 0,
      porTipo: [],
    }
  }

  const contagem = new Map<string, number>()
  for (const r of (tipos.data ?? []) as { tipo: string | null }[]) {
    if (!r.tipo) continue
    contagem.set(r.tipo, (contagem.get(r.tipo) ?? 0) + 1)
  }
  const porTipo = [...contagem.entries()]
    .map(([tipo, total]) => ({ tipo, total }))
    .sort((a, b) => b.total - a.total)

  const total = tudo.count ?? 0
  const emAndamento = abertos.count ?? 0
  return {
    disponivel: true,
    total,
    emAndamento,
    finalizados: total - emAndamento,
    coletivos: coletivos.count ?? 0,
    porTipo,
  }
}

// ── Escrita ──────────────────────────────────────────────────────────────────

export type DadosProcesso = {
  numero_processo: string | null
  tipo: string | null
  coletivo: boolean
  status_processo: string | null
  data_abertura: string | null
  parte_assessorada: string | null
  outras_partes: string[]
  observacoes: string | null
  assessoria_id: string | null
  responsavel_id: string | null
  filiadoIds: string[]
}

function camposProcesso(dados: DadosProcesso) {
  return {
    numero_processo: dados.numero_processo,
    tipo: dados.tipo,
    coletivo: dados.coletivo,
    status_processo: dados.status_processo,
    finalizado: statusFinaliza(dados.status_processo),
    data_abertura: dados.data_abertura,
    parte_assessorada: dados.parte_assessorada,
    outras_partes: dados.outras_partes.length ? dados.outras_partes : null,
    observacoes: dados.observacoes,
    assessoria_id: dados.assessoria_id,
    responsavel_id: dados.responsavel_id,
  }
}

export async function criarProcesso(
  dados: DadosProcesso,
  registradoPorId: string
): Promise<{ id?: string; erro?: string }> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("juridico_processos")
    .insert({
      ...camposProcesso(dados),
      emp_proprietaria_id: await tenantAtual(),
      registrado_por_id: registradoPorId,
    })
    .select("id")
    .single()
  if (error) {
    return { erro: esquemaAusente(error) ? AVISO_SQL_PROCESSOS : error.message }
  }
  const vinc = await gravarFiliadosDoProcesso(data.id, dados.filiadoIds)
  if (vinc.erro) return { erro: vinc.erro }
  return { id: data.id }
}

export async function atualizarProcesso(
  id: string,
  dados: DadosProcesso
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  // Escopo por tenant + confirma que a linha é deste tenant ANTES de mexer na
  // junção (juridico_processos_filiados é escopada pelo processo, não por emp).
  const { data: alteradas, error } = await admin
    .from("juridico_processos")
    .update({ ...camposProcesso(dados), updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
    .select("id")
  if (error) {
    return { erro: esquemaAusente(error) ? AVISO_SQL_PROCESSOS : error.message }
  }
  if ((alteradas ?? []).length === 0) return { erro: "Processo não encontrado." }
  return gravarFiliadosDoProcesso(id, dados.filiadoIds)
}

// ===========================================================================
// REEMBOLSOS DE PROCESSO
// ===========================================================================
//
// O escritório de advocacia responsável pelo caso (juridico_processos.
// assessoria_id → empresa) gasta e o sindicato reembolsa. Esteira em duas
// etapas: a gestão jurídica aprova/reprova o reembolso; ao aprovar, gera uma
// ordem de pagamento tipo 'Reembolso' em 'Em autorização' (favorecido = o
// escritório), que ainda passa pela alçada do Financeiro. Nunca se gera ordem
// já autorizada. Colunas novas vêm de supabase/juridico-reembolsos.sql.

const AVISO_SQL_REEMBOLSOS =
  "Reembolsos ainda não configurados — rode supabase/juridico-reembolsos.sql no Supabase."

const COLUNAS_REEMBOLSO =
  "id, processo_id, valor, descricao_despesa, comprovante_despesa, " +
  "data_despesa, situacao, solicitante_id, avaliador_id, avaliacao_data, " +
  "avaliacao_observacao, ordem_pagamento_id, created_at, updated_at"

type LinhaReembolsoBanco = {
  id: string
  processo_id: string | null
  valor: number | null
  descricao_despesa: string | null
  comprovante_despesa: string | null
  data_despesa: string | null
  situacao: string | null
  solicitante_id: string | null
  avaliador_id: string | null
  avaliacao_data: string | null
  avaliacao_observacao: string | null
  ordem_pagamento_id: string | null
  created_at: string | null
  updated_at: string | null
}

export type Reembolso = LinhaReembolsoBanco & {
  situacaoExibida: SituacaoReembolsoExibida
  solicitante: string | null
  avaliador: string | null
  /** Dados da ordem gerada (quando aprovado). */
  ordemCodigo: string | null
  ordemPago: boolean
}

export type FiltrosReembolso = {
  busca?: string
  situacao?: FiltroSituacaoReembolso
}

/** Resolve código/pago das ordens de pagamento vinculadas. */
async function ordensDosReembolsos(
  ids: string[]
): Promise<Map<string, { codigo: string | null; pago: boolean }>> {
  const mapa = new Map<string, { codigo: string | null; pago: boolean }>()
  const unicos = [...new Set(ids.filter(Boolean))]
  if (unicos.length === 0) return mapa
  const admin = await createAdminClient()
  const { data } = await admin
    .from("ordens_pagamento")
    .select("id, codigo, pago")
    .in("id", unicos)
  for (const o of data ?? []) {
    mapa.set(o.id, { codigo: o.codigo ?? null, pago: o.pago === true })
  }
  return mapa
}

function situacaoExibidaReembolso(
  situacao: string | null,
  pago: boolean
): SituacaoReembolsoExibida {
  if (situacao === "reprovado") return "reprovado"
  if (situacao === "aprovado") return pago ? "pago" : "aprovado"
  return "aguardando"
}

async function enriquecerReembolsos(
  linhas: LinhaReembolsoBanco[]
): Promise<Reembolso[]> {
  const [usuarios, ordens] = await Promise.all([
    nomesDeUsuarios(
      linhas.flatMap((l) =>
        [l.solicitante_id, l.avaliador_id].filter((v): v is string => !!v)
      )
    ),
    ordensDosReembolsos(
      linhas.map((l) => l.ordem_pagamento_id ?? "").filter(Boolean)
    ),
  ])
  return linhas.map((l) => {
    const ordem = l.ordem_pagamento_id ? ordens.get(l.ordem_pagamento_id) : undefined
    const pago = ordem?.pago ?? false
    return {
      ...l,
      situacaoExibida: situacaoExibidaReembolso(l.situacao, pago),
      solicitante: l.solicitante_id ? (usuarios.get(l.solicitante_id) ?? null) : null,
      avaliador: l.avaliador_id ? (usuarios.get(l.avaliador_id) ?? null) : null,
      ordemCodigo: ordem?.codigo ?? null,
      ordemPago: pago,
    }
  })
}

/** Reembolsos de UM processo, mais recentes primeiro. */
export async function listarReembolsosDoProcesso(
  processoId: string
): Promise<{ linhas: Reembolso[]; disponivel: boolean }> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("juridico_reembolsos")
    .select(COLUNAS_REEMBOLSO)
    .eq("processo_id", processoId)
    .order("created_at", { ascending: false })
  if (error) {
    if (esquemaAusente(error)) return { linhas: [], disponivel: false }
    throw new Error(`Falha ao listar reembolsos: ${error.message}`)
  }
  const linhas = await enriquecerReembolsos(
    (data ?? []) as unknown as LinhaReembolsoBanco[]
  )
  return { linhas, disponivel: true }
}

/** Fila global de reembolsos (todos os processos) para a gestão jurídica. */
export async function listarReembolsos(
  filtros: FiltrosReembolso,
  limite = 500
): Promise<{ linhas: (Reembolso & { processo: ProcessoResumo })[]; disponivel: boolean }> {
  const admin = await createAdminClient()
  let q = admin
    .from("juridico_reembolsos")
    .select(COLUNAS_REEMBOLSO)
    .eq("emp_proprietaria_id", await tenantAtual())

  // Situação: 'aprovado' e 'pago' partilham a coluna 'aprovado' (pago deriva
  // da ordem), então filtramos por 'aprovado' no banco e refinamos depois.
  if (filtros.situacao === "aguardando") q = q.eq("situacao", "aguardando")
  else if (filtros.situacao === "reprovado") q = q.eq("situacao", "reprovado")
  else if (filtros.situacao === "aprovado" || filtros.situacao === "pago") {
    q = q.eq("situacao", "aprovado")
  }

  const { data, error } = await q
    .order("created_at", { ascending: false })
    .limit(limite)
  if (error) {
    if (esquemaAusente(error)) return { linhas: [], disponivel: false }
    throw new Error(`Falha ao listar reembolsos: ${error.message}`)
  }

  const base = await enriquecerReembolsos(
    (data ?? []) as unknown as LinhaReembolsoBanco[]
  )
  const processos = await resumosDeProcessos(
    base.map((r) => r.processo_id ?? "").filter(Boolean)
  )
  let linhas = base.map((r) => ({
    ...r,
    processo: (r.processo_id && processos.get(r.processo_id)) || {
      id: r.processo_id ?? "",
      numero_processo: null,
      escritorio: null,
    },
  }))

  // Refino do filtro pago × a-pagar (deriva da ordem).
  if (filtros.situacao === "pago") {
    linhas = linhas.filter((r) => r.situacaoExibida === "pago")
  } else if (filtros.situacao === "aprovado") {
    linhas = linhas.filter((r) => r.situacaoExibida === "aprovado")
  }

  const termo = filtros.busca?.trim().toLocaleLowerCase("pt-BR")
  if (termo) {
    linhas = linhas.filter((r) =>
      [r.descricao_despesa, r.processo.numero_processo, r.processo.escritorio, r.solicitante]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("pt-BR")
        .includes(termo)
    )
  }
  return { linhas, disponivel: true }
}

type ProcessoResumo = {
  id: string
  numero_processo: string | null
  escritorio: string | null
}

async function resumosDeProcessos(
  ids: string[]
): Promise<Map<string, ProcessoResumo>> {
  const mapa = new Map<string, ProcessoResumo>()
  const unicos = [...new Set(ids.filter(Boolean))]
  if (unicos.length === 0) return mapa
  const admin = await createAdminClient()
  const { data } = await admin
    .from("juridico_processos")
    .select("id, numero_processo, assessoria_id")
    .in("id", unicos)
  const linhas = (data ?? []) as {
    id: string
    numero_processo: string | null
    assessoria_id: string | null
  }[]
  const escritorios = await nomesDeEmpresas(
    linhas.map((l) => l.assessoria_id).filter((v): v is string => !!v)
  )
  for (const l of linhas) {
    mapa.set(l.id, {
      id: l.id,
      numero_processo: l.numero_processo,
      escritorio: l.assessoria_id ? (escritorios.get(l.assessoria_id) ?? null) : null,
    })
  }
  return mapa
}

/** Total reembolsado (aprovado/pago) de um processo. */
export function totalReembolsado(linhas: Reembolso[]): number {
  return linhas
    .filter((r) => r.situacao === "aprovado")
    .reduce((soma, r) => soma + (r.valor ?? 0), 0)
}

// ── Escrita ──────────────────────────────────────────────────────────────────

export type DadosReembolso = {
  processo_id: string
  valor: number | null
  descricao_despesa: string | null
  data_despesa: string | null
}

export async function criarReembolso(
  dados: DadosReembolso,
  solicitanteId: string
): Promise<{ id?: string; erro?: string }> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("juridico_reembolsos")
    .insert({
      processo_id: dados.processo_id,
      valor: dados.valor,
      descricao_despesa: dados.descricao_despesa,
      data_despesa: dados.data_despesa,
      situacao: "aguardando",
      solicitante_id: solicitanteId,
      emp_proprietaria_id: await tenantAtual(),
    })
    .select("id")
    .single()
  if (error) {
    return { erro: esquemaAusente(error) ? AVISO_SQL_REEMBOLSOS : error.message }
  }
  return { id: data.id }
}

export async function gravarComprovanteReembolso(
  id: string,
  arquivo: File
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const caminho = `reembolsos/${id}/${Date.now()}-${arquivo.name.replace(/[^\w.-]/g, "_")}`
  const { error: erroUpload } = await admin.storage
    .from("juridico")
    .upload(caminho, arquivo, { contentType: arquivo.type, upsert: false })
  if (erroUpload) return { erro: `Falha no upload: ${erroUpload.message}` }

  const { error } = await admin
    .from("juridico_reembolsos")
    .update({ comprovante_despesa: caminho, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: esquemaAusente(error) ? AVISO_SQL_REEMBOLSOS : error.message }
  return {}
}

export async function urlComprovanteReembolso(
  caminho: string | null
): Promise<string | null> {
  if (!caminho) return null
  if (/^(https?:)?\/\//.test(caminho)) {
    return caminho.startsWith("//") ? `https:${caminho}` : caminho
  }
  const admin = await createAdminClient()
  const { data } = await admin.storage
    .from("juridico")
    .createSignedUrl(caminho, 3600)
  return data?.signedUrl ?? null
}

/**
 * Avalia o reembolso. Aprovar exige que o processo tenha ESCRITÓRIO
 * (assessoria_id) — é o favorecido da ordem gerada em 'Em autorização'.
 * Update condicionado a situacao='aguardando' protege contra corrida; a
 * ordem órfã é apagada se a corrida for perdida.
 */
export async function avaliarReembolso(
  id: string,
  avaliadorId: string,
  decisao: { aprovar: boolean; observacao: string | null }
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()

  const { data: reemb, error: erroLer } = await admin
    .from("juridico_reembolsos")
    .select("id, valor, descricao_despesa, situacao, solicitante_id, processo_id")
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (erroLer) {
    return { erro: esquemaAusente(erroLer) ? AVISO_SQL_REEMBOLSOS : erroLer.message }
  }
  if (!reemb) return { erro: "Reembolso não encontrado." }
  if (reemb.situacao !== "aguardando") {
    return { erro: "Este reembolso já foi avaliado." }
  }

  let ordemId: string | null = null
  let ordemCodigo: string | undefined

  if (decisao.aprovar) {
    // Precisa do escritório (favorecido) definido no processo.
    const { data: proc } = await admin
      .from("juridico_processos")
      .select("numero_processo, assessoria_id")
      .eq("id", reemb.processo_id)
      .maybeSingle()
    if (!proc?.assessoria_id) {
      return {
        erro: "Defina o escritório responsável no processo antes de aprovar o reembolso.",
      }
    }

    ordemCodigo = gerarCodigoProcesso()
    const descricao = [
      `Reembolso ao escritório responsável — ${reemb.descricao_despesa ?? "despesa"}`,
      proc.numero_processo ? `(processo ${proc.numero_processo}).` : ".",
      `Valor ${formatarMoeda(reemb.valor)}.`,
    ].join(" ")

    // Centro de custo padrão configurado para o jurídico (pode ser nulo).
    const centroCustoId = await centroCustoJuridicoId()

    const { data: ordem, error: erroOrdem } = await admin
      .from("ordens_pagamento")
      .insert({
        codigo: ordemCodigo,
        tipo: "Reembolso",
        descricao,
        situacao: "Em autorização",
        valor_inicial_cobranca: reemb.valor,
        beneficiario_fornecedor_id: proc.assessoria_id,
        centro_custo_despesa_id: centroCustoId,
        emp_proprietaria_id: await tenantAtual(),
        excluido: false,
      })
      .select("id")
      .single()
    if (erroOrdem || !ordem) {
      return { erro: `Não foi possível gerar a ordem de pagamento: ${erroOrdem?.message}` }
    }
    ordemId = ordem.id
  }

  const { data: alteradas, error } = await admin
    .from("juridico_reembolsos")
    .update({
      situacao: decisao.aprovar ? "aprovado" : "reprovado",
      avaliador_id: avaliadorId,
      avaliacao_data: new Date().toISOString(),
      avaliacao_observacao: decisao.observacao,
      ordem_pagamento_id: ordemId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("situacao", "aguardando")
    .select("id")
  if (error) return { erro: `Não foi possível salvar a avaliação: ${error.message}` }
  if ((alteradas ?? []).length === 0) {
    if (ordemId) await admin.from("ordens_pagamento").delete().eq("id", ordemId)
    return { erro: "Este reembolso já foi avaliado por outra pessoa." }
  }

  // Notifica o solicitante (melhor esforço — não desfaz a avaliação).
  if (reemb.solicitante_id) {
    try {
      await criarNotificacao({
        usuarioId: reemb.solicitante_id,
        texto: decisao.aprovar
          ? `Reembolso jurídico aprovado (${formatarMoeda(reemb.valor)}). Ordem ${ordemCodigo} gerada, aguardando autorização do Financeiro.`
          : `Reembolso jurídico reprovado. ${decisao.observacao ?? ""}`.trim(),
      })
    } catch {
      // notificação é acessório
    }
  }
  return {}
}

/** Contagem de reembolsos aguardando aprovação (badge da fila/hub). */
export async function contarReembolsosAguardando(): Promise<number> {
  const admin = await createAdminClient()
  const { count, error } = await admin
    .from("juridico_reembolsos")
    .select("*", { count: "exact", head: true })
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("situacao", "aguardando")
  if (error) return 0
  return count ?? 0
}

// ── Configuração: centro de custo dos reembolsos ─────────────────────────────
//
// `juridico_configuracoes` é um singleton (uma linha) com o centro de custo
// padrão que as ordens de reembolso do jurídico carregam. Definido pela
// gestão na fila de reembolsos; aplicado em avaliarReembolso.

export type CentroCustoJuridico = {
  centroCustoId: string | null
  centroCustoNome: string | null
}

async function linhaConfiguracao(): Promise<{ id: string; centro_custo_id: string | null } | null> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("juridico_configuracoes")
    .select("id, centro_custo_id")
    .order("created_at", { ascending: true, nullsFirst: false })
    .limit(1)
    .maybeSingle()
  if (error && !esquemaAusente(error)) {
    throw new Error(`Falha ao ler configuração jurídica: ${error.message}`)
  }
  return (data as { id: string; centro_custo_id: string | null } | null) ?? null
}

async function centroCustoJuridicoId(): Promise<string | null> {
  return (await linhaConfiguracao())?.centro_custo_id ?? null
}

export async function obterCentroCustoJuridico(): Promise<CentroCustoJuridico> {
  const centroCustoId = await centroCustoJuridicoId()
  if (!centroCustoId) return { centroCustoId: null, centroCustoNome: null }
  const admin = await createAdminClient()
  const { data } = await admin
    .from("centros_de_custo")
    .select("nome_da_conta")
    .eq("id", centroCustoId)
    .maybeSingle()
  return { centroCustoId, centroCustoNome: data?.nome_da_conta ?? null }
}

export async function definirCentroCustoJuridico(
  centroCustoId: string | null
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const atual = await linhaConfiguracao()
  if (atual) {
    const { error } = await admin
      .from("juridico_configuracoes")
      .update({ centro_custo_id: centroCustoId })
      .eq("id", atual.id)
    if (error) return { erro: error.message }
  } else {
    const { error } = await admin
      .from("juridico_configuracoes")
      .insert({ centro_custo_id: centroCustoId })
    if (error) {
      return { erro: esquemaAusente(error) ? AVISO_SQL_REEMBOLSOS : error.message }
    }
  }
  return {}
}
