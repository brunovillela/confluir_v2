import {
  asosTelegram,
  buscarFiliadoTelegram,
  diariasRecentesTelegram,
  informesTelegram,
  permissoesPorUsuario,
  resumoFeriasTelegram,
  ultimoContrachequeTelegram,
  usuarioPorChat,
  veiculosDisponiveisTelegram,
  vincularTelegramPorCodigo,
  type UsuarioTelegram,
} from "@/lib/db/telegram"
import { gerarTextoIA } from "@/lib/ia"
import { podeAcessar } from "@/lib/permissoes"
import { enviarTelegram } from "@/lib/telegram"

export const runtime = "nodejs"

/**
 * Webhook do bot do Telegram. O Telegram faz POST aqui a cada mensagem.
 * Autenticado pelo header `X-Telegram-Bot-Api-Secret-Token` (o `secret_token`
 * passado no setWebhook) = `TELEGRAM_WEBHOOK_SECRET`. SEMPRE responde 200 para
 * o Telegram não reenviar; erros viram mensagem ao usuário.
 *
 * Não precisa de n8n nem Edge Function — esta rota é o backend do bot.
 */
export async function POST(req: Request): Promise<Response> {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET
  const enviado = req.headers.get("x-telegram-bot-api-secret-token") ?? ""
  if (!secret || enviado !== secret) {
    return new Response("não autorizado", { status: 401 })
  }

  let update: Record<string, unknown>
  try {
    update = (await req.json()) as Record<string, unknown>
  } catch {
    return Response.json({ ok: true })
  }

  const msg = (update.message ?? update.edited_message) as
    | Record<string, unknown>
    | undefined
  const chat = msg?.chat as { id?: number | string } | undefined
  const texto = typeof msg?.text === "string" ? msg.text.trim() : ""
  if (!chat?.id || !texto) return Response.json({ ok: true })

  try {
    await tratar(String(chat.id), texto)
  } catch (e) {
    console.error("Erro no webhook do Telegram:", e)
  }
  return Response.json({ ok: true })
}

function primeiroNome(n: string | null | undefined): string {
  return (n ?? "").trim().split(/\s+/)[0] || "por aí"
}

async function tratar(chatId: string, texto: string): Promise<void> {
  // /start [codigo] — vínculo (deep link t.me/<bot>?start=<codigo>).
  if (texto === "/start" || texto.startsWith("/start ")) {
    const codigo = texto.split(/\s+/)[1]
    if (!codigo) {
      await enviarTelegram({
        chatId,
        texto:
          "Olá! Para usar o bot do Confluir, vincule sua conta em <b>Meu perfil → Telegram</b> no painel — você recebe um link que abre esta conversa já vinculada.",
      })
      return
    }
    const r = await vincularTelegramPorCodigo(codigo, chatId)
    if (r.erro === "codigo_invalido") {
      await enviarTelegram({
        chatId,
        texto: "Código inválido. Gere um novo em Meu perfil → Telegram.",
      })
      return
    }
    if (r.erro === "codigo_expirado") {
      await enviarTelegram({
        chatId,
        texto: "Código expirado. Gere um novo em Meu perfil → Telegram.",
      })
      return
    }
    if (r.erro) {
      await enviarTelegram({
        chatId,
        texto: "Não consegui vincular agora. Tente novamente em instantes.",
      })
      return
    }
    await enviarTelegram({
      chatId,
      texto: `Pronto, ${primeiroNome(r.nome)}! Seu Telegram foi vinculado ao Confluir${r.entidade ? ` · ${r.entidade}` : ""}. Agora confirme seu telefone em Meu perfil → Telegram para ativar o bot.`,
    })
    return
  }

  const u = await usuarioPorChat(chatId)
  if (!u) {
    await enviarTelegram({
      chatId,
      texto:
        "Sua conta ainda não está vinculada. Abra o Confluir → Meu perfil → Telegram e siga o link.",
    })
    return
  }

  // Gate: o bot só responde a quem confirmou o telefone no Confluir.
  if (!u.telefoneConfirmado) {
    await enviarTelegram({
      chatId,
      texto:
        "Para usar o bot, confirme seu telefone em <b>Meu perfil → Telegram</b> no Confluir: informe o número e digite o código que eu enviar aqui.",
    })
    return
  }

  if (texto === "/ajuda" || texto === "/help") {
    await enviarTelegram({
      chatId,
      texto: [
        `Olá, ${primeiroNome(u.nome)}!${u.entidade ? ` Bot do Confluir · ${u.entidade}.` : ""}`,
        "",
        "Comandos disponíveis:",
        "/contracheque — seu contracheque mais recente",
        "/ferias — seu saldo de férias",
        "/diarias — suas últimas solicitações de diária",
        "/informes — seus informes de rendimentos",
        "/asos — seus atestados de saúde ocupacional",
        "/carros — veículos disponíveis na frota",
        "/filiado &lt;nome ou CPF&gt; — consulta de filiação",
        "/eu — confirma sua conta vinculada",
        "/ajuda — esta mensagem",
        "",
        "<i>/carros e /filiado dependem da sua permissão no painel.</i>",
        "",
        "Você também pode escrever uma dúvida em texto que eu tento ajudar.",
      ].join("\n"),
    })
    return
  }

  if (texto === "/eu") {
    await enviarTelegram({
      chatId,
      texto: `Você está vinculado como <b>${u.nome ?? "usuário"}</b>${u.entidade ? ` · ${u.entidade}` : ""}.`,
    })
    return
  }

  if (texto === "/contracheque") {
    await responderContracheque(chatId, u)
    return
  }
  if (texto === "/ferias" || texto === "/férias") {
    await responderFerias(chatId, u)
    return
  }
  if (texto === "/diarias" || texto === "/diárias") {
    await responderDiarias(chatId, u)
    return
  }
  if (texto === "/informes" || texto === "/informe") {
    await responderInformes(chatId, u)
    return
  }
  if (texto === "/asos" || texto === "/aso") {
    await responderAsos(chatId, u)
    return
  }
  if (texto === "/carros" || texto === "/carro" || texto === "/veiculos") {
    await responderCarros(chatId, u)
    return
  }
  if (
    texto.startsWith("/filiado") ||
    texto.startsWith("/filiada") ||
    texto.startsWith("/filiacao") ||
    texto.startsWith("/filiação")
  ) {
    await responderFiliado(chatId, u, texto.replace(/^\/\S+\s*/, "").trim())
    return
  }

  // Texto livre → assistente por IA (sem acesso a dados sensíveis da pessoa).
  const { texto: resposta, erro } = await gerarTextoIA({
    system: `Você é o assistente do Confluir${u.entidade ? ` da entidade ${u.entidade}` : ""}, sistema de gestão de um sindicato, conversando pelo Telegram com um funcionário ou filiado. Responda em português do Brasil, de forma breve e cordial. O bot tem comandos: contracheque → /contracheque, férias → /ferias, diárias → /diarias, informes de rendimentos → /informes, atestados de saúde ocupacional (ASO) → /asos, veículos disponíveis → /carros, consulta de filiação por nome/CPF → /filiado <termo>. Oriente a usar o comando adequado. Para o restante (treinamentos, ASO detalhado etc.), oriente a consultar o painel do Confluir (área Meu perfil). Você NÃO tem acesso direto a esses dados nesta conversa em texto livre. Nunca invente informações.`,
    prompt: texto,
  })
  await enviarTelegram({
    chatId,
    texto:
      erro || !resposta
        ? "Não consegui responder agora. Consulte o painel do Confluir."
        : resposta,
    formato: null,
  })
}

// ── Comandos de relatório (dados do próprio usuário, escopados por emp) ───────

const REAL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })

/** "2024-05-10" → "10/05/2024"; devolve o valor cru se não casar. */
function dataBR(iso: string | null): string {
  const m = (iso ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : (iso ?? "—")
}

function capitalizar(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s
}

/** Sem emp não dá para escopar com segurança — nega em vez de vazar. */
function semEmp(u: UsuarioTelegram): boolean {
  return !u.emp
}

async function responderContracheque(
  chatId: string,
  u: UsuarioTelegram
): Promise<void> {
  if (semEmp(u)) {
    await enviarTelegram({ chatId, texto: "Não consegui identificar sua entidade. Refaça o vínculo em Meu perfil → Telegram." })
    return
  }
  const { disponivel, item } = await ultimoContrachequeTelegram(u.id, u.emp!)
  if (!disponivel) {
    await enviarTelegram({ chatId, texto: "Contracheques indisponíveis no momento. Tente pelo painel." })
    return
  }
  if (!item) {
    await enviarTelegram({ chatId, texto: "Você ainda não tem contracheque liberado." })
    return
  }
  if (!item.url) {
    await enviarTelegram({ chatId, texto: `Encontrei seu contracheque${item.remessaNome ? ` (${item.remessaNome})` : ""}, mas o arquivo está indisponível. Veja no painel → Meu perfil.` })
    return
  }
  await enviarTelegram({
    chatId,
    texto: [
      `Seu contracheque mais recente${item.remessaNome ? ` — <b>${item.remessaNome}</b>` : ""}:`,
      item.url,
      "",
      "<i>O link é pessoal e expira em 1 hora.</i>",
    ].join("\n"),
  })
}

async function responderFerias(
  chatId: string,
  u: UsuarioTelegram
): Promise<void> {
  if (semEmp(u)) {
    await enviarTelegram({ chatId, texto: "Não consegui identificar sua entidade. Refaça o vínculo em Meu perfil → Telegram." })
    return
  }
  const { disponivel, periodos, saldoTotal } = await resumoFeriasTelegram(u.id, u.emp!)
  if (!disponivel) {
    await enviarTelegram({ chatId, texto: "Férias indisponíveis no momento. Tente pelo painel." })
    return
  }
  if (periodos.length === 0) {
    await enviarTelegram({ chatId, texto: "Não encontrei períodos de férias no seu cadastro." })
    return
  }
  const abertos = periodos.filter((p) => !p.finalizado)
  const linhas = abertos.map(
    (p) =>
      `• Aquisitivo ${dataBR(p.aquisitivo)}: <b>${p.saldo}</b> dia(s) de saldo (${p.gozados} de ${p.descanso} gozados)`
  )
  await enviarTelegram({
    chatId,
    texto: [
      `Saldo de férias: <b>${saldoTotal}</b> dia(s) em ${abertos.length} período(s) em aberto.`,
      ...(linhas.length ? ["", ...linhas] : []),
      "",
      "<i>Para solicitar férias, use o painel → Meu perfil → Férias.</i>",
    ].join("\n"),
  })
}

async function responderDiarias(
  chatId: string,
  u: UsuarioTelegram
): Promise<void> {
  if (semEmp(u)) {
    await enviarTelegram({ chatId, texto: "Não consegui identificar sua entidade. Refaça o vínculo em Meu perfil → Telegram." })
    return
  }
  const { disponivel, itens } = await diariasRecentesTelegram(u.id, u.emp!)
  if (!disponivel) {
    await enviarTelegram({ chatId, texto: "As diárias ainda não estão disponíveis no sistema." })
    return
  }
  if (itens.length === 0) {
    await enviarTelegram({ chatId, texto: "Você não tem solicitações de diária." })
    return
  }
  const linhas = itens.map((d) => {
    const periodo = d.data_inicio ? `${dataBR(d.data_inicio)}${d.data_termino ? ` a ${dataBR(d.data_termino)}` : ""}` : "—"
    const valor = d.valor_total != null ? ` · ${REAL.format(d.valor_total)}` : ""
    const qtd = d.quantidade != null ? `${d.quantidade}× ` : ""
    return `• ${qtd}${d.tipoNome ?? "Diária"} — ${periodo} — <b>${capitalizar(d.situacao)}</b>${valor}`
  })
  await enviarTelegram({
    chatId,
    texto: [`Suas últimas ${itens.length} solicitação(ões) de diária:`, "", ...linhas].join("\n"),
  })
}

async function responderInformes(chatId: string, u: UsuarioTelegram): Promise<void> {
  if (semEmp(u)) {
    await enviarTelegram({ chatId, texto: "Não consegui identificar sua entidade. Refaça o vínculo em Meu perfil → Telegram." })
    return
  }
  const { disponivel, itens } = await informesTelegram(u.id, u.emp!)
  if (!disponivel) {
    await enviarTelegram({ chatId, texto: "Informes indisponíveis no momento. Tente pelo painel." })
    return
  }
  if (itens.length === 0) {
    await enviarTelegram({ chatId, texto: "Você não tem informe de rendimentos liberado." })
    return
  }
  const linhas = itens.map((i) =>
    i.url
      ? `• <b>${i.ano ?? "—"}</b>: ${i.url}`
      : `• <b>${i.ano ?? "—"}</b>: arquivo indisponível`
  )
  await enviarTelegram({
    chatId,
    texto: [
      "Seus informes de rendimentos:",
      "",
      ...linhas,
      "",
      "<i>Links pessoais — não compartilhe.</i>",
    ].join("\n"),
  })
}

async function responderAsos(chatId: string, u: UsuarioTelegram): Promise<void> {
  const { disponivel, itens } = await asosTelegram(u.id)
  if (!disponivel) {
    await enviarTelegram({ chatId, texto: "ASOs indisponíveis no momento. Tente pelo painel." })
    return
  }
  if (itens.length === 0) {
    await enviarTelegram({ chatId, texto: "Você não tem ASO registrado." })
    return
  }
  const linhas = itens.map((a) => {
    const status = a.vencido ? "⚠️ vencido" : "✅ válido"
    const venc = a.vencimento ? ` — vence ${dataBR(a.vencimento)}` : ""
    const atual = a.ultimo ? " (atual)" : ""
    return `• ${a.tipo ?? "ASO"}${atual} — realizado ${dataBR(a.data)}${venc} — ${status}`
  })
  await enviarTelegram({
    chatId,
    texto: [`Seus ASOs (${itens.length}):`, "", ...linhas].join("\n"),
  })
}

// ── Comandos institucionais (gateados por permissão) ─────────────────────────

/** CPF só dígitos → "123.***.***-01" (mostra 3 primeiros e 2 últimos). */
function cpfMascarado(cpf: string | null): string {
  const d = (cpf ?? "").replace(/\D/g, "")
  if (d.length !== 11) return cpf ?? "—"
  return `${d.slice(0, 3)}.***.***-${d.slice(9)}`
}

async function responderCarros(chatId: string, u: UsuarioTelegram): Promise<void> {
  if (semEmp(u)) {
    await enviarTelegram({ chatId, texto: "Não consegui identificar sua entidade. Refaça o vínculo em Meu perfil → Telegram." })
    return
  }
  const perms = await permissoesPorUsuario(u.id)
  if (!podeAcessar(perms, "veiculos", ["veiculos_gestao", "veiculos_condutores"])) {
    await enviarTelegram({ chatId, texto: "Você não tem permissão para consultar a frota." })
    return
  }
  const { disponivel, itens } = await veiculosDisponiveisTelegram(u.emp!)
  if (!disponivel) {
    await enviarTelegram({ chatId, texto: "A frota está indisponível no momento. Tente pelo painel." })
    return
  }
  if (itens.length === 0) {
    await enviarTelegram({ chatId, texto: "Nenhum carro disponível no momento (todos em uso, inativos ou em manutenção)." })
    return
  }
  const linhas = itens.map((v) => {
    const nome = v.marcaModelo ?? "Veículo"
    const detalhe = [v.codigo, v.placa].filter(Boolean).join(" · ")
    return `• <b>${nome}</b>${detalhe ? ` — ${detalhe}` : ""}`
  })
  await enviarTelegram({
    chatId,
    texto: [`${itens.length} veículo(s) disponível(is):`, "", ...linhas].join("\n"),
  })
}

async function responderFiliado(
  chatId: string,
  u: UsuarioTelegram,
  termo: string
): Promise<void> {
  if (semEmp(u)) {
    await enviarTelegram({ chatId, texto: "Não consegui identificar sua entidade. Refaça o vínculo em Meu perfil → Telegram." })
    return
  }
  const perms = await permissoesPorUsuario(u.id)
  if (!podeAcessar(perms, "filiacao_filiados", ["filiacao_gestao", "filiacao_receitas"])) {
    await enviarTelegram({ chatId, texto: "Você não tem permissão para consultar filiações." })
    return
  }
  if (termo.length < 3) {
    await enviarTelegram({ chatId, texto: "Envie o nome ou CPF a consultar. Ex.: <code>/filiado Maria Silva</code> ou <code>/filiado 12345678900</code>." })
    return
  }
  const { disponivel, itens } = await buscarFiliadoTelegram(termo, u.emp!)
  if (!disponivel) {
    await enviarTelegram({ chatId, texto: "A consulta de filiados está indisponível no momento." })
    return
  }
  if (itens.length === 0) {
    await enviarTelegram({ chatId, texto: `Nenhum filiado encontrado para “${termo}”.` })
    return
  }
  const linhas = itens.map((f) => {
    const status = f.ativo ? "✅ Ativo" : `⚠️ ${f.condicao ?? "Não ativo"}`
    const doc = f.cpf ? ` — CPF ${cpfMascarado(f.cpf)}` : f.matricula ? ` — matr. ${f.matricula}` : ""
    return `• <b>${f.nome ?? "Sem nome"}</b>${doc} — ${status}`
  })
  await enviarTelegram({
    chatId,
    texto: [`Resultado para “${termo}” (${itens.length}):`, "", ...linhas].join("\n"),
  })
}
