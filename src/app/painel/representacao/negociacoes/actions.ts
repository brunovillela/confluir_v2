"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { diferenca, type Trecho } from "@/lib/acordos-comparar"
import { TIPOS_ACORDO, type TipoAcordo } from "@/lib/acordos-constantes"
import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import {
  adicionarDocumento,
  atualizarDocumento,
  atualizarNegociacao,
  concluirNegociacao,
  criarNegociacao,
  excluirDocumento,
  excluirEvento,
  excluirNegociacao,
  registrarEvento,
  textosDoQuadro,
  type DadosNegociacao,
} from "@/lib/db/negociacoes"
import { papelDocumento, situacaoNegociacao, tipoEvento } from "@/lib/negociacoes-constantes"

const BASE = "/painel/representacao/negociacoes"
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATA = /^\d{4}-\d{2}-\d{2}$/
const txt = (fd: FormData, n: string) => String(fd.get(n) ?? "").trim()
const ouNull = (v: string) => v || null
const dataOuNull = (v: string) => (DATA.test(v) ? v : null)

async function requireNegociacoes() {
  return requirePermissao("negociacoes")
}

function lerNegociacao(fd: FormData): DadosNegociacao | { erro: string } {
  const titulo = txt(fd, "titulo")
  if (!titulo) return { erro: "Dê um título à negociação." }
  const tipo = txt(fd, "tipo")
  const vigente = txt(fd, "acordo_vigente_id")
  const campanha = txt(fd, "campanha_id")
  return {
    titulo,
    tipo: TIPOS_ACORDO.some((t) => t.chave === tipo) ? (tipo as TipoAcordo) : "act",
    dataBase: ouNull(txt(fd, "data_base")),
    situacao: situacaoNegociacao(txt(fd, "situacao")),
    inicio: dataOuNull(txt(fd, "inicio")),
    acordoVigenteId: UUID.test(vigente) ? vigente : null,
    campanhaId: UUID.test(campanha) ? campanha : null,
    observacoes: ouNull(txt(fd, "observacoes")),
    empresaIds: fd.getAll("empresa").map(String).filter((v) => UUID.test(v)),
  }
}

export async function salvarNegociacaoAction(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const sessao = await requireNegociacoes()
  const dados = lerNegociacao(fd)
  if ("erro" in dados) return { erro: dados.erro }
  const id = txt(fd, "negociacao_id")
  if (id) {
    if (!UUID.test(id)) return { erro: "Negociação inválida." }
    const { erro } = await atualizarNegociacao(id, dados)
    if (erro) return { erro }
    revalidatePath(BASE)
    redirect(`${BASE}/${id}?salvo=1`)
  }
  const { id: novo, erro } = await criarNegociacao(dados, String(sessao.usuario.id))
  if (erro || !novo) return { erro: erro ?? "Não foi possível criar." }
  revalidatePath(BASE)
  redirect(`${BASE}/${novo}`)
}

export async function excluirNegociacaoAction(fd: FormData): Promise<void> {
  await requireNegociacoes()
  const id = txt(fd, "negociacao_id")
  if (!UUID.test(id)) return
  await excluirNegociacao(id)
  revalidatePath(BASE)
  redirect(`${BASE}?excluida=1`)
}

function lerDocumento(fd: FormData) {
  const papel = papelDocumento(txt(fd, "papel"))
  const rodada = Number.parseInt(txt(fd, "rodada"), 10)
  return {
    papel,
    rodada: Number.isFinite(rodada) && rodada > 0 && rodada < 100 ? rodada : null,
    data: dataOuNull(txt(fd, "data")),
    titulo: ouNull(txt(fd, "titulo")),
  }
}

/** Cria o documento e leva à página dele, onde se envia o PDF e se extraem as cláusulas. */
export async function adicionarDocumentoAction(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  await requireNegociacoes()
  const negociacaoId = txt(fd, "negociacao_id")
  const d = lerDocumento(fd)
  if (!UUID.test(negociacaoId)) return { erro: "Negociação inválida." }
  if (!d.papel) return { erro: "Escolha o tipo do documento." }
  const { id, erro } = await adicionarDocumento(negociacaoId, { ...d, papel: d.papel })
  if (erro || !id) return { erro: erro ?? "Não foi possível criar o documento." }
  revalidatePath(`${BASE}/${negociacaoId}`)
  redirect(`/painel/representacao/acordos/${id}`)
}

export async function atualizarDocumentoAction(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  await requireNegociacoes()
  const acordoId = txt(fd, "acordo_id")
  const d = lerDocumento(fd)
  if (!UUID.test(acordoId) || !d.papel) return { erro: "Dados inválidos." }
  const { negociacaoId, erro } = await atualizarDocumento(acordoId, { ...d, papel: d.papel })
  if (erro || !negociacaoId) return { erro: erro ?? "Documento não encontrado." }
  revalidatePath(`${BASE}/${negociacaoId}`)
  return { ok: "Documento salvo." }
}

export async function excluirDocumentoAction(fd: FormData): Promise<void> {
  await requireNegociacoes()
  const acordoId = txt(fd, "acordo_id")
  if (!UUID.test(acordoId)) return
  const { negociacaoId } = await excluirDocumento(acordoId)
  if (negociacaoId) {
    revalidatePath(`${BASE}/${negociacaoId}`)
    redirect(`${BASE}/${negociacaoId}#documentos`)
  }
}

export async function registrarEventoAction(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const sessao = await requireNegociacoes()
  const negociacaoId = txt(fd, "negociacao_id")
  const titulo = txt(fd, "titulo")
  const data = dataOuNull(txt(fd, "data"))
  if (!UUID.test(negociacaoId)) return { erro: "Negociação inválida." }
  if (!titulo || !data) return { erro: "Informe a data e o que aconteceu." }
  const { erro } = await registrarEvento(
    negociacaoId,
    { data, tipo: tipoEvento(txt(fd, "tipo")), titulo, descricao: ouNull(txt(fd, "descricao")) },
    String(sessao.usuario.id)
  )
  if (erro) return { erro }
  revalidatePath(`${BASE}/${negociacaoId}`)
  return { ok: "Registrado na linha do tempo." }
}

export async function excluirEventoAction(fd: FormData): Promise<void> {
  await requireNegociacoes()
  const id = txt(fd, "evento_id")
  const negociacaoId = txt(fd, "negociacao_id")
  if (!UUID.test(id)) return
  await excluirEvento(id)
  revalidatePath(`${BASE}/${negociacaoId}`)
}

export async function concluirNegociacaoAction(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  await requireNegociacoes()
  const negociacaoId = txt(fd, "negociacao_id")
  const documentoId = txt(fd, "documento_id")
  if (!UUID.test(negociacaoId) || !UUID.test(documentoId)) return { erro: "Escolha o documento do acordo final." }
  const inicio = dataOuNull(txt(fd, "vigencia_inicio"))
  const fim = dataOuNull(txt(fd, "vigencia_fim"))
  if (!inicio || !fim) return { erro: "Informe o início e o fim da vigência do novo acordo." }
  if (fim <= inicio) return { erro: "O fim da vigência precisa ser depois do início." }
  const { erro } = await concluirNegociacao(negociacaoId, { documentoId, vigenciaInicio: inicio, vigenciaFim: fim })
  if (erro) return { erro }
  revalidatePath(BASE)
  revalidatePath("/painel/representacao/acordos")
  redirect(`${BASE}/${negociacaoId}?concluida=1`)
}

/**
 * Diferença palavra a palavra entre duas cláusulas do quadro (vigente, pauta
 * ou proposta). As duas precisam ser do acordo vigente ou de documentos desta
 * negociação.
 */
export async function diferencaQuadroAction(
  negociacaoId: string,
  clausulaAntes: string,
  clausulaDepois: string
): Promise<{ trechos?: Trecho[]; erro?: string }> {
  await requireNegociacoes()
  if (![negociacaoId, clausulaAntes, clausulaDepois].every((v) => UUID.test(v))) return { erro: "Dados inválidos." }
  const textos = await textosDoQuadro(negociacaoId, [clausulaAntes, clausulaDepois])
  if (!textos) return { erro: "Cláusula fora desta negociação." }
  return { trechos: diferenca(textos.get(clausulaAntes) ?? "", textos.get(clausulaDepois) ?? "") }
}
