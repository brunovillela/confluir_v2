"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao, type SessaoPainel } from "@/lib/auth"
import { normalizarFiltros } from "@/lib/comunicacao-mensagens-constantes"
import { criarMalaDiretaPronta } from "@/lib/db/comunicacao-mensagens"
import { nomeEntidade } from "@/lib/db/organizacao"
import { formatarData } from "@/lib/formato"
import { origemAtual } from "@/lib/tenant-url"
import { type EstadoForm } from "@/lib/contas"
import { salvarModeloCarta } from "@/lib/db/oposicao-carta"
import {
  regrasDoFormulario,
  requireOposicao,
  salvarAvisoPrivacidade,
  salvarRegrasDaEntidade,
  sessaoParaOposicao,
} from "@/lib/db/oposicao-regras"
import { corpoDoBoletim, normalizarPerguntasFrequentes, textosDivulgacao, type PerguntaFrequente } from "@/lib/oposicao-orientacoes"
import {
  adicionarPergunta,
  atualizarCampanha,
  avaliarOpositor,
  criarCampanha,
  devolverCarta,
  excluirPergunta,
  obterCampanhaPublica,
  reverificarAssinaturaOposicao,
  completarMatriculaOposicao,
  type DadosCampanha,
} from "@/lib/db/oposicao"
import {
  avaliarEmLote,
  encerrarSemCarta,
  proximaParaAvaliar,
  registrarEnvioEmpregador,
  type PuladaLote,
} from "@/lib/db/oposicao-gestao"
import {
  lerTempoVideo,
  MEIOS_ENVIO,
  MODOS_FORMALIZACAO,
  SITUACOES_CAMPANHA,
  SITUACOES_OPOSITOR,
  type MeioEnvio,
  type ModoFormalizacao,
  type SituacaoCampanha,
  type SituacaoOpositor,
} from "@/lib/oposicao-constantes"

function texto(fd: FormData, campo: string): string {
  return String(fd.get(campo) ?? "").trim()
}
function ouNull(v: string): string | null {
  return v || null
}
/**
 * A permissão da ação na campanha (ou no padrão da entidade): com a decisão
 * "permissões separadas", configurar e avaliar pedem permissões próprias.
 */
async function exigirNaOposicao(
  acao: "configurar" | "avaliar",
  campanhaId: string | null
): Promise<{ sessao: SessaoPainel } | { erro: string }> {
  const r = await sessaoParaOposicao(acao, campanhaId)
  return r.erro !== undefined ? { erro: r.erro } : { sessao: r.sessao }
}

function revalidar(id?: string) {
  revalidatePath("/painel/representacao/oposicao")
  if (id) revalidatePath(`/painel/representacao/oposicao/${id}`)
}

function lerModo(fd: FormData): ModoFormalizacao {
  const m = texto(fd, "modo_formalizacao")
  return MODOS_FORMALIZACAO.some((x) => x.chave === m)
    ? (m as ModoFormalizacao)
    : "tela"
}
function lerSituacao(fd: FormData): SituacaoCampanha {
  const s = texto(fd, "situacao")
  return SITUACOES_CAMPANHA.some((x) => x.chave === s)
    ? (s as SituacaoCampanha)
    : "rascunho"
}

function lerDados(fd: FormData): DadosCampanha {
  return {
    nome: texto(fd, "nome"),
    detalhe_desconto: ouNull(texto(fd, "detalhe_desconto")),
    prazo_inicio: ouNull(texto(fd, "prazo_inicio")),
    prazo_fim: ouNull(texto(fd, "prazo_fim")),
    modo_formalizacao: lerModo(fd),
    situacao: lerSituacao(fd),
    texto_declaracao: ouNull(texto(fd, "texto_declaracao")),
    video_filiado_url: ouNull(texto(fd, "video_filiado_url")),
    video_filiado_tempo: lerTempoVideo(texto(fd, "video_filiado_tempo")),
    video_nao_filiado_url: ouNull(texto(fd, "video_nao_filiado_url")),
    video_nao_filiado_tempo: lerTempoVideo(texto(fd, "video_nao_filiado_tempo")),
    video_agradecimento_url: ouNull(texto(fd, "video_agradecimento_url")),
    fonteIds: fd.getAll("fonte").map(String).filter(Boolean),
    // Decisões jurídicas da campanha ("" = padrão da entidade).
    regras: regrasDoFormulario(fd),
    perguntasFrequentes: perguntasDoFormulario(fd),
  }
}

/** As perguntas frequentes da campanha: os pares pergunta/resposta, na ordem da tela. */
function perguntasDoFormulario(fd: FormData): PerguntaFrequente[] {
  const perguntas = fd.getAll("faq_pergunta").map(String)
  const respostas = fd.getAll("faq_resposta").map(String)
  return normalizarPerguntasFrequentes(perguntas.map((pergunta, i) => ({ pergunta, resposta: respostas[i] ?? "" })))
}

/** Salva as decisões jurídicas padrão da entidade. */
export async function salvarRegrasEntidadeAction(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const permissao = await exigirNaOposicao("configurar", null)
  if ("erro" in permissao) return { erro: permissao.erro }
  const { sessao } = permissao
  const { erro } = await salvarRegrasDaEntidade(regrasDoFormulario(fd), {
    id: sessao.usuario.id,
    nome: sessao.usuario.nome_completo ?? sessao.usuario.nome_guerra ?? null,
  })
  if (erro) return { erro }
  revalidatePath("/painel/representacao/oposicao")
  return { ok: "Decisões salvas. Valem para as campanhas que seguem o padrão e ainda não foram abertas." }
}

/** Salva o aviso de privacidade da oposição da entidade (vazio = padrão do sistema). */
export async function salvarAvisoPrivacidadeAction(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const permissao = await exigirNaOposicao("configurar", null)
  if ("erro" in permissao) return { erro: permissao.erro }
  const { sessao } = permissao
  const padrao = texto(fd, "restaurar") === "1"
  const { erro } = await salvarAvisoPrivacidade(padrao ? null : texto(fd, "aviso_privacidade"), {
    id: sessao.usuario.id,
    nome: sessao.usuario.nome_completo ?? sessao.usuario.nome_guerra ?? null,
  })
  if (erro) return { erro }
  revalidatePath("/painel/representacao/oposicao/decisoes")
  return {
    ok: padrao
      ? "O aviso voltou ao texto padrão do sistema."
      : "Aviso salvo. Vale para quem ainda vai ler; quem já se opôs guarda o texto que leu.",
  }
}

/**
 * O texto da carta (14/11/2026): o padrão da entidade (sem campanha_id) ou o
 * da campanha. "restaurar" volta ao nível de cima (campanha → entidade →
 * sistema). Só com a permissão de configurar.
 */
export async function salvarCartaAction(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const campanhaId = texto(fd, "campanha_id") || null
  const permissao = await exigirNaOposicao("configurar", campanhaId)
  if ("erro" in permissao) return { erro: permissao.erro }
  const { sessao } = permissao
  const restaurar = texto(fd, "restaurar") === "1"
  const { erro, restaurado } = await salvarModeloCarta(campanhaId, restaurar ? null : String(fd.get("carta_modelo") ?? ""), {
    id: sessao.usuario.id,
    nome: sessao.usuario.nome_completo ?? sessao.usuario.nome_guerra ?? null,
  })
  if (erro) return { erro }
  revalidatePath("/painel/representacao/oposicao/carta", "layout")
  if (campanhaId) revalidatePath(`/painel/representacao/oposicao/${campanhaId}/carta`, "layout")
  return {
    ok: restaurado
      ? campanhaId
        ? "A campanha voltou a usar o texto da entidade."
        : "A carta voltou ao texto padrão do sistema."
      : "Texto da carta salvo. Vale para as próximas oposições; quem já se opôs mantém a carta que registrou.",
  }
}

export async function criarCampanhaAction(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  const permissao = await exigirNaOposicao("configurar", texto(fd, "campanha_id") || null)
  if ("erro" in permissao) return { erro: permissao.erro }
  const { sessao } = permissao
  const { id, erro } = await criarCampanha(
    lerDados(fd),
    sessao.usuario.id
  )
  if (erro || !id) return { erro: erro ?? "Falha ao criar." }
  revalidar(id)
  redirect(`/painel/representacao/oposicao/${id}?salvo=1`)
}

/** Estado do formulário da campanha: `confirmar` = mudar decisão do ato pede confirmação. */
export type EstadoCampanhaForm = EstadoForm & { confirmar?: string }

export async function atualizarCampanhaAction(
  _prev: EstadoCampanhaForm,
  fd: FormData
): Promise<EstadoCampanhaForm> {
  const permissao = await exigirNaOposicao("configurar", texto(fd, "campanha_id") || null)
  if ("erro" in permissao) return { erro: permissao.erro }
  const { sessao } = permissao
  const id = texto(fd, "campanha_id")
  if (!id) return { erro: "Campanha inválida." }
  const { erro, confirmar } = await atualizarCampanha(id, lerDados(fd), sessao.usuario.id, {
    confirmarMudancaDoAto: texto(fd, "confirmar_mudanca_ato") === "1",
  })
  if (erro) return { erro }
  if (confirmar) return { confirmar }
  revalidar(id)
  redirect(`/painel/representacao/oposicao/${id}?salvo=1`)
}

export async function adicionarPerguntaAction(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  const permissao = await exigirNaOposicao("configurar", texto(fd, "campanha_id") || null)
  if ("erro" in permissao) return { erro: permissao.erro }
  const { sessao } = permissao
  const id = texto(fd, "campanha_id")
  const { erro } = await adicionarPergunta(id, texto(fd, "pergunta"), sessao.usuario.id)
  if (erro) return { erro }
  revalidar(id)
  return { ok: "Pergunta adicionada." }
}

export async function excluirPerguntaAction(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  const permissao = await exigirNaOposicao("configurar", texto(fd, "campanha_id") || null)
  if ("erro" in permissao) return { erro: permissao.erro }
  const { sessao } = permissao
  const { erro } = await excluirPergunta(texto(fd, "pergunta_id"), sessao.usuario.id)
  if (erro) return { erro }
  revalidar(texto(fd, "campanha_id"))
  return { ok: "Pergunta removida." }
}

/** Estado da avaliação: `exigeConfirmacao` mostra a caixa "Conferi o documento". */
export type EstadoAvaliar = EstadoForm & { exigeConfirmacao?: boolean }

export async function avaliarOpositorAction(
  _prev: EstadoAvaliar,
  fd: FormData
): Promise<EstadoAvaliar> {
  const permissao = await exigirNaOposicao("avaliar", texto(fd, "campanha_id") || null)
  if ("erro" in permissao) return { erro: permissao.erro }
  const { sessao } = permissao
  const id = texto(fd, "opositor_id")
  if (!id) return { erro: "Oposição inválida." }
  const decisao = texto(fd, "decisao")
  // "Pedir nova carta" (onda 2 das melhorias): volta a aguardar a carta.
  const { erro, exigeConfirmacao } =
    decisao === "devolver"
      ? await devolverCarta(id, texto(fd, "motivo") || null, sessao.usuario.id)
      : await avaliarOpositor(id, decisao === "aprovar", texto(fd, "motivo") || null, sessao.usuario.id, {
          confirmarAssinatura: texto(fd, "confirmar_assinatura") === "on",
        })
  if (erro) return { erro, exigeConfirmacao }
  if (decisao === "devolver") {
    revalidar(texto(fd, "campanha_id"))
    redirect(`/painel/representacao/oposicao/${texto(fd, "campanha_id")}/opositor/${id}?devolvida=1`)
  }
  const campanhaId = texto(fd, "campanha_id")
  revalidar(campanhaId)
  // "Salvar e ir para a próxima" (onda 2): a próxima não avaliada da campanha.
  if (texto(fd, "seguir") === "1") {
    const proxima = await proximaParaAvaliar(campanhaId, id)
    redirect(
      proxima
        ? `/painel/representacao/oposicao/${campanhaId}/opositor/${proxima}?avaliado=1`
        : `/painel/representacao/oposicao/${campanhaId}?situacao=nao_avaliada&fila=vazia`
    )
  }
  redirect(
    `/painel/representacao/oposicao/${campanhaId}/opositor/${id}?avaliado=1`
  )
}

export type EstadoLote = EstadoForm & { puladas?: PuladaLote[] }

/**
 * Avaliação em lote (onda 2): as marcadas na lista ou todas as filtradas
 * (o filtro vem nos campos ocultos, o mesmo da tela). Aprovar deixa de fora
 * quem tem pendência no checklist e devolve a lista delas.
 */
export async function avaliarEmLoteAction(_prev: EstadoLote, fd: FormData): Promise<EstadoLote> {
  const permissao = await exigirNaOposicao("avaliar", texto(fd, "campanha_id") || null)
  if ("erro" in permissao) return { erro: permissao.erro }
  const { sessao } = permissao
  const campanhaId = texto(fd, "campanha_id")
  if (!campanhaId) return { erro: "Campanha inválida." }
  const aprovar = texto(fd, "decisao") === "aprovar"
  const alcance = texto(fd, "alcance")
  const situacaoBruta = texto(fd, "situacao")
  const situacao = SITUACOES_OPOSITOR.some((x) => x.chave === situacaoBruta)
    ? (situacaoBruta as SituacaoOpositor)
    : "todas"
  const ids = fd.getAll("id").map(String).filter(Boolean)
  if (alcance !== "filtradas" && ids.length === 0) return { erro: "Marque ao menos uma oposição." }
  const r = await avaliarEmLote({
    campanhaId,
    alvo:
      alcance === "filtradas"
        ? { filtros: { situacao, busca: texto(fd, "busca"), fonteId: texto(fd, "fonte") || undefined } }
        : { ids },
    aprovar,
    motivo: texto(fd, "motivo") || null,
    usuarioId: sessao.usuario.id,
  })
  revalidar(campanhaId)
  if (r.erro && r.avaliadas === 0) return { erro: r.erro, puladas: r.puladas }
  const partes = [
    `${r.avaliadas.toLocaleString("pt-BR")} ${aprovar ? "aprovada(s)" : "reprovada(s)"}; os avisos saem aos poucos, nos próximos minutos.`,
    r.puladas.length ? `${r.puladas.length.toLocaleString("pt-BR")} ficaram de fora por pendência — avalie uma a uma (lista abaixo).` : null,
    r.foraDaSituacao ? `${r.foraDaSituacao.toLocaleString("pt-BR")} não estavam “não avaliadas” e não foram mexidas.` : null,
    r.restantes ? `${r.restantes.toLocaleString("pt-BR")} passaram do limite deste lote: repita para continuar.` : null,
    r.erro ? `Atenção: ${r.erro}` : null,
  ].filter(Boolean)
  return { ok: partes.join(" "), puladas: r.puladas }
}

/** Encerra, depois do prazo, as que não mandaram a carta (A12). */
export async function encerrarSemCartaAction(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const permissao = await exigirNaOposicao("avaliar", texto(fd, "campanha_id") || null)
  if ("erro" in permissao) return { erro: permissao.erro }
  const { sessao } = permissao
  const campanhaId = texto(fd, "campanha_id")
  if (!campanhaId) return { erro: "Campanha inválida." }
  const { encerradas, erro } = await encerrarSemCarta({ campanhaId, usuarioId: sessao.usuario.id })
  revalidar(campanhaId)
  if (erro && encerradas === 0) return { erro }
  if (encerradas === 0) return { ok: "Nenhuma oposição aguardando a carta com o prazo vencido." }
  return {
    ok: `${encerradas.toLocaleString("pt-BR")} encerrada(s) como “carta não enviada”; os avisos saem aos poucos.${erro ? ` Atenção: ${erro}` : ""}`,
  }
}

/** Registra o envio da relação de aprovadas a um empregador (C7). */
export async function registrarEnvioEmpregadorAction(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const permissao = await exigirNaOposicao("configurar", texto(fd, "campanha_id") || null)
  if ("erro" in permissao) return { erro: permissao.erro }
  const { sessao } = permissao
  const campanhaId = texto(fd, "campanha_id")
  if (!campanhaId) return { erro: "Campanha inválida." }
  const empresa = texto(fd, "empresa_id")
  const meio = texto(fd, "meio")
  if (!MEIOS_ENVIO.some((m) => m.chave === meio)) return { erro: "Escolha o meio do envio." }
  const { erro, quantidade } = await registrarEnvioEmpregador({
    campanhaId,
    empresaId: empresa && empresa !== "sem" ? empresa : null,
    meio: meio as MeioEnvio,
    referencia: texto(fd, "referencia") || null,
    observacao: texto(fd, "observacao") || null,
    usuario: { id: sessao.usuario.id, nome: sessao.usuario.nome_completo ?? sessao.usuario.nome_guerra ?? null },
  })
  if (erro) return { erro }
  revalidatePath(`/painel/representacao/oposicao/${campanhaId}/empregadores`)
  return { ok: `Envio registrado com ${(quantidade ?? 0).toLocaleString("pt-BR")} oposição(ões).` }
}

/** Passa a carta assinada de novo pelo validador (onda 3: legado e validador novo). */
/** "Completar matrícula" na oposição (23/11/2026): quem avalia informa a matrícula que faltou. */
export async function completarMatriculaAction(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const permissao = await exigirNaOposicao("avaliar", texto(fd, "campanha_id") || null)
  if ("erro" in permissao) return { erro: permissao.erro }
  const { sessao } = permissao
  const id = texto(fd, "opositor_id")
  const campanhaId = texto(fd, "campanha_id")
  if (!id) return { erro: "Oposição inválida." }
  const { erro } = await completarMatriculaOposicao(id, texto(fd, "matricula"), texto(fd, "origem"), sessao.usuario.id)
  if (erro) return { erro }
  revalidatePath(`/painel/representacao/oposicao/${campanhaId}/opositor/${id}`)
  revalidatePath(`/painel/representacao/oposicao/${campanhaId}`)
  return { ok: "Matrícula registrada." }
}

export async function reverificarAssinaturaAction(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const permissao = await exigirNaOposicao("avaliar", texto(fd, "campanha_id") || null)
  if ("erro" in permissao) return { erro: permissao.erro }
  const { sessao } = permissao
  const id = texto(fd, "opositor_id")
  const campanhaId = texto(fd, "campanha_id")
  if (!id) return { erro: "Oposição inválida." }
  const { erro, resumo } = await reverificarAssinaturaOposicao(id, sessao.usuario.id)
  if (erro) return { erro }
  revalidatePath(`/painel/representacao/oposicao/${campanhaId}/opositor/${id}`)
  return { ok: resumo }
}

/**
 * "Preparar a mensagem aos filiados" (15/11/2026): abre na Mala direta um
 * rascunho já preenchido com o texto do boletim (link marcado como e-mail), o
 * texto do WhatsApp e o recorte da campanha — filiados ativos das fontes dela,
 * ou todos, se ela não tem fonte marcada. Quem envia revisa e libera.
 */
export async function prepararMensagemAction(fd: FormData): Promise<void> {
  const id = texto(fd, "campanha_id")
  const sessao = await requirePermissao("comunicacao_mensagens")
  await requireOposicao("consultar", id)
  const [campanha, entidade, origem] = await Promise.all([
    obterCampanhaPublica(id),
    nomeEntidade(),
    origemAtual().catch(() => ""),
  ])
  if (!campanha) throw new Error("Campanha não encontrada.")
  const textos = textosDivulgacao({
    entidade,
    campanhaNome: campanha.nome,
    detalheDesconto: campanha.detalhe_desconto,
    campanha,
    link: `${origem}/portal/oposicao/${id}`,
    canais: { boletim: "email", whatsapp: "whatsapp" },
  })
  const nome = campanha.nome ?? "Contribuição assistencial"
  const r = await criarMalaDiretaPronta(sessao.usuario.id as string, {
    titulo: `Oposição — ${nome}`,
    assunto: `Oposição à contribuição assistencial: prazo até ${formatarData(campanha.prazo_fim)}`,
    corpo: corpoDoBoletim(textos.boletim),
    textoWhatsapp: textos.whatsapp,
    filtros: normalizarFiltros({ condicoes: ["Ativo"], fontes: campanha.fontes.map((f) => f.id) }),
  })
  if (!r.id) throw new Error(r.erro ?? "Não foi possível preparar a mensagem.")
  redirect(`/painel/comunicacao/mensagens/${r.id}`)
}

