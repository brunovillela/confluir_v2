import "server-only"

import { alcadaDoUsuario, avaliarOrdemCompra, listarOrdensParaAvaliacao } from "@/lib/db/compras"
import { permissoesPorUsuario, type UsuarioTelegram } from "@/lib/db/telegram"
import { formatarMoeda } from "@/lib/formato"
import { podeAcessar } from "@/lib/permissoes"
import { editarMensagemTelegram, enviarTelegram, responderCallbackTelegram } from "@/lib/telegram"
import { tenantAtual } from "@/lib/tenant"

/**
 * TELEGRAM TRANSACIONAL (onda 4, D3): aprovar ou devolver ordens de pagamento
 * dentro da alçada sem sair da conversa. O aviso de "ordem aguarda sua
 * autorização" já sai com os botões (lib/db/avisos.ts); o comando /aprovar
 * lista as ordens na alçada com os mesmos botões. Devolver pede o motivo: o
 * bot guarda a ordem escolhida e usa a próxima mensagem da pessoa como
 * motivo (ou `/devolver <id> <motivo>` de uma vez).
 *
 * A regra é a MESMA da tela (avaliarOrdemCompra): alçada pelo valor, ordem
 * ainda em autorização, motivo obrigatório na devolução. O tenant precisa ser
 * o da requisição do webhook — em outro tenant o bot manda usar o painel.
 */

const UUID = /^[0-9a-f-]{36}$/i

/** Ordem escolhida para devolver, por chat, à espera do motivo (10 min). */
const devolucoesPendentes = new Map<string, { ordemId: string; expira: number }>()

function linhaOrdem(o: { codigo: string | null; tipo: string | null; favorecidoNome: string | null; valor_inicial_cobranca: number | null; produto?: string | null; descricao: string | null }): string {
  const partes = [o.tipo, o.favorecidoNome].filter(Boolean).join(" · ")
  return `<b>${formatarMoeda(o.valor_inicial_cobranca ?? 0)}</b>${partes ? ` — ${partes}` : ""}\n${(o.produto ?? o.descricao ?? "").slice(0, 140)}`
}

async function contexto(u: UsuarioTelegram): Promise<{ alcada: number; erro?: string }> {
  if (u.emp && u.emp !== (await tenantAtual())) return { alcada: 0, erro: "Para aprovar pelo Telegram, use o endereço da sua entidade no painel (Aprovar)." }
  const p = (await permissoesPorUsuario(u.id)) ?? {}
  if (!podeAcessar(p, "aquisicoes_avaliacoes", ["financeiro_pagamento"])) return { alcada: 0, erro: "Sua conta não avalia ordens de pagamento." }
  const alcada = alcadaDoUsuario(p)
  if (alcada <= 0) return { alcada: 0, erro: "Sua conta não tem alçada de aprovação." }
  return { alcada }
}

/** /aprovar — lista as ordens na alçada, cada uma com os botões. */
export async function responderAprovar(chatId: string, u: UsuarioTelegram): Promise<void> {
  const { alcada, erro } = await contexto(u)
  if (erro) {
    await enviarTelegram({ chatId, texto: erro })
    return
  }
  const lista = await listarOrdensParaAvaliacao(alcada)
  if (lista.dentroDaAlcada.length === 0) {
    await enviarTelegram({
      chatId,
      texto: `Nada na sua alçada (${formatarMoeda(alcada)}) agora.${lista.acimaDaAlcada.length ? ` Há ${lista.acimaDaAlcada.length} ordem(ns) acima dela.` : ""}`,
    })
    return
  }
  const primeiras = lista.dentroDaAlcada.slice(0, 5)
  await enviarTelegram({
    chatId,
    texto: `${lista.dentroDaAlcada.length} ordem(ns) na sua alçada${lista.dentroDaAlcada.length > 5 ? " — as 5 mais urgentes abaixo; o resto está em Aprovar no painel" : ""}:`,
  })
  for (const o of primeiras) {
    await enviarTelegram({
      chatId,
      texto: linhaOrdem(o),
      botoes: [[{ texto: "✅ Aprovar", dado: `ord:a:${o.id}` }, { texto: "↩️ Devolver", dado: `ord:d:${o.id}` }]],
    })
  }
}

/** Toque num botão inline (callback_query do Telegram). */
export async function tratarCallbackAprovacao(p: {
  callbackId: string
  chatId: string
  messageId: number | null
  dado: string
  u: UsuarioTelegram
}): Promise<void> {
  const m = /^ord:([ad]):([0-9a-f-]{36})$/i.exec(p.dado)
  if (!m) {
    await responderCallbackTelegram(p.callbackId, "Botão desconhecido.")
    return
  }
  const [, acao, ordemId] = m
  const { alcada, erro } = await contexto(p.u)
  if (erro) {
    await responderCallbackTelegram(p.callbackId, erro, true)
    return
  }
  if (acao === "d") {
    devolucoesPendentes.set(p.chatId, { ordemId, expira: Date.now() + 10 * 60_000 })
    await responderCallbackTelegram(p.callbackId, "Qual o motivo?")
    await enviarTelegram({
      chatId: p.chatId,
      texto: "Escreva o <b>motivo da devolução</b> na próxima mensagem (ou /cancelar). Ele vai para quem lançou a ordem.",
    })
    return
  }
  const r = await avaliarOrdemCompra(ordemId, p.u.id, alcada, true, null)
  if (r.erro) {
    await responderCallbackTelegram(p.callbackId, r.erro, true)
    return
  }
  await responderCallbackTelegram(p.callbackId, "Ordem aprovada.")
  if (p.messageId !== null) await editarMensagemTelegram(p.chatId, p.messageId, "✅ <b>Ordem aprovada</b> por você pelo Telegram. Ela segue para pagamento.")
  else await enviarTelegram({ chatId: p.chatId, texto: "✅ Ordem aprovada. Ela segue para pagamento." })
}

/**
 * Mensagem de texto quando há devolução pendente (o motivo) ou
 * `/devolver <id> <motivo>`. Devolve true se tratou a mensagem.
 */
export async function tratarTextoDevolucao(chatId: string, texto: string, u: UsuarioTelegram): Promise<boolean> {
  if (texto === "/cancelar") {
    const tinha = devolucoesPendentes.delete(chatId)
    if (tinha) await enviarTelegram({ chatId, texto: "Devolução cancelada — a ordem continua em autorização." })
    return tinha
  }
  let ordemId: string | null = null
  let motivo = ""
  if (texto.startsWith("/devolver")) {
    const partes = texto.split(/\s+/)
    ordemId = partes[1] && UUID.test(partes[1]) ? partes[1] : null
    motivo = partes.slice(2).join(" ").trim()
    if (!ordemId) {
      await enviarTelegram({ chatId, texto: "Use os botões de /aprovar para devolver, ou /devolver &lt;id da ordem&gt; &lt;motivo&gt;." })
      return true
    }
  } else {
    const pendente = devolucoesPendentes.get(chatId)
    if (!pendente) return false
    if (pendente.expira < Date.now()) {
      devolucoesPendentes.delete(chatId)
      await enviarTelegram({ chatId, texto: "O pedido de devolução expirou. Toque em Devolver de novo." })
      return true
    }
    ordemId = pendente.ordemId
    motivo = texto.trim()
  }
  if (motivo.length < 3) {
    await enviarTelegram({ chatId, texto: "Escreva o motivo da devolução (pelo menos 3 letras)." })
    return true
  }
  const { alcada, erro } = await contexto(u)
  if (erro) {
    devolucoesPendentes.delete(chatId)
    await enviarTelegram({ chatId, texto: erro })
    return true
  }
  const r = await avaliarOrdemCompra(ordemId, u.id, alcada, false, motivo)
  devolucoesPendentes.delete(chatId)
  await enviarTelegram({ chatId, texto: r.erro ? `Não deu: ${r.erro}` : "↩️ Ordem devolvida com o seu motivo. Quem lançou foi avisado." })
  return true
}
