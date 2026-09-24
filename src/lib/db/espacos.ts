import "server-only"

import { esquemaAusente, texto } from "@/lib/db/comum"
import {
  faltaNoRecinto,
  horaCompleta,
  janelasSobrepostas,
  motivoInelegivel,
  slugDoNome,
  type Janela,
  type ModoJanela,
  type MotivoBloqueio,
  type PublicoAlvo,
  type VisitaTecnica,
} from "@/lib/espacos-constantes"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"
import { VINCULOS_DO_QUADRO } from "@/lib/vinculos-instituicao"

/**
 * Cessão de espaços — fase 1: o cadastro do que se cede.
 *
 * Um ESPAÇO agrupa um ou mais AMBIENTES (`patrimonio_recinto`), tem lotação
 * própria, regras de cessão, janelas de agenda e bloqueios. Ver
 * supabase/cessao-espacos.sql.
 */

export const AVISO_SQL_ESPACOS =
  "Cessão de espaços ainda não configurada — rode supabase/cessao-espacos.sql no SQL Editor do Supabase."

// ── Ambientes elegíveis ──────────────────────────────────────────────────────

export type RecintoOpcao = {
  id: string
  nome: string
  sede: string | null
  descricao: string | null
  /** Vazio = pode ser usado. Senão, o que falta no cadastro do ambiente. */
  falta: string[]
  motivo: string
  responsavelId: string | null
  responsavelNome: string | null
}

/**
 * Todos os ambientes do tenant, elegíveis ou não. Os inelegíveis vêm junto de
 * propósito: a tela mostra apagado com o motivo, em vez de esconder — quem
 * procura o Teatro e não o acha abre um chamado.
 */
export async function listarRecintosParaEspaco(): Promise<RecintoOpcao[]> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data, error } = await admin
    .from("patrimonio_recinto")
    .select("id, nome_recinto, sede, descricao_fisica")
    .eq("emp_proprietaria_id", emp)
    .order("nome_recinto", { ascending: true })
  if (error) {
    if (esquemaAusente(error)) return []
    throw new Error(`Falha ao listar os ambientes: ${error.message}`)
  }

  const ids = (data ?? []).map((r) => String(r.id))
  const responsaveis = await responsaveisDosRecintos(ids)

  return (data ?? []).map((r) => {
    const item = {
      nome: texto(r.nome_recinto),
      sede: texto(r.sede),
      descricao: texto(r.descricao_fisica),
    }
    const falta = faltaNoRecinto(item)
    const resp = responsaveis.get(String(r.id))
    return {
      id: String(r.id),
      nome: item.nome ?? "(sem nome)",
      sede: item.sede,
      descricao: item.descricao,
      falta,
      motivo: motivoInelegivel(falta),
      responsavelId: resp?.id ?? null,
      responsavelNome: resp?.nome ?? null,
    }
  })
}

/** Responsável ATUAL de cada ambiente — a sugestão para a visita técnica. */
async function responsaveisDosRecintos(
  ids: string[]
): Promise<Map<string, { id: string; nome: string | null }>> {
  const mapa = new Map<string, { id: string; nome: string | null }>()
  if (ids.length === 0) return mapa
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("patrimonio_recinto_responsavel")
    .select("recinto_id, funcionario_id")
    .in("recinto_id", ids)
    .eq("atual", true)
  if (error) return mapa

  const funcionarios = [
    ...new Set((data ?? []).map((r) => String(r.funcionario_id)).filter(Boolean)),
  ]
  if (funcionarios.length === 0) return mapa
  const { data: pessoas } = await admin
    .from("usuarios")
    .select("id, nome_completo, nome_guerra")
    .in("id", funcionarios)
  const nomes = new Map(
    (pessoas ?? []).map((p) => [
      String(p.id),
      texto(p.nome_completo) ?? texto(p.nome_guerra),
    ])
  )
  for (const r of data ?? []) {
    const fid = String(r.funcionario_id)
    mapa.set(String(r.recinto_id), { id: fid, nome: nomes.get(fid) ?? null })
  }
  return mapa
}

/** Funcionários e diretores do tenant — quem pode responder pela visita. */
export async function listarResponsaveisPossiveis(): Promise<
  { id: string; nome: string; vinculo: string }[]
> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("usuarios")
    .select("id, nome_completo, nome_guerra, vinculo_instituicao")
    .eq("emp_proprietaria_id", await tenantAtual())
    .in("vinculo_instituicao", [...VINCULOS_DO_QUADRO])
    .not("inativo", "is", true)
    .not("deletado", "is", true)
    .order("nome_completo", { ascending: true })
  if (error) return []
  return (data ?? []).map((u) => ({
    id: String(u.id),
    nome: texto(u.nome_completo) ?? texto(u.nome_guerra) ?? "(sem nome)",
    vinculo: String(u.vinculo_instituicao ?? ""),
  }))
}

export async function listarSedes(): Promise<{ id: string; nome: string }[]> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("empresa_sede")
    .select("id, nome")
    .eq("emp_proprietaria_id", await tenantAtual())
    .order("nome", { ascending: true })
  if (error) return []
  return (data ?? []).map((s) => ({
    id: String(s.id),
    nome: texto(s.nome) ?? "(sem nome)",
  }))
}

// ── Espaços ──────────────────────────────────────────────────────────────────

export type EspacoLinha = {
  id: string
  nome: string
  slug: string | null
  sedeNome: string | null
  capacidade: number | null
  visita: VisitaTecnica
  publico: PublicoAlvo
  ativo: boolean
  ambientes: number
  janelas: number
  bloqueiosAtivos: number
}

export type EspacoDetalhe = {
  id: string
  nome: string
  slug: string | null
  descricao: string | null
  sedeId: string | null
  sedeNome: string | null
  capacidade: number | null
  visita: VisitaTecnica
  exigeTermo: boolean
  exigeAutorizacao: boolean
  publico: PublicoAlvo
  agendaPublica: boolean
  responsavelVisitaId: string | null
  responsavelVisitaNome: string | null
  ativo: boolean
  created_at: string | null
  recintoIds: string[]
  recintoPrincipalId: string | null
}

export type DadosEspaco = {
  nome: string
  descricao: string | null
  sedeId: string | null
  capacidade: number | null
  visita: VisitaTecnica
  exigeTermo: boolean
  exigeAutorizacao: boolean
  publico: PublicoAlvo
  agendaPublica: boolean
  responsavelVisitaId: string | null
  ativo: boolean
  recintoIds: string[]
  recintoPrincipalId: string | null
}

export async function listarEspacos(): Promise<{
  linhas: EspacoLinha[]
  esquemaPronto: boolean
}> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data, error } = await admin
    .from("cessao_espacos")
    .select(
      "id, nome, slug, sede_id, capacidade_pessoas, visita_tecnica, publico_alvo, ativo"
    )
    .eq("emp_proprietaria_id", emp)
    .order("ativo", { ascending: false })
    .order("nome", { ascending: true })
  if (error) {
    if (esquemaAusente(error)) return { linhas: [], esquemaPronto: false }
    throw new Error(`Falha ao listar os espaços: ${error.message}`)
  }

  const ids = (data ?? []).map((e) => String(e.id))
  const [sedes, ambientes, janelas, bloqueios] = await Promise.all([
    listarSedes(),
    contarPorEspaco("cessao_espaco_recintos", ids),
    contarPorEspaco("cessao_espaco_janelas", ids),
    contarBloqueiosAtivos(ids),
  ])
  const nomeSede = new Map(sedes.map((s) => [s.id, s.nome]))

  return {
    esquemaPronto: true,
    linhas: (data ?? []).map((e) => ({
      id: String(e.id),
      nome: texto(e.nome) ?? "(sem nome)",
      slug: texto(e.slug),
      sedeNome: e.sede_id ? (nomeSede.get(String(e.sede_id)) ?? null) : null,
      capacidade: (e.capacidade_pessoas as number | null) ?? null,
      visita: (e.visita_tecnica as VisitaTecnica) ?? "facultativa",
      publico: (e.publico_alvo as PublicoAlvo) ?? "qualquer",
      ativo: e.ativo !== false,
      ambientes: ambientes.get(String(e.id)) ?? 0,
      janelas: janelas.get(String(e.id)) ?? 0,
      bloqueiosAtivos: bloqueios.get(String(e.id)) ?? 0,
    })),
  }
}

async function contarPorEspaco(
  tabela: string,
  ids: string[]
): Promise<Map<string, number>> {
  const contagem = new Map<string, number>()
  if (ids.length === 0) return contagem
  const admin = await createAdminClient()
  const { data } = await admin.from(tabela).select("espaco_id").in("espaco_id", ids)
  for (const linha of (data ?? []) as unknown as Record<string, unknown>[]) {
    const id = String(linha.espaco_id)
    contagem.set(id, (contagem.get(id) ?? 0) + 1)
  }
  return contagem
}

async function contarBloqueiosAtivos(ids: string[]): Promise<Map<string, number>> {
  const contagem = new Map<string, number>()
  if (ids.length === 0) return contagem
  const admin = await createAdminClient()
  const agora = new Date().toISOString()
  const { data } = await admin
    .from("cessao_espaco_bloqueios")
    .select("espaco_id, termino")
    .in("espaco_id", ids)
    .is("encerrado_em", null)
    .or(`termino.is.null,termino.gte.${agora}`)
  for (const b of (data ?? []) as unknown as Record<string, unknown>[]) {
    const id = String(b.espaco_id)
    contagem.set(id, (contagem.get(id) ?? 0) + 1)
  }
  return contagem
}

export async function obterEspaco(id: string): Promise<EspacoDetalhe | null> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("cessao_espacos")
    .select("*")
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (error || !data) return null

  const [sedes, responsaveis, vinculos] = await Promise.all([
    listarSedes(),
    listarResponsaveisPossiveis(),
    admin
      .from("cessao_espaco_recintos")
      .select("recinto_id, principal")
      .eq("espaco_id", id),
  ])
  const linhas = (vinculos.data ?? []) as unknown as Record<string, unknown>[]

  return {
    id: String(data.id),
    nome: texto(data.nome) ?? "(sem nome)",
    slug: texto(data.slug),
    descricao: texto(data.descricao),
    sedeId: data.sede_id ? String(data.sede_id) : null,
    sedeNome: data.sede_id
      ? (sedes.find((s) => s.id === String(data.sede_id))?.nome ?? null)
      : null,
    capacidade: (data.capacidade_pessoas as number | null) ?? null,
    visita: (data.visita_tecnica as VisitaTecnica) ?? "facultativa",
    exigeTermo: data.exige_termo !== false,
    exigeAutorizacao: data.exige_autorizacao !== false,
    publico: (data.publico_alvo as PublicoAlvo) ?? "qualquer",
    agendaPublica: data.agenda_publica !== false,
    responsavelVisitaId: data.responsavel_visita_id
      ? String(data.responsavel_visita_id)
      : null,
    responsavelVisitaNome: data.responsavel_visita_id
      ? (responsaveis.find((r) => r.id === String(data.responsavel_visita_id))?.nome ??
        null)
      : null,
    ativo: data.ativo !== false,
    created_at: texto(data.created_at),
    recintoIds: linhas.map((v) => String(v.recinto_id)),
    recintoPrincipalId:
      linhas.find((v) => v.principal === true)?.recinto_id != null
        ? String(linhas.find((v) => v.principal === true)!.recinto_id)
        : null,
  }
}

/**
 * Recusa o que a tela também recusa. O ambiente inelegível é barrado AQUI
 * também porque o formulário pode ser burlado — e porque a régua tem de ser a
 * mesma nos dois lados.
 */
async function validarEspaco(
  dados: DadosEspaco,
  espacoId: string | null
): Promise<string | null> {
  if (!dados.nome.trim()) return "Informe o nome do espaço."
  if (!dados.sedeId) return "Escolha a sede."
  if (dados.capacidade !== null && dados.capacidade <= 0) {
    return "A lotação tem de ser maior que zero."
  }
  if (dados.recintoIds.length > 0) {
    const ambientes = await listarRecintosParaEspaco()
    const porId = new Map(ambientes.map((a) => [a.id, a]))
    for (const id of dados.recintoIds) {
      const a = porId.get(id)
      if (!a) return "Um dos ambientes escolhidos não existe."
      if (a.falta.length > 0) {
        return `O ambiente "${a.nome}" ainda não pode ser usado: ${a.motivo}. Complete o cadastro dele em Patrimônio › Recintos.`
      }
    }
    if (
      dados.recintoPrincipalId &&
      !dados.recintoIds.includes(dados.recintoPrincipalId)
    ) {
      return "O ambiente principal precisa estar entre os escolhidos."
    }
  }

  // Nome repetido no tenant confunde na hora de escolher o espaço.
  const admin = await createAdminClient()
  let q = admin
    .from("cessao_espacos")
    .select("id")
    .eq("emp_proprietaria_id", await tenantAtual())
    .ilike("nome", dados.nome.trim())
  if (espacoId) q = q.neq("id", espacoId)
  const { data: iguais } = await q.limit(1)
  if ((iguais ?? []).length > 0) return "Já existe um espaço com esse nome."
  return null
}

/** Slug único no tenant: "area-gourmet", "area-gourmet-2", … */
async function slugLivre(nome: string, espacoId: string | null): Promise<string> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const base = slugDoNome(nome) || "espaco"
  for (let n = 1; n < 50; n++) {
    const tentativa = n === 1 ? base : `${base}-${n}`
    let q = admin
      .from("cessao_espacos")
      .select("id")
      .eq("emp_proprietaria_id", emp)
      .eq("slug", tentativa)
    if (espacoId) q = q.neq("id", espacoId)
    const { data } = await q.limit(1)
    if ((data ?? []).length === 0) return tentativa
  }
  return `${base}-${Date.now()}`
}

function colunasDoEspaco(dados: DadosEspaco): Record<string, unknown> {
  return {
    nome: dados.nome.trim(),
    descricao: dados.descricao?.trim() || null,
    sede_id: dados.sedeId,
    capacidade_pessoas: dados.capacidade,
    visita_tecnica: dados.visita,
    exige_termo: dados.exigeTermo,
    exige_autorizacao: dados.exigeAutorizacao,
    publico_alvo: dados.publico,
    agenda_publica: dados.agendaPublica,
    responsavel_visita_id: dados.responsavelVisitaId,
    ativo: dados.ativo,
  }
}

export async function criarEspaco(
  dados: DadosEspaco,
  usuarioId: string
): Promise<{ id?: string; erro?: string }> {
  const erro = await validarEspaco(dados, null)
  if (erro) return { erro }

  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("cessao_espacos")
    .insert({
      ...colunasDoEspaco(dados),
      slug: await slugLivre(dados.nome, null),
      criado_por_id: usuarioId,
      emp_proprietaria_id: await tenantAtual(),
    })
    .select("id")
    .single()
  if (error) {
    if (esquemaAusente(error)) return { erro: AVISO_SQL_ESPACOS }
    return { erro: `Não foi possível cadastrar o espaço: ${error.message}` }
  }

  const id = String(data.id)
  const falha = await gravarAmbientes(id, dados)
  return falha ? { id, erro: falha } : { id }
}

export async function atualizarEspaco(
  id: string,
  dados: DadosEspaco
): Promise<{ erro?: string }> {
  const erro = await validarEspaco(dados, id)
  if (erro) return { erro }

  const admin = await createAdminClient()
  const { error } = await admin
    .from("cessao_espacos")
    .update({ ...colunasDoEspaco(dados), updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) {
    if (esquemaAusente(error)) return { erro: AVISO_SQL_ESPACOS }
    return { erro: `Não foi possível salvar o espaço: ${error.message}` }
  }
  const falha = await gravarAmbientes(id, dados)
  return falha ? { erro: falha } : {}
}

/** Substitui a lista de ambientes do espaço (apaga e regrava). */
async function gravarAmbientes(
  espacoId: string,
  dados: DadosEspaco
): Promise<string | null> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  await admin.from("cessao_espaco_recintos").delete().eq("espaco_id", espacoId)
  if (dados.recintoIds.length === 0) return null
  const { error } = await admin.from("cessao_espaco_recintos").insert(
    dados.recintoIds.map((recintoId) => ({
      espaco_id: espacoId,
      recinto_id: recintoId,
      principal: recintoId === dados.recintoPrincipalId,
      emp_proprietaria_id: emp,
    }))
  )
  return error ? `Espaço salvo, mas os ambientes não: ${error.message}` : null
}

/**
 * Espaços que compartilham ambiente com este — na fase 2, ceder um bloqueia os
 * outros. Aqui serve para o cadastro avisar quem vai ser afetado.
 */
export async function espacosQueCompartilhamAmbiente(
  espacoId: string
): Promise<{ id: string; nome: string; ambientes: string[] }[]> {
  const admin = await createAdminClient()
  const { data: meus } = await admin
    .from("cessao_espaco_recintos")
    .select("recinto_id")
    .eq("espaco_id", espacoId)
  const ids = [
    ...new Set(
      ((meus ?? []) as unknown as Record<string, unknown>[]).map((r) =>
        String(r.recinto_id)
      )
    ),
  ]
  if (ids.length === 0) return []

  const { data: outros } = await admin
    .from("cessao_espaco_recintos")
    .select("espaco_id, recinto_id")
    .in("recinto_id", ids)
    .neq("espaco_id", espacoId)
  const linhas = (outros ?? []) as unknown as Record<string, unknown>[]
  if (linhas.length === 0) return []

  const porEspaco = new Map<string, Set<string>>()
  for (const l of linhas) {
    const eid = String(l.espaco_id)
    if (!porEspaco.has(eid)) porEspaco.set(eid, new Set())
    porEspaco.get(eid)!.add(String(l.recinto_id))
  }
  const { data: espacos } = await admin
    .from("cessao_espacos")
    .select("id, nome")
    .in("id", [...porEspaco.keys()])
  const ambientes = await listarRecintosParaEspaco()
  const nomeAmbiente = new Map(ambientes.map((a) => [a.id, a.nome]))

  return (espacos ?? []).map((e) => ({
    id: String(e.id),
    nome: texto(e.nome) ?? "(sem nome)",
    ambientes: [...(porEspaco.get(String(e.id)) ?? [])].map(
      (r) => nomeAmbiente.get(r) ?? "(ambiente)"
    ),
  }))
}

// ── Janelas ──────────────────────────────────────────────────────────────────

export type JanelaLinha = Janela & { id: string }

export async function listarJanelas(espacoId: string): Promise<JanelaLinha[]> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("cessao_espaco_janelas")
    .select("id, dia_semana, hora_inicio, hora_termino, modo, slot_minutos, rotulo")
    .eq("espaco_id", espacoId)
    .order("dia_semana", { ascending: true })
    .order("hora_inicio", { ascending: true })
  if (error) return []
  return (data ?? []).map((j) => ({
    id: String(j.id),
    dia_semana: Number(j.dia_semana),
    hora_inicio: String(j.hora_inicio ?? ""),
    hora_termino: String(j.hora_termino ?? ""),
    modo: (j.modo as ModoJanela) ?? "livre",
    slot_minutos: (j.slot_minutos as number | null) ?? null,
    rotulo: texto(j.rotulo),
  }))
}

export type DadosJanela = {
  dias: number[]
  horaInicio: string
  horaTermino: string
  modo: ModoJanela
  slotMinutos: number | null
  rotulo: string | null
}

/** Uma linha por dia marcado — o formulário deixa marcar vários de uma vez. */
export async function criarJanelas(
  espacoId: string,
  dados: DadosJanela
): Promise<{ erro?: string; criadas?: number }> {
  const inicio = horaCompleta(dados.horaInicio)
  const termino = horaCompleta(dados.horaTermino)
  if (!inicio || !termino) return { erro: "Informe o horário de início e de término." }
  if (inicio >= termino) return { erro: "O término tem de ser depois do início." }
  if (dados.dias.length === 0) return { erro: "Escolha ao menos um dia da semana." }
  if (dados.modo === "slots" && (!dados.slotMinutos || dados.slotMinutos <= 0)) {
    return { erro: "Informe a duração do bloco, em minutos." }
  }

  const existentes = await listarJanelas(espacoId)
  for (const dia of dados.dias) {
    const nova: Janela = {
      dia_semana: dia,
      hora_inicio: inicio,
      hora_termino: termino,
      modo: dados.modo,
      slot_minutos: dados.slotMinutos,
      rotulo: dados.rotulo,
    }
    const choque = existentes.find((j) => janelasSobrepostas(j, nova))
    if (choque) {
      return {
        erro: `Já existe uma faixa nesse dia que se sobrepõe (${choque.hora_inicio.slice(0, 5)} às ${choque.hora_termino.slice(0, 5)}).`,
      }
    }
  }

  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { error } = await admin.from("cessao_espaco_janelas").insert(
    dados.dias.map((dia) => ({
      espaco_id: espacoId,
      dia_semana: dia,
      hora_inicio: inicio,
      hora_termino: termino,
      modo: dados.modo,
      slot_minutos: dados.modo === "slots" ? dados.slotMinutos : null,
      rotulo: dados.rotulo?.trim() || null,
      emp_proprietaria_id: emp,
    }))
  )
  if (error) {
    if (esquemaAusente(error)) return { erro: AVISO_SQL_ESPACOS }
    return { erro: `Não foi possível salvar a faixa: ${error.message}` }
  }
  return { criadas: dados.dias.length }
}

export async function excluirJanela(id: string): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin
    .from("cessao_espaco_janelas")
    .delete()
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  return error ? { erro: `Não foi possível excluir: ${error.message}` } : {}
}

// ── Bloqueios ────────────────────────────────────────────────────────────────

export type BloqueioLinha = {
  id: string
  inicio: string | null
  termino: string | null
  motivo: MotivoBloqueio
  descricao: string | null
  encerrado_em: string | null
  vigente: boolean
  indefinido: boolean
}

export async function listarBloqueios(espacoId: string): Promise<BloqueioLinha[]> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("cessao_espaco_bloqueios")
    .select("id, inicio, termino, motivo, descricao, encerrado_em")
    .eq("espaco_id", espacoId)
    .order("inicio", { ascending: false, nullsFirst: false })
  if (error) return []
  const agora = Date.now()
  return (data ?? []).map((b) => {
    const inicio = texto(b.inicio)
    const termino = texto(b.termino)
    const encerrado = texto(b.encerrado_em)
    const comecou = !inicio || new Date(inicio).getTime() <= agora
    const acabou = termino ? new Date(termino).getTime() < agora : false
    return {
      id: String(b.id),
      inicio,
      termino,
      motivo: (b.motivo as MotivoBloqueio) ?? "manutencao",
      descricao: texto(b.descricao),
      encerrado_em: encerrado,
      vigente: !encerrado && comecou && !acabou,
      indefinido: !termino && !encerrado,
    }
  })
}

export type DadosBloqueio = {
  inicio: string
  /** Vazio = prazo indefinido, encerrado à mão. */
  termino: string | null
  motivo: MotivoBloqueio
  descricao: string | null
}

export async function criarBloqueio(
  espacoId: string,
  dados: DadosBloqueio,
  usuarioId: string
): Promise<{ erro?: string }> {
  if (!dados.inicio) return { erro: "Informe quando o bloqueio começa." }
  if (dados.termino && dados.termino <= dados.inicio) {
    return { erro: "O término tem de ser depois do início." }
  }
  const admin = await createAdminClient()
  const { error } = await admin.from("cessao_espaco_bloqueios").insert({
    espaco_id: espacoId,
    inicio: dados.inicio,
    termino: dados.termino,
    motivo: dados.motivo,
    descricao: dados.descricao?.trim() || null,
    criado_por_id: usuarioId,
    emp_proprietaria_id: await tenantAtual(),
  })
  if (error) {
    if (esquemaAusente(error)) return { erro: AVISO_SQL_ESPACOS }
    return { erro: `Não foi possível bloquear: ${error.message}` }
  }
  return {}
}

/** Encerra o bloqueio (o caminho do "prazo indefinido"). */
export async function encerrarBloqueio(
  id: string,
  usuarioId: string
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin
    .from("cessao_espaco_bloqueios")
    .update({
      encerrado_em: new Date().toISOString(),
      encerrado_por_id: usuarioId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  return error ? { erro: `Não foi possível encerrar: ${error.message}` } : {}
}

export async function excluirBloqueio(id: string): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin
    .from("cessao_espaco_bloqueios")
    .delete()
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  return error ? { erro: `Não foi possível excluir: ${error.message}` } : {}
}
