import "server-only"

import type { UsuarioTelegram } from "@/lib/db/telegram"
import { apontamentosAbertos } from "@/lib/db/veiculos-apontamentos"
import { listarItens } from "@/lib/db/veiculos-checklist"
import { gravarChecklist } from "@/lib/db/veiculos-checklist-gravar"
import { hodometroAtual } from "@/lib/db/veiculos-manutencoes"
import { createAdminClient } from "@/lib/supabase/admin"
import { editarMensagemTelegram, enviarTelegram, responderCallbackTelegram } from "@/lib/telegram"
import {
  iniciarChecklistBot,
  perguntaDoPassoChecklist,
  PREFIXO_CALLBACK_CHECKLIST,
  respostasParaGravar,
  responderChecklistBot,
  type ContextoChecklist,
  type EntradaChecklist,
  type EstadoChecklistBot,
  type PassoChecklist,
} from "@/lib/telegram-checklist-fluxo"
import { tenantAtual } from "@/lib/tenant"

/**
 * /checklist no bot do Telegram (27/11/2026): o condutor do carro de uso
 * DEDICADO faz o checklist do carro, com o km, pela conversa (roteiro em
 * lib/telegram-checklist-fluxo.ts). Grava pela MESMA gravarChecklist da tela
 * de Veículos › Checklist, com o condutor como inspetor — vale como qualquer
 * checklist: zera o prazo, abre e encerra apontamentos, e o km entra no
 * hodômetro do carro. O pedido chega pelo tick diário (veiculos-dedicados.ts)
 * com o botão "Fazer o checklist agora" (ck:v:<veículo>).
 *
 * Só o condutor dedicado do carro, num contrato de locação vigente. O passo
 * de cada conversa fica em `veiculos_telegram_checklists` (2 horas). Como no
 * /diaria, o tenant tem de ser o da requisição do webhook.
 */

const VALIDADE_MS = 2 * 60 * 60_000
const TABELA = "veiculos_telegram_checklists"

type Conversa = EstadoChecklistBot & { veiculoId: string }

async function lerConversa(chatId: string, u: UsuarioTelegram): Promise<Conversa | null> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from(TABELA)
    .select("usuario_id, emp_proprietaria_id, veiculo_id, passo, dados, expira_em")
    .eq("chat_id", chatId)
    .maybeSingle()
  if (error || !data) return null
  if (data.usuario_id !== u.id || data.emp_proprietaria_id !== u.emp) return null
  if (new Date(String(data.expira_em)).getTime() < Date.now()) {
    await apagarConversa(chatId)
    return null
  }
  return {
    veiculoId: String(data.veiculo_id),
    passo: data.passo as PassoChecklist,
    dados: data.dados as EstadoChecklistBot["dados"],
  }
}

async function gravarConversa(chatId: string, u: UsuarioTelegram, c: Conversa): Promise<boolean> {
  const admin = await createAdminClient()
  const { error } = await admin.from(TABELA).upsert({
    chat_id: chatId,
    emp_proprietaria_id: u.emp,
    usuario_id: u.id,
    veiculo_id: c.veiculoId,
    passo: c.passo,
    dados: c.dados,
    atualizado_em: new Date().toISOString(),
    expira_em: new Date(Date.now() + VALIDADE_MS).toISOString(),
  })
  if (error) console.error("Checklist no Telegram:", error.message)
  return !error
}

/** Apaga e diz se havia linha — o "Salvar" tocado duas vezes grava uma vez só. */
async function apagarConversa(chatId: string): Promise<boolean> {
  const admin = await createAdminClient()
  const { data } = await admin.from(TABELA).delete().eq("chat_id", chatId).select("chat_id")
  return (data ?? []).length > 0
}

/** Outro pedido guiado começou (/diaria, /viagem): o checklist pela metade sai. */
export async function descartarChecklist(chatId: string): Promise<void> {
  await apagarConversa(chatId).catch(() => false)
}

type CarroDedicado = { id: string; rotulo: string }

/** Os carros de locação vigente de uso dedicado a esta pessoa. */
async function carrosDedicados(u: UsuarioTelegram): Promise<CarroDedicado[]> {
  const admin = await createAdminClient()
  const { data: contratos } = await admin
    .from("veiculo_contratos_aluguel")
    .select("id")
    .eq("emp_proprietaria_id", u.emp)
    .eq("uso", "dedicado")
    .eq("condutor_dedicado_id", u.id)
    .not("finalizado", "is", true)
  if (!contratos?.length) return []
  const { data: carros } = await admin
    .from("veiculos")
    .select("id, placa, marca_modelo, codigo")
    .eq("emp_proprietaria_id", u.emp)
    .in("contrato_aluguel_id", contratos.map((c) => String(c.id)))
    .not("inativo", "is", true)
  return (carros ?? []).map((v) => ({
    id: String(v.id),
    rotulo: [v.placa, v.marca_modelo].filter(Boolean).join(" · ") || String(v.codigo ?? "Veículo"),
  }))
}

async function contexto(carro: CarroDedicado): Promise<ContextoChecklist> {
  const [kmAnterior, abertos, itens] = await Promise.all([
    hodometroAtual(carro.id).catch(() => null),
    apontamentosAbertos(carro.id),
    listarItens(true),
  ])
  return {
    veiculo: carro.rotulo,
    kmAnterior,
    apontamentos: abertos.map((a) => ({
      id: a.id,
      itemId: a.item_id,
      categoria: a.categoria,
      descricao: a.descricao,
      desde: a.aberto_em,
    })),
    itens: itens.map((i) => ({ id: i.id, categoria: i.categoria, verificar: i.itens_verificar })),
  }
}

async function perguntar(chatId: string, c: Conversa, ctx: ContextoChecklist, prefixo?: string): Promise<void> {
  const p = perguntaDoPassoChecklist(c, ctx)
  await enviarTelegram({ chatId, texto: prefixo ? `${prefixo}\n\n${p.texto}` : p.texto, botoes: p.botoes })
}

/** Por que esta pessoa não faz checklist por aqui (ou null, se pode). */
async function impedimento(u: UsuarioTelegram): Promise<string | null> {
  if (!u.emp) return "Não consegui identificar sua entidade. Refaça o vínculo em Meu perfil → Telegram."
  if (u.emp !== (await tenantAtual())) return "Para o checklist, use o painel da sua entidade."
  return null
}

const SEM_CARRO =
  "O checklist pelo Telegram é para quem tem um carro de uso dedicado (locação). Os carros da frota são verificados pela recepção."

/**
 * /checklist — começa (ou recomeça) o checklist. Com mais de um carro
 * dedicado, pergunta qual; `veiculoId` vem do botão do pedido ou da escolha.
 */
export async function iniciarChecklistDedicado(chatId: string, u: UsuarioTelegram, veiculoId?: string): Promise<void> {
  const barrado = await impedimento(u)
  if (barrado) {
    await enviarTelegram({ chatId, texto: barrado })
    return
  }
  const carros = await carrosDedicados(u)
  if (carros.length === 0) {
    await enviarTelegram({ chatId, texto: SEM_CARRO })
    return
  }
  const carro = veiculoId ? carros.find((c) => c.id === veiculoId) : carros.length === 1 ? carros[0] : undefined
  if (veiculoId && !carro) {
    await enviarTelegram({ chatId, texto: "Este carro não está mais dedicado a você. Fale com a gestão da frota." })
    return
  }
  if (!carro) {
    await enviarTelegram({
      chatId,
      texto: "De qual carro é o checklist?",
      botoes: carros.map((c) => [{ texto: c.rotulo.slice(0, 40), dado: `${PREFIXO_CALLBACK_CHECKLIST}v:${c.id}` }]),
    })
    return
  }
  const ctx = await contexto(carro)
  if (ctx.itens.length === 0) {
    await enviarTelegram({ chatId, texto: "Não há itens de checklist cadastrados. Fale com a gestão da frota." })
    return
  }
  const c: Conversa = { ...iniciarChecklistBot(), veiculoId: carro.id }
  if (!(await gravarConversa(chatId, u, c))) {
    await enviarTelegram({ chatId, texto: "O checklist pelo Telegram ainda não está disponível. Fale com a gestão da frota." })
    return
  }
  await perguntar(chatId, c, ctx, "Vamos ao checklist. A qualquer momento, /cancelar desiste.")
}

async function aplicar(
  chatId: string,
  u: UsuarioTelegram,
  c: Conversa,
  entrada: EntradaChecklist,
  mensagem: { id: number; texto: string } | null
): Promise<void> {
  // O carro pode ter deixado de ser dedicado à pessoa no meio da conversa.
  const carro = (await carrosDedicados(u)).find((x) => x.id === c.veiculoId)
  if (!carro) {
    await apagarConversa(chatId)
    await enviarTelegram({ chatId, texto: "Este carro não está mais dedicado a você. Nada foi salvo." })
    return
  }
  const ctx = await contexto(carro)
  const r = responderChecklistBot(c, entrada, ctx)
  if ("cancelar" in r) {
    await apagarConversa(chatId)
    if (mensagem) await editarMensagemTelegram(chatId, mensagem.id, escapar(mensagem.texto))
    await enviarTelegram({ chatId, texto: "Checklist cancelado. Nada foi salvo. Mande /checklist para recomeçar." })
    return
  }
  if ("erro" in r) {
    // Na lista de itens o erro não apaga a lista: vai como aviso à parte.
    if (c.passo === "itens") {
      await enviarTelegram({ chatId, texto: r.erro })
      return
    }
    if (mensagem) await editarMensagemTelegram(chatId, mensagem.id, escapar(mensagem.texto))
    const p = perguntaDoPassoChecklist(c, ctx)
    await enviarTelegram({ chatId, texto: `${r.erro}\n\n${p.texto}`, botoes: p.botoes })
    return
  }
  if ("salvar" in r) {
    if (mensagem) await editarMensagemTelegram(chatId, mensagem.id, escapar(mensagem.texto))
    await concluir(chatId, u, c, ctx)
    return
  }
  const proximo: Conversa = { ...r.estado, veiculoId: c.veiculoId }
  await gravarConversa(chatId, u, proximo)
  if (r.editar && mensagem) {
    // Marcar um item reescreve a própria lista (com os botões).
    const p = perguntaDoPassoChecklist(proximo, ctx)
    await editarMensagemTelegram(chatId, mensagem.id, p.texto, p.botoes)
    return
  }
  // Tira os botões da pergunta respondida (não dá para tocar duas vezes).
  if (mensagem) await editarMensagemTelegram(chatId, mensagem.id, escapar(mensagem.texto))
  await perguntar(chatId, proximo, ctx)
}

async function concluir(chatId: string, u: UsuarioTelegram, c: Conversa, ctx: ContextoChecklist): Promise<void> {
  // Quem apagar a linha é quem grava: dois toques em Salvar dão um checklist só.
  if (!(await apagarConversa(chatId))) return
  const { itens, apontamentos } = respostasParaGravar(c.dados, ctx)
  const { id, erro } = await gravarChecklist({
    veiculoId: c.veiculoId,
    inspetorId: u.id,
    hodometro: c.dados.km ?? null,
    observacoes: "Feito pelo condutor dedicado, pelo Telegram.",
    itens,
    apontamentos,
  })
  if (erro || !id) {
    await gravarConversa(chatId, u, c)
    await enviarTelegram({
      chatId,
      texto: `Não consegui salvar o checklist: ${erro ?? "sem retorno"}. Toque em Salvar de novo ou mande /checklist para recomeçar.`,
      botoes: perguntaDoPassoChecklist(c, ctx).botoes,
    })
    return
  }
  const problemas = Object.values(itens).filter((i) => i.situacao === "nao_conforme").length +
    Object.values(apontamentos).filter((a) => a.resposta === "permanece").length
  await enviarTelegram({
    chatId,
    texto:
      `✅ Checklist do <b>${escapar(ctx.veiculo)}</b> salvo${c.dados.km !== undefined ? `, com ${c.dados.km.toLocaleString("pt-BR")} km` : ""}.` +
      (problemas > 0
        ? `\n\n⚠️ ${problemas === 1 ? "O problema apontado foi" : `Os ${problemas} problemas apontados foram`} para a gestão da frota, que cuida da manutenção.`
        : "\n\nObrigado! Quando chegar a hora do próximo, eu aviso."),
  })
}

/**
 * Texto digitado com um checklist em andamento: vira a resposta do passo
 * atual. Comandos (/…) seguem para o bot, salvo o /cancelar.
 */
export async function tratarTextoChecklist(chatId: string, texto: string, u: UsuarioTelegram): Promise<boolean> {
  if (texto.startsWith("/") && texto !== "/cancelar") return false
  const c = await lerConversa(chatId, u)
  if (!c) return false
  await aplicar(chatId, u, c, { texto }, null)
  return true
}

/** Botão do checklist (callback "ck:…"). */
export async function tratarCallbackChecklist(p: {
  callbackId: string
  chatId: string
  messageId: number | null
  textoDaMensagem: string | null
  dado: string
  u: UsuarioTelegram
}): Promise<boolean> {
  if (!p.dado.startsWith(PREFIXO_CALLBACK_CHECKLIST)) return false
  const dado = p.dado.slice(PREFIXO_CALLBACK_CHECKLIST.length)
  const barrado = await impedimento(p.u)
  if (barrado) {
    await responderCallbackTelegram(p.callbackId, barrado, true)
    return true
  }
  // "v:<veículo>": o botão do pedido diário ou a escolha do carro — começa.
  if (dado.startsWith("v:")) {
    await responderCallbackTelegram(p.callbackId)
    if (p.messageId !== null && p.textoDaMensagem) {
      await editarMensagemTelegram(p.chatId, p.messageId, escapar(p.textoDaMensagem))
    }
    await iniciarChecklistDedicado(p.chatId, p.u, dado.slice(2))
    return true
  }
  const c = await lerConversa(p.chatId, p.u)
  if (!c) {
    await responderCallbackTelegram(p.callbackId, "Este checklist expirou. Mande /checklist para começar de novo.", true)
    return true
  }
  await responderCallbackTelegram(p.callbackId)
  const mensagem = p.messageId !== null && p.textoDaMensagem ? { id: p.messageId, texto: p.textoDaMensagem } : null
  await aplicar(p.chatId, p.u, c, { botao: dado }, mensagem)
  return true
}

function escapar(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}
