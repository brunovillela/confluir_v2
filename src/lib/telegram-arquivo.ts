import "server-only"

import { avisarQuemPode } from "@/lib/db/avisos"
import { hojeSP } from "@/lib/db/comum"
import { quadroParaDiaria } from "@/lib/db/diarias-diretoria"
import { vinculoComSindicato } from "@/lib/db/perfil"
import { listarFuncionarios } from "@/lib/db/pessoal"
import { criarAtestado } from "@/lib/db/pessoal-saude"
import { criarReembolso, listarTiposReembolso } from "@/lib/db/reembolsos"
import { permissoesPorUsuario, type UsuarioTelegram } from "@/lib/db/telegram"
import { criarAbastecimento, subirArquivoVeiculos } from "@/lib/db/veiculos"
import { casarCondutor, resolverAbastecimentos } from "@/lib/db/veiculos-abastecimentos-ia"
import { gerarJsonIADeImagem, gerarJsonIADePdf } from "@/lib/ia"
import { podeAcessar } from "@/lib/permissoes"
import { createAdminClient } from "@/lib/supabase/admin"
import { editarMensagemTelegram, enviarTelegram, responderCallbackTelegram } from "@/lib/telegram"
import {
  arquivoDaMensagem,
  escaparHtml,
  iniciarArquivoBot,
  lancamentoDoArquivo,
  LIMITE_BYTES_ARQUIVO,
  MIMES_ARQUIVO,
  normalizarLeitura,
  perguntaDoPassoArquivo,
  PREFIXO_CALLBACK_ARQUIVO,
  problemaDoArquivo,
  responderArquivoBot,
  ROTULO_TIPO_ARQUIVO,
  SISTEMA_LEITURA_ARQUIVO,
  type ArquivoTelegram,
  type ContextoArquivo,
  type EntradaArquivo,
  type EstadoArquivoBot,
  type PassoArquivo,
  type Pessoa,
  type TipoArquivo,
} from "@/lib/telegram-arquivo-fluxo"
import { tenantAtual } from "@/lib/tenant"
import { semAcento } from "@/lib/texto"
import { chavePlaca } from "@/lib/veiculos-constantes"

/**
 * Comprovante por foto ou PDF no bot do Telegram (31/10/2026). A pessoa manda
 * o arquivo; a IA (lib/ia.ts) lê e deduz o tipo; o roteiro
 * (lib/telegram-arquivo-fluxo.ts) completa o que falta e pede a confirmação.
 * Grava pelas MESMAS funções do painel:
 *   • reembolso do ACT → criarReembolso (funcionário com vínculo em vigor,
 *     como no Meu perfil; comprovante no bucket 'pessoal');
 *   • abastecimento → criarAbastecimento (o condutor é quem mandou:
 *     funcionário, diretor em exercício ou a gestão de veículos; cupom no
 *     bucket 'veiculos');
 *   • atestado → criarAtestado, que gera a ausência (o próprio, com vínculo
 *     em vigor; de outro funcionário, só a gestão de pessoal). A gestão é
 *     avisada como assunto sensível — nenhum canal leva o conteúdo.
 *
 * O arquivo só sobe ao storage no "Confirmar": até lá, a conversa guarda o
 * file_id do Telegram (`pessoal_telegram_arquivos`, 30 min). Como no /viagem,
 * a entidade da pessoa tem de ser a do endereço do webhook.
 */

const VALIDADE_MS = 30 * 60_000
const TABELA = "pessoal_telegram_arquivos"
const API = "https://api.telegram.org"

// ── Conversa ────────────────────────────────────────────────────────────────

async function lerConversa(chatId: string, u: UsuarioTelegram): Promise<EstadoArquivoBot | null> {
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
  return { passo: data.passo as PassoArquivo, dados: data.dados as EstadoArquivoBot["dados"] }
}

async function gravarConversa(chatId: string, u: UsuarioTelegram, c: EstadoArquivoBot): Promise<boolean> {
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
  if (error) console.error("Conversa de arquivo no Telegram:", error.message)
  return !error
}

/** Apaga e diz se havia linha — o "Confirmar" tocado duas vezes grava uma vez só. */
async function apagarConversa(chatId: string): Promise<boolean> {
  const svc = await createAdminClient()
  const { data } = await svc.from(TABELA).delete().eq("chat_id", chatId).select("chat_id")
  return (data ?? []).length > 0
}

// ── Quem pode o quê ─────────────────────────────────────────────────────────

type Alcance = { permitidos: TipoArquivo[]; atestadoDeOutros: boolean }

async function alcance(u: UsuarioTelegram): Promise<Alcance> {
  const [vinculo, perms, quadro] = await Promise.all([
    vinculoComSindicato(u.id).catch(() => ({ ativo: false })),
    permissoesPorUsuario(u.id).catch(() => null),
    quadroParaDiaria(u.id).catch(() => null),
  ])
  const funcionario = vinculo.ativo
  const atestadoDeOutros = podeAcessar(perms, "pessoal_gestao")
  const permitidos: TipoArquivo[] = []
  if (funcionario) permitidos.push("reembolso")
  if (quadro || podeAcessar(perms, "veiculos_gestao")) permitidos.push("abastecimento")
  if (funcionario || atestadoDeOutros) permitidos.push("atestado")
  return { permitidos, atestadoDeOutros }
}

/** Por que esta pessoa não manda arquivo por aqui (ou null, se pode). */
async function impedimento(u: UsuarioTelegram): Promise<string | null> {
  if (!u.emp) return "Não consegui identificar sua entidade. Refaça o vínculo em Meu perfil → Telegram."
  if (u.emp !== (await tenantAtual())) return "Para lançar comprovantes, use o painel da sua entidade."
  return null
}

// ── Contexto ────────────────────────────────────────────────────────────────

async function veiculosAtivos(): Promise<ContextoArquivo["veiculos"]> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("veiculos")
    .select("id, placa, marca_modelo, inativo")
    .eq("emp_proprietaria_id", await tenantAtual())
    .not("inativo", "is", true)
    .not("placa", "is", null)
    .order("placa")
  return ((data ?? []) as { id: string; placa: string; marca_modelo: string | null }[]).map((v) => ({
    id: String(v.id),
    placa: v.placa,
    rotulo: `${v.placa}${v.marca_modelo ? ` · ${v.marca_modelo}` : ""}`.slice(0, 40),
  }))
}

async function contexto(u: UsuarioTelegram, c?: EstadoArquivoBot): Promise<ContextoArquivo> {
  const tipo = c?.dados.tipo
  const precisaTipos = !c || tipo === "reembolso"
  const precisaVeiculos = !c || tipo === "abastecimento"
  const [tipos, veiculos] = await Promise.all([
    precisaTipos ? listarTiposReembolso().catch(() => ({ tipos: [] })) : Promise.resolve({ tipos: [] }),
    precisaVeiculos ? veiculosAtivos().catch(() => []) : Promise.resolve([]),
  ])
  return {
    hoje: hojeSP(),
    usuario: { id: u.id, nome: u.nome ?? "você" },
    tiposReembolso: tipos.tipos.filter((t) => t.ativa).map((t) => ({ id: t.id, nome: t.nome })),
    veiculos,
  }
}

async function funcionariosAtivos(): Promise<Pessoa[]> {
  const { linhas } = await listarFuncionarios({ situacao: "ativos" })
  return linhas.filter((f) => f.nome).map((f) => ({ id: f.usuarioId, nome: f.nome as string }))
}

/** Busca digitada: todas as palavras no nome, sem acento. */
async function buscarFuncionarios(termo: string): Promise<Pessoa[]> {
  const palavras = semAcento(termo).split(/\s+/).filter(Boolean)
  return (await funcionariosAtivos())
    .filter((p) => {
      const nome = semAcento(p.nome)
      return palavras.every((w) => nome.includes(w))
    })
    .slice(0, 8)
}

// ── Telegram: baixar o arquivo ──────────────────────────────────────────────

/** getFile + download. O Telegram entrega a bots arquivos de até 20 MB. */
async function baixarArquivo(fileId: string): Promise<{ bytes: Uint8Array } | { erro: string }> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) return { erro: "Bot não configurado." }
  try {
    const r = await fetch(`${API}/bot${token}/getFile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_id: fileId }),
    })
    const corpo = (await r.json().catch(() => null)) as
      | { ok?: boolean; result?: { file_path?: string; file_size?: number }; description?: string }
      | null
    const caminho = corpo?.result?.file_path
    if (!corpo?.ok || !caminho) {
      return { erro: /too big/i.test(corpo?.description ?? "") ? "O arquivo passa de 5 MB." : "Não consegui baixar o arquivo do Telegram." }
    }
    if ((corpo.result?.file_size ?? 0) > LIMITE_BYTES_ARQUIVO) return { erro: "O arquivo passa de 5 MB." }
    const arq = await fetch(`${API}/file/bot${token}/${caminho}`)
    if (!arq.ok) return { erro: "Não consegui baixar o arquivo do Telegram." }
    const bytes = new Uint8Array(await arq.arrayBuffer())
    if (bytes.byteLength > LIMITE_BYTES_ARQUIVO) return { erro: "O arquivo passa de 5 MB." }
    return { bytes }
  } catch (e) {
    console.error("Download do Telegram:", e)
    return { erro: "Não consegui baixar o arquivo do Telegram." }
  }
}

async function lerPelaIA(a: ArquivoTelegram, bytes: Uint8Array, legenda: string | null) {
  const base64 = Buffer.from(bytes).toString("base64")
  const prompt = [
    "Leia o documento anexo e devolva o JSON pedido.",
    legenda ? `Legenda que a pessoa escreveu junto (pista do que é): "${legenda.slice(0, 200)}"` : "",
  ]
    .filter(Boolean)
    .join("\n")
  const r =
    a.mime === "application/pdf"
      ? await gerarJsonIADePdf({ system: SISTEMA_LEITURA_ARQUIVO, prompt, pdfBase64: base64 })
      : await gerarJsonIADeImagem({ system: SISTEMA_LEITURA_ARQUIVO, prompt, imagemBase64: base64, mimeType: a.mime })
  return r
}

// ── Perguntar ───────────────────────────────────────────────────────────────

/**
 * Abastecimento pronto para confirmar: a mesma conferência da importação do
 * painel (já lançado, km abaixo do último, preço por litro estranho).
 */
async function conferirAbastecimento(c: EstadoArquivoBot, ctx: ContextoArquivo): Promise<EstadoArquivoBot> {
  const d = c.dados
  if (c.passo !== "confirmar" || d.tipo !== "abastecimento") return c
  const v = ctx.veiculos.find((x) => x.id === d.veiculoId)
  if (!v || !d.dataHora || !d.litros || !d.valor) return c
  try {
    const [linha] = await resolverAbastecimentos(
      [
        {
          placa: v.placa,
          data: d.dataHora.slice(0, 10),
          hora: d.dataHora.slice(11, 16),
          posto: d.posto ?? null,
          cidade: d.cidade ?? null,
          combustivel: d.combustivel ?? null,
          litros: d.litros,
          valor: d.valor,
          hodometro: d.hodometro ?? null,
          condutor: null,
        },
      ],
      null
    )
    if (!linha) return c
    return {
      ...c,
      dados: { ...d, alertas: linha.alertas, duplicado: linha.situacao === "duplicado" },
    }
  } catch (e) {
    console.error("Conferência do abastecimento (Telegram):", e)
    return c
  }
}

async function perguntar(chatId: string, c: EstadoArquivoBot, ctx: ContextoArquivo, prefixo?: string): Promise<void> {
  const p = perguntaDoPassoArquivo(c, ctx)
  await enviarTelegram({
    chatId,
    texto: prefixo ? `${prefixo}\n\n${p.texto}` : p.texto,
    botoes: p.botoes,
  })
}

// ── Entrada: o arquivo ──────────────────────────────────────────────────────

/**
 * Foto ou documento recebido. Devolve false se a mensagem não traz arquivo
 * (o webhook segue com o texto).
 */
export async function tratarArquivoTelegram(
  chatId: string,
  msg: Record<string, unknown>,
  u: UsuarioTelegram
): Promise<boolean> {
  const arquivo = arquivoDaMensagem(msg)
  if (!arquivo) return false

  const barrado = await impedimento(u)
  if (barrado) {
    await enviarTelegram({ chatId, texto: barrado })
    return true
  }
  const problema = problemaDoArquivo(arquivo)
  if (problema) {
    await enviarTelegram({ chatId, texto: problema })
    return true
  }
  const { permitidos, atestadoDeOutros } = await alcance(u)
  const ctx = await contexto(u)
  const efetivos = permitidos.filter(
    (t) => (t !== "reembolso" || ctx.tiposReembolso.length > 0) && (t !== "abastecimento" || ctx.veiculos.length > 0)
  )
  if (efetivos.length === 0) {
    await enviarTelegram({
      chatId,
      texto:
        "Por aqui dá para lançar reembolso do ACT, abastecimento e atestado — e nenhum deles está aberto para você. Se precisar, lance pelo painel ou fale com a gestão.",
    })
    return true
  }

  await enviarTelegram({ chatId, texto: "📄 Recebi. Lendo o arquivo…" })
  const baixado = await baixarArquivo(arquivo.fileId)
  if ("erro" in baixado) {
    await enviarTelegram({ chatId, texto: `${baixado.erro} Mande de novo, como foto ou PDF de até 5 MB.` })
    return true
  }
  const legenda = typeof msg.caption === "string" ? msg.caption.trim() : null
  const lida = await lerPelaIA(arquivo, baixado.bytes, legenda)
  if (lida.erro) console.error("Leitura do arquivo do Telegram:", lida.erro)
  const lido = normalizarLeitura(lida.dados as Record<string, unknown> | undefined)

  // Pistas que dependem do banco: a placa na frota e (para a gestão) de quem é o atestado.
  const placa = lido.placa
  const veiculoSugeridoId = placa
    ? (ctx.veiculos.find((v) => chavePlaca(v.placa) === chavePlaca(placa))?.id ?? null)
    : null
  let sugestaoFuncionario: Pessoa | null = null
  if (atestadoDeOutros && lido.paciente) {
    sugestaoFuncionario = casarCondutor(lido.paciente, await funcionariosAtivos().catch(() => []))
  }

  let c = iniciarArquivoBot(arquivo, lido, efetivos, atestadoDeOutros, ctx, { veiculoSugeridoId, sugestaoFuncionario })
  c = await conferirAbastecimento(c, ctx)
  if (!(await gravarConversa(chatId, u, c))) {
    await enviarTelegram({ chatId, texto: "Lançar comprovantes pelo Telegram ainda não está disponível. Use o painel." })
    return true
  }
  const prefixo = lida.erro
    ? "Não consegui ler o arquivo agora — vamos preencher juntos. A qualquer momento, /cancelar desiste."
    : c.dados.tipo
      ? `Li o arquivo: parece <b>${ROTULO_TIPO_ARQUIVO[c.dados.tipo].toLowerCase()}</b>. A qualquer momento, /cancelar desiste.`
      : undefined
  await perguntar(chatId, c, ctx, prefixo)
  return true
}

// ── Respostas ───────────────────────────────────────────────────────────────

async function aplicar(chatId: string, u: UsuarioTelegram, c: EstadoArquivoBot, entrada: EntradaArquivo): Promise<void> {
  const ctx = await contexto(u, c)
  const r = responderArquivoBot(c, entrada, ctx)
  if ("cancelar" in r) {
    await apagarConversa(chatId)
    await enviarTelegram({ chatId, texto: "Cancelado. Nada foi lançado." })
    return
  }
  if ("erro" in r) {
    const p = perguntaDoPassoArquivo(c, ctx)
    await enviarTelegram({ chatId, texto: `${r.erro}\n\n${p.texto}`, botoes: p.botoes })
    return
  }
  if ("confirmar" in r) {
    await concluir(chatId, u, c, ctx)
    return
  }
  let proximo = r.estado
  if ("buscarFuncionario" in r) {
    proximo = {
      ...proximo,
      dados: { ...proximo.dados, opcoesFuncionario: await buscarFuncionarios(r.buscarFuncionario).catch(() => []) },
    }
  }
  // O tipo pode ter mudado (Corrigir → mudar o tipo): recarrega a lista certa.
  const ctxProximo = proximo.dados.tipo !== c.dados.tipo ? await contexto(u, proximo) : ctx
  proximo = await conferirAbastecimento(proximo, ctxProximo)
  await gravarConversa(chatId, u, proximo)
  await perguntar(chatId, proximo, ctxProximo)
}

function arquivoParaFile(bytes: Uint8Array, a: ArquivoTelegram): File {
  const ext = MIMES_ARQUIVO[a.mime] ?? "bin"
  return new File([Buffer.from(bytes)], `comprovante.${ext}`, { type: a.mime })
}

async function subirPessoal(pasta: string, dono: string, bytes: Uint8Array, a: ArquivoTelegram) {
  const caminho = `${pasta}/${dono}-${Date.now()}.${MIMES_ARQUIVO[a.mime]}`
  const admin = await createAdminClient()
  const { error } = await admin.storage.from("pessoal").upload(caminho, Buffer.from(bytes), { contentType: a.mime })
  return error ? { erro: `Falha ao guardar o arquivo: ${error.message}` } : { caminho }
}

async function removerDoStorage(bucket: string, caminho: string): Promise<void> {
  await (await createAdminClient()).storage.from(bucket).remove([caminho]).catch(() => undefined)
}

async function concluir(chatId: string, u: UsuarioTelegram, c: EstadoArquivoBot, ctx: ContextoArquivo): Promise<void> {
  const l = lancamentoDoArquivo(c.dados)
  if (!l) {
    await apagarConversa(chatId)
    await enviarTelegram({ chatId, texto: "Faltou algum dado. Mande o arquivo de novo." })
    return
  }
  // Quem apagar a linha é quem grava: dois toques em Confirmar dão um lançamento só.
  if (!(await apagarConversa(chatId))) return

  // A régua pode ter mudado no meio da conversa (vínculo encerrado, permissão retirada).
  const { permitidos, atestadoDeOutros } = await alcance(u)
  const deOutro = l.tipo === "atestado" && l.funcionarioId !== u.id
  if (!permitidos.includes(l.tipo) || (deOutro && !atestadoDeOutros)) {
    await enviarTelegram({ chatId, texto: "Você não tem mais permissão para esse lançamento. Nada foi gravado." })
    return
  }
  const voltar = async (erro: string) => {
    await gravarConversa(chatId, u, c)
    await enviarTelegram({
      chatId,
      texto: `Não consegui lançar: ${escaparHtml(erro)}. Tente de novo.`,
      botoes: perguntaDoPassoArquivo(c, ctx).botoes,
    })
  }

  const baixado = await baixarArquivo(c.dados.arquivo.fileId)
  if ("erro" in baixado) return voltar(baixado.erro)
  const a = c.dados.arquivo

  if (l.tipo === "reembolso") {
    const up = await subirPessoal("reembolsos", u.id, baixado.bytes, a)
    if ("erro" in up || !up.caminho) return voltar(up.erro ?? "falha ao guardar o arquivo")
    const { erro } = await criarReembolso({
      funcionario_id: u.id,
      tipo_id: l.tipoReembolsoId,
      valor_solicitado: l.valor,
      descricao: l.descricao,
      comprovante_url: up.caminho,
    })
    if (erro) {
      await removerDoStorage("pessoal", up.caminho)
      return voltar(erro)
    }
    await enviarTelegram({
      chatId,
      texto: "✅ Pedido de reembolso enviado à gestão de pessoal, com o comprovante. Você recebe aviso quando for avaliado; acompanhe em Meu perfil → Reembolsos.",
    })
    return
  }

  if (l.tipo === "abastecimento") {
    const up = await subirArquivoVeiculos(`abastecimentos/${l.veiculoId}`, arquivoParaFile(baixado.bytes, a))
    if (up.erro || !up.caminho) return voltar(up.erro ?? "falha ao guardar o cupom")
    const { erro } = await criarAbastecimento({
      veiculo_id: l.veiculoId,
      condutor_usuario_id: u.id,
      posto: l.posto,
      cidade: l.cidade,
      combustivel: l.combustivel,
      volume: l.litros,
      valor: l.valor,
      hodometro: l.hodometro,
      data_hora: l.dataHora,
      comprovante_url: up.caminho,
    })
    if (erro) {
      await removerDoStorage("veiculos", up.caminho)
      return voltar(erro)
    }
    await enviarTelegram({ chatId, texto: "✅ Abastecimento lançado, com o cupom guardado." })
    return
  }

  const up = await subirPessoal("atestados", l.funcionarioId, baixado.bytes, a)
  if ("erro" in up || !up.caminho) return voltar(up.erro ?? "falha ao guardar o arquivo")
  const { erro } = await criarAtestado({
    funcionario_id: l.funcionarioId,
    inicio: l.inicio,
    termino: l.termino,
    quantidade_dias: l.dias,
    cid10: l.cid,
    consideracao: `Enviado pelo Telegram por ${u.nome ?? "usuário"}.`,
    atestado_acompanhamento: l.acompanhamento,
    nome_acompanhado: l.nomeAcompanhado,
    filho_menor_6_anos: false,
    arquivo: up.caminho,
  })
  if (erro) {
    await removerDoStorage("pessoal", up.caminho)
    return voltar(erro)
  }
  // Saúde: o aviso diz só que há um registro novo — o detalhe fica no painel.
  await avisarQuemPode("pessoal_gestao", [], {
    texto: `${u.nome ?? "Um funcionário"} enviou um atestado pelo Telegram.`,
    link: `/painel/pessoal/atestados/funcionario/${l.funcionarioId}`,
    evento: "pendencia_pessoal",
    assunto: "Atestado recebido pelo Telegram",
    exceto: u.id,
    sensivel: true,
  }).catch((e) => console.error("Aviso de atestado (Telegram):", e))
  await enviarTelegram({
    chatId,
    texto: deOutro
      ? "✅ Atestado registrado; a ausência do período já entrou."
      : "✅ Atestado registrado e a ausência do período já entrou. A gestão de pessoal foi avisada.",
  })
}

/**
 * Texto digitado com um comprovante em andamento: vira a resposta do passo
 * atual. Comandos (/…) seguem para o bot, salvo o /cancelar.
 */
export async function tratarTextoArquivo(chatId: string, texto: string, u: UsuarioTelegram): Promise<boolean> {
  if (texto.startsWith("/") && texto !== "/cancelar") return false
  const c = await lerConversa(chatId, u)
  if (!c) return false
  await aplicar(chatId, u, c, { texto })
  return true
}

/** Botão do comprovante (callback "ar:…"). */
export async function tratarCallbackArquivo(p: {
  callbackId: string
  chatId: string
  messageId: number | null
  textoDaMensagem: string | null
  dado: string
  u: UsuarioTelegram
}): Promise<boolean> {
  if (!p.dado.startsWith(PREFIXO_CALLBACK_ARQUIVO)) return false
  const barrado = await impedimento(p.u)
  if (barrado) {
    await responderCallbackTelegram(p.callbackId, barrado, true)
    return true
  }
  const c = await lerConversa(p.chatId, p.u)
  if (!c) {
    await responderCallbackTelegram(p.callbackId, "Expirou. Mande o arquivo de novo.", true)
    return true
  }
  await responderCallbackTelegram(p.callbackId)
  // Tira os botões da pergunta respondida (não dá para tocar duas vezes).
  if (p.messageId !== null && p.textoDaMensagem) {
    await editarMensagemTelegram(p.chatId, p.messageId, escaparHtml(p.textoDaMensagem))
  }
  await aplicar(p.chatId, p.u, c, { botao: p.dado.slice(PREFIXO_CALLBACK_ARQUIVO.length) })
  return true
}
