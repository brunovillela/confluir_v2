import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { tenantAtual } from "@/lib/tenant"

import { listarLacres, type LacreLinha } from "./votacao-mesarios"
import { perguntasDaAssembleia, type PerguntaVoto } from "./votacao-portal"

// Apurador: papel próprio (nome/CPF/e-mail), ambiente /apurador. O admin atribui
// urnas (voto_urnas.apurador_id). O apurador abre a urna, atesta a integridade
// dos lacres e apura por OPÇÃO cadastrada na rodada + BRANCO + NULO.

function txt(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null
}

export type ApuradorLinha = {
  id: string
  rodadaId: string | null
  nome: string | null
  cpf: string | null
  email: string | null
  ativo: boolean
}

// ── Painel: CRUD de apuradores ──────────────────────────────────────────────

export async function listarApuradores(
  rodadaId: string
): Promise<ApuradorLinha[]> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("voto_apuradores")
    .select("id, rod_assembleia_id, nome_completo, cpf, email, ativo")
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("rod_assembleia_id", rodadaId)
    .order("nome_completo", { ascending: true })
  return (data ?? []).map((m) => ({
    id: String(m.id),
    rodadaId: txt(m.rod_assembleia_id),
    nome: txt(m.nome_completo),
    cpf: txt(m.cpf),
    email: txt(m.email),
    ativo: m.ativo !== false,
  }))
}

export async function criarApurador(
  rodadaId: string,
  dados: { nome: string; cpf: string | null; email: string }
): Promise<{ erro?: string; ok?: boolean }> {
  const admin = await createAdminClient()
  const { error } = await admin.from("voto_apuradores").insert({
    emp_proprietaria_id: await tenantAtual(),
    rod_assembleia_id: rodadaId,
    nome_completo: dados.nome,
    cpf: dados.cpf,
    email: dados.email.toLowerCase(),
    ativo: true,
  })
  if (error) return { erro: `Não foi possível cadastrar: ${error.message}` }
  return { ok: true }
}

export async function atualizarApurador(
  id: string,
  dados: { nome: string; cpf: string | null; email: string; ativo: boolean }
): Promise<{ erro?: string; ok?: boolean }> {
  const admin = await createAdminClient()
  const { error } = await admin
    .from("voto_apuradores")
    .update({
      nome_completo: dados.nome,
      cpf: dados.cpf,
      email: dados.email.toLowerCase(),
      ativo: dados.ativo,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: `Não foi possível salvar: ${error.message}` }
  return { ok: true }
}

export async function removerApurador(
  id: string
): Promise<{ erro?: string; ok?: boolean }> {
  const admin = await createAdminClient()
  const { error } = await admin
    .from("voto_apuradores")
    .delete()
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: `Não foi possível excluir: ${error.message}` }
  return { ok: true }
}

/** Atribui (ou tira) uma urna a um apurador. */
export async function atribuirUrnaApurador(
  urnaId: string,
  apuradorId: string | null
): Promise<{ erro?: string; ok?: boolean }> {
  const admin = await createAdminClient()
  const { error } = await admin
    .from("voto_urnas")
    .update({ apurador_id: apuradorId, updated_at: new Date().toISOString() })
    .eq("id", urnaId)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: `Não foi possível atribuir: ${error.message}` }
  return { ok: true }
}

// ── Ambiente do apurador (/apurador) ────────────────────────────────────────

async function emailSessao(): Promise<string | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user?.email ? user.email.toLowerCase() : null
}

export async function emailEhApurador(email: string): Promise<boolean> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("voto_apuradores")
    .select("id")
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("ativo", true)
    .ilike("email", email.trim().toLowerCase())
    .limit(1)
  return (data ?? []).length > 0
}

export async function apuradoresDaSessao(): Promise<ApuradorLinha[]> {
  const email = await emailSessao()
  if (!email) return []
  const admin = await createAdminClient()
  const { data } = await admin
    .from("voto_apuradores")
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

export type UrnaDoApurador = {
  id: string
  nome: string | null
  tipo: "fisica" | "digital"
  assembleiaId: string
  assembleiaNome: string | null
  apuracaoStatus: "nao_iniciada" | "em_andamento" | "concluida"
}

export async function urnasDoApurador(): Promise<{
  email: string | null
  urnas: UrnaDoApurador[]
}> {
  const email = await emailSessao()
  const apuradores = await apuradoresDaSessao()
  if (apuradores.length === 0) return { email, urnas: [] }
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const ids = apuradores.map((ap) => ap.id)

  const { data: urnas } = await admin
    .from("voto_urnas")
    .select("id, nome, tipo, assembleia_id")
    .eq("emp_proprietaria_id", emp)
    .in("apurador_id", ids)
    .order("created_at", { ascending: true })
  const lista = urnas ?? []
  const assembleiaIds = [...new Set(lista.map((u) => String(u.assembleia_id)))]
  const urnaIds = lista.map((u) => String(u.id))

  const [{ data: assembleias }, { data: sessoes }] = await Promise.all([
    assembleiaIds.length
      ? admin
          .from("voto_assembleias")
          .select("id, nome_assembleia")
          .in("id", assembleiaIds)
      : Promise.resolve({ data: [] }),
    urnaIds.length
      ? admin
          .from("voto_apuracao_urna")
          .select("urna_id, status")
          .eq("emp_proprietaria_id", emp)
          .in("urna_id", urnaIds)
      : Promise.resolve({ data: [] }),
  ])
  const nomeAss = new Map(
    (assembleias ?? []).map((a) => [String(a.id), txt(a.nome_assembleia)])
  )
  const statusUrna = new Map(
    (sessoes ?? []).map((s) => [String(s.urna_id), String(s.status)])
  )

  return {
    email,
    urnas: lista.map((u) => {
      const st = statusUrna.get(String(u.id))
      return {
        id: String(u.id),
        nome: txt(u.nome),
        tipo: u.tipo === "fisica" ? "fisica" : "digital",
        assembleiaId: String(u.assembleia_id),
        assembleiaNome: nomeAss.get(String(u.assembleia_id)) ?? null,
        apuracaoStatus:
          st === "concluida"
            ? "concluida"
            : st === "em_andamento"
              ? "em_andamento"
              : "nao_iniciada",
      }
    }),
  }
}

/** Garante que a urna é de um apurador logado; devolve emp + dados básicos. */
async function urnaDoApurador(urnaId: string): Promise<{
  emp: string
  urna: { id: string; nome: string | null; tipo: string; assembleiaId: string }
} | null> {
  const apuradores = await apuradoresDaSessao()
  if (apuradores.length === 0) return null
  const ids = new Set(apuradores.map((ap) => ap.id))
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data: u } = await admin
    .from("voto_urnas")
    .select("id, nome, tipo, assembleia_id, apurador_id")
    .eq("id", urnaId)
    .eq("emp_proprietaria_id", emp)
    .maybeSingle()
  if (!u || !ids.has(txt(u.apurador_id) ?? "")) return null
  return {
    emp,
    urna: {
      id: String(u.id),
      nome: txt(u.nome),
      tipo: String(u.tipo),
      assembleiaId: String(u.assembleia_id),
    },
  }
}

export type ContagemLinha = {
  perguntaId: string
  opcaoId: string | null
  tipo: "opcao" | "branco" | "nulo"
  quantidade: number
}

export type ApuracaoUrnaDados = {
  urnaId: string
  nome: string | null
  tipo: "fisica" | "digital"
  assembleiaNome: string | null
  perguntas: PerguntaVoto[]
  lacres: LacreLinha[]
  sessao: {
    id: string | null
    lacresOk: boolean | null
    lacresObservacao: string | null
    status: "nao_iniciada" | "em_andamento" | "concluida"
  }
  contagem: ContagemLinha[]
}

export async function dadosApuracaoUrna(
  urnaId: string
): Promise<ApuracaoUrnaDados | null> {
  const auth = await urnaDoApurador(urnaId)
  if (!auth) return null
  const { emp, urna } = auth
  const admin = await createAdminClient()

  const [assembleiaNome, perguntas, lacres, { data: sessao }] =
    await Promise.all([
      admin
        .from("voto_assembleias")
        .select("nome_assembleia")
        .eq("id", urna.assembleiaId)
        .maybeSingle()
        .then((r) => txt(r.data?.nome_assembleia)),
      perguntasDaAssembleia(urna.assembleiaId),
      listarLacres(urnaId),
      admin
        .from("voto_apuracao_urna")
        .select("id, lacres_ok, lacres_observacao, status")
        .eq("emp_proprietaria_id", emp)
        .eq("urna_id", urnaId)
        .maybeSingle(),
    ])

  let contagem: ContagemLinha[] = []
  if (sessao?.id) {
    const { data: c } = await admin
      .from("voto_apuracao_contagem")
      .select("pergunta_id, opcao_id, tipo, quantidade")
      .eq("emp_proprietaria_id", emp)
      .eq("apuracao_urna_id", sessao.id)
    contagem = (c ?? []).map((x) => ({
      perguntaId: String(x.pergunta_id),
      opcaoId: txt(x.opcao_id),
      tipo: x.tipo === "branco" ? "branco" : x.tipo === "nulo" ? "nulo" : "opcao",
      quantidade: typeof x.quantidade === "number" ? x.quantidade : 0,
    }))
  }

  return {
    urnaId,
    nome: urna.nome,
    tipo: urna.tipo === "fisica" ? "fisica" : "digital",
    assembleiaNome,
    perguntas,
    lacres,
    sessao: {
      id: sessao?.id ? String(sessao.id) : null,
      lacresOk: typeof sessao?.lacres_ok === "boolean" ? sessao.lacres_ok : null,
      lacresObservacao: txt(sessao?.lacres_observacao),
      status:
        sessao?.status === "concluida"
          ? "concluida"
          : sessao?.status === "em_andamento"
            ? "em_andamento"
            : "nao_iniciada",
    },
    contagem,
  }
}

/** O apurador abre a urna e atesta a integridade dos lacres recebidos. */
export async function iniciarApuracaoUrna(
  urnaId: string,
  dados: { lacresOk: boolean; lacresObservacao: string | null }
): Promise<{ erro?: string; ok?: boolean }> {
  const auth = await urnaDoApurador(urnaId)
  if (!auth) return { erro: "Urna não autorizada." }
  const { emp } = auth
  const apuradores = await apuradoresDaSessao()
  const apuradorId = apuradores[0]?.id ?? null
  const admin = await createAdminClient()

  const { data: existente } = await admin
    .from("voto_apuracao_urna")
    .select("id")
    .eq("emp_proprietaria_id", emp)
    .eq("urna_id", urnaId)
    .maybeSingle()

  if (existente?.id) {
    const { error } = await admin
      .from("voto_apuracao_urna")
      .update({
        lacres_ok: dados.lacresOk,
        lacres_observacao: dados.lacresObservacao,
        status: "em_andamento",
      })
      .eq("id", existente.id)
      .eq("emp_proprietaria_id", emp)
    if (error) return { erro: `Não foi possível iniciar: ${error.message}` }
    return { ok: true }
  }
  const { error } = await admin.from("voto_apuracao_urna").insert({
    emp_proprietaria_id: emp,
    urna_id: urnaId,
    apurador_id: apuradorId,
    lacres_ok: dados.lacresOk,
    lacres_observacao: dados.lacresObservacao,
    status: "em_andamento",
  })
  if (error) return { erro: `Não foi possível iniciar: ${error.message}` }
  return { ok: true }
}

/** Salva a contagem (por opção/branco/nulo) da urna. Substitui a anterior. */
export async function salvarContagemUrna(
  urnaId: string,
  contagens: ContagemLinha[]
): Promise<{ erro?: string; ok?: boolean }> {
  const auth = await urnaDoApurador(urnaId)
  if (!auth) return { erro: "Urna não autorizada." }
  const { emp } = auth
  const admin = await createAdminClient()
  const { data: sessao } = await admin
    .from("voto_apuracao_urna")
    .select("id, status")
    .eq("emp_proprietaria_id", emp)
    .eq("urna_id", urnaId)
    .maybeSingle()
  if (!sessao?.id) return { erro: "Inicie a apuração da urna primeiro." }

  const linhas = contagens
    .filter((c) => Number.isFinite(c.quantidade) && c.quantidade >= 0)
    .map((c) => ({
      emp_proprietaria_id: emp,
      apuracao_urna_id: sessao.id,
      pergunta_id: c.perguntaId,
      opcao_id: c.tipo === "opcao" ? c.opcaoId : null,
      tipo: c.tipo,
      quantidade: Math.floor(c.quantidade),
      updated_at: new Date().toISOString(),
    }))
  // Regrava do zero (idempotente para a urna).
  await admin
    .from("voto_apuracao_contagem")
    .delete()
    .eq("emp_proprietaria_id", emp)
    .eq("apuracao_urna_id", sessao.id)
  if (linhas.length) {
    const { error } = await admin.from("voto_apuracao_contagem").insert(linhas)
    if (error) return { erro: `Não foi possível salvar: ${error.message}` }
  }
  return { ok: true }
}

export async function concluirApuracaoUrna(
  urnaId: string
): Promise<{ erro?: string; ok?: boolean }> {
  const auth = await urnaDoApurador(urnaId)
  if (!auth) return { erro: "Urna não autorizada." }
  const { emp } = auth
  const admin = await createAdminClient()
  const { error } = await admin
    .from("voto_apuracao_urna")
    .update({ status: "concluida", concluida_em: new Date().toISOString() })
    .eq("emp_proprietaria_id", emp)
    .eq("urna_id", urnaId)
  if (error) return { erro: `Não foi possível concluir: ${error.message}` }
  return { ok: true }
}
