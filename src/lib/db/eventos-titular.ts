import "server-only"

import { createHash, randomInt, timingSafeEqual } from "node:crypto"

import { obterConfig } from "@/lib/db/eventos"
import { createServiceClient } from "@/lib/supabase/admin"

/**
 * Canal do TITULAR dos dados (LGPD art. 18) para quem não é filiado.
 *
 * Convidado de evento não tem conta nem filiação: o `/portal/lgpd` não o
 * alcança. Aqui ele se identifica pelo e-mail que usou na inscrição, confirma
 * por código e ganha uma sessão curta — sem senha, sem cadastro.
 *
 * A EXCLUSÃO anonimiza em vez de apagar: o registro de presença precisa
 * sobreviver para os indicadores históricos não mentirem sobre quantas pessoas
 * estiveram no evento. O que some é a identificação da pessoa.
 *
 * SQL: supabase/eventos-titular.sql
 */

const VALIDADE_CODIGO_MIN = 30
const VALIDADE_SESSAO_HORAS = 4
const MAX_TENTATIVAS = 5

function hashCodigo(codigo: string, token: string): string {
  return createHash("sha256").update(`${codigo}:${token}`).digest("hex")
}

function conferirHash(codigo: string, token: string, hash: string): boolean {
  const a = Buffer.from(hashCodigo(codigo, token))
  const b = Buffer.from(hash)
  return a.length === b.length && timingSafeEqual(a, b)
}

// ── Identificação ────────────────────────────────────────────────────────────

/**
 * Abre a sessão. Devolve o token SEMPRE — mesmo sem inscrição alguma para o
 * e-mail —, e o código só quando há o que mostrar. Assim a tela não revela se
 * um e-mail existe ou não na base: quem digita o e-mail de outra pessoa recebe
 * a mesma resposta.
 */
export async function iniciarAcesso(
  email: string,
  tenantId: string
): Promise<{ token: string; codigo?: string; nome?: string | null }> {
  const service = createServiceClient()
  const normalizado = email.trim().toLowerCase()

  const { data: inscricoes } = await service
    .from("eventos_inscricoes")
    .select("nome")
    .eq("emp_proprietaria_id", tenantId)
    .eq("email", normalizado)
    .is("anonimizada_em", null)
    .limit(1)

  const { data: criada, error } = await service
    .from("eventos_titular_sessao")
    .insert({
      emp_proprietaria_id: tenantId,
      email: normalizado,
      codigo_expira_em: new Date(
        Date.now() + VALIDADE_CODIGO_MIN * 60_000
      ).toISOString(),
    })
    .select("id, token")
    .single()

  const token = (criada?.token as string) ?? ""
  if (!token) {
    // A tela mostra uma frase genérica; o motivo real fica no log, senão a
    // falha vira adivinhação (tabela ausente, RLS, coluna faltando).
    console.error("[eventos/titular] falha ao abrir sessão:", error)
    return { token: "" }
  }

  const temAlgo = (inscricoes ?? []).length > 0
  if (!temAlgo) return { token }

  const codigo = String(randomInt(0, 1_000_000)).padStart(6, "0")
  await service
    .from("eventos_titular_sessao")
    .update({ codigo_hash: hashCodigo(codigo, token) })
    .eq("id", criada!.id as string)

  return {
    token,
    codigo,
    nome: (inscricoes?.[0]?.nome as string | null) ?? null,
  }
}

export async function confirmarAcesso(
  token: string,
  codigo: string,
  tenantId: string
): Promise<{ erro?: string; ok?: boolean }> {
  const service = createServiceClient()
  const { data } = await service
    .from("eventos_titular_sessao")
    .select("id, codigo_hash, codigo_expira_em, codigo_tentativas, token_expira_em")
    .eq("emp_proprietaria_id", tenantId)
    .eq("token", token)
    .maybeSingle()
  if (!data) return { erro: "Sessão não encontrada. Comece de novo." }
  if (data.token_expira_em) return { ok: true }

  const tentativas = Number(data.codigo_tentativas ?? 0)
  if (tentativas >= MAX_TENTATIVAS) {
    return { erro: "Muitas tentativas. Comece de novo." }
  }
  if (
    !data.codigo_expira_em ||
    new Date(data.codigo_expira_em as string) < new Date()
  ) {
    return { erro: "O código expirou. Comece de novo." }
  }
  if (
    !data.codigo_hash ||
    !conferirHash(codigo.trim(), token, data.codigo_hash as string)
  ) {
    await service
      .from("eventos_titular_sessao")
      .update({ codigo_tentativas: tentativas + 1 })
      .eq("id", data.id as string)
    return { erro: "Código incorreto." }
  }

  await service
    .from("eventos_titular_sessao")
    .update({
      token_expira_em: new Date(
        Date.now() + VALIDADE_SESSAO_HORAS * 3_600_000
      ).toISOString(),
      codigo_hash: null,
    })
    .eq("id", data.id as string)

  return { ok: true }
}

export type SituacaoSessao =
  | "inexistente"
  | "aguardando"
  | "confirmada"
  | "expirada"

/**
 * Em que ponto a sessão está. A página precisa distinguir "ainda não digitou o
 * código" de "o acesso já venceu" — nos dois casos não há dado para mostrar,
 * mas a saída é diferente.
 */
export async function situacaoDaSessao(
  token: string,
  tenantId: string
): Promise<SituacaoSessao> {
  const service = createServiceClient()
  const { data } = await service
    .from("eventos_titular_sessao")
    .select("codigo_expira_em, token_expira_em")
    .eq("emp_proprietaria_id", tenantId)
    .eq("token", token)
    .maybeSingle()
  if (!data) return "inexistente"

  const agora = new Date()
  if (data.token_expira_em) {
    return new Date(data.token_expira_em as string) > agora
      ? "confirmada"
      : "expirada"
  }
  if (
    data.codigo_expira_em &&
    new Date(data.codigo_expira_em as string) > agora
  ) {
    return "aguardando"
  }
  return "expirada"
}

async function emailDaSessao(
  token: string,
  tenantId: string
): Promise<string | null> {
  const service = createServiceClient()
  const { data } = await service
    .from("eventos_titular_sessao")
    .select("email, token_expira_em")
    .eq("emp_proprietaria_id", tenantId)
    .eq("token", token)
    .maybeSingle()
  if (!data?.token_expira_em) return null
  if (new Date(data.token_expira_em as string) < new Date()) return null
  return (data.email as string) ?? null
}

// ── O que a pessoa vê ────────────────────────────────────────────────────────

export type DadoDoTitular = {
  inscricaoId: string
  eventoTitulo: string | null
  eventoInicio: string | null
  nome: string | null
  cpf: string | null
  telefone: string | null
  situacao: string
  temFoto: boolean
  fotoBiometrica: boolean
  acessoSituacao: string
  presencas: number
  inscritaEm: string
}

export async function dadosDoTitular(
  token: string,
  tenantId: string
): Promise<{ email: string; dados: DadoDoTitular[] } | null> {
  const email = await emailDaSessao(token, tenantId)
  if (!email) return null

  const service = createServiceClient()
  const { config } = await obterConfig()

  const { data: inscricoes } = await service
    .from("eventos_inscricoes")
    .select(
      "id, evento_id, nome, cpf, telefone, situacao, foto_url, acesso_situacao, created_at"
    )
    .eq("emp_proprietaria_id", tenantId)
    .eq("email", email)
    .is("anonimizada_em", null)
    .order("created_at", { ascending: false })

  const linhas = inscricoes ?? []
  if (linhas.length === 0) return { email, dados: [] }

  const { data: eventos } = await service
    .from("eventos")
    .select("id, titulo, inicio")
    .in(
      "id",
      linhas.map((i) => i.evento_id as string)
    )
  const porEvento = new Map(
    (eventos ?? []).map((e) => [
      e.id as string,
      { titulo: e.titulo as string | null, inicio: e.inicio as string | null },
    ])
  )

  const { data: presencas } = await service
    .from("eventos_presencas")
    .select("inscricao_id")
    .in(
      "inscricao_id",
      linhas.map((i) => i.id as string)
    )
  const contagem = new Map<string, number>()
  for (const p of presencas ?? []) {
    const id = p.inscricao_id as string
    contagem.set(id, (contagem.get(id) ?? 0) + 1)
  }

  return {
    email,
    dados: linhas.map((i) => {
      const ev = porEvento.get(i.evento_id as string)
      return {
        inscricaoId: i.id as string,
        eventoTitulo: ev?.titulo ?? null,
        eventoInicio: ev?.inicio ?? null,
        nome: (i.nome as string | null) ?? null,
        cpf: (i.cpf as string | null) ?? null,
        telefone: (i.telefone as string | null) ?? null,
        situacao: (i.situacao as string) ?? "pendente",
        temFoto: i.foto_url !== null,
        fotoBiometrica:
          i.foto_url !== null && config.modo_foto === "biometrica",
        acessoSituacao: (i.acesso_situacao as string) ?? "nao_aplica",
        presencas: contagem.get(i.id as string) ?? 0,
        inscritaEm: i.created_at as string,
      }
    }),
  }
}

export type ReciboExclusao = {
  em: string
  registros: number
  remocaoAcessoPendente: boolean
}

/**
 * Comprovante da exclusão já feita. Sem ele, quem exclui recebe de volta uma
 * lista vazia e nenhuma palavra — fica sem saber se deu certo e sem prova de
 * ter exercido o direito.
 */
export async function reciboDeExclusao(
  token: string,
  tenantId: string
): Promise<ReciboExclusao | null> {
  const email = await emailDaSessao(token, tenantId)
  if (!email) return null

  const service = createServiceClient()
  const { data } = await service
    .from("lgpd_solicitacoes")
    .select("concluido_em, registros_anonimizados, acesso_remocao_pendente")
    .eq("emp_proprietaria_id", tenantId)
    .eq("email_titular", email)
    .eq("tipo", "exclusao")
    .not("concluido_em", "is", null)
    .order("concluido_em", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!data) return null

  return {
    em: data.concluido_em as string,
    registros: Number(data.registros_anonimizados ?? 0),
    remocaoAcessoPendente: Boolean(data.acesso_remocao_pendente),
  }
}

// ── Correção ─────────────────────────────────────────────────────────────────

export async function corrigirDados(
  token: string,
  tenantId: string,
  campos: { nome?: string; telefone?: string }
): Promise<{ erro?: string; ok?: boolean }> {
  const email = await emailDaSessao(token, tenantId)
  if (!email) return { erro: "Sessão expirada. Comece de novo." }

  const mudancas: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (campos.nome) mudancas.nome = campos.nome
  if (campos.telefone !== undefined) mudancas.telefone = campos.telefone || null
  if (Object.keys(mudancas).length === 1) return { erro: "Nada a corrigir." }

  const service = createServiceClient()
  // Guarda uma inscrição como âncora do pedido: é a marca que sobrevive caso
  // a identificação seja removida depois.
  const { data: alvos } = await service
    .from("eventos_inscricoes")
    .select("id")
    .eq("emp_proprietaria_id", tenantId)
    .eq("email", email)
    .is("anonimizada_em", null)
    .limit(1)

  // Corrige em TODAS as inscrições daquele e-mail: para a pessoa é um cadastro
  // só, mesmo que o sistema guarde uma linha por evento.
  const { error } = await service
    .from("eventos_inscricoes")
    .update(mudancas)
    .eq("emp_proprietaria_id", tenantId)
    .eq("email", email)
    .is("anonimizada_em", null)
  if (error) return { erro: "Não foi possível salvar a correção." }

  await service.from("lgpd_solicitacoes").insert({
    emp_proprietaria_id: tenantId,
    tipo: "correcao",
    email_titular: email,
    inscricao_id: (alvos ?? [])[0]?.id ?? null,
    solicitado_em: new Date().toISOString(),
    concluido_em: new Date().toISOString(),
    observacao: "Correção feita pelo próprio titular no canal de eventos.",
  })

  return { ok: true }
}

// ── Exclusão ─────────────────────────────────────────────────────────────────

export type ResultadoExclusao = {
  erro?: string
  anonimizadas?: number
  fotosApagadas?: number
  remocaoAcessoPendente?: boolean
}

/**
 * Exclusão a pedido do titular.
 *
 * ANONIMIZA em vez de apagar a linha: o registro de presença sustenta os
 * indicadores do evento ("quantos vieram"), e apagá-lo reescreveria a história.
 * O que some é a identificação — nome, CPF, e-mail, telefone e a foto.
 *
 * A foto é REMOVIDA DO BUCKET aqui mesmo. Já a remoção no sistema de controle
 * de acesso é manual e fora do Confluir: por isso a solicitação nasce com
 * `acesso_remocao_pendente`, e alguém precisa marcar como feita. Sem isso, o
 * termo prometeria algo que não conseguimos executar.
 */
export async function excluirDadosDoTitular(
  token: string,
  tenantId: string,
  motivo: string | null
): Promise<ResultadoExclusao> {
  const email = await emailDaSessao(token, tenantId)
  if (!email) return { erro: "Sessão expirada. Comece de novo." }

  const service = createServiceClient()
  const { data: inscricoes } = await service
    .from("eventos_inscricoes")
    .select("id, foto_url, acesso_situacao")
    .eq("emp_proprietaria_id", tenantId)
    .eq("email", email)
    .is("anonimizada_em", null)

  const linhas = inscricoes ?? []
  if (linhas.length === 0) return { erro: "Nada a excluir." }

  // Foto: sai do bucket de fato, não só da referência.
  const caminhos = linhas
    .map((i) => i.foto_url as string | null)
    .filter((c): c is string => Boolean(c))
  if (caminhos.length > 0) {
    await service.storage.from("eventos").remove(caminhos)
  }

  // Quem chegou a ir para o controle de acesso precisa de remoção lá também.
  const foiParaAcesso = linhas.some(
    (i) => i.acesso_situacao === "enviado" || i.acesso_situacao === "pendente"
  )

  const agora = new Date().toISOString()
  await service
    .from("eventos_inscricoes")
    .update({
      nome: null,
      cpf: null,
      email: null,
      telefone: null,
      foto_url: null,
      foto_expurgada_em: agora,
      anonimizada_em: agora,
      acesso_situacao: foiParaAcesso ? "removido" : "nao_aplica",
      acesso_removido_em: foiParaAcesso ? agora : null,
      updated_at: agora,
    })
    .in(
      "id",
      linhas.map((i) => i.id as string)
    )

  // As respostas dos campos extras podem conter dado pessoal — vão junto.
  await service
    .from("eventos_inscricao_respostas")
    .delete()
    .in(
      "inscricao_id",
      linhas.map((i) => i.id as string)
    )

  await service.from("lgpd_solicitacoes").insert({
    emp_proprietaria_id: tenantId,
    tipo: "exclusao",
    email_titular: email,
    // Marca que sobrevive à remoção do e-mail: é por ela que o painel
    // continua listando o pedido depois de a identificação sair.
    inscricao_id: linhas[0]?.id ?? null,
    solicitado_em: agora,
    concluido_em: agora,
    registros_anonimizados: linhas.length,
    registros_retidos: 0,
    base_legal_retencao:
      "Registro de presença mantido de forma anonimizada para indicadores do evento (art. 16, II e IV).",
    acesso_remocao_pendente: foiParaAcesso,
    observacao: motivo,
  })

  return {
    anonimizadas: linhas.length,
    fotosApagadas: caminhos.length,
    remocaoAcessoPendente: foiParaAcesso,
  }
}
