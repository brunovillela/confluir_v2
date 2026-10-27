"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import {
  adicionarPergunta,
  atualizarCampanha,
  avaliarOpositor,
  criarCampanha,
  excluirPergunta,
  subirDocumentoModelo,
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
function numero(fd: FormData, campo: string): number | null {
  const v = texto(fd, campo)
  return v && !Number.isNaN(Number(v)) ? Number(v) : null
}

async function requireOposicao() {
  return requirePermissao("oposicao")
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

/** Sobe o PDF-modelo se enviado; devolve caminho, `undefined` (não mexer) ou erro. */
async function lerModelo(
  fd: FormData
): Promise<{ caminho?: string | null; erro?: string }> {
  const arq = fd.get("documento_modelo")
  if (!(arq instanceof File) || arq.size === 0) return { caminho: undefined }
  const { caminho, erro } = await subirDocumentoModelo(arq)
  if (erro) return { erro }
  return { caminho }
}

function lerDados(fd: FormData): Omit<DadosCampanha, "documento_modelo_url"> {
  return {
    nome: texto(fd, "nome"),
    detalhe_desconto: ouNull(texto(fd, "detalhe_desconto")),
    prazo_inicio: ouNull(texto(fd, "prazo_inicio")),
    prazo_fim: ouNull(texto(fd, "prazo_fim")),
    modo_formalizacao: lerModo(fd),
    situacao: lerSituacao(fd),
    texto_declaracao: ouNull(texto(fd, "texto_declaracao")),
    video_filiado_url: ouNull(texto(fd, "video_filiado_url")),
    video_filiado_tempo: numero(fd, "video_filiado_tempo"),
    video_nao_filiado_url: ouNull(texto(fd, "video_nao_filiado_url")),
    video_nao_filiado_tempo: numero(fd, "video_nao_filiado_tempo"),
    video_agradecimento_url: ouNull(texto(fd, "video_agradecimento_url")),
    fonteIds: fd.getAll("fonte").map(String).filter(Boolean),
  }
}

export async function criarCampanhaAction(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  const sessao = await requireOposicao()
  const { caminho, erro: erroArq } = await lerModelo(fd)
  if (erroArq) return { erro: erroArq }
  const { id, erro } = await criarCampanha(
    { ...lerDados(fd), documento_modelo_url: caminho ?? null },
    sessao.usuario.id
  )
  if (erro || !id) return { erro: erro ?? "Falha ao criar." }
  revalidar(id)
  redirect(`/painel/representacao/oposicao/${id}?salvo=1`)
}

export async function atualizarCampanhaAction(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  const sessao = await requireOposicao()
  const id = texto(fd, "campanha_id")
  if (!id) return { erro: "Campanha inválida." }
  const { caminho, erro: erroArq } = await lerModelo(fd)
  if (erroArq) return { erro: erroArq }
  const { erro } = await atualizarCampanha(
    id,
    { ...lerDados(fd), documento_modelo_url: caminho },
    sessao.usuario.id
  )
  if (erro) return { erro }
  revalidar(id)
  redirect(`/painel/representacao/oposicao/${id}?salvo=1`)
}

export async function adicionarPerguntaAction(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  const sessao = await requireOposicao()
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
  const sessao = await requireOposicao()
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
  const sessao = await requireOposicao()
  const id = texto(fd, "opositor_id")
  if (!id) return { erro: "Oposição inválida." }
  const aprovar = texto(fd, "decisao") === "aprovar"
  const { erro, exigeConfirmacao } = await avaliarOpositor(
    id,
    aprovar,
    texto(fd, "motivo") || null,
    sessao.usuario.id,
    { confirmarAssinatura: texto(fd, "confirmar_assinatura") === "on" }
  )
  if (erro) return { erro, exigeConfirmacao }
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
  const sessao = await requireOposicao()
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
  const sessao = await requireOposicao()
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
  const sessao = await requireOposicao()
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
