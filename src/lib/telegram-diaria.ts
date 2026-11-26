import "server-only"

import { hojeSP } from "@/lib/db/comum"
import { criarSolicitacaoDiaria, listarTiposDiaria, tipoDiariaLiberado } from "@/lib/db/diarias"
import { quadroParaDiaria } from "@/lib/db/diarias-diretoria"
import { enviarRemessaParaAvaliacao, listarRemessasNovas } from "@/lib/db/diarias-remessas"
import { projetosAbertosParaTransferencia } from "@/lib/db/projetos"
import type { UsuarioTelegram } from "@/lib/db/telegram"
import { createAdminClient } from "@/lib/supabase/admin"
import { editarMensagemTelegram, enviarTelegram, responderCallbackTelegram } from "@/lib/telegram"
import {
  iniciarDiariaBot,
  perguntaDoPassoDiaria,
  PREFIXO_CALLBACK_DIARIA,
  responderDiariaBot,
  resumoDiariaBot,
  type ContextoDiaria,
  type EntradaDiaria,
  type EstadoDiariaBot,
  type PassoDiaria,
} from "@/lib/telegram-diaria-fluxo"
import { tenantAtual } from "@/lib/tenant"
import { origemAtual } from "@/lib/tenant-url"

/**
 * /diaria no bot do Telegram (17/11/2026): funcionário com vínculo em vigor ou
 * diretor em exercício pede diária numa conversa guiada (roteiro em
 * lib/telegram-diaria-fluxo.ts). Grava pela MESMA criarSolicitacaoDiaria do
 * Meu perfil → Diárias — a diária entra na remessa em preparação e, no
 * "Salvar e enviar", a remessa vai para avaliação como no painel. O passo de
 * cada conversa fica em `pessoal_telegram_diarias` (30 min).
 *
 * Como no /viagem, o tenant tem de ser o da requisição do webhook; em outra
 * entidade o bot manda usar o painel.
 */

const VALIDADE_MS = 30 * 60_000
const TABELA = "pessoal_telegram_diarias"

async function lerConversa(chatId: string, u: UsuarioTelegram): Promise<EstadoDiariaBot | null> {
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
  return { passo: data.passo as PassoDiaria, dados: data.dados as EstadoDiariaBot["dados"] }
}

async function gravarConversa(chatId: string, u: UsuarioTelegram, c: EstadoDiariaBot): Promise<boolean> {
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
  if (error) console.error("Conversa de diária no Telegram:", error.message)
  return !error
}

/** Apaga e diz se havia linha — o "Salvar" tocado duas vezes grava uma vez só. */
async function apagarConversa(chatId: string): Promise<boolean> {
  const svc = await createAdminClient()
  const { data } = await svc.from(TABELA).delete().eq("chat_id", chatId).select("chat_id")
  return (data ?? []).length > 0
}

/** Outro pedido guiado começou (/viagem): a diária pela metade não pode roubar as respostas. */
export async function descartarPedidoDiaria(chatId: string): Promise<void> {
  await apagarConversa(chatId).catch(() => false)
}

type Quadro = NonNullable<Awaited<ReturnType<typeof quadroParaDiaria>>>

/** Os tipos que a pessoa vê no formulário: ativos, com valor e liberados para ela. */
async function tiposDaPessoa(u: UsuarioTelegram, quadro: Quadro): Promise<ContextoDiaria["tipos"]> {
  const { tipos } = await listarTiposDiaria().catch(() => ({ tipos: [] }))
  return tipos
    .filter((t) => t.ativa && t.valor_reembolso !== null && tipoDiariaLiberado(t, u.id, quadro.quadro))
    .map((t) => ({ id: t.id, nome: t.nome, valor: t.valor_reembolso as number }))
}

async function contexto(u: UsuarioTelegram, quadro: Quadro, passo: PassoDiaria): Promise<ContextoDiaria> {
  const [tipos, remessas, projetos] = await Promise.all([
    tiposDaPessoa(u, quadro),
    passo === "confirmar"
      ? listarRemessasNovas({ beneficiarioId: u.id }).catch(() => ({ remessas: [] }))
      : Promise.resolve({ remessas: [] }),
    // O motivo decide se pergunta o projeto; projeto e confirmar mostram a lista.
    passo === "motivo" || passo === "projeto" || passo === "confirmar"
      ? projetosAbertosParaTransferencia().catch(() => [])
      : Promise.resolve([]),
  ])
  // A mesma remessa que garantirRemessaAberta vai usar: a mais antiga do
  // quadro ainda não enviada, em preparação ou devolvida (a lista vem da
  // mais nova para a mais antiga).
  const aberta = remessas.remessas
    .filter((r) => !r.enviada && (r.situacao === "preparacao" || r.situacao === "devolvida") && r.quadro === quadro.quadro)
    .at(-1)
  return {
    hoje: hojeSP(),
    tipos,
    projetos,
    remessaAberta: aberta
      ? { codigo: aberta.codigo, valorTotal: aberta.valorTotal, devolvida: aberta.situacao === "devolvida" }
      : null,
  }
}

async function perguntar(chatId: string, c: EstadoDiariaBot, ctx: ContextoDiaria, prefixo?: string): Promise<void> {
  const p = perguntaDoPassoDiaria(c, ctx)
  await enviarTelegram({
    chatId,
    texto: prefixo ? `${prefixo}\n\n${p.texto}` : p.texto,
    botoes: p.botoes,
  })
}

/** Por que esta pessoa não pede diária por aqui (ou null, se pode). */
async function impedimento(u: UsuarioTelegram): Promise<string | null> {
  if (!u.emp) return "Não consegui identificar sua entidade. Refaça o vínculo em Meu perfil → Telegram."
  if (u.emp !== (await tenantAtual())) return "Para pedir diária, use o painel da sua entidade (Meu perfil → Diárias)."
  return null
}

const SEM_QUADRO =
  "Só funcionários com vínculo em vigor ou diretores em exercício pedem diária. Diária para outra pessoa é pelo painel."

/** /diaria — começa (ou recomeça) o pedido. */
export async function iniciarPedidoDiaria(chatId: string, u: UsuarioTelegram): Promise<void> {
  const barrado = await impedimento(u)
  if (barrado) {
    await enviarTelegram({ chatId, texto: barrado })
    return
  }
  const quadro = await quadroParaDiaria(u.id).catch(() => null)
  if (!quadro) {
    await enviarTelegram({ chatId, texto: SEM_QUADRO })
    return
  }
  const c = iniciarDiariaBot()
  const ctx = await contexto(u, quadro, c.passo)
  if (ctx.tipos.length === 0) {
    await enviarTelegram({ chatId, texto: "Não há tipo de diária liberado para você. Fale com quem cuida do Pessoal." })
    return
  }
  if (!(await gravarConversa(chatId, u, c))) {
    await enviarTelegram({ chatId, texto: "O pedido de diária pelo Telegram ainda não está disponível. Use o painel → Meu perfil → Diárias." })
    return
  }
  await perguntar(chatId, c, ctx, "Vou fazer umas perguntas rápidas. A qualquer momento, /cancelar desiste.")
}

async function aplicar(chatId: string, u: UsuarioTelegram, c: EstadoDiariaBot, entrada: EntradaDiaria): Promise<void> {
  // A régua pode ter mudado no meio da conversa (vínculo encerrado, mandato findo).
  const quadro = await quadroParaDiaria(u.id).catch(() => null)
  if (!quadro) {
    await apagarConversa(chatId)
    await enviarTelegram({ chatId, texto: SEM_QUADRO })
    return
  }
  const ctx = await contexto(u, quadro, c.passo)
  const r = responderDiariaBot(c, entrada, ctx)
  if ("cancelar" in r) {
    await apagarConversa(chatId)
    await enviarTelegram({ chatId, texto: "Pedido de diária cancelado. Nada foi salvo." })
    return
  }
  if ("erro" in r) {
    const p = perguntaDoPassoDiaria(c, ctx)
    await enviarTelegram({ chatId, texto: `${r.erro}\n\n${p.texto}`, botoes: p.botoes })
    return
  }
  if ("confirmar" in r) {
    await concluir(chatId, u, c, quadro, ctx, r.enviarRemessa)
    return
  }
  await gravarConversa(chatId, u, r.estado)
  await perguntar(chatId, r.estado, r.estado.passo === c.passo ? ctx : await contexto(u, quadro, r.estado.passo))
}

async function concluir(
  chatId: string,
  u: UsuarioTelegram,
  c: EstadoDiariaBot,
  quadro: Quadro,
  ctx: ContextoDiaria,
  enviarRemessa: boolean
): Promise<void> {
  const d = c.dados
  if (!d.tipoId || !d.quantidade || !d.motivo) {
    await apagarConversa(chatId)
    await enviarTelegram({ chatId, texto: "O pedido ficou incompleto. Mande /diaria para começar de novo." })
    return
  }
  // Quem apagar a linha é quem grava: dois toques em Salvar dão uma diária só.
  if (!(await apagarConversa(chatId))) return

  const { erro, id, remessaId } = await criarSolicitacaoDiaria({
    funcionario_id: u.id,
    diaria_id: d.tipoId,
    quantidade: d.quantidade,
    motivo: d.motivo,
    data_inicio: d.inicio ?? null,
    data_termino: d.termino ?? null,
    beneficiario_tipo: quadro.quadro,
    departamento_id: quadro.departamentoId,
    // Só um projeto ainda em andamento (a lista do contexto é a de agora).
    projeto_id: d.projetoId && ctx.projetos?.some((p) => p.id === d.projetoId) ? d.projetoId : null,
  })
  if (erro || !id) {
    await gravarConversa(chatId, u, c)
    await enviarTelegram({
      chatId,
      texto: `Não consegui salvar a diária: ${erro ?? "sem retorno"}. Tente de novo.`,
      botoes: perguntaDoPassoDiaria(c, ctx).botoes,
    })
    return
  }

  const link = `${await origemAtual()}/painel/perfil/diarias`
  const resumo = resumoDiariaBot(d, { ...ctx, remessaAberta: null }).split("\n\n")[0]
  let situacao: string
  if (enviarRemessa && remessaId) {
    const envio = await enviarRemessaParaAvaliacao(remessaId, u.id)
    situacao = envio.erro
      ? `✅ Diária salva na sua remessa, mas a remessa não foi enviada: ${envio.erro}\nEnvie pelo painel.`
      : "✅ Diária salva e remessa enviada para avaliação. Você recebe aviso quando ela for avaliada."
  } else if (remessaId && ctx.remessaAberta?.devolvida) {
    situacao = "✅ Diária salva na sua remessa devolvida. Depois de corrigir o que foi apontado, reenvie a remessa pelo painel."
  } else if (remessaId) {
    situacao = "✅ Diária salva na sua remessa em preparação. Quando juntar tudo, envie a remessa para avaliação pelo painel (ou mande /diaria de novo e escolha “Salvar e enviar”)."
  } else {
    situacao = "✅ Diária enviada para avaliação."
  }
  await enviarTelegram({
    chatId,
    texto: [situacao, "", resumo, "", "Despesas extras com comprovante e acompanhamento:", link].join("\n"),
  })
}

/**
 * Texto digitado com um pedido de diária em andamento: vira a resposta do
 * passo atual. Comandos (/…) seguem para o bot, salvo o /cancelar.
 */
export async function tratarTextoDiaria(chatId: string, texto: string, u: UsuarioTelegram): Promise<boolean> {
  if (texto.startsWith("/") && texto !== "/cancelar") return false
  const c = await lerConversa(chatId, u)
  if (!c) return false
  await aplicar(chatId, u, c, { texto })
  return true
}

/** Botão do pedido de diária (callback "dg:…"). */
export async function tratarCallbackDiaria(p: {
  callbackId: string
  chatId: string
  messageId: number | null
  textoDaMensagem: string | null
  dado: string
  u: UsuarioTelegram
}): Promise<boolean> {
  if (!p.dado.startsWith(PREFIXO_CALLBACK_DIARIA)) return false
  const barrado = await impedimento(p.u)
  if (barrado) {
    await responderCallbackTelegram(p.callbackId, barrado, true)
    return true
  }
  const c = await lerConversa(p.chatId, p.u)
  if (!c) {
    await responderCallbackTelegram(p.callbackId, "Este pedido expirou. Mande /diaria para começar de novo.", true)
    return true
  }
  await responderCallbackTelegram(p.callbackId)
  // Tira os botões da pergunta respondida (não dá para tocar duas vezes).
  if (p.messageId !== null && p.textoDaMensagem) {
    await editarMensagemTelegram(p.chatId, p.messageId, escapar(p.textoDaMensagem))
  }
  await aplicar(p.chatId, p.u, c, { botao: p.dado.slice(PREFIXO_CALLBACK_DIARIA.length) })
  return true
}

function escapar(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}
