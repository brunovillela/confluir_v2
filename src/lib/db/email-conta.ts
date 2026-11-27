import "server-only"

import { createHash, randomBytes } from "node:crypto"

import { esquemaAusente, nomesDosUsuarios, texto } from "@/lib/db/comum"
import type { Credencial, Provedor } from "@/lib/email-provedores"
import { cifrarSegredo, decifrarSegredoDetalhado, segredosConfigurados } from "@/lib/segredos"
import { createServiceClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * CONTA PRÓPRIA DE E-MAIL DA ENTIDADE (Gestão › E-mail, 27/11/2026 — fase 4).
 * A chave de API do Brevo ou do Resend da entidade fica em email_config,
 * cifrada como a chave de IA (lib/segredos.ts), com o remetente próprio, o
 * nome de exibição e o endereço de resposta. lib/email.ts pede a conta aqui a
 * cada envio (em memória por um minuto). Sem conta própria, ou com a chave
 * ilegível, o e-mail sai pela conta da plataforma.
 */

const COLUNAS =
  "provedor, chave_cifrada, chave_versao, chave_final, chave_definida_em, chave_definida_por, chave_testada_em, chave_teste_erro, remetente_email, remetente_nome, responder_para, webhook_token_final"

type Linha = Record<string, unknown>

/** O que lib/email.ts precisa para mandar pela conta da entidade. */
export type ContaEnvio = {
  credencial: Credencial | null
  remetenteEmail: string | null
  remetenteNome: string | null
  responderPara: string | null
}

const SEM_CONTA: ContaEnvio = { credencial: null, remetenteEmail: null, remetenteNome: null, responderPara: null }
const cache = new Map<string, { valor: ContaEnvio; ate: number }>()

async function linha(emp: string): Promise<{ disponivel: boolean; l: Linha | null }> {
  try {
    const { data, error } = await createServiceClient().from("email_config").select(COLUNAS).eq("emp_proprietaria_id", emp).maybeSingle()
    if (error) return { disponivel: !esquemaAusente(error), l: null }
    return { disponivel: true, l: (data as Linha | null) ?? null }
  } catch {
    return { disponivel: false, l: null }
  }
}

function provedorDe(v: unknown): Provedor | null {
  return v === "brevo" || v === "resend" ? v : null
}

export async function contaEnvioDaEntidade(emp: string): Promise<ContaEnvio> {
  const c = cache.get(emp)
  if (c && c.ate > Date.now()) return c.valor
  let valor = SEM_CONTA
  const { l } = await linha(emp)
  const provedor = provedorDe(l?.provedor)
  if (l && provedor && l.chave_cifrada) {
    const chave = decifrarSegredoDetalhado(String(l.chave_cifrada), Number(l.chave_versao ?? 0), emp).texto
    valor = {
      credencial: chave ? { provedor, chave } : null,
      remetenteEmail: texto(l.remetente_email),
      remetenteNome: texto(l.remetente_nome),
      responderPara: texto(l.responder_para),
    }
  }
  cache.set(emp, { valor, ate: Date.now() + 60_000 })
  return valor
}

export function esquecerContaEmail(emp: string): void {
  cache.delete(emp)
}

/** A conta da entidade recusou a chave num envio: marca o erro (para a tela) e esquece a conta por um minuto. */
export async function marcarChaveEmailRecusada(emp: string, erro: string): Promise<void> {
  try {
    await createServiceClient()
      .from("email_config")
      .update({ chave_teste_erro: erro.slice(0, 300), chave_testada_em: new Date().toISOString() })
      .eq("emp_proprietaria_id", emp)
  } catch {
    // Acessório.
  }
}

// ── Gestão ──────────────────────────────────────────────────────────────────

export type ContaEmailPublica = {
  disponivel: boolean
  provedor: Provedor | null
  temChave: boolean
  chaveIlegivel: boolean
  chaveFinal: string | null
  chaveDefinidaEm: string | null
  chaveDefinidaPor: string | null
  chaveTestadaEm: string | null
  chaveTesteErro: string | null
  remetenteEmail: string | null
  remetenteNome: string | null
  responderPara: string | null
  webhookFinal: string | null
  segredosConfigurados: boolean
}

export async function obterContaEmail(): Promise<ContaEmailPublica> {
  const emp = await tenantAtual()
  const { disponivel, l } = await linha(emp)
  const temChave = Boolean(l?.chave_cifrada)
  const legivel = temChave ? decifrarSegredoDetalhado(String(l!.chave_cifrada), Number(l!.chave_versao ?? 0), emp).texto !== null : false
  const quem = l?.chave_definida_por ? String(l.chave_definida_por) : null
  const nomes = quem ? await nomesDosUsuarios([quem]) : new Map<string, string>()
  return {
    disponivel,
    provedor: provedorDe(l?.provedor),
    temChave,
    chaveIlegivel: temChave && !legivel,
    chaveFinal: texto(l?.chave_final),
    chaveDefinidaEm: texto(l?.chave_definida_em),
    chaveDefinidaPor: quem ? (nomes.get(quem) ?? null) : null,
    chaveTestadaEm: texto(l?.chave_testada_em),
    chaveTesteErro: texto(l?.chave_teste_erro),
    remetenteEmail: texto(l?.remetente_email),
    remetenteNome: texto(l?.remetente_nome),
    responderPara: texto(l?.responder_para),
    webhookFinal: texto(l?.webhook_token_final),
    segredosConfigurados: segredosConfigurados(),
  }
}

/** A chave decifrada da entidade (para testar e listar domínios); null sem chave legível. */
export async function credencialDaEntidade(): Promise<Credencial | null> {
  const emp = await tenantAtual()
  const { l } = await linha(emp)
  const provedor = provedorDe(l?.provedor)
  if (!l?.chave_cifrada || !provedor) return null
  const chave = decifrarSegredoDetalhado(String(l.chave_cifrada), Number(l.chave_versao ?? 0), emp).texto
  return chave ? { provedor, chave } : null
}

async function gravar(campos: Linha, usuarioId: string): Promise<{ erro?: string }> {
  const emp = await tenantAtual()
  const { error } = await createServiceClient()
    .from("email_config")
    .upsert({ emp_proprietaria_id: emp, ...campos, atualizado_por: usuarioId, updated_at: new Date().toISOString() }, { onConflict: "emp_proprietaria_id" })
  if (error) return { erro: esquemaAusente(error) ? "Falta aplicar a migração da conta própria de e-mail." : `Falha ao salvar: ${error.message}` }
  esquecerContaEmail(emp)
  return {}
}

async function registrarEvento(acao: string, detalhe: string | null, usuarioId: string): Promise<void> {
  await createServiceClient().from("gestao_eventos").insert({ emp_proprietaria_id: await tenantAtual(), usuario_id: usuarioId, area: "email", acao, detalhe })
}

/** Grava a chave (já testada pela action) com o remetente próprio. */
export async function salvarContaEmail(
  p: { provedor: Provedor; chave: string; remetenteEmail: string; remetenteNome: string | null; responderPara: string | null },
  usuarioId: string
): Promise<{ erro?: string }> {
  if (!segredosConfigurados()) return { erro: "O servidor não tem chave de cifra (SEGREDOS_CHAVE). Sem ela a chave não pode ser guardada com segurança." }
  const emp = await tenantAtual()
  const { cifrado, versao } = cifrarSegredo(p.chave, emp)
  const agora = new Date().toISOString()
  const r = await gravar(
    {
      provedor: p.provedor,
      chave_cifrada: cifrado,
      chave_versao: versao,
      chave_final: p.chave.slice(-4),
      chave_definida_em: agora,
      chave_definida_por: usuarioId,
      chave_testada_em: agora,
      chave_teste_erro: null,
      remetente_email: p.remetenteEmail,
      remetente_nome: p.remetenteNome,
      responder_para: p.responderPara,
    },
    usuarioId
  )
  if (!r.erro) await registrarEvento("email_conta", `conta ${p.provedor} (chave terminada em ${p.chave.slice(-4)}), remetente ${p.remetenteEmail}`, usuarioId)
  return r
}

/** Só o remetente, o nome e a resposta (a chave fica). */
export async function salvarRemetenteEmail(
  p: { remetenteEmail: string; remetenteNome: string | null; responderPara: string | null },
  usuarioId: string
): Promise<{ erro?: string }> {
  const r = await gravar({ remetente_email: p.remetenteEmail, remetente_nome: p.remetenteNome, responder_para: p.responderPara }, usuarioId)
  if (!r.erro) await registrarEvento("email_remetente", `remetente ${p.remetenteEmail}`, usuarioId)
  return r
}

export async function registrarTesteContaEmail(erro: string | null): Promise<void> {
  const emp = await tenantAtual()
  await createServiceClient().from("email_config").update({ chave_testada_em: new Date().toISOString(), chave_teste_erro: erro }).eq("emp_proprietaria_id", emp)
  esquecerContaEmail(emp)
}

/** Volta para a conta da plataforma: apaga a chave, o remetente e o token do webhook. */
export async function removerContaEmail(usuarioId: string): Promise<{ erro?: string }> {
  const atual = await obterContaEmail()
  const r = await gravar(
    {
      provedor: null,
      chave_cifrada: null,
      chave_versao: null,
      chave_final: null,
      chave_definida_em: null,
      chave_definida_por: null,
      chave_testada_em: null,
      chave_teste_erro: null,
      remetente_email: null,
      remetente_nome: null,
      responder_para: null,
      webhook_token_hash: null,
      webhook_token_final: null,
    },
    usuarioId
  )
  if (!r.erro) await registrarEvento("email_conta_removida", atual.chaveFinal ? `chave terminada em ${atual.chaveFinal}` : null, usuarioId)
  return r
}

// ── Token do webhook da conta da entidade ───────────────────────────────────

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

/** Gera um token novo (o anterior para de valer) e o devolve uma única vez. */
export async function gerarTokenWebhookEmail(usuarioId: string): Promise<{ erro?: string; token?: string }> {
  const token = `whk_${randomBytes(24).toString("hex")}`
  const r = await gravar({ webhook_token_hash: hashToken(token), webhook_token_final: token.slice(-4) }, usuarioId)
  if (r.erro) return r
  await registrarEvento("email_webhook", `token terminado em ${token.slice(-4)}`, usuarioId)
  return { token }
}

/** Webhook: de que entidade é este token (null = de nenhuma). */
export async function entidadeDoTokenWebhook(token: string): Promise<string | null> {
  if (!token.startsWith("whk_")) return null
  try {
    const { data } = await createServiceClient().from("email_config").select("emp_proprietaria_id").eq("webhook_token_hash", hashToken(token)).maybeSingle()
    return data?.emp_proprietaria_id ? String(data.emp_proprietaria_id) : null
  } catch {
    return null
  }
}
