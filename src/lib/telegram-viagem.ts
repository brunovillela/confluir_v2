import "server-only"

import { listarDepartamentos } from "@/lib/db/compras"
import { hojeSP } from "@/lib/db/comum"
import { quadroParaDiaria } from "@/lib/db/diarias-diretoria"
import type { UsuarioTelegram } from "@/lib/db/telegram"
import { buscarViagem, criarViagem, minhasViagens, obterConfigViagens } from "@/lib/db/viagens"
import { avisarEquipeNovaViagem } from "@/lib/db/viagens-atendimento"
import { createAdminClient } from "@/lib/supabase/admin"
import { editarMensagemTelegram, enviarTelegram, responderCallbackTelegram } from "@/lib/telegram"
import {
  dataCurta,
  iniciarViagemBot,
  itensDaViagemBot,
  perguntaDoPasso,
  PREFIXO_CALLBACK_VIAGEM,
  responderViagemBot,
  resumoViagemBot,
  type ContextoViagem,
  type EntradaViagem,
  type EstadoViagemBot,
  type PassoViagem,
} from "@/lib/telegram-viagem-fluxo"
import { tenantAtual } from "@/lib/tenant"
import { origemAtual } from "@/lib/tenant-url"
import { ROTULO_SITUACAO_VIAGEM, validarItensViagem } from "@/lib/viagens-constantes"

/**
 * /viagem no bot do Telegram (31/10/2026): funcionário com vínculo em vigor ou
 * diretor em exercício pede passagem e hospedagem numa conversa guiada
 * (roteiro em lib/telegram-viagem-fluxo.ts). O pedido entra pela MESMA
 * criarViagem do painel — mesma tabela, mesmo aviso à equipe de Viagens, sem
 * aprovação prévia. O passo de cada conversa fica em
 * `viagens_telegram_conversas` (30 min), porque cada mensagem pode cair numa
 * instância diferente.
 *
 * Como no /aprovar, o tenant tem de ser o da requisição do webhook: as
 * funções de Viagens leem o tenant pelo endereço; em outra entidade o bot
 * manda usar o painel.
 */

const VALIDADE_MS = 30 * 60_000
const TABELA = "viagens_telegram_conversas"

type Conversa = EstadoViagemBot

async function lerConversa(chatId: string, u: UsuarioTelegram): Promise<Conversa | null> {
  const svc = await createAdminClient()
  const { data, error } = await svc
    .from(TABELA)
    .select("usuario_id, emp_proprietaria_id, passo, dados, expira_em")
    .eq("chat_id", chatId)
    .maybeSingle()
  if (error || !data) return null
  if (data.usuario_id !== u.id || data.emp_proprietaria_id !== u.emp) return null
  if (new Date(String(data.expira_em)).getTime() < Date.now()) {
    await apagarConversa(chatId)
    return null
  }
  return { passo: data.passo as PassoViagem, dados: data.dados as Conversa["dados"] }
}

async function gravarConversa(chatId: string, u: UsuarioTelegram, c: Conversa): Promise<boolean> {
  const svc = await createAdminClient()
  const { error } = await svc.from(TABELA).upsert({
    chat_id: chatId,
    emp_proprietaria_id: u.emp,
    usuario_id: u.id,
    passo: c.passo,
    dados: c.dados,
    atualizado_em: new Date().toISOString(),
    expira_em: new Date(Date.now() + VALIDADE_MS).toISOString(),
  })
  if (error) console.error("Conversa de viagem no Telegram:", error.message)
  return !error
}

/** Apaga e diz se havia linha — o "Confirmar" tocado duas vezes grava uma vez só. */
async function apagarConversa(chatId: string): Promise<boolean> {
  const svc = await createAdminClient()
  const { data } = await svc.from(TABELA).delete().eq("chat_id", chatId).select("chat_id")
  return (data ?? []).length > 0
}

async function contexto(passo: PassoViagem): Promise<ContextoViagem> {
  const precisaDeptos = passo === "departamento" || passo === "confirmar"
  const [departamentos, config] = await Promise.all([
    precisaDeptos ? listarDepartamentos().catch(() => []) : Promise.resolve([]),
    passo === "confirmar" ? obterConfigViagens().catch(() => null) : Promise.resolve(null),
  ])
  return {
    hoje: hojeSP(),
    departamentos: departamentos.map((d) => ({ id: String(d.id), nome: String(d.nome) })),
    antecedenciaDias: config?.antecedenciaDias ?? null,
  }
}

async function perguntar(chatId: string, c: Conversa, prefixo?: string): Promise<void> {
  const p = perguntaDoPasso(c, await contexto(c.passo))
  await enviarTelegram({
    chatId,
    texto: prefixo ? `${prefixo}\n\n${p.texto}` : p.texto,
    botoes: p.botoes,
  })
}

/** Por que esta pessoa não pede viagem por aqui (ou null, se pode). */
async function impedimento(u: UsuarioTelegram): Promise<string | null> {
  if (!u.emp) return "Não consegui identificar sua entidade. Refaça o vínculo em Meu perfil → Telegram."
  if (u.emp !== (await tenantAtual())) return "Para pedir viagem, use o painel da sua entidade (Meu perfil → Viagens)."
  return null
}

/** /viagem — começa (ou recomeça) o pedido. */
export async function iniciarPedidoViagem(chatId: string, u: UsuarioTelegram): Promise<void> {
  const barrado = await impedimento(u)
  if (barrado) {
    await enviarTelegram({ chatId, texto: barrado })
    return
  }
  const quadro = await quadroParaDiaria(u.id).catch(() => null)
  if (!quadro) {
    await enviarTelegram({
      chatId,
      texto: "Só funcionários com vínculo em vigor ou diretores em exercício pedem viagem. Pedido para convidado é com a equipe de Viagens.",
    })
    return
  }
  const c = iniciarViagemBot(quadro.quadro, quadro.departamentoId)
  if (!(await gravarConversa(chatId, u, c))) {
    await enviarTelegram({ chatId, texto: "O pedido de viagem pelo Telegram ainda não está disponível. Use o painel → Meu perfil → Viagens." })
    return
  }
  await perguntar(chatId, c, "Vou fazer umas perguntas rápidas. A qualquer momento, /cancelar desiste.")
}

async function aplicar(chatId: string, u: UsuarioTelegram, c: Conversa, entrada: EntradaViagem): Promise<void> {
  const ctx = await contexto(c.passo)
  const r = responderViagemBot(c, entrada, ctx)
  if ("cancelar" in r) {
    await apagarConversa(chatId)
    await enviarTelegram({ chatId, texto: "Pedido de viagem cancelado. Nada foi enviado." })
    return
  }
  if ("erro" in r) {
    const p = perguntaDoPasso(c, ctx)
    await enviarTelegram({ chatId, texto: `${r.erro}\n\n${p.texto}`, botoes: p.botoes })
    return
  }
  if ("confirmar" in r) {
    await concluir(chatId, u, c, ctx)
    return
  }
  await gravarConversa(chatId, u, r.estado)
  await perguntar(chatId, r.estado)
}

async function concluir(chatId: string, u: UsuarioTelegram, c: Conversa, ctx: ContextoViagem): Promise<void> {
  const lidos = validarItensViagem(itensDaViagemBot(c.dados), ctx.hoje)
  if ("erro" in lidos) {
    await apagarConversa(chatId)
    await enviarTelegram({ chatId, texto: `${lidos.erro} Mande /viagem para começar de novo.` })
    return
  }
  // Quem apagar a linha é quem grava: dois toques em Confirmar dão um pedido só.
  if (!(await apagarConversa(chatId))) return

  // A régua pode ter mudado no meio da conversa (vínculo encerrado).
  const quadro = await quadroParaDiaria(u.id).catch(() => null)
  if (!quadro) {
    await enviarTelegram({ chatId, texto: "Só funcionários com vínculo em vigor ou diretores em exercício pedem viagem." })
    return
  }
  const { erro, id } = await criarViagem({
    beneficiarioTipo: quadro.quadro,
    beneficiarioUsuarioId: u.id,
    solicitanteId: u.id,
    departamentoId: c.dados.departamentoId ?? null,
    eventoId: null,
    motivo: c.dados.motivo ?? "",
    itens: lidos.itens,
  })
  if (erro || !id) {
    await gravarConversa(chatId, u, c)
    await enviarTelegram({
      chatId,
      texto: `Não consegui registrar o pedido: ${erro ?? "sem retorno"}. Tente de novo.`,
      botoes: perguntaDoPasso(c, ctx).botoes,
    })
    return
  }
  await avisarEquipeNovaViagem(id).catch((e) => console.error("Aviso de viagem nova (Telegram):", e))
  const v = await buscarViagem(id).catch(() => null)
  const link = `${await origemAtual()}/painel/perfil/viagens/${id}`
  await enviarTelegram({
    chatId,
    texto: [
      `✅ Pedido de viagem${v?.numero ? ` nº ${v.numero}` : ""} enviado à equipe de Viagens.`,
      "",
      resumoViagemBot(c.dados, { ...ctx, antecedenciaDias: null }),
      "",
      "Você recebe aviso aqui e por e-mail quando a reserva sair. Para acompanhar ou cancelar:",
      link,
    ].join("\n"),
  })
}

/**
 * Texto digitado com um pedido de viagem em andamento: vira a resposta do
 * passo atual. Comandos (/…) seguem para o bot, salvo o /cancelar.
 */
export async function tratarTextoViagem(chatId: string, texto: string, u: UsuarioTelegram): Promise<boolean> {
  if (texto.startsWith("/") && texto !== "/cancelar") return false
  const c = await lerConversa(chatId, u)
  if (!c) return false
  await aplicar(chatId, u, c, { texto })
  return true
}

/** Botão do pedido de viagem (callback "vg:…"). */
export async function tratarCallbackViagem(p: {
  callbackId: string
  chatId: string
  messageId: number | null
  textoDaMensagem: string | null
  dado: string
  u: UsuarioTelegram
}): Promise<boolean> {
  if (!p.dado.startsWith(PREFIXO_CALLBACK_VIAGEM)) return false
  const barrado = await impedimento(p.u)
  if (barrado) {
    await responderCallbackTelegram(p.callbackId, barrado, true)
    return true
  }
  const c = await lerConversa(p.chatId, p.u)
  if (!c) {
    await responderCallbackTelegram(p.callbackId, "Este pedido expirou. Mande /viagem para começar de novo.", true)
    return true
  }
  await responderCallbackTelegram(p.callbackId)
  // Tira os botões da pergunta respondida (não dá para tocar duas vezes).
  if (p.messageId !== null && p.textoDaMensagem) {
    await editarMensagemTelegram(p.chatId, p.messageId, escapar(p.textoDaMensagem))
  }
  await aplicar(p.chatId, p.u, c, { botao: p.dado.slice(PREFIXO_CALLBACK_VIAGEM.length) })
  return true
}

function escapar(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

/** /viagens — os últimos pedidos em que a pessoa viaja. */
export async function responderMinhasViagens(chatId: string, u: UsuarioTelegram): Promise<void> {
  const barrado = await impedimento(u)
  if (barrado) {
    await enviarTelegram({ chatId, texto: barrado })
    return
  }
  const { disponivel, viagens } = await minhasViagens(u.id)
  if (!disponivel) {
    await enviarTelegram({ chatId, texto: "Viagens indisponíveis no momento. Tente pelo painel." })
    return
  }
  if (viagens.length === 0) {
    await enviarTelegram({ chatId, texto: "Você não tem pedidos de viagem. Para pedir, mande /viagem." })
    return
  }
  const linhas = viagens.slice(0, 5).map((v) => {
    const quando = v.inicio ? dataCurta(v.inicio.slice(0, 10)) : "—"
    const itens = v.itens
      .map((i) => (i.tipo === "hospedagem" ? `hotel em ${i.cidade ?? "—"}` : `${i.origem ?? "—"} → ${i.destino ?? "—"}`))
      .join("; ")
    return `• <b>nº ${v.numero ?? "—"}</b> — ${quando} — ${escapar(itens).slice(0, 160)} — <b>${ROTULO_SITUACAO_VIAGEM[v.situacao]}</b>`
  })
  await enviarTelegram({
    chatId,
    texto: [
      `Seus últimos pedidos de viagem (${Math.min(5, viagens.length)} de ${viagens.length}):`,
      "",
      ...linhas,
      "",
      `Detalhes e cancelamento: ${await origemAtual()}/painel/perfil/viagens`,
    ].join("\n"),
  })
}
