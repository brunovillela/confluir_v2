import "server-only"

import { randomUUID } from "node:crypto"

import {
  ASSUNTOS_ATENDIMENTO,
  ATENDIMENTO_ABERTO,
  ATENDIMENTO_AGUARDANDO_EQUIPE,
  TIPO_DEMANDA_ATENDIMENTO,
  assuntoAtendimento,
  type SituacaoAtendimento,
} from "@/lib/atendimento-constantes"
import { cpfConfiavel } from "@/lib/cpf"
import { avisarQuemPode, depoisDaResposta } from "@/lib/db/avisos"
import { esquemaAusente, hojeSP, texto } from "@/lib/db/comum"
import { avisarFiliado } from "@/lib/db/portal-avisos"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * ATENDIMENTO AO FILIADO (onda 4, F2). A solicitação nasce no portal e vira,
 * no mesmo ato, uma Demanda em Ferramentas → Demandas com prazo pelo SLA do
 * assunto — a equipe trabalha onde já trabalha. A conversa (filiado ↔
 * entidade) fica em `portal_atendimentos_mensagens`; cada resposta da
 * entidade avisa o filiado (sino + e-mail por preferência) e cada mensagem
 * do filiado avisa quem cuida das demandas. Tabelas em
 * supabase/portal-atendimentos.sql; sem elas o portal diz que o canal ainda
 * não está disponível.
 */

const BUCKET = "documentos"
const PASTA = "atendimentos"
const MAX_ANEXO = 10 * 1024 * 1024

export type Atendimento = {
  id: string
  cpf: string
  filiacaoId: string | null
  nome: string | null
  email: string | null
  assunto: string
  assuntoRotulo: string
  titulo: string
  situacao: SituacaoAtendimento
  prazo: string | null
  demandaId: string | null
  primeiraRespostaEm: string | null
  concluidaEm: string | null
  criadoEm: string
  atualizadoEm: string
  /** Prazo vencido com a solicitação ainda aberta. */
  atrasada: boolean
}

export type MensagemAtendimento = {
  id: string
  autor: "filiado" | "entidade"
  autorNome: string | null
  texto: string
  anexoCaminho: string | null
  anexoNome: string | null
  criadoEm: string
}

function montar(d: Record<string, unknown>): Atendimento {
  const situacao = String(d.situacao) as SituacaoAtendimento
  const prazo = texto(d.prazo)
  return {
    id: String(d.id),
    cpf: String(d.cpf),
    filiacaoId: texto(d.filiacao_id),
    nome: texto(d.nome),
    email: texto(d.email),
    assunto: String(d.assunto),
    assuntoRotulo: assuntoAtendimento(String(d.assunto))?.rotulo ?? String(d.assunto),
    titulo: String(d.titulo),
    situacao,
    prazo,
    demandaId: texto(d.demanda_id),
    primeiraRespostaEm: texto(d.primeira_resposta_em),
    concluidaEm: texto(d.concluida_em),
    criadoEm: String(d.created_at),
    atualizadoEm: String(d.updated_at ?? d.created_at),
    atrasada: Boolean(prazo && prazo < hojeSP() && ATENDIMENTO_ABERTO.includes(situacao) && !d.primeira_resposta_em),
  }
}

function montarMensagem(m: Record<string, unknown>): MensagemAtendimento {
  return {
    id: String(m.id),
    autor: m.autor === "entidade" ? "entidade" : "filiado",
    autorNome: texto(m.autor_nome),
    texto: String(m.texto),
    anexoCaminho: texto(m.anexo_caminho),
    anexoNome: texto(m.anexo_nome),
    criadoEm: String(m.created_at),
  }
}

const COLS = "id, cpf, filiacao_id, nome, email, assunto, titulo, situacao, prazo, demanda_id, primeira_resposta_em, concluida_em, created_at, updated_at"

/** false = falta rodar supabase/portal-atendimentos.sql. */
export async function atendimentoDisponivel(): Promise<boolean> {
  const admin = await createAdminClient()
  const { error } = await admin.from("portal_atendimentos").select("id", { head: true, count: "exact" }).limit(1)
  return !error || !esquemaAusente(error)
}

function somarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

async function guardarAnexo(atendimentoId: string, arquivo: File | null): Promise<{ caminho: string | null; nome: string | null; erro?: string }> {
  if (!arquivo || arquivo.size === 0) return { caminho: null, nome: null }
  if (arquivo.size > MAX_ANEXO) return { caminho: null, nome: null, erro: "O anexo deve ter no máximo 10 MB." }
  const ext = (arquivo.name.split(".").pop() ?? "bin").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) || "bin"
  const caminho = `${PASTA}/${atendimentoId}/${randomUUID()}.${ext}`
  const admin = await createAdminClient()
  // O storage do createAdminClient confere os bytes (lib/uploads.ts).
  const { error } = await admin.storage.from(BUCKET).upload(caminho, arquivo, { contentType: arquivo.type })
  if (error) return { caminho: null, nome: null, erro: `Não foi possível guardar o anexo: ${error.message}` }
  return { caminho, nome: arquivo.name.slice(0, 120) }
}

/** URL assinada de curta duração para um anexo (quem chama já conferiu o acesso). */
export async function urlAnexoAtendimento(caminho: string): Promise<string | null> {
  if (!caminho.startsWith(`${PASTA}/`)) return null
  const admin = await createAdminClient()
  const { data } = await admin.storage.from(BUCKET).createSignedUrl(caminho, 300)
  return data?.signedUrl ?? null
}

// ── Portal ───────────────────────────────────────────────────────────────────

export async function abrirAtendimento(p: {
  cpf: string
  filiacaoId: string | null
  nome: string | null
  email: string | null
  assunto: string
  titulo: string
  texto: string
  anexo: File | null
}): Promise<{ id?: string; erro?: string; campo?: string }> {
  const cpf = cpfConfiavel(p.cpf)
  if (!cpf) return { erro: "Cadastro sem CPF válido — fale com a entidade." }
  const assunto = assuntoAtendimento(p.assunto)
  if (!assunto) return { erro: "Escolha o assunto.", campo: "assunto" }
  const titulo = p.titulo.trim().replace(/\s+/g, " ")
  if (titulo.length < 5) return { erro: "Resuma o pedido em poucas palavras (pelo menos 5 letras).", campo: "titulo" }
  const corpo = p.texto.trim()
  if (corpo.length < 10) return { erro: "Conte um pouco mais sobre o que você precisa.", campo: "texto" }

  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const prazo = somarDias(hojeSP(), assunto.slaDias)

  const { data: criado, error } = await admin
    .from("portal_atendimentos")
    .insert({
      emp_proprietaria_id: emp,
      cpf,
      filiacao_id: p.filiacaoId,
      nome: p.nome,
      email: p.email,
      assunto: assunto.chave,
      titulo: titulo.slice(0, 140),
      situacao: "aberta",
      prazo,
    })
    .select("id")
    .single()
  if (error || !criado) {
    if (error && esquemaAusente(error)) return { erro: "O atendimento pelo portal ainda não está disponível — a entidade precisa concluir a atualização do sistema." }
    return { erro: `Não foi possível abrir a solicitação: ${error?.message ?? "?"}` }
  }
  const id = String(criado.id)

  const anexo = await guardarAnexo(id, p.anexo)
  if (anexo.erro) {
    await admin.from("portal_atendimentos").delete().eq("id", id)
    return { erro: anexo.erro, campo: "anexo" }
  }
  await admin.from("portal_atendimentos_mensagens").insert({
    emp_proprietaria_id: emp,
    atendimento_id: id,
    autor: "filiado",
    autor_nome: p.nome,
    texto: corpo,
    anexo_caminho: anexo.caminho,
    anexo_nome: anexo.nome,
  })

  // A Demanda no painel: a equipe trabalha onde já trabalha.
  const descricao = [
    corpo,
    "",
    `— Solicitação de ${p.nome ?? "filiado"} (CPF ${cpf}) pelo portal, assunto ${assunto.rotulo}. Prazo de resposta: ${assunto.slaDias} dias.`,
    `Responder ao filiado: /painel/filiados/atendimentos/${id}`,
  ].join("\n")
  const { data: demanda } = await admin
    .from("demandas")
    .insert({
      emp_proprietaria_id: emp,
      nome: `[${assunto.rotulo}] ${titulo.slice(0, 90)} — ${(p.nome ?? "filiado").split(" ")[0]}`,
      descricao,
      situacao: "A fazer",
      prazo,
      tipo: TIPO_DEMANDA_ATENDIMENTO,
    })
    .select("id")
    .single()
  if (demanda?.id) await admin.from("portal_atendimentos").update({ demanda_id: demanda.id }).eq("id", id)

  depoisDaResposta(() =>
    avisarQuemPode("ferramentas_demandas", ["ferramentas_tarefas"], {
      texto: `${p.nome ?? "Um filiado"} abriu uma solicitação de ${assunto.rotulo.toLowerCase()} pelo portal: ${titulo}`,
      link: `/painel/filiados/atendimentos/${id}`,
      evento: "atendimento_filiado",
      assunto: `Nova solicitação de ${assunto.rotulo.toLowerCase()} pelo portal`,
    })
  )
  return { id }
}

export async function meusAtendimentos(cpf: string): Promise<{ lista: Atendimento[]; disponivel: boolean }> {
  const chave = cpfConfiavel(cpf)
  if (!chave) return { lista: [], disponivel: true }
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("portal_atendimentos")
    .select(COLS)
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("cpf", chave)
    .order("created_at", { ascending: false })
    .limit(200)
  if (error) return { lista: [], disponivel: !esquemaAusente(error) }
  return { lista: (data ?? []).map((d) => montar(d as Record<string, unknown>)), disponivel: true }
}

async function mensagensDe(atendimentoId: string): Promise<MensagemAtendimento[]> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("portal_atendimentos_mensagens")
    .select("id, autor, autor_nome, texto, anexo_caminho, anexo_nome, created_at")
    .eq("atendimento_id", atendimentoId)
    .order("created_at", { ascending: true })
  return (data ?? []).map((m) => montarMensagem(m as Record<string, unknown>))
}

/** A solicitação do próprio filiado (CPF conferido), com a conversa. */
export async function atendimentoDoFiliado(id: string, cpf: string): Promise<{ atendimento: Atendimento; mensagens: MensagemAtendimento[] } | null> {
  const chave = cpfConfiavel(cpf)
  if (!chave || !/^[0-9a-f-]{36}$/i.test(id)) return null
  const admin = await createAdminClient()
  const { data } = await admin
    .from("portal_atendimentos")
    .select(COLS)
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("id", id)
    .eq("cpf", chave)
    .maybeSingle()
  if (!data) return null
  return { atendimento: montar(data as Record<string, unknown>), mensagens: await mensagensDe(id) }
}

export async function responderComoFiliado(p: {
  id: string
  cpf: string
  nome: string | null
  texto: string
  anexo: File | null
}): Promise<{ erro?: string; campo?: string }> {
  const atual = await atendimentoDoFiliado(p.id, p.cpf)
  if (!atual) return { erro: "Solicitação não encontrada." }
  if (atual.atendimento.situacao === "concluida") return { erro: "Esta solicitação foi concluída — abra uma nova se o assunto voltou." }
  const corpo = p.texto.trim()
  if (corpo.length < 2) return { erro: "Escreva a mensagem.", campo: "texto" }
  const anexo = await guardarAnexo(p.id, p.anexo)
  if (anexo.erro) return { erro: anexo.erro, campo: "anexo" }

  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { error } = await admin.from("portal_atendimentos_mensagens").insert({
    emp_proprietaria_id: emp,
    atendimento_id: p.id,
    autor: "filiado",
    autor_nome: p.nome,
    texto: corpo,
    anexo_caminho: anexo.caminho,
    anexo_nome: anexo.nome,
  })
  if (error) return { erro: `Não foi possível enviar: ${error.message}` }
  // Uma resposta do filiado reabre a vez da entidade.
  await admin
    .from("portal_atendimentos")
    .update({ situacao: atual.atendimento.situacao === "respondida" ? "em_andamento" : atual.atendimento.situacao, updated_at: new Date().toISOString() })
    .eq("id", p.id)
  if (atual.atendimento.demandaId) {
    await admin.from("demandas").update({ situacao: "Fazendo" }).eq("id", atual.atendimento.demandaId).neq("situacao", "Feito")
  }

  depoisDaResposta(() =>
    avisarQuemPode("ferramentas_demandas", ["ferramentas_tarefas"], {
      texto: `${p.nome ?? "O filiado"} respondeu na solicitação "${atual.atendimento.titulo}"`,
      link: `/painel/filiados/atendimentos/${p.id}`,
      evento: "atendimento_filiado",
      assunto: "Resposta do filiado em uma solicitação",
    })
  )
  return {}
}

// ── Painel ───────────────────────────────────────────────────────────────────

export type FiltroAtendimentos = { situacao?: string; assunto?: string; busca?: string }

export async function listarAtendimentos(filtro: FiltroAtendimentos = {}): Promise<{ lista: Atendimento[]; disponivel: boolean }> {
  const admin = await createAdminClient()
  let q = admin.from("portal_atendimentos").select(COLS).eq("emp_proprietaria_id", await tenantAtual())
  if (filtro.situacao === "abertas") q = q.in("situacao", ATENDIMENTO_ABERTO)
  // Esperando a equipe: novas ou com resposta nova do filiado (= caixa de entrada).
  else if (filtro.situacao === "aguardando") q = q.in("situacao", ATENDIMENTO_AGUARDANDO_EQUIPE)
  else if (filtro.situacao && filtro.situacao !== "todas") q = q.eq("situacao", filtro.situacao)
  if (filtro.assunto) q = q.eq("assunto", filtro.assunto)
  const busca = (filtro.busca ?? "").trim()
  if (busca) q = q.or(`titulo.ilike.%${busca.replace(/[%_,()]/g, "")}%,nome.ilike.%${busca.replace(/[%_,()]/g, "")}%`)
  const { data, error } = await q.order("created_at", { ascending: false }).limit(500)
  if (error) return { lista: [], disponivel: !esquemaAusente(error) }
  return { lista: (data ?? []).map((d) => montar(d as Record<string, unknown>)), disponivel: true }
}

export async function obterAtendimento(id: string): Promise<{ atendimento: Atendimento; mensagens: MensagemAtendimento[] } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null
  const admin = await createAdminClient()
  const { data } = await admin
    .from("portal_atendimentos")
    .select(COLS)
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("id", id)
    .maybeSingle()
  if (!data) return null
  return { atendimento: montar(data as Record<string, unknown>), mensagens: await mensagensDe(id) }
}

/** A solicitação ligada a uma Demanda (para o painel responder de lá). */
export async function atendimentoDaDemanda(demandaId: string): Promise<{ atendimento: Atendimento; mensagens: MensagemAtendimento[] } | null> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("portal_atendimentos")
    .select(COLS)
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("demanda_id", demandaId)
    .maybeSingle()
  if (error || !data) return null
  const a = montar(data as Record<string, unknown>)
  return { atendimento: a, mensagens: await mensagensDe(a.id) }
}

export async function responderAtendimento(p: {
  id: string
  usuarioId: string
  usuarioNome: string | null
  texto: string
  anexo: File | null
  /** true = encerra a solicitação junto com a resposta. */
  concluir: boolean
}): Promise<{ erro?: string; campo?: string }> {
  const atual = await obterAtendimento(p.id)
  if (!atual) return { erro: "Solicitação não encontrada." }
  const corpo = p.texto.trim()
  if (corpo.length < 2 && !p.concluir) return { erro: "Escreva a resposta.", campo: "texto" }
  const anexo = await guardarAnexo(p.id, p.anexo)
  if (anexo.erro) return { erro: anexo.erro, campo: "anexo" }

  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const agora = new Date().toISOString()
  if (corpo.length > 0) {
    const { error } = await admin.from("portal_atendimentos_mensagens").insert({
      emp_proprietaria_id: emp,
      atendimento_id: p.id,
      autor: "entidade",
      autor_nome: p.usuarioNome,
      autor_usuario_id: p.usuarioId,
      texto: corpo,
      anexo_caminho: anexo.caminho,
      anexo_nome: anexo.nome,
    })
    if (error) return { erro: `Não foi possível responder: ${error.message}` }
  }
  const nova: SituacaoAtendimento = p.concluir ? "concluida" : "respondida"
  await admin
    .from("portal_atendimentos")
    .update({
      situacao: nova,
      primeira_resposta_em: atual.atendimento.primeiraRespostaEm ?? agora,
      concluida_em: p.concluir ? agora : null,
      updated_at: agora,
    })
    .eq("id", p.id)
  if (atual.atendimento.demandaId) {
    await admin.from("demandas").update({ situacao: p.concluir ? "Feito" : "Fazendo" }).eq("id", atual.atendimento.demandaId)
  }

  const a = atual.atendimento
  depoisDaResposta(() =>
    avisarFiliado({
      cpf: a.cpf,
      nome: a.nome,
      email: a.email,
      evento: "atendimento",
      assunto: p.concluir ? "Sua solicitação foi concluída" : "A entidade respondeu à sua solicitação",
      texto: p.concluir
        ? `Sua solicitação "${a.titulo}" foi concluída${corpo ? " com uma resposta da entidade" : ""}.`
        : `A entidade respondeu à sua solicitação "${a.titulo}".`,
      link: `/portal/atendimento/${a.id}`,
    })
  )
  return {}
}

/** Reabre uma solicitação concluída (a equipe, quando encerrou cedo demais). */
export async function reabrirAtendimento(id: string): Promise<{ erro?: string }> {
  const atual = await obterAtendimento(id)
  if (!atual) return { erro: "Solicitação não encontrada." }
  const admin = await createAdminClient()
  await admin.from("portal_atendimentos").update({ situacao: "em_andamento", concluida_em: null, updated_at: new Date().toISOString() }).eq("id", id)
  if (atual.atendimento.demandaId) await admin.from("demandas").update({ situacao: "Fazendo" }).eq("id", atual.atendimento.demandaId)
  return {}
}

// ── Indicadores ──────────────────────────────────────────────────────────────

export type IndicadoresAtendimento = {
  abertas: number
  atrasadas: number
  /** Dias corridos até a primeira resposta (média dos últimos 90 dias). */
  tempoMedioDias: number | null
  /** Respondidas dentro do prazo, entre as que já têm primeira resposta (90 dias). */
  noPrazoPct: number | null
  respondidas90d: number
  porAssunto: { assunto: string; rotulo: string; abertas: number }[]
}

export async function indicadoresAtendimento(): Promise<IndicadoresAtendimento> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const vazio: IndicadoresAtendimento = { abertas: 0, atrasadas: 0, tempoMedioDias: null, noPrazoPct: null, respondidas90d: 0, porAssunto: [] }
  const desde = somarDias(hojeSP(), -90)
  const { data, error } = await admin
    .from("portal_atendimentos")
    .select("assunto, situacao, prazo, primeira_resposta_em, created_at")
    .eq("emp_proprietaria_id", emp)
    .gte("created_at", `${desde}T00:00:00Z`)
    .limit(5000)
  const { data: abertasTodas } = await admin
    .from("portal_atendimentos")
    .select("assunto, prazo, primeira_resposta_em")
    .eq("emp_proprietaria_id", emp)
    .in("situacao", ATENDIMENTO_ABERTO)
    .limit(5000)
  if (error) return vazio

  const hoje = hojeSP()
  const abertas = abertasTodas ?? []
  const porAssunto = ASSUNTOS_ATENDIMENTO.map((a) => ({
    assunto: a.chave,
    rotulo: a.rotulo,
    abertas: abertas.filter((x) => x.assunto === a.chave).length,
  })).filter((x) => x.abertas > 0)

  let soma = 0
  let n = 0
  let noPrazo = 0
  for (const r of data ?? []) {
    if (!r.primeira_resposta_em) continue
    const dias = (new Date(String(r.primeira_resposta_em)).getTime() - new Date(String(r.created_at)).getTime()) / 86_400_000
    soma += Math.max(0, dias)
    n++
    if (!r.prazo || String(r.primeira_resposta_em).slice(0, 10) <= String(r.prazo)) noPrazo++
  }
  return {
    abertas: abertas.length,
    atrasadas: abertas.filter((x) => x.prazo && String(x.prazo) < hoje && !x.primeira_resposta_em).length,
    tempoMedioDias: n ? Math.round((soma / n) * 10) / 10 : null,
    noPrazoPct: n ? Math.round((noPrazo / n) * 100) : null,
    respondidas90d: n,
    porAssunto,
  }
}
