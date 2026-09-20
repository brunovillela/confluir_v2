import "server-only"
import { randomUUID } from "node:crypto"

import { cpfConfiavel } from "@/lib/cpf"
import { esquemaAusente, texto } from "@/lib/db/comum"
import { tenantAtual } from "@/lib/tenant"

import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Diretoria — mandatos (`diretoria_mandatos`) e seus integrantes
 * (`diretoria_integrantes`, criada em supabase/organizacao-diretoria.sql).
 * O signatário de um ofício é um integrante do mandato vigente com
 * `pode_assinar = true`. "Vigente" = hoje entre data_inicio e data_termino.
 *
 * Integrantes têm vínculo OPCIONAL com `usuarios`; como quase ninguém está
 * integrado ao painel, são identificados por nome + cargo.
 */

const AVISO_SQL =
  "Diretoria ainda não configurada — rode supabase/organizacao-diretoria.sql no Supabase."

const AVISO_SQL_LOTE =
  "Liberações em lote e instâncias no mandato ainda não configuradas — rode supabase/diretoria-liberacoes-lote.sql no Supabase."

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10)
}

function vigente(inicio: string | null, termino: string | null): boolean {
  const hoje = hojeISO()
  if (inicio && inicio > hoje) return false
  if (termino && termino < hoje) return false
  return Boolean(inicio || termino)
}

// ── Mandatos ────────────────────────────────────────────────────────────────

export type MandatoLinha = {
  id: string
  mandato: string | null
  dataInicio: string | null
  dataTermino: string | null
  vigente: boolean
  integrantes: number
}

async function contarIntegrantes(
  mandatoIds: string[]
): Promise<Map<string, number>> {
  const mapa = new Map<string, number>()
  const ids = [...new Set(mandatoIds.filter(Boolean))]
  if (ids.length === 0) return mapa
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("diretoria_integrantes")
    .select("mandato_id")
    .in("mandato_id", ids)
  if (error) return mapa
  for (const r of data ?? []) {
    const m = r.mandato_id as string
    mapa.set(m, (mapa.get(m) ?? 0) + 1)
  }
  return mapa
}

export async function listarMandatos(): Promise<MandatoLinha[]> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("diretoria_mandatos")
    .select("id, mandato, data_inicio, data_termino")
    .eq("emp_proprietaria_id", await tenantAtual())
    .order("data_inicio", { ascending: false, nullsFirst: false })

  const linhas = data ?? []
  const contagem = await contarIntegrantes(linhas.map((m) => m.id as string))
  return linhas.map((m) => ({
    id: m.id as string,
    mandato: texto(m.mandato),
    dataInicio: texto(m.data_inicio),
    dataTermino: texto(m.data_termino),
    vigente: vigente(texto(m.data_inicio), texto(m.data_termino)),
    integrantes: contagem.get(m.id as string) ?? 0,
  }))
}

export type Integrante = {
  id: string
  nome: string | null
  cargo: string | null
  ordem: number
  podeAssinar: boolean
  /** Tem liberação sindical vigente hoje. */
  liberado: boolean
  grupoId: string | null
  grupoNome: string | null
  cpf: string | null
  filiacaoId: string | null
  /** Cruzamento por CPF: é filiado / tem conta de usuário / tem acesso ao painel. */
  ehFiliado: boolean
  temUsuario: boolean
  temAcesso: boolean
  /** Instâncias em que tem assento vigente (nome). */
  instancias: string[]
  /** Conta de usuário (gravada ou achada pelo CPF) — liga aos departamentos. */
  usuarioId: string | null
  /** Em exercício, licenciado ou excluído (supabase/diretoria-situacao.sql). */
  situacao: SituacaoIntegrante
  situacaoDesde: string | null
  situacaoMotivo: string | null
}

export type SituacaoIntegrante = "exercicio" | "licenciado" | "excluido"

function situacaoDe(v: unknown): SituacaoIntegrante {
  return v === "licenciado" || v === "excluido" ? v : "exercicio"
}

export type Grupo = { id: string; nome: string; ordem: number }

export type DetalheMandato = {
  id: string
  mandato: string | null
  dataInicio: string | null
  dataTermino: string | null
  vigente: boolean
  integrantesDisponiveis: boolean
  /** true quando as colunas de grupo/cpf existem (SQL diretoria-grupos rodado). */
  gruposDisponiveis: boolean
  grupos: Grupo[]
  integrantes: Integrante[]
}

export async function obterMandato(id: string): Promise<DetalheMandato | null> {
  const admin = await createAdminClient()
  const { data: m } = await admin
    .from("diretoria_mandatos")
    .select("id, mandato, data_inicio, data_termino")
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (!m) return null

  // Tenta com as colunas novas (grupo/cpf/filiacao). Se ainda não existem,
  // cai para o select básico e marca gruposDisponiveis = false.
  let comGrupos = true
  let ints: Record<string, unknown>[] = []
  let erroBasico = false
  {
    const ler = (colunas: string) =>
      admin
        .from("diretoria_integrantes")
        .select(colunas)
        .eq("mandato_id", id)
        .order("ordem", { ascending: true })
        .order("nome", { ascending: true })
    let r = await ler(
      "id, nome, cargo, ordem, pode_assinar, grupo_id, cpf, filiacao_id, usuario_id, situacao, situacao_desde, situacao_motivo"
    )
    // Sem supabase/diretoria-situacao.sql: todos em exercício.
    if (r.error) r = await ler("id, nome, cargo, ordem, pode_assinar, grupo_id, cpf, filiacao_id, usuario_id")
    if (r.error) {
      comGrupos = false
      const r2 = await admin
        .from("diretoria_integrantes")
        .select("id, nome, cargo, ordem, pode_assinar")
        .eq("mandato_id", id)
        .order("ordem", { ascending: true })
      erroBasico = !!r2.error
      ints = (r2.data ?? []) as Record<string, unknown>[]
    } else {
      ints = (r.data ?? []) as unknown as Record<string, unknown>[]
    }
  }

  const [liberados, grupos, cruzamento, instancias] = await Promise.all([
    integrantesLiberadosHoje(ints.map((i) => i.id as string)),
    comGrupos ? listarGrupos(id) : Promise.resolve([]),
    comGrupos
      ? cruzarPessoas(ints.map((i) => texto(i.cpf)).filter(Boolean) as string[])
      : Promise.resolve(new Map()),
    instanciasVigentesPorIntegrante(ints.map((i) => i.id as string)),
  ])
  const nomeGrupo = new Map(grupos.map((g) => [g.id, g.nome]))

  return {
    id: m.id as string,
    mandato: texto(m.mandato),
    dataInicio: texto(m.data_inicio),
    dataTermino: texto(m.data_termino),
    vigente: vigente(texto(m.data_inicio), texto(m.data_termino)),
    integrantesDisponiveis: !erroBasico,
    gruposDisponiveis: comGrupos,
    grupos,
    integrantes: ints.map((i) => {
      const cpf = texto(i.cpf)
      const c = cpf ? cruzamento.get(cpf) : undefined
      return {
        id: i.id as string,
        nome: texto(i.nome),
        cargo: texto(i.cargo),
        ordem: (i.ordem as number) ?? 0,
        podeAssinar: i.pode_assinar === true,
        liberado: liberados.has(i.id as string),
        grupoId: texto(i.grupo_id),
        grupoNome: i.grupo_id ? (nomeGrupo.get(i.grupo_id as string) ?? null) : null,
        cpf,
        filiacaoId: texto(i.filiacao_id),
        ehFiliado: Boolean(i.filiacao_id) || (c?.filiado ?? false),
        temUsuario: c?.temUsuario ?? false,
        temAcesso: c?.temAcesso ?? false,
        instancias: instancias.get(i.id as string) ?? [],
        usuarioId: texto(i.usuario_id) ?? c?.usuarioId ?? null,
        situacao: situacaoDe(i.situacao),
        situacaoDesde: texto(i.situacao_desde),
        situacaoMotivo: texto(i.situacao_motivo),
      }
    }),
  }
}

/** Nomes das instâncias com assento vigente (sem fim ou fim >= hoje), por integrante. */
async function instanciasVigentesPorIntegrante(ids: string[]): Promise<Map<string, string[]>> {
  const mapa = new Map<string, string[]>()
  const unicos = [...new Set(ids.filter(Boolean))]
  if (unicos.length === 0) return mapa
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("diretoria_instancia_assentos")
    .select("integrante_id, instancia_id, mandato_fim")
    .in("integrante_id", unicos)
  if (error || !data?.length) return mapa
  const hoje = hojeISO()
  const vigentes = data.filter((a) => !a.mandato_fim || String(a.mandato_fim) >= hoje)
  const { data: insts } = await admin
    .from("diretoria_instancias")
    .select("id, nome")
    .in("id", [...new Set(vigentes.map((a) => String(a.instancia_id)))])
  const nome = new Map((insts ?? []).map((i) => [String(i.id), texto(i.nome) ?? "Instância"]))
  for (const a of vigentes) {
    const k = String(a.integrante_id)
    const n = nome.get(String(a.instancia_id))
    if (!n) continue
    const lista = mapa.get(k) ?? []
    if (!lista.includes(n)) lista.push(n)
    mapa.set(k, lista)
  }
  return mapa
}

/**
 * Cruza um conjunto de CPFs com filiacoes e usuarios:
 * • filiado = existe em `filiacoes`;
 * • temUsuario = existe em `usuarios`;
 * • temAcesso = o usuário tem login (auth_user_id) E registro em `permissoes`.
 */
async function cruzarPessoas(
  cpfs: string[]
): Promise<Map<string, { filiado: boolean; temUsuario: boolean; temAcesso: boolean; usuarioId: string | null }>> {
  const mapa = new Map<
    string,
    { filiado: boolean; temUsuario: boolean; temAcesso: boolean; usuarioId: string | null }
  >()
  const unicos = [...new Set(cpfs.map((c) => cpfConfiavel(c)).filter((c): c is string => Boolean(c)))]
  if (unicos.length === 0) return mapa
  const admin = await createAdminClient()

  const [{ data: fis }, { data: us }] = await Promise.all([
    admin.from("filiacoes").select("cpf").in("cpf", unicos),
    admin.from("usuarios").select("id, cpf, auth_user_id").in("cpf", unicos),
  ])

  const usuariosComAuth = (us ?? []).filter((u) => u.auth_user_id)
  const permissoesPorUsuario = new Set<string>()
  if (usuariosComAuth.length > 0) {
    const { data: perms } = await admin
      .from("permissoes")
      .select("usuario_id")
      .in(
        "usuario_id",
        usuariosComAuth.map((u) => u.id)
      )
    for (const p of perms ?? []) if (p.usuario_id) permissoesPorUsuario.add(p.usuario_id as string)
  }

  for (const cpf of unicos) mapa.set(cpf, { filiado: false, temUsuario: false, temAcesso: false, usuarioId: null })
  for (const f of fis ?? []) {
    const e = mapa.get(f.cpf as string)
    if (e) e.filiado = true
  }
  for (const u of us ?? []) {
    const e = mapa.get(u.cpf as string)
    if (!e) continue
    e.temUsuario = true
    e.usuarioId ??= String(u.id)
    if (u.auth_user_id && permissoesPorUsuario.has(u.id as string)) e.temAcesso = true
  }
  return mapa
}

// ── Grupos de membros ───────────────────────────────────────────────────────

export async function listarGrupos(mandatoId: string): Promise<Grupo[]> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("diretoria_grupos")
    .select("id, nome, ordem")
    .eq("mandato_id", mandatoId)
    .order("ordem", { ascending: true })
    .order("nome", { ascending: true })
  if (error) return []
  return (data ?? []).map((g) => ({
    id: g.id as string,
    nome: texto(g.nome) ?? "(sem nome)",
    ordem: (g.ordem as number) ?? 0,
  }))
}

export async function criarGrupo(
  mandatoId: string,
  nome: string,
  ordem: number
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin.from("diretoria_grupos").insert({
    mandato_id: mandatoId,
    nome,
    ordem,
    emp_proprietaria_id: await tenantAtual(),
  })
  if (error) {
    if (esquemaAusente(error)) return { erro: AVISO_SQL }
    return { erro: `Falha ao criar grupo: ${error.message}` }
  }
  return {}
}

export async function removerGrupo(id: string): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin
    .from("diretoria_grupos")
    .delete()
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: `Falha ao remover grupo: ${error.message}` }
  return {}
}

/** Conjunto de integrantes com liberação vigente hoje (fim null = permanente). */
async function integrantesLiberadosHoje(
  integranteIds: string[]
): Promise<Set<string>> {
  const liberados = new Set<string>()
  const ids = [...new Set(integranteIds.filter(Boolean))]
  if (ids.length === 0) return liberados
  const admin = await createAdminClient()
  const hoje = hojeISO()
  const { data, error } = await admin
    .from("diretoria_liberacoes")
    .select("integrante_id, inicio, fim")
    .in("integrante_id", ids)
  if (error) return liberados // tabela ausente antes do SQL
  for (const l of data ?? []) {
    const inicio = texto(l.inicio)
    const fim = texto(l.fim)
    if ((!inicio || inicio <= hoje) && (!fim || fim >= hoje)) {
      liberados.add(l.integrante_id as string)
    }
  }
  return liberados
}

export type DadosMandato = {
  mandato: string
  data_inicio: string | null
  data_termino: string | null
}

export async function criarMandato(
  dados: DadosMandato
): Promise<{ id?: string; erro?: string }> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("diretoria_mandatos")
    .insert({ ...dados, emp_proprietaria_id: await tenantAtual() })
    .select("id")
    .single()
  if (error) return { erro: `Falha ao criar mandato: ${error.message}` }
  return { id: data.id as string }
}

export async function atualizarMandato(
  id: string,
  dados: DadosMandato
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin
    .from("diretoria_mandatos")
    .update(dados)
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: `Falha ao salvar mandato: ${error.message}` }
  return {}
}

// ── Integrantes ─────────────────────────────────────────────────────────────

export type DadosIntegrante = {
  nome: string
  cargo: string | null
  ordem: number
  pode_assinar: boolean
  grupo_id?: string | null
  /** Filiado vinculado (a pessoa). Dele derivam CPF, nome e o vínculo com usuário. */
  filiacao_id?: string | null
}

export async function adicionarIntegrante(
  mandatoId: string,
  dados: DadosIntegrante
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()

  // Se veio um filiado vinculado, ancora na pessoa: pega CPF + nome da filiacao
  // e resolve a conta de usuário (se existir) pelo mesmo CPF.
  let cpf: string | null = null
  let nome = dados.nome
  let usuario_id: string | null = null
  if (dados.filiacao_id) {
    const { data: fil } = await admin
      .from("filiacoes")
      .select("cpf, nome_completo")
      .eq("id", dados.filiacao_id)
      .maybeSingle()
    cpf = cpfConfiavel(texto(fil?.cpf))
    if (!nome) nome = texto(fil?.nome_completo) ?? ""
    if (cpf) {
      const { data: usr } = await admin
        .from("usuarios")
        .select("id")
        .eq("cpf", cpf)
        .limit(1)
        .maybeSingle()
      usuario_id = texto(usr?.id)
    }
  }
  if (!nome) return { erro: "Informe o nome ou vincule um filiado." }

  const { error } = await admin.from("diretoria_integrantes").insert({
    nome,
    cargo: dados.cargo,
    ordem: dados.ordem,
    pode_assinar: dados.pode_assinar,
    grupo_id: dados.grupo_id ?? null,
    filiacao_id: dados.filiacao_id ?? null,
    cpf,
    usuario_id,
    mandato_id: mandatoId,
    emp_proprietaria_id: await tenantAtual(),
  })
  if (error) {
    if (esquemaAusente(error)) return { erro: AVISO_SQL }
    return { erro: `Falha ao adicionar integrante: ${error.message}` }
  }
  return {}
}

export type EdicaoIntegrante = {
  nome: string
  cargo: string | null
  pode_assinar: boolean
  grupo_id: string | null
  /** Se enviado, RELIGA a pessoa: rederiva CPF/nome e o vínculo com usuário. */
  filiacao_id?: string | null
  situacao?: SituacaoIntegrante
  situacao_desde?: string | null
  situacao_motivo?: string | null
}

export async function atualizarIntegrante(
  id: string,
  dados: EdicaoIntegrante
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()

  const patch: Record<string, unknown> = {
    cargo: dados.cargo,
    pode_assinar: dados.pode_assinar,
    grupo_id: dados.grupo_id ?? null,
    updated_at: new Date().toISOString(),
  }
  if (dados.situacao) {
    patch.situacao = dados.situacao
    patch.situacao_desde = dados.situacao === "exercicio" ? null : (dados.situacao_desde ?? null)
    patch.situacao_motivo = dados.situacao === "exercicio" ? null : (dados.situacao_motivo ?? null)
  }

  // Religar filiado: rederiva CPF + nome + usuario_id pelo CPF.
  if (dados.filiacao_id) {
    const { data: fil } = await admin
      .from("filiacoes")
      .select("cpf, nome_completo")
      .eq("id", dados.filiacao_id)
      .maybeSingle()
    const cpf = cpfConfiavel(texto(fil?.cpf))
    patch.filiacao_id = dados.filiacao_id
    patch.cpf = cpf
    patch.nome = dados.nome || texto(fil?.nome_completo) || ""
    if (cpf) {
      const { data: usr } = await admin
        .from("usuarios")
        .select("id")
        .eq("cpf", cpf)
        .limit(1)
        .maybeSingle()
      patch.usuario_id = texto(usr?.id)
    } else {
      patch.usuario_id = null
    }
  } else {
    // Sem religar: mantém nome digitado (fallback) e não mexe no vínculo.
    if (dados.nome) patch.nome = dados.nome
  }

  const { error } = await admin
    .from("diretoria_integrantes")
    .update(patch)
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) {
    if (esquemaAusente(error) && dados.situacao) {
      return { erro: "A situação do membro usa colunas novas — rode supabase/diretoria-situacao.sql no Supabase." }
    }
    return { erro: `Falha ao salvar integrante: ${error.message}` }
  }
  return {}
}

export async function removerIntegrante(id: string): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin
    .from("diretoria_integrantes")
    .delete()
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: `Falha ao remover integrante: ${error.message}` }
  return {}
}

/** Integrantes aptos a assinar ofícios no mandato vigente (para o seletor). */
export async function assinantesVigentes(): Promise<
  { id: string; nome: string; cargo: string | null }[]
> {
  const mandatos = await listarMandatos()
  const atual = mandatos.find((m) => m.vigente)
  if (!atual) return []
  const admin = await createAdminClient()
  const ler = (emExercicio: boolean) => {
    const q = admin
      .from("diretoria_integrantes")
      .select("id, nome, cargo")
      .eq("mandato_id", atual.id)
      .eq("pode_assinar", true)
    // Licenciado e excluído não assinam (supabase/diretoria-situacao.sql).
    return (emExercicio ? q.eq("situacao", "exercicio") : q).order("ordem", { ascending: true })
  }
  let { data, error } = await ler(true)
  if (error) ({ data, error } = await ler(false))
  if (error) return []
  return (data ?? []).map((i) => ({
    id: i.id as string,
    nome: (texto(i.nome) ?? "") as string,
    cargo: texto(i.cargo),
  }))
}

/** Opções de integrante de um mandato (para seletores de liberação). */
export async function integrantesDoMandato(
  mandatoId: string
): Promise<{ id: string; nome: string; cargo: string | null }[]> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("diretoria_integrantes")
    .select("id, nome, cargo")
    .eq("mandato_id", mandatoId)
    .order("nome", { ascending: true })
  if (error) return []
  return (data ?? []).map((i) => ({
    id: i.id as string,
    nome: texto(i.nome) ?? "(sem nome)",
    cargo: texto(i.cargo),
  }))
}

/**
 * Empregadores (fontes pagadoras) por integrante do mandato — só os vínculos
 * ATIVOS (sem demissão) do filiado, pela âncora de CPF. É o empregador que pode
 * liberar o diretor; não faz sentido abrir todas as empresas.
 */
export async function empregadoresPorIntegrante(
  mandatoId: string
): Promise<Record<string, { id: string; nome: string }[]>> {
  const admin = await createAdminClient()
  const { data: ints } = await admin
    .from("diretoria_integrantes")
    .select("id, cpf")
    .eq("mandato_id", mandatoId)
  const integrantes = (ints ?? []).filter((i) => texto(i.cpf))
  const resultado: Record<string, { id: string; nome: string }[]> = {}
  for (const i of ints ?? []) resultado[i.id as string] = []
  if (integrantes.length === 0) return resultado

  const cpfs = [
    ...new Set(
      integrantes.map((i) => cpfConfiavel(i.cpf as string | null)).filter((c): c is string => Boolean(c))
    ),
  ]

  // CPF → filiações (uma pessoa pode ter várias) e o inverso filiacao→cpf.
  const { data: fils } = await admin
    .from("filiacoes")
    .select("id, cpf")
    .in("cpf", cpfs)
  const cpfDaFiliacao = new Map<string, string>()
  for (const f of fils ?? []) cpfDaFiliacao.set(f.id as string, f.cpf as string)
  const filiacaoIds = [...cpfDaFiliacao.keys()]
  if (filiacaoIds.length === 0) return resultado

  // Vínculos ativos → fonte pagadora, agrupados por CPF.
  const fontesPorCpf = new Map<string, Set<string>>()
  const todasFontes = new Set<string>()
  const { data: vincs } = await admin
    .from("filiacao_vinculos")
    .select("filiado_id, fonte_pagadora_id, data_saida_demissao")
    .in("filiado_id", filiacaoIds)
    .is("data_saida_demissao", null)
    .not("fonte_pagadora_id", "is", null)
  for (const v of vincs ?? []) {
    const cpf = cpfDaFiliacao.get(v.filiado_id as string)
    const fonte = texto(v.fonte_pagadora_id)
    if (!cpf || !fonte) continue
    if (!fontesPorCpf.has(cpf)) fontesPorCpf.set(cpf, new Set())
    fontesPorCpf.get(cpf)!.add(fonte)
    todasFontes.add(fonte)
  }

  const nomes = await nomesDasEmpresas([...todasFontes])
  for (const i of integrantes) {
    const cpf = i.cpf as string
    const fontes = [...(fontesPorCpf.get(cpf) ?? [])]
    resultado[i.id as string] = fontes
      .map((id) => ({ id, nome: nomes.get(id) ?? "(empresa)" }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
  }
  return resultado
}

/** Integrantes do mandato vigente (para seletores de assento em instâncias). */
export async function integrantesVigentes(): Promise<
  { id: string; nome: string; cargo: string | null }[]
> {
  const mandatos = await listarMandatos()
  const atual = mandatos.find((m) => m.vigente) ?? mandatos[0]
  if (!atual) return []
  return integrantesDoMandato(atual.id)
}

// ── Documentos (bucket privado `diretoria`) ─────────────────────────────────

const TIPOS_DOC: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
}

export async function urlDocumentoDiretoria(
  caminho: string | null
): Promise<string | null> {
  if (!caminho) return null
  if (/^(https?:)?\/\//.test(caminho)) {
    return caminho.startsWith("//") ? `https:${caminho}` : caminho
  }
  const admin = await createAdminClient()
  const { data } = await admin.storage
    .from("diretoria")
    .createSignedUrl(caminho, 3600)
  return data?.signedUrl ?? null
}

async function subirDocumento(
  prefixo: string,
  arquivo: File
): Promise<{ caminho?: string; erro?: string }> {
  const extensao = TIPOS_DOC[arquivo.type]
  if (!extensao) return { erro: "O documento deve ser PDF, JPG ou PNG." }
  if (arquivo.size > 5 * 1024 * 1024) {
    return { erro: "O documento deve ter no máximo 5 MB." }
  }
  const caminho = `${prefixo}/${Date.now()}.${extensao}`
  const admin = await createAdminClient()
  const { error } = await admin.storage
    .from("diretoria")
    .upload(caminho, arquivo, { contentType: arquivo.type })
  if (error) return { erro: `Falha ao subir o documento: ${error.message}` }
  return { caminho }
}

// ── Liberações sindicais ────────────────────────────────────────────────────

export type Liberacao = {
  id: string
  integranteId: string | null
  /** Quem foi liberado: o diretor ou o trabalhador da base. */
  pessoaNome: string | null
  /** false = trabalhador da base, liberado sem ser diretor. */
  ehDiretor: boolean
  filiacaoId: string | null
  empresaId: string | null
  empresaNome: string | null
  tipo: string | null
  inicio: string | null
  fim: string | null
  documentoUrl: string | null
  oficioId: string | null
  oficioRotulo: string | null
  loteId: string | null
  observacao: string | null
  vigente: boolean
}

async function nomesDasEmpresas(ids: string[]): Promise<Map<string, string>> {
  const mapa = new Map<string, string>()
  const unicos = [...new Set(ids.filter(Boolean))]
  if (unicos.length === 0) return mapa
  const admin = await createAdminClient()
  const { data } = await admin
    .from("empresa")
    .select("id, nome_razao, nome_fantasia")
    .in("id", unicos)
  for (const e of data ?? []) {
    const nome = texto(e.nome_fantasia) ?? texto(e.nome_razao)
    if (nome) mapa.set(e.id as string, nome)
  }
  return mapa
}

/**
 * Liberações de um mandato: as lançadas nele (mandato_id) e, das antigas, as
 * dos seus integrantes. Inclui trabalhadores da base liberados sem ser diretores.
 */
export async function listarLiberacoes(
  mandatoId: string
): Promise<{ disponivel: boolean; lote: boolean; liberacoes: Liberacao[] }> {
  const admin = await createAdminClient()
  const { data: ints } = await admin
    .from("diretoria_integrantes")
    .select("id, nome")
    .eq("mandato_id", mandatoId)
  const integrantes = ints ?? []
  const nomeIntegrante = new Map(integrantes.map((i) => [i.id as string, texto(i.nome)]))
  const idsIntegrantes = integrantes.map((i) => String(i.id))

  let lote = true
  let { data, error } = await admin
    .from("diretoria_liberacoes")
    .select("*")
    .or(
      idsIntegrantes.length
        ? `mandato_id.eq.${mandatoId},integrante_id.in.(${idsIntegrantes.join(",")})`
        : `mandato_id.eq.${mandatoId}`
    )
    .order("inicio", { ascending: false, nullsFirst: false })
  if (error && esquemaAusente(error)) {
    // Antes de diretoria-liberacoes-lote.sql não há mandato_id.
    lote = false
    if (idsIntegrantes.length === 0) return { disponivel: true, lote, liberacoes: [] }
    ;({ data, error } = await admin
      .from("diretoria_liberacoes")
      .select("*")
      .in("integrante_id", idsIntegrantes)
      .order("inicio", { ascending: false, nullsFirst: false }))
  }
  if (error) {
    if (esquemaAusente(error)) return { disponivel: false, lote: false, liberacoes: [] }
    throw new Error(`Falha ao listar liberações: ${error.message}`)
  }

  const linhas = data ?? []
  const [empresas, oficios, urls] = await Promise.all([
    nomesDasEmpresas(linhas.map((l) => l.empresa_id as string).filter(Boolean)),
    rotulosDosOficios(linhas.map((l) => texto(l.oficio_id)).filter((v): v is string => Boolean(v))),
    Promise.all(linhas.map((l) => urlDocumentoDiretoria(texto(l.documento_url)))),
  ])
  const hoje = hojeISO()

  return {
    disponivel: true,
    lote,
    liberacoes: linhas.map((l, i) => {
      const inicio = texto(l.inicio)
      const fim = texto(l.fim)
      const integranteId = texto(l.integrante_id)
      return {
        id: l.id as string,
        integranteId,
        pessoaNome: (integranteId ? nomeIntegrante.get(integranteId) : null) ?? texto(l.nome),
        ehDiretor: Boolean(integranteId),
        filiacaoId: texto(l.filiacao_id),
        empresaId: texto(l.empresa_id),
        empresaNome: l.empresa_id ? (empresas.get(l.empresa_id as string) ?? null) : null,
        tipo: texto(l.tipo),
        inicio,
        fim,
        documentoUrl: urls[i],
        oficioId: texto(l.oficio_id),
        oficioRotulo: l.oficio_id ? (oficios.get(String(l.oficio_id)) ?? "Ofício") : null,
        loteId: texto(l.lote_id),
        observacao: texto(l.observacao),
        vigente: (!inicio || inicio <= hoje) && (!fim || fim >= hoje),
      }
    }),
  }
}

/** "Ofício nº 12/2026 — Liberação de diretores" por id. */
async function rotulosDosOficios(ids: string[]): Promise<Map<string, string>> {
  const mapa = new Map<string, string>()
  const unicos = [...new Set(ids)]
  if (unicos.length === 0) return mapa
  const admin = await createAdminClient()
  const { data } = await admin.from("oficios").select("id, numero, ano, assunto").in("id", unicos)
  for (const o of data ?? []) {
    const numero = o.numero ? `nº ${o.numero}/${o.ano}` : "rascunho"
    mapa.set(String(o.id), `Ofício ${numero}${texto(o.assunto) ? ` — ${texto(o.assunto)}` : ""}`)
  }
  return mapa
}

export type DadosLiberacao = {
  integrante_id: string
  mandato_id: string | null
  empresa_id: string | null
  tipo: string
  inicio: string | null
  fim: string | null
  observacao: string | null
}

export async function adicionarLiberacao(
  dados: DadosLiberacao,
  documento?: File
): Promise<{ erro?: string }> {
  let documento_url: string | null = null
  if (documento && documento.size > 0) {
    const up = await subirDocumento(`liberacoes/${dados.integrante_id}`, documento)
    if (up.erro) return { erro: up.erro }
    documento_url = up.caminho ?? null
  }
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  let { error } = await admin.from("diretoria_liberacoes").insert({ ...dados, documento_url, emp_proprietaria_id: emp })
  if (error && esquemaAusente(error)) {
    // Sem a coluna mandato_id (SQL do lote não rodado), grava como antes.
    const { mandato_id: _m, ...semMandato } = dados
    void _m
    ;({ error } = await admin.from("diretoria_liberacoes").insert({ ...semMandato, documento_url, emp_proprietaria_id: emp }))
  }
  if (error) {
    if (esquemaAusente(error)) return { erro: AVISO_SQL }
    return { erro: `Falha ao adicionar liberação: ${error.message}` }
  }
  return {}
}

export type MembroDoLote = {
  integranteId: string | null
  filiacaoId: string | null
  inicio: string | null
  fim: string | null
}

/**
 * Várias liberações de uma vez, pelo mesmo ofício: cada pessoa com a sua data
 * de saída e de retorno. A pessoa é um diretor do mandato ou um trabalhador da
 * base (filiação) — que não precisa ser diretor.
 */
export async function adicionarLiberacoesEmLote(dados: {
  mandatoId: string
  empresaId: string | null
  oficioId: string | null
  observacao: string | null
  membros: MembroDoLote[]
}): Promise<{ erro?: string; criadas?: number }> {
  const membros = dados.membros.filter((m) => m.integranteId || m.filiacaoId)
  if (membros.length === 0) return { erro: "Adicione ao menos uma pessoa." }
  const semSaida = membros.find((m) => !m.inicio)
  if (semSaida) return { erro: "Informe a data de saída de cada pessoa." }
  const invertida = membros.find((m) => m.inicio && m.fim && m.fim < m.inicio)
  if (invertida) return { erro: "A data de retorno não pode ser anterior à de saída." }

  const admin = await createAdminClient()
  const emp = await tenantAtual()

  const idsIntegrantes = membros.map((m) => m.integranteId).filter((v): v is string => Boolean(v))
  const idsFiliacoes = membros.map((m) => m.filiacaoId).filter((v): v is string => Boolean(v))
  const [{ data: ints }, { data: fils }] = await Promise.all([
    idsIntegrantes.length
      ? admin.from("diretoria_integrantes").select("id, nome, cpf, mandato_id").eq("emp_proprietaria_id", emp).in("id", idsIntegrantes)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    idsFiliacoes.length
      ? admin.from("filiacoes").select("id, nome_completo, cpf").eq("emp_proprietaria_id", emp).in("id", idsFiliacoes)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ])
  const integrante = new Map((ints ?? []).map((i) => [String(i.id), i]))
  const filiacao = new Map((fils ?? []).map((f) => [String(f.id), f]))
  if (idsIntegrantes.some((id) => integrante.get(id)?.mandato_id !== dados.mandatoId)) {
    return { erro: "Algum diretor escolhido não é deste mandato." }
  }
  if (idsFiliacoes.some((id) => !filiacao.has(id))) return { erro: "Algum trabalhador escolhido não foi encontrado." }

  const loteId = randomUUID()
  const linhas = membros.map((m) => {
    const i = m.integranteId ? integrante.get(m.integranteId) : null
    const f = m.filiacaoId ? filiacao.get(m.filiacaoId) : null
    return {
      mandato_id: dados.mandatoId,
      integrante_id: m.integranteId,
      filiacao_id: m.integranteId ? null : m.filiacaoId,
      nome: texto(i?.nome) ?? texto(f?.nome_completo),
      cpf: cpfConfiavel(texto(i?.cpf) ?? texto(f?.cpf)),
      empresa_id: dados.empresaId,
      oficio_id: dados.oficioId,
      lote_id: loteId,
      tipo: m.fim ? "pontual" : "permanente",
      inicio: m.inicio,
      fim: m.fim,
      observacao: dados.observacao,
      emp_proprietaria_id: emp,
    }
  })
  const { error } = await admin.from("diretoria_liberacoes").insert(linhas)
  if (error) {
    if (esquemaAusente(error)) return { erro: AVISO_SQL_LOTE }
    return { erro: `Falha ao registrar as liberações: ${error.message}` }
  }
  return { criadas: linhas.length }
}

/** Liberações registradas com um ofício — para a página do ofício. */
export async function liberacoesDoOficio(
  oficioId: string
): Promise<{ id: string; pessoaNome: string | null; ehDiretor: boolean; inicio: string | null; fim: string | null; mandatoId: string | null }[]> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("diretoria_liberacoes")
    .select("id, integrante_id, nome, inicio, fim, mandato_id")
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("oficio_id", oficioId)
    .order("nome")
  if (error) return []
  const nomes = await nomesDosIntegrantes((data ?? []).map((l) => texto(l.integrante_id)).filter((v): v is string => Boolean(v)))
  return (data ?? []).map((l) => ({
    id: String(l.id),
    pessoaNome: (l.integrante_id ? nomes.get(String(l.integrante_id)) : null) ?? texto(l.nome),
    ehDiretor: Boolean(l.integrante_id),
    inicio: texto(l.inicio),
    fim: texto(l.fim),
    mandatoId: texto(l.mandato_id),
  }))
}

export async function removerLiberacao(id: string): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin
    .from("diretoria_liberacoes")
    .delete()
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: `Falha ao remover liberação: ${error.message}` }
  return {}
}

// ── Instâncias ──────────────────────────────────────────────────────────────

export type InstanciaLinha = {
  id: string
  nome: string | null
  descricao: string | null
  assentos: number
}

export async function listarInstancias(): Promise<{
  disponivel: boolean
  instancias: InstanciaLinha[]
}> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("diretoria_instancias")
    .select("id, nome, descricao")
    .eq("emp_proprietaria_id", await tenantAtual())
    .order("nome", { ascending: true })
  if (error) {
    if (esquemaAusente(error)) return { disponivel: false, instancias: [] }
    throw new Error(`Falha ao listar instâncias: ${error.message}`)
  }
  const linhas = data ?? []
  const contagem = await contarAssentos(linhas.map((i) => i.id as string))
  return {
    disponivel: true,
    instancias: linhas.map((i) => ({
      id: i.id as string,
      nome: texto(i.nome),
      descricao: texto(i.descricao),
      assentos: contagem.get(i.id as string) ?? 0,
    })),
  }
}

async function contarAssentos(ids: string[]): Promise<Map<string, number>> {
  const mapa = new Map<string, number>()
  const unicos = [...new Set(ids.filter(Boolean))]
  if (unicos.length === 0) return mapa
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("diretoria_instancia_assentos")
    .select("instancia_id")
    .in("instancia_id", unicos)
  if (error) return mapa
  for (const a of data ?? []) {
    const k = a.instancia_id as string
    mapa.set(k, (mapa.get(k) ?? 0) + 1)
  }
  return mapa
}

export type Assento = {
  id: string
  integranteId: string | null
  integranteNome: string | null
  instanciaId: string
  instanciaNome: string | null
  mandatoId: string | null
  mandatoNome: string | null
  cargo: string | null
  mandatoInicio: string | null
  mandatoFim: string | null
  documentoUrl: string | null
}

export type DetalheInstancia = {
  id: string
  nome: string | null
  descricao: string | null
  assentos: Assento[]
}

export async function obterInstancia(id: string): Promise<DetalheInstancia | null> {
  const admin = await createAdminClient()
  const { data: inst } = await admin
    .from("diretoria_instancias")
    .select("id, nome, descricao")
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (!inst) return null

  const { data: as } = await admin
    .from("diretoria_instancia_assentos")
    .select("*")
    .eq("instancia_id", id)
    .order("created_at", { ascending: true })
  const assentos = as ?? []
  const [nomes, mandatos] = await Promise.all([
    nomesDosIntegrantes(assentos.map((a) => a.integrante_id as string).filter(Boolean)),
    mandatosDosAssentos(assentos),
  ])
  const urls = await Promise.all(
    assentos.map((a) => urlDocumentoDiretoria(texto(a.documento_url)))
  )

  return {
    id: inst.id as string,
    nome: texto(inst.nome),
    descricao: texto(inst.descricao),
    assentos: assentos.map((a, i) => ({
      id: a.id as string,
      integranteId: texto(a.integrante_id),
      integranteNome: a.integrante_id ? (nomes.get(a.integrante_id as string) ?? null) : null,
      instanciaId: id,
      instanciaNome: texto(inst.nome),
      mandatoId: mandatos.idDoAssento.get(String(a.id)) ?? null,
      mandatoNome: mandatos.nomeDoAssento.get(String(a.id)) ?? null,
      cargo: texto(a.cargo),
      mandatoInicio: texto(a.mandato_inicio),
      mandatoFim: texto(a.mandato_fim),
      documentoUrl: urls[i],
    })),
  }
}

/** Mandato de cada assento: o gravado nele ou, nos antigos, o do integrante. */
async function mandatosDosAssentos(
  assentos: Record<string, unknown>[]
): Promise<{ idDoAssento: Map<string, string>; nomeDoAssento: Map<string, string> }> {
  const admin = await createAdminClient()
  const semMandato = assentos.filter((a) => !a.mandato_id && a.integrante_id).map((a) => String(a.integrante_id))
  const { data: ints } = semMandato.length
    ? await admin.from("diretoria_integrantes").select("id, mandato_id").in("id", semMandato)
    : { data: [] as Record<string, unknown>[] }
  const mandatoDoIntegrante = new Map((ints ?? []).map((i) => [String(i.id), String(i.mandato_id)]))
  const idDoAssento = new Map<string, string>()
  for (const a of assentos) {
    const m = texto(a.mandato_id) ?? (a.integrante_id ? mandatoDoIntegrante.get(String(a.integrante_id)) : undefined)
    if (m) idDoAssento.set(String(a.id), m)
  }
  const { data: ms } = idDoAssento.size
    ? await admin.from("diretoria_mandatos").select("id, mandato").in("id", [...new Set(idDoAssento.values())])
    : { data: [] as Record<string, unknown>[] }
  const nomeMandato = new Map((ms ?? []).map((m) => [String(m.id), texto(m.mandato) ?? "Mandato"]))
  const nomeDoAssento = new Map<string, string>()
  for (const [assento, mandato] of idDoAssento) nomeDoAssento.set(assento, nomeMandato.get(mandato) ?? "Mandato")
  return { idDoAssento, nomeDoAssento }
}

/** Vínculos dos diretores de um mandato às instâncias. */
export async function assentosDoMandato(mandatoId: string): Promise<Assento[]> {
  const admin = await createAdminClient()
  const { data: ints } = await admin.from("diretoria_integrantes").select("id, nome").eq("mandato_id", mandatoId)
  const ids = (ints ?? []).map((i) => String(i.id))
  if (ids.length === 0) return []
  const { data, error } = await admin
    .from("diretoria_instancia_assentos")
    .select("*")
    .in("integrante_id", ids)
    .order("created_at", { ascending: true })
  if (error) return []
  const assentos = data ?? []
  const { data: insts } = assentos.length
    ? await admin.from("diretoria_instancias").select("id, nome").in("id", [...new Set(assentos.map((a) => String(a.instancia_id)))])
    : { data: [] as Record<string, unknown>[] }
  const nomeInstancia = new Map((insts ?? []).map((i) => [String(i.id), texto(i.nome)]))
  const nomeIntegrante = new Map((ints ?? []).map((i) => [String(i.id), texto(i.nome)]))
  const urls = await Promise.all(assentos.map((a) => urlDocumentoDiretoria(texto(a.documento_url))))
  return assentos.map((a, n) => ({
    id: String(a.id),
    integranteId: texto(a.integrante_id),
    integranteNome: a.integrante_id ? (nomeIntegrante.get(String(a.integrante_id)) ?? null) : null,
    instanciaId: String(a.instancia_id),
    instanciaNome: nomeInstancia.get(String(a.instancia_id)) ?? null,
    mandatoId,
    mandatoNome: null,
    cargo: texto(a.cargo),
    mandatoInicio: texto(a.mandato_inicio),
    mandatoFim: texto(a.mandato_fim),
    documentoUrl: urls[n],
  }))
}

async function nomesDosIntegrantes(ids: string[]): Promise<Map<string, string>> {
  const mapa = new Map<string, string>()
  const unicos = [...new Set(ids.filter(Boolean))]
  if (unicos.length === 0) return mapa
  const admin = await createAdminClient()
  const { data } = await admin
    .from("diretoria_integrantes")
    .select("id, nome")
    .in("id", unicos)
  for (const i of data ?? []) {
    const n = texto(i.nome)
    if (n) mapa.set(i.id as string, n)
  }
  return mapa
}

export async function criarInstancia(dados: {
  nome: string
  descricao: string | null
}): Promise<{ id?: string; erro?: string }> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("diretoria_instancias")
    .insert({ ...dados, emp_proprietaria_id: await tenantAtual() })
    .select("id")
    .single()
  if (error) {
    if (esquemaAusente(error)) return { erro: AVISO_SQL }
    return { erro: `Falha ao criar instância: ${error.message}` }
  }
  return { id: data.id as string }
}

export async function atualizarInstancia(
  id: string,
  dados: { nome: string; descricao: string | null }
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin
    .from("diretoria_instancias")
    .update({ ...dados, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: `Falha ao salvar instância: ${error.message}` }
  return {}
}

export type DadosAssento = {
  mandato_id?: string | null
  integrante_id: string | null
  cargo: string | null
  mandato_inicio: string | null
  mandato_fim: string | null
}

export async function adicionarAssento(
  instanciaId: string,
  dados: DadosAssento,
  documento?: File
): Promise<{ erro?: string }> {
  let documento_url: string | null = null
  if (documento && documento.size > 0) {
    const up = await subirDocumento(`assentos/${instanciaId}`, documento)
    if (up.erro) return { erro: up.erro }
    documento_url = up.caminho ?? null
  }
  const admin = await createAdminClient()
  const linha = { ...dados, instancia_id: instanciaId, documento_url, emp_proprietaria_id: await tenantAtual() }
  let { error } = await admin.from("diretoria_instancia_assentos").insert(linha)
  if (error && esquemaAusente(error)) {
    const { mandato_id: _m, ...semMandato } = linha
    void _m
    ;({ error } = await admin.from("diretoria_instancia_assentos").insert(semMandato))
  }
  if (error) return { erro: `Falha ao adicionar assento: ${error.message}` }
  return {}
}

export async function removerAssento(id: string): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin
    .from("diretoria_instancia_assentos")
    .delete()
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: `Falha ao remover assento: ${error.message}` }
  return {}
}

// ── Ficha do diretor (diretoria_ficha, 1:1 com o integrante) ─────────────────

export type CabecalhoIntegrante = {
  id: string
  mandatoId: string
  mandatoNome: string | null
  nome: string | null
  cargo: string | null
  cpf: string | null
  ehFiliado: boolean
  temUsuario: boolean
  /** Cadastro em `usuarios` (pode existir sem conta de login). */
  usuarioId: string | null
}

export async function obterIntegrante(
  integranteId: string
): Promise<CabecalhoIntegrante | null> {
  const admin = await createAdminClient()
  const { data: i } = await admin
    .from("diretoria_integrantes")
    .select("id, mandato_id, nome, cargo, cpf, filiacao_id, usuario_id")
    .eq("id", integranteId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (!i) return null
  const { data: m } = await admin
    .from("diretoria_mandatos")
    .select("mandato")
    .eq("id", i.mandato_id)
    .maybeSingle()
  // "Acesso ao painel" é ter conta de login, não só um cadastro de usuário.
  const { data: u } = i.usuario_id
    ? await admin.from("usuarios").select("auth_user_id").eq("id", i.usuario_id).maybeSingle()
    : { data: null }
  return {
    id: i.id as string,
    mandatoId: i.mandato_id as string,
    mandatoNome: texto(m?.mandato),
    nome: texto(i.nome),
    cargo: texto(i.cargo),
    cpf: texto(i.cpf),
    ehFiliado: Boolean(i.filiacao_id),
    temUsuario: Boolean(u?.auth_user_id),
    usuarioId: texto(i.usuario_id),
  }
}

// Tipo, leitura e gravação da ficha moram em diretoria-ficha.ts (dados da
// filiação refletidos). Reexportados aqui para quem já importava deste módulo.
export {
  obterFichaDiretor,
  salvarFichaDiretor,
  type FichaDiretor,
} from "@/lib/db/diretoria-ficha"

/** Liberações sindicais de UM integrante (reusa o shape de listarLiberacoes). */
export async function liberacoesDoIntegrante(
  integranteId: string
): Promise<Liberacao[]> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("diretoria_liberacoes")
    .select("*")
    .eq("integrante_id", integranteId)
    .order("inicio", { ascending: false, nullsFirst: false })
  if (error) return []
  const linhas = data ?? []
  const [empresas, oficios, urls] = await Promise.all([
    nomesDasEmpresas(linhas.map((l) => l.empresa_id as string).filter(Boolean)),
    rotulosDosOficios(linhas.map((l) => texto(l.oficio_id)).filter((v): v is string => Boolean(v))),
    Promise.all(linhas.map((l) => urlDocumentoDiretoria(texto(l.documento_url)))),
  ])
  const hoje = hojeISO()
  return linhas.map((l, i) => {
    const inicio = texto(l.inicio)
    const fim = texto(l.fim)
    return {
      id: l.id as string,
      integranteId: l.integrante_id as string,
      pessoaNome: texto(l.nome),
      ehDiretor: true,
      filiacaoId: texto(l.filiacao_id),
      empresaId: texto(l.empresa_id),
      empresaNome: l.empresa_id
        ? (empresas.get(l.empresa_id as string) ?? null)
        : null,
      tipo: texto(l.tipo),
      inicio,
      fim,
      documentoUrl: urls[i],
      oficioId: texto(l.oficio_id),
      oficioRotulo: l.oficio_id ? (oficios.get(String(l.oficio_id)) ?? "Ofício") : null,
      loteId: texto(l.lote_id),
      observacao: texto(l.observacao),
      vigente: (!inicio || inicio <= hoje) && (!fim || fim >= hoje),
    }
  })
}
