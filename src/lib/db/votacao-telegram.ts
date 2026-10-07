import "server-only"

import { randomBytes } from "node:crypto"

import { esquemaAusente } from "@/lib/db/comum"
import { createServiceClient } from "@/lib/supabase/admin"

/**
 * Confirmação pelo TELEGRAM no link único de votação (07/10/2026) — a
 * alternativa ao código por e-mail, que os filtros corporativos retêm.
 *
 *  1. a página cria um token (15 min, uso único) e mostra o botão
 *     t.me/<bot>?start=lu_<token>;
 *  2. a pessoa aperta Iniciar → o webhook liga o token ao chat e pede o número
 *     ("Compartilhar meu número");
 *  3. ela compartilha o PRÓPRIO contato (o Telegram confirmou o número por
 *     SMS) → o token fica confirmado;
 *  4. a página, que consulta a cada poucos segundos, abre a sessão.
 *
 * O webhook atende todas as entidades (um bot só): o token carrega a entidade
 * e tudo aqui usa o service role (tabela com RLS e sem política).
 */

export const PREFIXO_START = "lu_"
const VALIDADE_MS = 15 * 60 * 1000

function txt(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null
}

/** Cria a confirmação e devolve o token (null = SQL não rodado). */
export async function criarConfirmacaoTelegram(empId: string): Promise<string | null> {
  const token = randomBytes(18).toString("base64url")
  const svc = createServiceClient()
  const { error } = await svc.from("votacao_telegram_confirmacoes").insert({
    emp_proprietaria_id: empId,
    token,
    expira_em: new Date(Date.now() + VALIDADE_MS).toISOString(),
  })
  if (error) {
    if (!esquemaAusente(error)) console.error("confirmação Telegram:", error.message)
    return null
  }
  return token
}

/** /start lu_<token>: liga o token ao chat. */
export async function iniciarConfirmacaoPeloBot(
  token: string,
  chatId: string
): Promise<"ok" | "invalido" | "expirado" | "usado"> {
  const svc = createServiceClient()
  const { data } = await svc
    .from("votacao_telegram_confirmacoes")
    .select("id, expira_em, chat_id, confirmado_em")
    .eq("token", token)
    .maybeSingle()
  if (!data) return "invalido"
  if (new Date(String(data.expira_em)).getTime() < Date.now()) return "expirado"
  if (data.confirmado_em || (data.chat_id && data.chat_id !== chatId)) return "usado"
  await svc.from("votacao_telegram_confirmacoes").update({ chat_id: chatId }).eq("id", data.id)
  return "ok"
}

/**
 * Contato compartilhado: só vale o PRÓPRIO número (contact.user_id = quem
 * mandou). Confirma a confirmação pendente mais recente daquele chat.
 * `null` = não havia confirmação pendente (o webhook segue o fluxo normal).
 */
export async function registrarContatoPeloBot(dados: {
  chatId: string
  telefone: string
  contatoDoProprio: boolean
  nome: string | null
}): Promise<"ok" | "outro_contato" | "expirado" | null> {
  const svc = createServiceClient()
  const { data } = await svc
    .from("votacao_telegram_confirmacoes")
    .select("id, expira_em")
    .eq("chat_id", dados.chatId)
    .is("confirmado_em", null)
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!data) return null
  if (new Date(String(data.expira_em)).getTime() < Date.now()) return "expirado"
  if (!dados.contatoDoProprio) return "outro_contato"
  const telefone = dados.telefone.replace(/[^\d+]/g, "")
  await svc
    .from("votacao_telegram_confirmacoes")
    .update({ telefone, nome_telegram: dados.nome, confirmado_em: new Date().toISOString() })
    .eq("id", data.id)
  return "ok"
}

/**
 * Consulta da página: a confirmação deste token já foi feita? Marca como
 * usada ao devolver a confirmação (uso único).
 */
export async function consumirConfirmacaoTelegram(
  token: string,
  empId: string
): Promise<{ situacao: "pendente" | "aguardando_numero" | "expirado" | "invalido" } | { situacao: "confirmado"; chatId: string; telefone: string }> {
  const svc = createServiceClient()
  const { data } = await svc
    .from("votacao_telegram_confirmacoes")
    .select("id, emp_proprietaria_id, expira_em, chat_id, telefone, confirmado_em, usado_em")
    .eq("token", token)
    .maybeSingle()
  if (!data || data.emp_proprietaria_id !== empId || data.usado_em) return { situacao: "invalido" }
  if (data.confirmado_em && txt(data.chat_id) && txt(data.telefone)) {
    await svc
      .from("votacao_telegram_confirmacoes")
      .update({ usado_em: new Date().toISOString() })
      .eq("id", data.id)
      .is("usado_em", null)
    return { situacao: "confirmado", chatId: String(data.chat_id), telefone: String(data.telefone) }
  }
  if (new Date(String(data.expira_em)).getTime() < Date.now()) return { situacao: "expirado" }
  return { situacao: data.chat_id ? "aguardando_numero" : "pendente" }
}

/** Tentativas de cadastro que não conferiram, somadas por chat (trava do link único). */
export async function falhasDoChat(chatId: string): Promise<number> {
  const svc = createServiceClient()
  const { data } = await svc.from("votacao_telegram_confirmacoes").select("falhas_cadastro").eq("chat_id", chatId)
  return (data ?? []).reduce((soma, r) => soma + Number(r.falhas_cadastro ?? 0), 0)
}

export async function registrarFalhaDoChat(chatId: string): Promise<void> {
  const svc = createServiceClient()
  const { data } = await svc
    .from("votacao_telegram_confirmacoes")
    .select("id, falhas_cadastro")
    .eq("chat_id", chatId)
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (data) {
    await svc
      .from("votacao_telegram_confirmacoes")
      .update({ falhas_cadastro: Number(data.falhas_cadastro ?? 0) + 1 })
      .eq("id", data.id)
  }
}
