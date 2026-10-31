import "server-only"

import { despesasParaReconhecer, avaliarDespesaCaixa } from "@/lib/db/caixa-reconhecimento"
import { hojeSP, nomesDosUsuarios, texto } from "@/lib/db/comum"
import { alcadaDoUsuario } from "@/lib/db/compras"
import { coordenaFuncionario, departamentosCoordenados } from "@/lib/db/coordenador"
import { avaliarSolicitacaoDiaria, buscarSolicitacaoDiaria } from "@/lib/db/diarias"
import { aprovarRemessaDiarias, devolverRemessaDiarias, obterRemessaNova } from "@/lib/db/diarias-remessas"
import { podeAvaliarRemessa } from "@/lib/db/diarias-remessas-avaliador"
import { decidirFalta } from "@/lib/db/faltas"
import { definirAutorizacaoGozo } from "@/lib/db/ferias"
import { confirmarAlteracao, recusarAlteracao } from "@/lib/db/meus-dados-bancarios"
import { pendenciasPara } from "@/lib/db/pendencias"
import { avaliarReembolso, buscarReembolso } from "@/lib/db/reembolsos"
import { permissoesEfetivasPorUsuario, type UsuarioTelegram } from "@/lib/db/telegram"
import { encerrarViagem, iniciarAtendimento } from "@/lib/db/viagens-atendimento"
import { formatarData, formatarMoeda } from "@/lib/formato"
import { podeAcessar, type Permissoes } from "@/lib/permissoes"
import { createAdminClient } from "@/lib/supabase/admin"
import {
  type BotaoTelegram,
  editarMensagemTelegram,
  enviarTelegram,
  responderCallbackTelegram,
} from "@/lib/telegram"
import {
  botoesPendencia,
  contrachequeSugerido,
  escaparHtmlTelegram,
  lerDadoPendencia,
  lerRefDoMotivo,
  mensagemComPainel,
  MOTIVO_MINIMO,
  pedidoDeMotivo,
  TIPOS_PENDENCIA,
  type TipoPendencia,
} from "@/lib/telegram-pendencias-fluxo"
import { tenantAtual } from "@/lib/tenant"
import { origemAtual } from "@/lib/tenant-url"

/**
 * RESOLVER PENDÊNCIAS PELO TELEGRAM (31/10/2026): os avisos de pendência
 * (férias, diária, remessa de diárias, reembolso do ACT, falta, pedido de
 * viagem, dados bancários, despesa no caixa) saem com botões, e o /pendencias
 * lista o que espera pela pessoa com os mesmos botões. Cada botão chama a
 * MESMA função de domínio da tela, depois da MESMA conferência de permissão,
 * alçada e coordenação que a action do painel faz. Como no /aprovar
 * (lib/telegram-aprovacoes.ts), o tenant tem de ser o da requisição do
 * webhook.
 *
 * A ação negativa (reprovar, devolver, recusar, não reconhecer) pede o motivo
 * numa resposta à mensagem do bot (force_reply): a referência do item vai no
 * fim do pedido e volta em `reply_to_message`, então funciona em qualquer
 * instância. Quem digita sem "responder" cai no item guardado em memória
 * (10 min), como nas ordens.
 */

type Ctx = { u: UsuarioTelegram; uid: string; emp: string; perms: Permissoes }
type Resultado = { erro?: string; ok?: string }

const motivosPendentes = new Map<string, { tipo: TipoPendencia; id: string; expira: number }>()

async function contexto(u: UsuarioTelegram): Promise<Ctx | { erro: string }> {
  if (!u.emp) return { erro: "Não consegui identificar sua entidade. Refaça o vínculo em Meu perfil → Telegram." }
  if (u.emp !== (await tenantAtual())) return { erro: "Para resolver pelo Telegram, use o endereço da sua entidade no painel." }
  // As mesmas permissões efetivas da sessão do painel (perfis de acesso por cima).
  const perms = await permissoesEfetivasPorUsuario(u.id)
  return { u, uid: u.id, emp: u.emp, perms }
}

const SEM_AUTORIDADE = "Você não decide este pedido (e ninguém decide o próprio)."

/**
 * Confere e, sem `soConferir`, executa. `aprovar` = ação positiva; o motivo
 * só vale na negativa. Cada caso espelha a action da tela citada.
 */
async function decidir(
  ctx: Ctx,
  tipo: TipoPendencia,
  id: string,
  aprovar: boolean,
  motivo: string | null,
  soConferir = false
): Promise<Resultado> {
  const { uid, perms } = ctx
  const pode = (chave: string, alt: string[] = []) => podeAcessar(perms, chave, alt)

  switch (tipo) {
    // pessoal/ferias/actions.ts (gestão) e coordenador/actions.ts.
    case "fe": {
      if (!aprovar) return { erro: "Férias não se devolvem por aqui — abra o pedido no painel." }
      const admin = await createAdminClient()
      const { data: g } = await admin
        .from("pessoal_ferias_gozo")
        .select("funcionario_id, autorizado")
        .eq("id", id)
        .eq("emp_proprietaria_id", ctx.emp)
        .maybeSingle()
      if (!g) return { erro: "Pedido de férias não encontrado." }
      if (g.autorizado === true) return { erro: "Estas férias já foram autorizadas." }
      const func = texto(g.funcionario_id)
      if (func === uid) return { erro: SEM_AUTORIDADE }
      if (!pode("pessoal_gestao") && !(await coordenaFuncionario(uid, func))) return { erro: SEM_AUTORIDADE }
      if (soConferir) return {}
      const r = await definirAutorizacaoGozo(id, uid, true)
      return r.erro ? r : { ok: "✅ <b>Férias autorizadas</b> por você pelo Telegram — o funcionário foi avisado." }
    }
    // pessoal/diarias/actions.ts (avaliarDiaria) e coordenador/actions.ts.
    case "di": {
      const d = await buscarSolicitacaoDiaria(id)
      if (!d) return { erro: "Diária não encontrada." }
      if (d.situacao !== "aguardando") return { erro: "Esta diária já foi avaliada." }
      if (d.funcionario_id === uid) return { erro: SEM_AUTORIDADE }
      const autoridade =
        d.beneficiarioTipo === "diretor"
          ? pode("diretoria_diarias", ["configuracoes"])
          : pode("pessoal_gestao", ["pessoal_diarias"]) || (await coordenaFuncionario(uid, d.funcionario_id))
      if (!autoridade) return { erro: SEM_AUTORIDADE }
      if (soConferir) return {}
      // Desconto das infrações pendentes ligado, como o padrão da tela.
      const r = await avaliarSolicitacaoDiaria(id, uid, aprovar, motivo, true)
      if (r.erro) return r
      return { ok: aprovar ? "✅ <b>Diária aprovada</b> por você pelo Telegram." : "↩️ <b>Diária reprovada</b> com o seu motivo. Quem pediu foi avisado." }
    }
    // pessoal/diarias/remessas/actions.ts (avaliarRemessaAction).
    case "dr": {
      const dados = await obterRemessaNova(id)
      if (!dados) return { erro: "Remessa não encontrada." }
      if (!(await podeAvaliarRemessa(uid, perms, dados.remessa))) return { erro: "Você não avalia esta remessa (e ninguém avalia a própria)." }
      if (dados.remessa.enviada) return { erro: "Esta remessa já foi aprovada." }
      if (soConferir) return {}
      if (!aprovar) {
        const r = await devolverRemessaDiarias(id, uid, motivo ?? "", [])
        return r.erro ? r : { ok: "↩️ <b>Remessa devolvida</b> — quem lançou foi avisado do que corrigir." }
      }
      const r = await aprovarRemessaDiarias(id, uid, {
        aplicarDescontos: true,
        // No modo "alcada" a ordem só nasce autorizada dentro desta alçada.
        alcada: alcadaDoUsuario(perms as Record<string, unknown>),
      })
      if (r.erro) return { erro: r.erro }
      return {
        ok: `✅ <b>Remessa aprovada</b> — ordem de pagamento ${r.ordemCodigo ?? ""} gerada ${
          r.ordemAutorizada ? "e autorizada: está A pagar no Financeiro." : "e enviada à fila de autorização (o valor passa da sua alçada financeira)."
        }${r.movidas ? ` ${r.movidas} diária(s) lançada(s) durante a avaliação passaram para a próxima remessa.` : ""}`,
      }
    }
    // pessoal/reembolsos/actions.ts (avaliarReembolsoAction).
    case "re": {
      if (!pode("pessoal_gestao", ["pessoal_reembolsos"])) return { erro: "Sua conta não avalia reembolsos do ACT." }
      const r0 = await buscarReembolso(id)
      if (!r0) return { erro: "Solicitação não encontrada." }
      if (r0.situacao !== "aguardando") return { erro: "Esta solicitação já foi avaliada ou cancelada." }
      if (r0.funcionario_id === uid) return { erro: SEM_AUTORIDADE }
      if (soConferir) return {}
      // Aprovado pelo bot: o valor reembolsável e o contracheque sugeridos pela tela.
      const valor = r0.valorReembolsavel ?? r0.valor_solicitado
      const sug = contrachequeSugerido(hojeSP())
      const r = await avaliarReembolso(id, uid, {
        aprovar,
        valor_aprovado: aprovar ? valor : null,
        observacao: aprovar ? null : motivo,
        pagamento_mes: aprovar ? sug.mes : null,
        pagamento_ano: aprovar ? sug.ano : null,
      })
      if (r.erro) return r
      return aprovar
        ? { ok: `✅ <b>Reembolso aprovado</b>: ${formatarMoeda(valor)}, no contracheque de ${sug.mes}/${sug.ano}. Para mudar o valor ou o mês, use o painel.` }
        : { ok: "↩️ <b>Reembolso reprovado</b> com o seu motivo. O funcionário foi avisado." }
    }
    // pessoal/faltas/actions.ts (decidirFaltaAction) e coordenador/actions.ts.
    case "fa": {
      const admin = await createAdminClient()
      const { data: f } = await admin
        .from("pessoal_faltas_justificadas")
        .select("funcionario_id")
        .eq("id", id)
        .eq("emp_proprietaria_id", ctx.emp)
        .maybeSingle()
      if (!f) return { erro: "Falta não encontrada." }
      const func = texto(f.funcionario_id)
      if (func === uid) return { erro: SEM_AUTORIDADE }
      if (!pode("pessoal_gestao", ["pessoal_faltas_justificadas"]) && !(await coordenaFuncionario(uid, func))) return { erro: SEM_AUTORIDADE }
      if (soConferir) return {}
      const r = await decidirFalta(id, uid, aprovar, motivo)
      return r.erro ? r : { ok: aprovar ? "✅ <b>Falta justificada autorizada</b> por você pelo Telegram." : "↩️ <b>Falta justificada recusada</b> com o seu motivo." }
    }
    // institucional/viagens/actions.ts (iniciarAtendimentoAction, encerrarViagemAction).
    case "vi": {
      if (!pode("viagens_gestao")) return { erro: "Sua conta não atende viagens." }
      if (soConferir) return {}
      if (aprovar) {
        const r = await iniciarAtendimento(id, uid)
        return r.erro ? r : { ok: "🧳 <b>Atendimento iniciado</b> por você — a reserva segue no painel (Viagens)." }
      }
      const r = await encerrarViagem(id, "recusada", motivo ?? "", uid)
      return r.erro ? { erro: r.erro } : { ok: "✖️ <b>Pedido de viagem recusado</b> e avisado a quem pediu." }
    }
    // financeiro/contas-bancarias/alteracoes/actions.ts.
    case "db": {
      if (!pode("financeiro_pagamento")) return { erro: "Sua conta não confirma dados bancários." }
      if (soConferir) return {}
      const r = aprovar ? await confirmarAlteracao(id, uid) : await recusarAlteracao(id, uid, motivo ?? "")
      return r.erro ? r : { ok: aprovar ? "✅ <b>Confirmado</b> — a conta já vale para os pagamentos." : "✖️ <b>Pedido recusado</b> — a pessoa foi avisada." }
    }
    // perfil/despesas-caixa/actions.ts: a função confere o responsável da conta.
    case "cx": {
      if (soConferir) return {}
      const r = await avaliarDespesaCaixa(id, uid, aprovar, motivo)
      return r.erro
        ? r
        : { ok: aprovar ? "✅ <b>Despesa reconhecida</b>." : "✖️ <b>Despesa não reconhecida</b> — o valor voltou ao seu saldo e quem lançou foi avisado para transferir." }
    }
  }
}

/** Botões de link que a mensagem já tinha ("Abrir no painel"): ficam depois da decisão. */
export type BotaoDeLink = { text?: string; url?: string }

/** Toque num botão `pd:…`. Devolve false se o botão não é de pendência. */
export async function tratarCallbackPendencia(p: {
  callbackId: string
  chatId: string
  messageId: number | null
  textoDaMensagem: string | null
  links: BotaoDeLink[]
  dado: string
  u: UsuarioTelegram
}): Promise<boolean> {
  const item = lerDadoPendencia(p.dado)
  if (!item) return false
  const ctx = await contexto(p.u)
  if ("erro" in ctx) {
    await responderCallbackTelegram(p.callbackId, ctx.erro, true)
    return true
  }
  if (item.acao === "d") {
    const conf = await decidir(ctx, item.tipo, item.id, false, null, true)
    if (conf.erro) {
      await responderCallbackTelegram(p.callbackId, conf.erro, true)
      return true
    }
    motivosPendentes.set(p.chatId, { tipo: item.tipo, id: item.id, expira: Date.now() + 10 * 60_000 })
    await responderCallbackTelegram(p.callbackId, "Qual o motivo?")
    await enviarTelegram({ chatId: p.chatId, texto: pedidoDeMotivo(item.tipo, item.id), teclado: "responder" })
    return true
  }
  const r = await decidir(ctx, item.tipo, item.id, true, null)
  if (r.erro) {
    await responderCallbackTelegram(p.callbackId, r.erro, true)
    return true
  }
  await responderCallbackTelegram(p.callbackId, "Feito.")
  const ok = r.ok ?? "Feito."
  if (p.messageId !== null) {
    const original = p.textoDaMensagem ? `${escaparHtmlTelegram(p.textoDaMensagem)}\n\n` : ""
    const links: BotaoTelegram[][] = p.links.filter((b) => b.url).map((b) => [{ texto: b.text ?? "Abrir", url: b.url }])
    await editarMensagemTelegram(p.chatId, p.messageId, `${original}${ok}`, links)
  } else {
    await enviarTelegram({ chatId: p.chatId, texto: ok })
  }
  return true
}

/**
 * Texto que é o motivo de uma ação negativa: resposta à mensagem do pedido
 * (com a referência) ou a próxima mensagem depois do botão. Devolve true se
 * tratou a mensagem.
 */
export async function tratarTextoMotivoPendencia(
  chatId: string,
  texto: string,
  u: UsuarioTelegram,
  respondida: string | null
): Promise<boolean> {
  const ref = lerRefDoMotivo(respondida)
  if (texto === "/cancelar") {
    const tinha = motivosPendentes.delete(chatId) || Boolean(ref)
    if (tinha) await enviarTelegram({ chatId, texto: "Cancelado — o pedido continua esperando decisão." })
    return tinha
  }
  let alvo: { tipo: TipoPendencia; id: string } | null = ref
  if (!alvo) {
    const pendente = motivosPendentes.get(chatId)
    if (!pendente) return false
    if (texto.startsWith("/")) return false
    if (pendente.expira < Date.now()) {
      motivosPendentes.delete(chatId)
      return false
    }
    alvo = pendente
  }
  const motivo = texto.trim()
  if (motivo.length < MOTIVO_MINIMO) {
    await enviarTelegram({ chatId, texto: `Escreva o motivo (pelo menos ${MOTIVO_MINIMO} letras), respondendo à mensagem do pedido.` })
    return true
  }
  const ctx = await contexto(u)
  if ("erro" in ctx) {
    motivosPendentes.delete(chatId)
    await enviarTelegram({ chatId, texto: ctx.erro })
    return true
  }
  const r = await decidir(ctx, alvo.tipo, alvo.id, false, motivo)
  motivosPendentes.delete(chatId)
  await enviarTelegram({ chatId, texto: r.erro ? `Não deu: ${escaparHtmlTelegram(r.erro)}` : (r.ok ?? "Feito.") })
  return true
}

// ── /pendencias ─────────────────────────────────────────────────────────────

type ItemPendente = { tipo: TipoPendencia; id: string; texto: string; link: string }

/** Itens com botão que esperam pela pessoa (até `limite`), já conferidos como na decisão. */
async function itensComBotao(ctx: Ctx, limite: number): Promise<ItemPendente[]> {
  // O cliente do tenant da requisição (contexto() já conferiu que é o da pessoa).
  const svc = await createAdminClient()
  const { emp, uid, perms } = ctx
  const pode = (chave: string, alt: string[] = []) => podeAcessar(perms, chave, alt)
  const coordena = (await departamentosCoordenados(uid).catch(() => [])).length > 0
  const candidatos: (Omit<ItemPendente, "texto"> & { pessoa: string | null; resumo: string })[] = []
  // Interface mínima do filtro: os genéricos do PostgREST estouram a inferência (pendencias.ts).
  type Q = PromiseLike<{ data: unknown; error: unknown }> & {
    not: (c: string, op: string, v: unknown) => Q
    is: (c: string, v: null) => Q
    eq: (c: string, v: unknown) => Q
    in: (c: string, v: unknown[]) => Q
    gt: (c: string, v: number) => Q
    order: (c: string) => Q
    limit: (n: number) => Q
  }
  const linhas = async (tabela: string, colunas: string, filtrar: (q: Q) => Q) => {
    try {
      const q = svc.from(tabela).select(colunas).eq("emp_proprietaria_id", emp) as unknown as Q
      const { data, error } = await filtrar(q)
      return error ? [] : ((data ?? []) as Record<string, unknown>[])
    } catch {
      return []
    }
  }

  if (pode("pessoal_gestao") || coordena) {
    for (const g of await linhas("pessoal_ferias_gozo", "id, funcionario_id, inicio, dias, ferias_periodo_id", (q) =>
      q.not("autorizado", "is", true).is("data_autorizacao", null).not("inicio", "is", null).order("inicio").limit(10)
    )) {
      candidatos.push({ tipo: "fe", id: String(g.id), pessoa: texto(g.funcionario_id), resumo: `${g.dias ?? "?"} dia(s) de férias a partir de ${formatarData(texto(g.inicio))}`, link: `/painel/pessoal/ferias/${g.ferias_periodo_id}` })
    }
  }
  if (pode("pessoal_gestao", ["pessoal_diarias", "diretoria_diarias", "configuracoes"]) || coordena) {
    for (const r of await linhas("pessoal_diarias_remessas", "id, codigo, beneficiario_id, beneficiario_tipo, valor_total", (q) =>
      q.is("bubble_id", null).not("enviado", "is", true).in("situacao", ["aberta", "reenviada"]).gt("valor_total", 0).limit(10)
    )) {
      const diretor = r.beneficiario_tipo === "diretor"
      candidatos.push({ tipo: "dr", id: String(r.id), pessoa: texto(r.beneficiario_id), resumo: `remessa de diárias ${r.codigo ?? ""} — ${formatarMoeda(Number(r.valor_total))}`, link: diretor ? `/painel/institucional/diretoria/diarias/remessas/${r.id}` : `/painel/pessoal/diarias/remessas/${r.id}` })
    }
    for (const d of await linhas("pessoal_diarias_solicitacoes", "id, funcionario_id, quantidade, data_inicio", (q) =>
      q.eq("situacao", "aguardando").is("remessa_id", null).limit(10)
    )) {
      candidatos.push({ tipo: "di", id: String(d.id), pessoa: texto(d.funcionario_id), resumo: `${d.quantidade ?? "?"} diária(s)${d.data_inicio ? ` a partir de ${formatarData(texto(d.data_inicio))}` : ""}`, link: `/painel/pessoal/diarias/${d.id}` })
    }
  }
  if (pode("pessoal_gestao", ["pessoal_reembolsos"])) {
    for (const r of await linhas("pessoal_reembolsos_act", "id, funcionario_id, valor_solicitado, descricao", (q) => q.eq("situacao", "aguardando").limit(10))) {
      candidatos.push({ tipo: "re", id: String(r.id), pessoa: texto(r.funcionario_id), resumo: `reembolso de ${formatarMoeda(Number(r.valor_solicitado))}: ${String(r.descricao ?? "").slice(0, 80)}`, link: `/painel/pessoal/reembolsos/${r.id}` })
    }
  }
  if (pode("pessoal_gestao", ["pessoal_faltas_justificadas"]) || coordena) {
    for (const f of await linhas("pessoal_faltas_justificadas", "id, funcionario_id, data_falta, justificativa_tipo", (q) =>
      q.not("autorizado", "is", true).not("recusado", "is", true).limit(10)
    )) {
      candidatos.push({ tipo: "fa", id: String(f.id), pessoa: texto(f.funcionario_id), resumo: `falta justificada em ${formatarData(texto(f.data_falta))} (${f.justificativa_tipo ?? "—"})`, link: `/painel/pessoal/faltas/${f.id}` })
    }
  }
  if (pode("viagens_gestao")) {
    for (const v of await linhas("viagens_solicitacoes", "id, beneficiario_usuario_id, convidado_nome, motivo", (q) => q.eq("situacao", "solicitada").order("created_at").limit(10))) {
      candidatos.push({ tipo: "vi", id: String(v.id), pessoa: texto(v.beneficiario_usuario_id), resumo: `pedido de viagem${v.convidado_nome ? ` de ${v.convidado_nome}` : ""}: ${String(v.motivo ?? "").slice(0, 80)}`, link: `/painel/institucional/viagens/${v.id}` })
    }
  }
  if (pode("financeiro_pagamento")) {
    for (const a of await linhas("financeiro_dados_bancarios_alteracoes", "id, usuario_id, acao", (q) => q.eq("situacao", "aguardando").limit(10))) {
      const verbo = a.acao === "incluir" ? "incluir uma conta" : a.acao === "alterar" ? "alterar uma conta" : "excluir uma conta"
      candidatos.push({ tipo: "db", id: String(a.id), pessoa: texto(a.usuario_id), resumo: `pediu para ${verbo} bancária`, link: "/painel/financeiro/contas-bancarias/alteracoes" })
    }
  }
  const caixa = await despesasParaReconhecer(uid).catch(() => ({ disponivel: false, lista: [] }))
  for (const d of caixa.lista) {
    candidatos.push({ tipo: "cx", id: d.id, pessoa: d.lancadaPorId, resumo: `${formatarMoeda(d.valor)} lançado no seu caixa "${d.contaNome ?? ""}": ${(d.descricao ?? "").slice(0, 80)}`, link: "/painel/perfil/caixa#reconhecer" })
  }

  const nomes = await nomesDosUsuarios(candidatos.map((c) => c.pessoa).filter((v): v is string => Boolean(v)))
  const itens: ItemPendente[] = []
  for (const c of candidatos) {
    if (itens.length >= limite) break
    // A mesma conferência do botão: só aparece o que a pessoa decide.
    if ((await decidir(ctx, c.tipo, c.id, true, null, true)).erro) continue
    const quem = c.pessoa ? nomes.get(c.pessoa) : null
    const titulo = TIPOS_PENDENCIA[c.tipo].nome
    itens.push({ tipo: c.tipo, id: c.id, link: c.link, texto: `${titulo.charAt(0).toUpperCase()}${titulo.slice(1)} — ${quem ? `${quem}: ` : ""}${c.resumo}` })
  }
  return itens
}

const LIMITE_ITENS = 8

/** /pendencias — o resumo da caixa de entrada e, item a item, os que têm botão. */
export async function responderPendencias(chatId: string, u: UsuarioTelegram): Promise<void> {
  const ctx = await contexto(u)
  if ("erro" in ctx) {
    await enviarTelegram({ chatId, texto: ctx.erro })
    return
  }
  const svc = await createAdminClient()
  const { data: pessoa } = await svc.from("usuarios").select("email").eq("id", ctx.uid).maybeSingle()
  const lista = await pendenciasPara({ client: svc, emp: ctx.emp, permissoes: ctx.perms, email: texto(pessoa?.email), usuarioId: ctx.uid, comAntigas: true })
  const origem = await origemAtual().catch(() => "")
  if (lista.length === 0) {
    await enviarTelegram({ chatId, texto: "Nada esperando por você agora. 🎉" })
    return
  }
  const total = lista.reduce((s, p) => s + p.quantidade, 0)
  const linhas = lista.map((p) => `• ${escaparHtmlTelegram(p.titulo)}: <b>${p.quantidade}</b>${p.antigas ? ` (${p.antigas} parada${p.antigas === 1 ? "" : "s"} há mais de 7 dias)` : ""}`)
  const resumo = mensagemComPainel(`${total} pendência${total === 1 ? "" : "s"} esperando você:\n\n${linhas.join("\n")}`, origem ? `${origem}/painel#caixa-entrada` : null)
  await enviarTelegram({ chatId, texto: resumo.texto, botoes: resumo.botoes })

  const itens = await itensComBotao(ctx, LIMITE_ITENS + 1)
  if (itens.length === 0) return
  await enviarTelegram({
    chatId,
    texto: `Dá para resolver aqui${itens.length > LIMITE_ITENS ? ` (os ${LIMITE_ITENS} primeiros; o resto, no painel)` : ""}:`,
  })
  for (const it of itens.slice(0, LIMITE_ITENS)) {
    const m = mensagemComPainel(escaparHtmlTelegram(it.texto), origem ? `${origem}${it.link}` : null, botoesPendencia(it.tipo, it.id))
    await enviarTelegram({ chatId, texto: m.texto, botoes: m.botoes })
  }
}
