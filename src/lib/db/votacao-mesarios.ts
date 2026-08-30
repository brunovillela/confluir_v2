import "server-only"

import { randomBytes, randomInt } from "node:crypto"

import {
  derivarModalidade,
  hojeLocalISO,
  temUrna,
  type Modalidade,
} from "@/lib/assembleias-constantes"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { tenantAtual } from "@/lib/tenant"

import { perguntasDaAssembleia, type PerguntaVoto } from "./votacao-portal"

// ─────────────────────────────────────────────────────────────────────────────
// Votação presencial com mesários (2026-08-29).
//
// O mesário registra a PRESENÇA do eleitor — nunca o voto. Em urna física, a
// presença encerra a participação (voto no papel, resultado agregado). Em urna
// digital, a presença LIBERA a cédula num terminal de votação separado e
// pareado, onde o próprio eleitor vota (secreto). Quem operou e em qual urna
// ficam no registro de presença (voto_assembleias_aptos) — que identifica o
// eleitor mas não o voto. O voto (voto_online) é anônimo: sem eleitor_id, sem
// mesario_id; só a urna (agregada). Assim o sigilo vale até no banco.
// ─────────────────────────────────────────────────────────────────────────────

function txt(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null
}

/** now() dentro da janela [abertura, fechamento] (nulos = ponta aberta). */
function janelaAberta(
  abertura: string | null,
  fechamento: string | null
): boolean {
  const agora = Date.now()
  if (abertura && new Date(abertura).getTime() > agora) return false
  if (fechamento && new Date(fechamento).getTime() < agora) return false
  return true
}

export type MesarioLinha = {
  id: string
  rodadaId: string | null
  nome: string | null
  cpf: string | null
  email: string | null
  ativo: boolean
}

export type UrnaLinha = {
  id: string
  assembleiaId: string
  nome: string | null
  tipo: "fisica" | "digital"
  abertura: string | null
  fechamento: string | null
  ativa: boolean
  aberta: boolean
  totalAptos: number
  compareceram: number
}

// ── Painel: dados de urnas + mesários de uma assembleia ─────────────────────

export type UrnaComLacres = UrnaLinha & {
  lacres: LacreLinha[]
  apuradorId: string | null
}

export type ApuradorBasico = {
  id: string
  nome: string | null
  cpf: string | null
  email: string | null
  ativo: boolean
}

export type DadosUrnasAssembleia = {
  assembleiaId: string
  nome: string | null
  modalidade: Modalidade
  rodadaId: string | null
  urnas: UrnaComLacres[]
  mesarios: MesarioLinha[]
  apuradores: ApuradorBasico[]
}

async function contarPresenca(
  emp: string,
  assembleiaId: string
): Promise<{ total: number; porUrna: Map<string, number> }> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("voto_assembleias_aptos")
    .select("presenca_urna_id, hora_voto")
    .eq("emp_proprietaria_id", emp)
    .eq("assembleia_id", assembleiaId)
  const porUrna = new Map<string, number>()
  for (const a of data ?? []) {
    const u = txt(a.presenca_urna_id)
    if (u) porUrna.set(u, (porUrna.get(u) ?? 0) + 1)
  }
  return { total: (data ?? []).length, porUrna }
}

export async function dadosUrnasAssembleia(
  assembleiaId: string
): Promise<DadosUrnasAssembleia | null> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data: a } = await admin
    .from("voto_assembleias")
    .select("id, nome_assembleia, online, urnas_de_votacao, rod_assembleia_id")
    .eq("id", assembleiaId)
    .eq("emp_proprietaria_id", emp)
    .maybeSingle()
  if (!a) return null
  const modalidade = derivarModalidade(a)
  const rodadaId = txt(a.rod_assembleia_id)

  const [{ data: urnas }, { data: mesarios }, { data: apuradores }, presenca] =
    await Promise.all([
      admin
        .from("voto_urnas")
        .select("id, nome, tipo, abertura, fechamento, ativa, apurador_id")
        .eq("emp_proprietaria_id", emp)
        .eq("assembleia_id", assembleiaId)
        .order("created_at", { ascending: true }),
      rodadaId
        ? admin
            .from("voto_mesarios")
            .select("id, rod_assembleia_id, nome_completo, cpf, email, ativo")
            .eq("emp_proprietaria_id", emp)
            .eq("rod_assembleia_id", rodadaId)
            .order("nome_completo", { ascending: true })
        : Promise.resolve({ data: [] }),
      rodadaId
        ? admin
            .from("voto_apuradores")
            .select("id, nome_completo, cpf, email, ativo")
            .eq("emp_proprietaria_id", emp)
            .eq("rod_assembleia_id", rodadaId)
            .order("nome_completo", { ascending: true })
        : Promise.resolve({ data: [] }),
      contarPresenca(emp, assembleiaId),
    ])

  // Lacres de todas as urnas desta assembleia (uma consulta, agrupada por urna).
  const urnaIds = (urnas ?? []).map((u) => String(u.id))
  const lacresPorUrna = new Map<string, LacreLinha[]>()
  if (urnaIds.length) {
    const { data: lacres } = await admin
      .from("voto_urna_lacres")
      .select("id, urna_id, tipo, numero, evento, data, guardado_na_urna, observacao")
      .eq("emp_proprietaria_id", emp)
      .in("urna_id", urnaIds)
      .order("data", { ascending: false })
    for (const l of lacres ?? []) {
      const arr = lacresPorUrna.get(String(l.urna_id)) ?? []
      arr.push({
        id: String(l.id),
        tipo: l.tipo === "principal" ? "principal" : "boca",
        numero: txt(l.numero),
        evento: l.evento === "rompido" ? "rompido" : "instalado",
        data: txt(l.data),
        guardadoNaUrna: l.guardado_na_urna === true,
        observacao: txt(l.observacao),
      })
      lacresPorUrna.set(String(l.urna_id), arr)
    }
  }

  const totalAptos = presenca.total
  return {
    assembleiaId,
    nome: txt(a.nome_assembleia),
    modalidade,
    rodadaId,
    urnas: (urnas ?? []).map((u) => {
      const abertura = txt(u.abertura)
      const fechamento = txt(u.fechamento)
      return {
        id: String(u.id),
        assembleiaId,
        nome: txt(u.nome),
        tipo: u.tipo === "fisica" ? "fisica" : "digital",
        abertura,
        fechamento,
        ativa: u.ativa !== false,
        aberta: u.ativa !== false && janelaAberta(abertura, fechamento),
        totalAptos,
        compareceram: presenca.porUrna.get(String(u.id)) ?? 0,
        lacres: lacresPorUrna.get(String(u.id)) ?? [],
        apuradorId: txt(u.apurador_id),
      }
    }),
    mesarios: (mesarios ?? []).map((m) => ({
      id: String(m.id),
      rodadaId: txt(m.rod_assembleia_id),
      nome: txt(m.nome_completo),
      cpf: txt(m.cpf),
      email: txt(m.email),
      ativo: m.ativo !== false,
    })),
    apuradores: (apuradores ?? []).map((m) => ({
      id: String(m.id),
      nome: txt(m.nome_completo),
      cpf: txt(m.cpf),
      email: txt(m.email),
      ativo: m.ativo !== false,
    })),
  }
}

// ── Painel: CRUD de urnas ───────────────────────────────────────────────────

export async function criarUrna(
  assembleiaId: string,
  dados: {
    nome: string
    tipo: "fisica" | "digital"
    abertura: string | null
    fechamento: string | null
  }
): Promise<{ erro?: string; ok?: boolean }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data: a } = await admin
    .from("voto_assembleias")
    .select("id, online, urnas_de_votacao, rod_assembleia_id")
    .eq("id", assembleiaId)
    .eq("emp_proprietaria_id", emp)
    .maybeSingle()
  if (!a) return { erro: "Assembleia não encontrada." }
  if (!temUrna(derivarModalidade(a))) {
    return { erro: "Esta assembleia não usa urnas presenciais." }
  }
  const { error } = await admin.from("voto_urnas").insert({
    emp_proprietaria_id: emp,
    assembleia_id: assembleiaId,
    rod_assembleia_id: a.rod_assembleia_id,
    nome: dados.nome,
    tipo: dados.tipo,
    abertura: dados.abertura,
    fechamento: dados.fechamento,
    ativa: true,
  })
  if (error) return { erro: `Não foi possível criar a urna: ${error.message}` }
  return { ok: true }
}

export async function atualizarUrna(
  urnaId: string,
  dados: {
    nome: string
    tipo: "fisica" | "digital"
    abertura: string | null
    fechamento: string | null
    ativa: boolean
  }
): Promise<{ erro?: string; ok?: boolean }> {
  const admin = await createAdminClient()
  const { error } = await admin
    .from("voto_urnas")
    .update({
      nome: dados.nome,
      tipo: dados.tipo,
      abertura: dados.abertura,
      fechamento: dados.fechamento,
      ativa: dados.ativa,
      updated_at: new Date().toISOString(),
    })
    .eq("id", urnaId)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: `Não foi possível salvar: ${error.message}` }
  return { ok: true }
}

export async function removerUrna(
  urnaId: string
): Promise<{ erro?: string; ok?: boolean }> {
  const admin = await createAdminClient()
  const { error } = await admin
    .from("voto_urnas")
    .delete()
    .eq("id", urnaId)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: `Não foi possível excluir: ${error.message}` }
  return { ok: true }
}

// ── Painel: CRUD de mesários (por rodada) ───────────────────────────────────

export async function criarMesario(
  rodadaId: string,
  dados: { nome: string; cpf: string | null; email: string }
): Promise<{ erro?: string; ok?: boolean }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { error } = await admin.from("voto_mesarios").insert({
    emp_proprietaria_id: emp,
    rod_assembleia_id: rodadaId,
    nome_completo: dados.nome,
    cpf: dados.cpf,
    email: dados.email.toLowerCase(),
    ativo: true,
  })
  if (error) return { erro: `Não foi possível cadastrar: ${error.message}` }
  return { ok: true }
}

export async function atualizarMesario(
  mesarioId: string,
  dados: { nome: string; cpf: string | null; email: string; ativo: boolean }
): Promise<{ erro?: string; ok?: boolean }> {
  const admin = await createAdminClient()
  const { error } = await admin
    .from("voto_mesarios")
    .update({
      nome_completo: dados.nome,
      cpf: dados.cpf,
      email: dados.email.toLowerCase(),
      ativo: dados.ativo,
      updated_at: new Date().toISOString(),
    })
    .eq("id", mesarioId)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: `Não foi possível salvar: ${error.message}` }
  return { ok: true }
}

export async function removerMesario(
  mesarioId: string
): Promise<{ erro?: string; ok?: boolean }> {
  const admin = await createAdminClient()
  const { error } = await admin
    .from("voto_mesarios")
    .delete()
    .eq("id", mesarioId)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: `Não foi possível excluir: ${error.message}` }
  return { ok: true }
}

// ── Ambiente do mesário (/mesario) ──────────────────────────────────────────

/** E-mail autenticado (OTP Supabase) da sessão atual, ou null. */
async function emailSessao(): Promise<string | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user?.email ? user.email.toLowerCase() : null
}

/** Mesários ativos cujo e-mail bate com a sessão, no tenant atual. */
export async function mesariosDaSessao(): Promise<MesarioLinha[]> {
  const email = await emailSessao()
  if (!email) return []
  const admin = await createAdminClient()
  const { data } = await admin
    .from("voto_mesarios")
    .select("id, rod_assembleia_id, nome_completo, cpf, email, ativo")
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("ativo", true)
    .ilike("email", email)
  return (data ?? []).map((m) => ({
    id: String(m.id),
    rodadaId: txt(m.rod_assembleia_id),
    nome: txt(m.nome_completo),
    cpf: txt(m.cpf),
    email: txt(m.email),
    ativo: true,
  }))
}

/** Existe um mesário ativo com este e-mail no tenant? (gate do login OTP). */
export async function emailEhMesario(email: string): Promise<boolean> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("voto_mesarios")
    .select("id")
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("ativo", true)
    .ilike("email", email.trim().toLowerCase())
    .limit(1)
  return (data ?? []).length > 0
}

export type UrnaDoMesario = UrnaLinha & {
  assembleiaNome: string | null
  terminalPareado: boolean
}

/** Urnas que o mesário logado pode operar (das rodadas em que é mesário). */
export async function urnasDoMesario(): Promise<{
  email: string | null
  urnas: UrnaDoMesario[]
}> {
  const email = await emailSessao()
  const mesarios = await mesariosDaSessao()
  if (mesarios.length === 0) return { email, urnas: [] }
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const rodadas = [...new Set(mesarios.map((m) => m.rodadaId).filter(Boolean))]

  // Assembleias com urnas dessas rodadas.
  const { data: urnasRaw } = await admin
    .from("voto_urnas")
    .select(
      "id, assembleia_id, nome, tipo, abertura, fechamento, ativa, rod_assembleia_id"
    )
    .eq("emp_proprietaria_id", emp)
    .in("rod_assembleia_id", rodadas as string[])
    .order("created_at", { ascending: true })
  const urnas = urnasRaw ?? []
  const assembleiaIds = [
    ...new Set(urnas.map((u) => String(u.assembleia_id))),
  ]

  const [{ data: assembleias }, { data: aptos }, { data: terminais }] =
    await Promise.all([
      assembleiaIds.length
        ? admin
            .from("voto_assembleias")
            .select("id, nome_assembleia")
            .in("id", assembleiaIds)
        : Promise.resolve({ data: [] }),
      assembleiaIds.length
        ? admin
            .from("voto_assembleias_aptos")
            .select("assembleia_id, presenca_urna_id")
            .eq("emp_proprietaria_id", emp)
            .in("assembleia_id", assembleiaIds)
        : Promise.resolve({ data: [] }),
      admin
        .from("voto_urna_terminais")
        .select("urna_id")
        .eq("emp_proprietaria_id", emp)
        .eq("pareada", true)
        .eq("encerrada", false),
    ])

  const nomePorAssembleia = new Map(
    (assembleias ?? []).map((a) => [String(a.id), txt(a.nome_assembleia)])
  )
  const totalPorAssembleia = new Map<string, number>()
  const presencaPorUrna = new Map<string, number>()
  for (const a of aptos ?? []) {
    const ass = String(a.assembleia_id)
    totalPorAssembleia.set(ass, (totalPorAssembleia.get(ass) ?? 0) + 1)
    const u = txt(a.presenca_urna_id)
    if (u) presencaPorUrna.set(u, (presencaPorUrna.get(u) ?? 0) + 1)
  }
  const pareadas = new Set(
    (terminais ?? []).map((t) => txt(t.urna_id)).filter(Boolean) as string[]
  )

  return {
    email,
    urnas: urnas.map((u) => {
      const abertura = txt(u.abertura)
      const fechamento = txt(u.fechamento)
      const assembleiaId = String(u.assembleia_id)
      return {
        id: String(u.id),
        assembleiaId,
        assembleiaNome: nomePorAssembleia.get(assembleiaId) ?? null,
        nome: txt(u.nome),
        tipo: u.tipo === "fisica" ? "fisica" : "digital",
        abertura,
        fechamento,
        ativa: u.ativa !== false,
        aberta: u.ativa !== false && janelaAberta(abertura, fechamento),
        totalAptos: totalPorAssembleia.get(assembleiaId) ?? 0,
        compareceram: presencaPorUrna.get(String(u.id)) ?? 0,
        terminalPareado: pareadas.has(String(u.id)),
      }
    }),
  }
}

/** Carrega uma urna garantindo que o mesário logado pode operá-la. */
async function urnaAutorizada(urnaId: string): Promise<{
  emp: string
  urna: {
    id: string
    assembleiaId: string
    nome: string | null
    tipo: "fisica" | "digital"
    abertura: string | null
    fechamento: string | null
    ativa: boolean
    aberta: boolean
  }
} | null> {
  const mesarios = await mesariosDaSessao()
  if (mesarios.length === 0) return null
  const rodadas = new Set(mesarios.map((m) => m.rodadaId).filter(Boolean))
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data: u } = await admin
    .from("voto_urnas")
    .select(
      "id, assembleia_id, rod_assembleia_id, nome, tipo, abertura, fechamento, ativa"
    )
    .eq("id", urnaId)
    .eq("emp_proprietaria_id", emp)
    .maybeSingle()
  if (!u) return null
  if (!rodadas.has(txt(u.rod_assembleia_id))) return null
  const abertura = txt(u.abertura)
  const fechamento = txt(u.fechamento)
  return {
    emp,
    urna: {
      id: String(u.id),
      assembleiaId: String(u.assembleia_id),
      nome: txt(u.nome),
      tipo: u.tipo === "fisica" ? "fisica" : "digital",
      abertura,
      fechamento,
      ativa: u.ativa !== false,
      aberta: u.ativa !== false && janelaAberta(abertura, fechamento),
    },
  }
}

export type AptoUrna = {
  id: string
  nome: string | null
  cpf: string | null
  matricula: string | null
  compareceu: boolean
}

export type OperacaoUrna = {
  urnaId: string
  nome: string | null
  tipo: "fisica" | "digital"
  aberta: boolean
  abertura: string | null
  fechamento: string | null
  assembleiaId: string
  assembleiaNome: string | null
  totalAptos: number
  compareceram: number
  terminalPareado: boolean
  estadoDia: EstadoDiaUrna
  eventos: EventoLinha[]
  aptos: AptoUrna[]
}

/** Tela de operação de uma urna pelo mesário (busca de eleitores + status). */
export async function operacaoUrna(
  urnaId: string,
  busca = ""
): Promise<OperacaoUrna | null> {
  const auth = await urnaAutorizada(urnaId)
  if (!auth) return null
  const { emp, urna } = auth
  const admin = await createAdminClient()
  const estadoDia = await estadoDiaUrna(urnaId)
  const eventos = await listarEventos(urnaId)

  let q = admin
    .from("voto_assembleias_aptos")
    .select("id, nome_completo, cpf, matricula, hora_voto, presenca_em")
    .eq("emp_proprietaria_id", emp)
    .eq("assembleia_id", urna.assembleiaId)
    .order("nome_completo", { ascending: true })
    .limit(50)
  const termo = busca.trim()
  if (termo) {
    const escapado = termo.replace(/[%_,()]/g, " ")
    q = q.or(
      `nome_completo.ilike.%${escapado}%,cpf.ilike.%${escapado}%,matricula.ilike.%${escapado}%`
    )
  }

  const [{ data: aptos }, { data: todos }, { data: term }, assembleiaNome] =
    await Promise.all([
      q,
      admin
        .from("voto_assembleias_aptos")
        .select("hora_voto, presenca_em")
        .eq("emp_proprietaria_id", emp)
        .eq("assembleia_id", urna.assembleiaId),
      admin
        .from("voto_urna_terminais")
        .select("id")
        .eq("emp_proprietaria_id", emp)
        .eq("urna_id", urnaId)
        .eq("pareada", true)
        .eq("encerrada", false)
        .limit(1),
      admin
        .from("voto_assembleias")
        .select("nome_assembleia")
        .eq("id", urna.assembleiaId)
        .maybeSingle()
        .then((r) => txt(r.data?.nome_assembleia)),
    ])

  const listaTodos = todos ?? []
  return {
    urnaId,
    nome: urna.nome,
    tipo: urna.tipo,
    aberta: urna.aberta,
    abertura: urna.abertura,
    fechamento: urna.fechamento,
    assembleiaId: urna.assembleiaId,
    assembleiaNome,
    totalAptos: listaTodos.length,
    compareceram: listaTodos.filter((a) => a.presenca_em || a.hora_voto).length,
    terminalPareado: (term ?? []).length > 0,
    estadoDia,
    eventos,
    aptos: (aptos ?? []).map((a) => ({
      id: String(a.id),
      nome: txt(a.nome_completo),
      cpf: txt(a.cpf),
      matricula: txt(a.matricula),
      compareceu: Boolean(a.presenca_em || a.hora_voto),
    })),
  }
}

/** O mesário pareia um terminal de votação (pelo código exibido nele). */
export async function parearTerminalMesario(
  urnaId: string,
  codigo: string
): Promise<{ erro?: string; ok?: boolean }> {
  const auth = await urnaAutorizada(urnaId)
  if (!auth) return { erro: "Urna não autorizada." }
  const { emp, urna } = auth
  if (urna.tipo !== "digital") {
    return { erro: "Só urnas digitais usam terminal de votação." }
  }
  if (!urna.aberta) return { erro: "A urna está fora do horário de votação." }
  const admin = await createAdminClient()
  const cod = codigo.trim().toUpperCase()
  const { data: term } = await admin
    .from("voto_urna_terminais")
    .select("id, pareada, urna_id")
    .eq("emp_proprietaria_id", emp)
    .eq("codigo", cod)
    .eq("encerrada", false)
    .maybeSingle()
  if (!term) return { erro: "Código não encontrado. Confira o terminal." }
  if (term.pareada && txt(term.urna_id) !== urnaId) {
    return { erro: "Este terminal já está pareado a outra urna." }
  }
  const { error } = await admin
    .from("voto_urna_terminais")
    .update({
      urna_id: urnaId,
      pareada: true,
      atualizado_em: new Date().toISOString(),
    })
    .eq("id", term.id)
    .eq("emp_proprietaria_id", emp)
  if (error) return { erro: `Não foi possível parear: ${error.message}` }
  return { ok: true }
}

// ── Eventos/atas e ritual de abertura da urna ───────────────────────────────
// A urna fica FECHADA (mesmo no horário) até a Abertura do dia, feita com o 1º
// eleitor que atesta o rompimento do lacre da boca. Eventos: instalacao (1ª),
// abertura (2ª+), fechamento (fim de dia, exceto o último), encerramento
// (último). Cada um vira uma ata.

export type EventoTipo =
  | "instalacao"
  | "abertura"
  | "fechamento"
  | "encerramento"
  | "anomalia"

export type EstadoDiaUrna = {
  jaInstalada: boolean
  encerrada: boolean
  abertaHoje: boolean
  ultimoTipo: EventoTipo | null
  ultimoData: string | null
}

/** Data local (YYYY-MM-DD) de um timestamptz. */
function diaLocal(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export async function estadoDiaUrna(urnaId: string): Promise<EstadoDiaUrna> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("voto_urna_eventos")
    .select("tipo, data")
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("urna_id", urnaId)
    .neq("tipo", "anomalia")
    .order("data", { ascending: false })
  const eventos = data ?? []
  const jaInstalada = eventos.some((e) => e.tipo === "instalacao")
  const encerrada = eventos.some((e) => e.tipo === "encerramento")
  const ultimo = eventos[0]
  const ultimoTipo = (ultimo?.tipo as EventoTipo | undefined) ?? null
  const abertaHoje =
    !encerrada &&
    (ultimoTipo === "instalacao" || ultimoTipo === "abertura") &&
    diaLocal(txt(ultimo?.data)) === hojeLocalISO()
  return {
    jaInstalada,
    encerrada,
    abertaHoje,
    ultimoTipo,
    ultimoData: txt(ultimo?.data),
  }
}

/** Abertura do dia com o 1º eleitor (instalação na 1ª vez, abertura depois). */
export async function abrirUrnaDia(
  urnaId: string,
  dados: {
    primeiroEleitorNome: string
    atestaLacreRompido: boolean
    lacreBocaNumero: string | null
    descricao: string | null
  }
): Promise<{ erro?: string; ok?: boolean }> {
  const auth = await urnaAutorizada(urnaId)
  if (!auth) return { erro: "Urna não autorizada." }
  const { emp, urna } = auth
  if (!urna.aberta) return { erro: "A urna está fora do horário de votação." }
  const estado = await estadoDiaUrna(urnaId)
  if (estado.encerrada) return { erro: "Esta urna já foi encerrada." }
  if (estado.abertaHoje) return { erro: "A urna já foi aberta hoje." }
  if (!dados.primeiroEleitorNome.trim()) {
    return { erro: "Informe o nome do primeiro eleitor." }
  }
  if (!dados.atestaLacreRompido) {
    return { erro: "O eleitor precisa atestar o rompimento do lacre da boca." }
  }
  const admin = await createAdminClient()
  const mesarios = await mesariosDaSessao()
  const mesarioId =
    mesarios.find((m) => m.rodadaId)?.id ?? mesarios[0]?.id ?? null
  const agora = new Date().toISOString()
  const tipo: EventoTipo = estado.jaInstalada ? "abertura" : "instalacao"

  const { error } = await admin.from("voto_urna_eventos").insert({
    emp_proprietaria_id: emp,
    urna_id: urnaId,
    tipo,
    data: agora,
    mesario_id: mesarioId,
    primeiro_eleitor_nome: dados.primeiroEleitorNome.trim(),
    atesta_lacre_rompido: dados.atestaLacreRompido,
    lacre_boca_numero: dados.lacreBocaNumero,
    descricao: dados.descricao,
  })
  if (error) return { erro: `Não foi possível abrir: ${error.message}` }

  // Registra o rompimento do lacre da boca (guardado dentro da urna).
  if (dados.lacreBocaNumero) {
    await admin.from("voto_urna_lacres").insert({
      emp_proprietaria_id: emp,
      urna_id: urnaId,
      tipo: "boca",
      numero: dados.lacreBocaNumero,
      evento: "rompido",
      data: agora,
      guardado_na_urna: true,
      observacao: "Rompido na abertura do dia, guardado dentro da urna.",
    })
  }
  return { ok: true }
}

/** Fechamento do dia (ou encerramento, quando é o último). */
export async function fecharUrnaDia(
  urnaId: string,
  dados: { encerrar: boolean; lacreBocaNumero: string | null; descricao: string | null }
): Promise<{ erro?: string; ok?: boolean }> {
  const auth = await urnaAutorizada(urnaId)
  if (!auth) return { erro: "Urna não autorizada." }
  const { emp } = auth
  const estado = await estadoDiaUrna(urnaId)
  if (estado.encerrada) return { erro: "Esta urna já foi encerrada." }
  if (!estado.abertaHoje) return { erro: "A urna não está aberta." }
  const admin = await createAdminClient()
  const mesarios = await mesariosDaSessao()
  const mesarioId =
    mesarios.find((m) => m.rodadaId)?.id ?? mesarios[0]?.id ?? null
  const agora = new Date().toISOString()
  const tipo: EventoTipo = dados.encerrar ? "encerramento" : "fechamento"

  const { error } = await admin.from("voto_urna_eventos").insert({
    emp_proprietaria_id: emp,
    urna_id: urnaId,
    tipo,
    data: agora,
    mesario_id: mesarioId,
    lacre_boca_numero: dados.lacreBocaNumero,
    descricao: dados.descricao,
  })
  if (error) return { erro: `Não foi possível fechar: ${error.message}` }

  // No fechamento normal, instala-se o lacre da boca (rompido no dia seguinte).
  if (!dados.encerrar && dados.lacreBocaNumero) {
    await admin.from("voto_urna_lacres").insert({
      emp_proprietaria_id: emp,
      urna_id: urnaId,
      tipo: "boca",
      numero: dados.lacreBocaNumero,
      evento: "instalado",
      data: agora,
      guardado_na_urna: false,
      observacao: "Lacre da boca instalado no fechamento do dia.",
    })
  }
  return { ok: true }
}

/** Registro livre de anomalia (ex.: lacre rompido acidental). */
export async function registrarAnomalia(
  urnaId: string,
  descricao: string
): Promise<{ erro?: string; ok?: boolean }> {
  const auth = await urnaAutorizada(urnaId)
  if (!auth) return { erro: "Urna não autorizada." }
  if (!descricao.trim()) return { erro: "Descreva a anomalia." }
  const admin = await createAdminClient()
  const mesarios = await mesariosDaSessao()
  const mesarioId =
    mesarios.find((m) => m.rodadaId)?.id ?? mesarios[0]?.id ?? null
  const { error } = await admin.from("voto_urna_eventos").insert({
    emp_proprietaria_id: auth.emp,
    urna_id: urnaId,
    tipo: "anomalia",
    data: new Date().toISOString(),
    mesario_id: mesarioId,
    descricao: descricao.trim(),
  })
  if (error) return { erro: `Não foi possível registrar: ${error.message}` }
  return { ok: true }
}

export type EventoLinha = {
  id: string
  tipo: EventoTipo
  data: string | null
  primeiroEleitor: string | null
  atestaLacre: boolean | null
  lacreBoca: string | null
  descricao: string | null
}

export type DadosAta = {
  organizacao: string | null
  tipo: EventoTipo
  data: string | null
  urna: string | null
  assembleia: string | null
  campanha: string | null
  primeiroEleitor: string | null
  atestaLacre: boolean | null
  lacreBoca: string | null
  descricao: string | null
}

/** Dados de uma ata (evento) — verifica que a urna é do mesário logado. */
export async function dadosAta(
  urnaId: string,
  eventoId: string
): Promise<DadosAta | null> {
  const auth = await urnaAutorizada(urnaId)
  if (!auth) return null
  const { emp, urna } = auth
  const admin = await createAdminClient()
  const { data: ev } = await admin
    .from("voto_urna_eventos")
    .select(
      "id, tipo, data, primeiro_eleitor_nome, atesta_lacre_rompido, lacre_boca_numero, descricao"
    )
    .eq("id", eventoId)
    .eq("emp_proprietaria_id", emp)
    .eq("urna_id", urnaId)
    .maybeSingle()
  if (!ev) return null

  const { data: a } = await admin
    .from("voto_assembleias")
    .select("nome_assembleia, campanha_id")
    .eq("id", urna.assembleiaId)
    .maybeSingle()
  const [{ data: camp }, org] = await Promise.all([
    txt(a?.campanha_id)
      ? admin.from("voto_campanha").select("tema").eq("id", a?.campanha_id).maybeSingle()
      : Promise.resolve({ data: null }),
    (async () => {
      const { obterOrganizacao } = await import("@/lib/db/organizacao")
      return obterOrganizacao()
    })(),
  ])

  return {
    organizacao: org?.nomeFantasia ?? org?.nomeRazao ?? null,
    tipo: (ev.tipo as EventoTipo) ?? "abertura",
    data: txt(ev.data),
    urna: urna.nome,
    assembleia: txt(a?.nome_assembleia),
    campanha: txt(camp?.tema),
    primeiroEleitor: txt(ev.primeiro_eleitor_nome),
    atestaLacre:
      typeof ev.atesta_lacre_rompido === "boolean" ? ev.atesta_lacre_rompido : null,
    lacreBoca: txt(ev.lacre_boca_numero),
    descricao: txt(ev.descricao),
  }
}

export async function listarEventos(urnaId: string): Promise<EventoLinha[]> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("voto_urna_eventos")
    .select(
      "id, tipo, data, primeiro_eleitor_nome, atesta_lacre_rompido, lacre_boca_numero, descricao"
    )
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("urna_id", urnaId)
    .order("data", { ascending: false })
  return (data ?? []).map((e) => ({
    id: String(e.id),
    tipo: (e.tipo as EventoTipo) ?? "abertura",
    data: txt(e.data),
    primeiroEleitor: txt(e.primeiro_eleitor_nome),
    atestaLacre: typeof e.atesta_lacre_rompido === "boolean" ? e.atesta_lacre_rompido : null,
    lacreBoca: txt(e.lacre_boca_numero),
    descricao: txt(e.descricao),
  }))
}

/**
 * O mesário registra a PRESENÇA do eleitor.
 * - urna física: encerra a participação (voto em papel; hora_voto = agora).
 * - urna digital: libera a cédula no terminal pareado (o eleitor vota lá).
 */
export async function registrarPresenca(
  urnaId: string,
  aptoId: string
): Promise<{ erro?: string; ok?: boolean; liberado?: boolean }> {
  const auth = await urnaAutorizada(urnaId)
  if (!auth) return { erro: "Urna não autorizada." }
  const { emp, urna } = auth
  if (!urna.aberta) return { erro: "A urna está fora do horário de votação." }
  // A urna FÍSICA precisa da Abertura do dia (ritual com o 1º eleitor); a
  // digital não tem lacre físico, então opera direto dentro do horário.
  if (urna.tipo === "fisica" && !(await estadoDiaUrna(urnaId)).abertaHoje) {
    return {
      erro: "Faça a Abertura do dia com o primeiro eleitor antes de registrar presenças.",
    }
  }
  const admin = await createAdminClient()

  const mesarios = await mesariosDaSessao()
  const mesarioId =
    mesarios.find((m) => m.rodadaId)?.id ?? mesarios[0]?.id ?? null

  const { data: apto } = await admin
    .from("voto_assembleias_aptos")
    .select("id, cpf, hora_voto, presenca_em")
    .eq("id", aptoId)
    .eq("emp_proprietaria_id", emp)
    .eq("assembleia_id", urna.assembleiaId)
    .maybeSingle()
  if (!apto) return { erro: "Eleitor não está na lista de aptos desta urna." }
  if (apto.hora_voto) return { erro: "Este eleitor já votou." }

  const agora = new Date().toISOString()

  if (urna.tipo === "digital") {
    // Precisa de um terminal pareado para liberar a cédula.
    const { data: term } = await admin
      .from("voto_urna_terminais")
      .select("id, apto_liberado_id")
      .eq("emp_proprietaria_id", emp)
      .eq("urna_id", urnaId)
      .eq("pareada", true)
      .eq("encerrada", false)
      .limit(1)
      .maybeSingle()
    if (!term) {
      return {
        erro: "Pareie um terminal de votação antes de liberar a cédula.",
      }
    }
    if (txt(term.apto_liberado_id) && txt(term.apto_liberado_id) !== aptoId) {
      return {
        erro: "O terminal ainda está com outra cédula liberada. Aguarde o voto.",
      }
    }
    // Marca a presença (sem hora_voto — o voto acontece no terminal).
    await admin
      .from("voto_assembleias_aptos")
      .update({
        presenca_em: apto.presenca_em ?? agora,
        presenca_mesario_id: mesarioId,
        presenca_urna_id: urnaId,
      })
      .eq("id", aptoId)
      .eq("emp_proprietaria_id", emp)
    const { error } = await admin
      .from("voto_urna_terminais")
      .update({ apto_liberado_id: aptoId, liberado_em: agora })
      .eq("id", term.id)
      .eq("emp_proprietaria_id", emp)
    if (error) return { erro: `Não foi possível liberar: ${error.message}` }
    return { ok: true, liberado: true }
  }

  // Urna física: a presença encerra a participação (voto no papel).
  const { error } = await admin
    .from("voto_assembleias_aptos")
    .update({
      presenca_em: agora,
      presenca_mesario_id: mesarioId,
      presenca_urna_id: urnaId,
      hora_voto: agora,
    })
    .eq("id", aptoId)
    .eq("emp_proprietaria_id", emp)
  if (error) return { erro: `Não foi possível registrar: ${error.message}` }
  await lancarProntuario(emp, apto.cpf ? String(apto.cpf) : null, urna.assembleiaId)
  return { ok: true, liberado: false }
}

async function lancarProntuario(
  emp: string,
  cpf: string | null,
  assembleiaId: string
): Promise<void> {
  if (!cpf) return
  const admin = await createAdminClient()
  const { buscarFiliadoPorCpf } = await import("@/lib/contas")
  const filiado = await buscarFiliadoPorCpf(cpf)
  if (!filiado?.filiacaoId) return
  const { data: a } = await admin
    .from("voto_assembleias")
    .select("nome_assembleia")
    .eq("id", assembleiaId)
    .maybeSingle()
  const nomeAss = txt(a?.nome_assembleia) ? ` "${txt(a?.nome_assembleia)}"` : ""
  const agora = new Date().toISOString()
  await admin.from("filiacao_prontuario").insert({
    filiacao_id: filiado.filiacaoId,
    data: agora,
    tipo: "Assembleia",
    descricao: `Participou da votação presencial da assembleia${nomeAss}.`,
    diretor_funcionario_id: null,
    emp_proprietaria_id: emp,
    created_at: agora,
    modified_at: agora,
  })
}

// ── Terminal de votação (urna digital, sem login; identidade = sessao_token) ─

export type EstadoTerminal = {
  status: "novo" | "aguardando" | "pareado" | "votando" | "encerrado"
  codigo: string | null
  urnaNome: string | null
  assembleiaId: string | null
  aptoNome: string | null
  /** A cédula liberada é de um eleitor em separado (fora da lista de aptos). */
  emSeparado: boolean
  perguntas: PerguntaVoto[]
}

/** Registra um novo terminal e devolve o código + o token de sessão (cookie). */
export async function registrarTerminal(): Promise<{
  codigo: string
  sessaoToken: string
}> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  // Código de 6 caracteres legível (sem 0/O/1/I).
  const alfabeto = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  let codigo = ""
  for (let i = 0; i < 6; i++) codigo += alfabeto[randomInt(alfabeto.length)]
  const sessaoToken = randomBytes(24).toString("hex")
  await admin.from("voto_urna_terminais").insert({
    emp_proprietaria_id: emp,
    codigo,
    sessao_token: sessaoToken,
    pareada: false,
    encerrada: false,
  })
  return { codigo, sessaoToken }
}

/** Estado atual do terminal (para polling). */
export async function estadoTerminal(
  sessaoToken: string
): Promise<EstadoTerminal | null> {
  if (!sessaoToken) return null
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data: term } = await admin
    .from("voto_urna_terminais")
    .select(
      "id, codigo, urna_id, pareada, apto_liberado_id, em_separado_liberado_id, encerrada"
    )
    .eq("emp_proprietaria_id", emp)
    .eq("sessao_token", sessaoToken)
    .maybeSingle()
  if (!term) return null
  if (term.encerrada) {
    return {
      status: "encerrado",
      codigo: txt(term.codigo),
      urnaNome: null,
      assembleiaId: null,
      aptoNome: null,
      emSeparado: false,
      perguntas: [],
    }
  }
  if (!term.pareada || !txt(term.urna_id)) {
    return {
      status: "aguardando",
      codigo: txt(term.codigo),
      urnaNome: null,
      assembleiaId: null,
      aptoNome: null,
      emSeparado: false,
      perguntas: [],
    }
  }

  const { data: urna } = await admin
    .from("voto_urnas")
    .select("id, nome, assembleia_id, ativa, abertura, fechamento")
    .eq("id", term.urna_id)
    .maybeSingle()
  const urnaNome = txt(urna?.nome)
  const assembleiaId = txt(urna?.assembleia_id)
  const aptoId = txt(term.apto_liberado_id)
  const emSepId = txt(term.em_separado_liberado_id)

  const pareado = (): EstadoTerminal => ({
    status: "pareado",
    codigo: txt(term.codigo),
    urnaNome,
    assembleiaId,
    aptoNome: null,
    emSeparado: false,
    perguntas: [],
  })

  if (!aptoId && !emSepId) return pareado()

  // Cédula liberada para um eleitor EM SEPARADO (fora da lista de aptos).
  if (emSepId) {
    const [{ data: reg }, perguntas] = await Promise.all([
      admin
        .from("voto_em_separado")
        .select("nome_completo, votou_em")
        .eq("id", emSepId)
        .maybeSingle(),
      assembleiaId ? perguntasDaAssembleia(assembleiaId) : Promise.resolve([]),
    ])
    if (!reg || reg.votou_em) return pareado()
    return {
      status: "votando",
      codigo: txt(term.codigo),
      urnaNome,
      assembleiaId,
      aptoNome: txt(reg.nome_completo),
      emSeparado: true,
      perguntas,
    }
  }

  const [{ data: apto }, perguntas] = await Promise.all([
    admin
      .from("voto_assembleias_aptos")
      .select("nome_completo, hora_voto")
      .eq("id", aptoId as string)
      .maybeSingle(),
    assembleiaId ? perguntasDaAssembleia(assembleiaId) : Promise.resolve([]),
  ])
  // Se o apto já votou (corrida), volta a "pareado".
  if (apto?.hora_voto) return pareado()
  return {
    status: "votando",
    codigo: txt(term.codigo),
    urnaNome,
    assembleiaId,
    aptoNome: txt(apto?.nome_completo),
    emSeparado: false,
    perguntas,
  }
}

/**
 * O eleitor confirma o voto no terminal. Voto ANÔNIMO em voto_online (sem
 * eleitor_id, sem mesario_id; carrega só urna_id agregada), marca a
 * participação no apto e limpa a liberação do terminal.
 */
export async function registrarVotoTerminal(
  sessaoToken: string,
  escolhas: { perguntaId: string; opcaoId: string }[]
): Promise<{ erro?: string; ok?: boolean }> {
  if (!sessaoToken) return { erro: "Terminal não identificado." }
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data: term } = await admin
    .from("voto_urna_terminais")
    .select(
      "id, urna_id, pareada, apto_liberado_id, em_separado_liberado_id, encerrada"
    )
    .eq("emp_proprietaria_id", emp)
    .eq("sessao_token", sessaoToken)
    .maybeSingle()
  if (!term || term.encerrada) return { erro: "Terminal encerrado." }
  if (!term.pareada || !txt(term.urna_id)) {
    return { erro: "Terminal não pareado." }
  }
  const aptoId = txt(term.apto_liberado_id)
  const emSepId = txt(term.em_separado_liberado_id)
  if (!aptoId && !emSepId) {
    return { erro: "Nenhuma cédula liberada. Chame o mesário." }
  }

  const { data: urna } = await admin
    .from("voto_urnas")
    .select("id, assembleia_id, rod_assembleia_id, ativa, abertura, fechamento")
    .eq("id", term.urna_id)
    .maybeSingle()
  if (!urna) return { erro: "Urna não encontrada." }
  if (urna.ativa === false || !janelaAberta(txt(urna.abertura), txt(urna.fechamento))) {
    return { erro: "A urna está fora do horário de votação." }
  }
  const assembleiaId = String(urna.assembleia_id)

  const perguntas = await perguntasDaAssembleia(assembleiaId)
  if (perguntas.length === 0) return { erro: "A cédula não tem perguntas." }
  const escolhaPorPergunta = new Map(
    escolhas.map((e) => [e.perguntaId, e.opcaoId])
  )
  for (const p of perguntas) {
    const opc = escolhaPorPergunta.get(p.id)
    if (!opc || !p.opcoes.some((o) => o.id === opc)) {
      return { erro: "Responda todas as perguntas para confirmar o voto." }
    }
  }
  const agora = new Date().toISOString()

  // ── Voto EM SEPARADO: fica RETIDO ligado ao cadastro (em_separado_id) até a
  // apuração. Só esse tipo de voto carrega vínculo — os normais são anônimos.
  if (emSepId) {
    const { data: reg } = await admin
      .from("voto_em_separado")
      .select("id, votou_em")
      .eq("id", emSepId)
      .eq("emp_proprietaria_id", emp)
      .maybeSingle()
    if (!reg) return { erro: "Cadastro em separado não encontrado." }
    if (reg.votou_em) {
      await limparLiberacao(emp, String(term.id))
      return { erro: "Este eleitor já votou." }
    }
    const linhas = perguntas.map((p) => ({
      emp_proprietaria_id: emp,
      assembleia_id: assembleiaId,
      rod_assembleia_id: urna.rod_assembleia_id,
      pergunta_id: p.id,
      resposta_id: escolhaPorPergunta.get(p.id) as string,
      valido: true,
      eleitor_id: null,
      mesario_id: null,
      em_separado_id: emSepId,
      created_at: agora,
    }))
    const { error: erroVoto } = await admin.from("voto_online").insert(linhas)
    if (erroVoto) {
      return { erro: `Não foi possível registrar o voto: ${erroVoto.message}` }
    }
    await admin
      .from("voto_em_separado")
      .update({ votou_em: agora, updated_at: agora })
      .eq("id", emSepId)
      .eq("emp_proprietaria_id", emp)
    await limparLiberacao(emp, String(term.id))
    return { ok: true }
  }

  // ── Voto NORMAL (apto): o mais anônimo possível — sem eleitor_id, sem
  // mesario_id, sem urna_id. A urna fica só na PRESENÇA do apto.
  const { data: apto } = await admin
    .from("voto_assembleias_aptos")
    .select("id, cpf, hora_voto")
    .eq("id", aptoId as string)
    .eq("emp_proprietaria_id", emp)
    .maybeSingle()
  if (!apto) return { erro: "Eleitor não encontrado." }
  if (apto.hora_voto) {
    await limparLiberacao(emp, String(term.id))
    return { erro: "Este eleitor já votou." }
  }

  const linhas = perguntas.map((p) => ({
    emp_proprietaria_id: emp,
    assembleia_id: assembleiaId,
    rod_assembleia_id: urna.rod_assembleia_id,
    pergunta_id: p.id,
    resposta_id: escolhaPorPergunta.get(p.id) as string,
    valido: true,
    eleitor_id: null,
    mesario_id: null,
    created_at: agora,
  }))
  const { error: erroVoto } = await admin.from("voto_online").insert(linhas)
  if (erroVoto) {
    return { erro: `Não foi possível registrar o voto: ${erroVoto.message}` }
  }

  await admin
    .from("voto_assembleias_aptos")
    .update({ hora_voto: agora })
    .eq("id", aptoId as string)
    .eq("emp_proprietaria_id", emp)
  await limparLiberacao(emp, String(term.id))
  await lancarProntuario(emp, apto.cpf ? String(apto.cpf) : null, assembleiaId)
  return { ok: true }
}

async function limparLiberacao(emp: string, termId: string): Promise<void> {
  const admin = await createAdminClient()
  await admin
    .from("voto_urna_terminais")
    .update({
      apto_liberado_id: null,
      em_separado_liberado_id: null,
      liberado_em: null,
    })
    .eq("id", termId)
    .eq("emp_proprietaria_id", emp)
}

// ── Cédula (dados para o PDF) ───────────────────────────────────────────────

import type { DadosCedula } from "@/lib/pdf/cedula"

function periodoTexto(inicio: string | null, termino: string | null): string | null {
  const f = (d: string | null) =>
    d
      ? new Date(d + "T00:00:00").toLocaleDateString("pt-BR", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        })
      : null
  const i = f(inicio)
  const t = f(termino)
  if (i && t) return `Período: ${i} a ${t}`
  if (i) return `A partir de ${i}`
  if (t) return `Até ${t}`
  return null
}

export async function dadosCedula(
  assembleiaId: string
): Promise<DadosCedula | null> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data: a } = await admin
    .from("voto_assembleias")
    .select("id, nome_assembleia, campanha_id, rod_assembleia_id")
    .eq("id", assembleiaId)
    .eq("emp_proprietaria_id", emp)
    .maybeSingle()
  if (!a) return null

  const [{ data: camp }, { data: rod }, perguntas, org] = await Promise.all([
    txt(a.campanha_id)
      ? admin.from("voto_campanha").select("tema").eq("id", a.campanha_id).maybeSingle()
      : Promise.resolve({ data: null }),
    txt(a.rod_assembleia_id)
      ? admin
          .from("voto_rod_assembleias")
          .select("inicio, termino")
          .eq("id", a.rod_assembleia_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    perguntasDaAssembleia(assembleiaId),
    (async () => {
      const { obterOrganizacao } = await import("@/lib/db/organizacao")
      return obterOrganizacao()
    })(),
  ])

  return {
    organizacao: org?.nomeFantasia ?? org?.nomeRazao ?? null,
    campanha: txt(camp?.tema),
    rodada: rod
      ? periodoTexto(txt(rod.inicio), txt(rod.termino))?.replace("Período: ", "") ?? null
      : null,
    assembleia: txt(a.nome_assembleia),
    periodo: rod ? periodoTexto(txt(rod.inicio), txt(rod.termino)) : null,
    perguntas: perguntas.map((p) => ({
      id: p.id,
      pergunta: p.pergunta,
      opcoes: p.opcoes.map((o) => ({ id: o.id, texto: o.texto })),
    })),
  }
}

// ── Voto em separado (mesário) ──────────────────────────────────────────────
// Eleitor que alega direito mas não está na lista de aptos. O mesário cadastra
// os dados; na urna DIGITAL a cédula é liberada no terminal e o voto fica RETIDO
// (ligado ao cadastro) até a apuração; na FÍSICA o voto vai em papel+envelope
// (manual). As orientações do procedimento aparecem na tela do mesário.

export type DadosEmSeparado = {
  nome: string
  cpf: string | null
  dataNascimento: string | null
  telefone: string | null
  email: string | null
}

export type ResultadoEmSeparado = {
  erro?: string
  ok?: boolean
  digital?: boolean
  instrucoes?: string[]
}

const INSTRUCOES_COMUNS = [
  "Confira e anote os documentos do eleitor no formulário físico de votos em separado.",
  "Registre o motivo (nome ausente da lista de aptos).",
]

export async function registrarVotoEmSeparado(
  urnaId: string,
  dados: DadosEmSeparado
): Promise<ResultadoEmSeparado> {
  const auth = await urnaAutorizada(urnaId)
  if (!auth) return { erro: "Urna não autorizada." }
  const { emp, urna } = auth
  if (!urna.aberta) return { erro: "A urna está fora do horário de votação." }
  if (urna.tipo === "fisica" && !(await estadoDiaUrna(urnaId)).abertaHoje) {
    return { erro: "Faça a Abertura do dia antes de registrar votos." }
  }
  if (!dados.nome.trim()) return { erro: "Informe o nome completo." }
  const admin = await createAdminClient()
  const mesarios = await mesariosDaSessao()
  const mesarioId =
    mesarios.find((m) => m.rodadaId)?.id ?? mesarios[0]?.id ?? null
  const agora = new Date().toISOString()

  const { data: a } = await admin
    .from("voto_assembleias")
    .select("rod_assembleia_id")
    .eq("id", urna.assembleiaId)
    .maybeSingle()

  const digital = urna.tipo === "digital"
  const { data: reg, error } = await admin
    .from("voto_em_separado")
    .insert({
      emp_proprietaria_id: emp,
      assembleia_id: urna.assembleiaId,
      rod_assembleia_id: a?.rod_assembleia_id ?? null,
      urna_id: urnaId,
      mesario_id: mesarioId,
      nome_completo: dados.nome.trim(),
      cpf: dados.cpf,
      data_nascimento: dados.dataNascimento,
      telefone: dados.telefone,
      email: dados.email ? dados.email.toLowerCase() : null,
      status: "pendente",
      // na urna física o voto é em papel agora; na digital, quando votar.
      votou_em: digital ? null : agora,
    })
    .select("id")
    .single()
  if (error || !reg) {
    return { erro: `Não foi possível cadastrar: ${error?.message ?? ""}` }
  }

  if (digital) {
    const { data: term } = await admin
      .from("voto_urna_terminais")
      .select("id, apto_liberado_id, em_separado_liberado_id")
      .eq("emp_proprietaria_id", emp)
      .eq("urna_id", urnaId)
      .eq("pareada", true)
      .eq("encerrada", false)
      .limit(1)
      .maybeSingle()
    if (!term) {
      return { erro: "Pareie um terminal de votação antes de liberar a cédula." }
    }
    if (txt(term.apto_liberado_id) || txt(term.em_separado_liberado_id)) {
      return {
        erro: "O terminal ainda está com outra cédula liberada. Aguarde o voto.",
      }
    }
    const { error: erroLib } = await admin
      .from("voto_urna_terminais")
      .update({ em_separado_liberado_id: reg.id, liberado_em: agora })
      .eq("id", term.id)
      .eq("emp_proprietaria_id", emp)
    if (erroLib) return { erro: `Não foi possível liberar: ${erroLib.message}` }
    return {
      ok: true,
      digital: true,
      instrucoes: [
        ...INSTRUCOES_COMUNS,
        "A cédula foi liberada no terminal de votação.",
        "O voto ficará RETIDO e será validado na apuração — deferido conta, indeferido é descartado.",
        "Informe ao eleitor que o voto só será computado se o direito for reconhecido.",
      ],
    }
  }

  return {
    ok: true,
    digital: false,
    instrucoes: [
      ...INSTRUCOES_COMUNS,
      "Entregue uma cédula de papel ao eleitor.",
      "Coloque a cédula votada no ENVELOPE de voto em separado, com os dados do eleitor por fora.",
      "Deposite o envelope conforme o procedimento (NÃO na urna comum).",
      "O voto será validado na apuração — deferido conta, indeferido é descartado.",
    ],
  }
}

// ── Painel: participação e votos em separado ────────────────────────────────

export type QuemVotou = {
  nome: string | null
  cpf: string | null
  urna: string | null
  quando: string | null
}

export type EmSeparadoLinha = {
  id: string
  nome: string | null
  cpf: string | null
  dataNascimento: string | null
  telefone: string | null
  email: string | null
  urna: string | null
  status: "pendente" | "deferido" | "indeferido"
  votou: boolean
  quando: string | null
}

export type Acompanhamento = {
  assembleiaId: string
  nome: string | null
  totalAptos: number
  votaram: number
  quemVotou: QuemVotou[]
  emSeparado: EmSeparadoLinha[]
  emSeparadoContagem: {
    total: number
    pendente: number
    deferido: number
    indeferido: number
  }
  votosPorUrna: { urna: string | null; compareceram: number }[]
  lacresPorDia: {
    dia: string
    itens: { tipo: string; numero: string | null; evento: string; urna: string | null }[]
  }[]
}

export async function acompanhamentoAssembleia(
  assembleiaId: string
): Promise<Acompanhamento | null> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data: a } = await admin
    .from("voto_assembleias")
    .select("id, nome_assembleia")
    .eq("id", assembleiaId)
    .eq("emp_proprietaria_id", emp)
    .maybeSingle()
  if (!a) return null

  // Nomes das urnas da assembleia.
  const { data: urnas } = await admin
    .from("voto_urnas")
    .select("id, nome")
    .eq("emp_proprietaria_id", emp)
    .eq("assembleia_id", assembleiaId)
  const nomeUrna = new Map(
    (urnas ?? []).map((u) => [String(u.id), txt(u.nome)])
  )

  const [{ data: aptos }, { data: separados }] = await Promise.all([
    admin
      .from("voto_assembleias_aptos")
      .select("nome_completo, cpf, hora_voto, presenca_urna_id")
      .eq("emp_proprietaria_id", emp)
      .eq("assembleia_id", assembleiaId),
    admin
      .from("voto_em_separado")
      .select(
        "id, nome_completo, cpf, data_nascimento, telefone, email, urna_id, status, votou_em, created_at"
      )
      .eq("emp_proprietaria_id", emp)
      .eq("assembleia_id", assembleiaId)
      .order("created_at", { ascending: true }),
  ])

  const lista = aptos ?? []
  const quemVotou: QuemVotou[] = lista
    .filter((x) => x.hora_voto)
    .map((x) => ({
      nome: txt(x.nome_completo),
      cpf: txt(x.cpf),
      urna: nomeUrna.get(txt(x.presenca_urna_id) ?? "") ?? null,
      quando: txt(x.hora_voto),
    }))
    .sort((p, q) => (q.quando ?? "").localeCompare(p.quando ?? ""))

  const emSeparado: EmSeparadoLinha[] = (separados ?? []).map((s) => ({
    id: String(s.id),
    nome: txt(s.nome_completo),
    cpf: txt(s.cpf),
    dataNascimento: txt(s.data_nascimento),
    telefone: txt(s.telefone),
    email: txt(s.email),
    urna: nomeUrna.get(txt(s.urna_id) ?? "") ?? null,
    status:
      s.status === "deferido"
        ? "deferido"
        : s.status === "indeferido"
          ? "indeferido"
          : "pendente",
    votou: Boolean(s.votou_em),
    quando: txt(s.votou_em) ?? txt(s.created_at),
  }))

  const contagem = { total: emSeparado.length, pendente: 0, deferido: 0, indeferido: 0 }
  for (const s of emSeparado) contagem[s.status]++

  // Votos por urna (comparecimento por urna presencial).
  const comparecPorUrna = new Map<string, number>()
  for (const x of lista) {
    if (!x.hora_voto) continue
    const u = txt(x.presenca_urna_id)
    if (u) comparecPorUrna.set(u, (comparecPorUrna.get(u) ?? 0) + 1)
  }
  const votosPorUrna = [...comparecPorUrna.entries()].map(([id, n]) => ({
    urna: nomeUrna.get(id) ?? null,
    compareceram: n,
  }))

  // Lacres usados por dia (todas as urnas da assembleia).
  const urnaIds = (urnas ?? []).map((u) => String(u.id))
  const lacresPorDiaMap = new Map<
    string,
    { tipo: string; numero: string | null; evento: string; urna: string | null }[]
  >()
  if (urnaIds.length) {
    const { data: lacres } = await admin
      .from("voto_urna_lacres")
      .select("urna_id, tipo, numero, evento, data")
      .eq("emp_proprietaria_id", emp)
      .in("urna_id", urnaIds)
      .order("data", { ascending: false })
    for (const l of lacres ?? []) {
      const dia = diaLocal(txt(l.data)) ?? "—"
      const arr = lacresPorDiaMap.get(dia) ?? []
      arr.push({
        tipo: l.tipo === "principal" ? "principal" : "boca",
        numero: txt(l.numero),
        evento: l.evento === "rompido" ? "rompido" : "instalado",
        urna: nomeUrna.get(String(l.urna_id)) ?? null,
      })
      lacresPorDiaMap.set(dia, arr)
    }
  }
  const lacresPorDia = [...lacresPorDiaMap.entries()]
    .sort((x, y) => y[0].localeCompare(x[0]))
    .map(([dia, itens]) => ({ dia, itens }))

  return {
    assembleiaId,
    nome: txt(a.nome_assembleia),
    totalAptos: lista.length,
    votaram: quemVotou.length,
    quemVotou,
    emSeparado,
    emSeparadoContagem: contagem,
    votosPorUrna,
    lacresPorDia,
  }
}

/** Defere/indefere um voto em separado (na apuração). */
export async function validarEmSeparado(
  id: string,
  status: "deferido" | "indeferido"
): Promise<{ erro?: string; ok?: boolean }> {
  const admin = await createAdminClient()
  const agora = new Date().toISOString()
  const { error } = await admin
    .from("voto_em_separado")
    .update({ status, decidido_em: agora, updated_at: agora })
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: `Não foi possível decidir: ${error.message}` }
  return { ok: true }
}

// ── Painel: controle de lacres ──────────────────────────────────────────────

export type LacreLinha = {
  id: string
  tipo: "boca" | "principal"
  numero: string | null
  evento: "instalado" | "rompido"
  data: string | null
  guardadoNaUrna: boolean
  observacao: string | null
}

export async function listarLacres(urnaId: string): Promise<LacreLinha[]> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("voto_urna_lacres")
    .select("id, tipo, numero, evento, data, guardado_na_urna, observacao")
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("urna_id", urnaId)
    .order("data", { ascending: false })
  return (data ?? []).map((l) => ({
    id: String(l.id),
    tipo: l.tipo === "principal" ? "principal" : "boca",
    numero: txt(l.numero),
    evento: l.evento === "rompido" ? "rompido" : "instalado",
    data: txt(l.data),
    guardadoNaUrna: l.guardado_na_urna === true,
    observacao: txt(l.observacao),
  }))
}

export async function registrarLacre(
  urnaId: string,
  dados: {
    tipo: "boca" | "principal"
    numero: string
    evento: "instalado" | "rompido"
    data: string | null
    guardadoNaUrna: boolean
    observacao: string | null
  }
): Promise<{ erro?: string; ok?: boolean }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { error } = await admin.from("voto_urna_lacres").insert({
    emp_proprietaria_id: emp,
    urna_id: urnaId,
    tipo: dados.tipo,
    numero: dados.numero,
    evento: dados.evento,
    data: dados.data ?? new Date().toISOString(),
    guardado_na_urna: dados.guardadoNaUrna,
    observacao: dados.observacao,
  })
  if (error) return { erro: `Não foi possível registrar o lacre: ${error.message}` }
  return { ok: true }
}

export async function removerLacre(
  id: string
): Promise<{ erro?: string; ok?: boolean }> {
  const admin = await createAdminClient()
  const { error } = await admin
    .from("voto_urna_lacres")
    .delete()
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: `Não foi possível excluir: ${error.message}` }
  return { ok: true }
}
