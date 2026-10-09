"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { podeAcessar } from "@/lib/permissoes"
import { type EstadoForm } from "@/lib/contas"
import {
  acordosSigilosos,
  adicionarClausula,
  atualizarAcordo,
  criarAcordo,
  excluirClausula,
  subirDocumentoAcordo,
  type DadosAcordo,
} from "@/lib/db/acordos"
import {
  CATEGORIAS_CLAUSULA,
  SITUACOES_ACORDO,
  TIPOS_ACORDO,
  type CategoriaClausula,
  type SituacaoAcordo,
  type TipoAcordo,
  temaClausula,
} from "@/lib/acordos-constantes"
import {
  confirmarDocumento,
  criarEnvioDocumento,
  extrairClausulasDoAcordo,
  juntarComProxima,
  marcarClausulasRevisadas,
  salvarClausula,
} from "@/lib/db/acordos-extracao"
import {
  adotarRascunho,
  criarEnvioRascunho,
  lerDadosDoRascunho,
  type DadosLidos,
} from "@/lib/db/acordos-leitura"

function texto(fd: FormData, campo: string): string {
  return String(fd.get(campo) ?? "").trim()
}
function ouNull(v: string): string | null {
  return v || null
}
async function requireAcordos() {
  return requirePermissao("acordos_coletivos")
}

/**
 * Para as ações sobre UM acordo: quem negocia também mexe nos documentos da
 * negociação (pauta, propostas), que são sigilosos para quem só tem
 * `acordos_coletivos`. Devolve a mensagem de recusa, ou null.
 */
async function recusaDoAcordo(acordoId: string): Promise<string | null> {
  const sessao = await requirePermissao("acordos_coletivos", ["negociacoes"])
  const sigiloso = (await acordosSigilosos([acordoId])).has(acordoId)
  const chave = sigiloso ? "negociacoes" : "acordos_coletivos"
  return podeAcessar(sessao.permissoes, chave) ? null : "Sem acesso a este acordo."
}
function revalidar(id?: string) {
  revalidatePath("/painel/representacao/acordos")
  revalidatePath("/painel/representacao")
  if (id) revalidatePath(`/painel/representacao/acordos/${id}`)
}

async function lerDocumento(
  fd: FormData
): Promise<{ caminho?: string | null; erro?: string }> {
  const arq = fd.get("documento")
  if (!(arq instanceof File) || arq.size === 0) return { caminho: undefined }
  const { caminho, erro } = await subirDocumentoAcordo(arq)
  if (erro) return { erro }
  return { caminho }
}

function lerDados(fd: FormData): Omit<DadosAcordo, "documento_url"> {
  const tipo = texto(fd, "tipo")
  const situacao = texto(fd, "situacao")
  return {
    tipo: TIPOS_ACORDO.some((t) => t.chave === tipo)
      ? (tipo as TipoAcordo)
      : "act",
    titulo: ouNull(texto(fd, "titulo")),
    numero_registro: ouNull(texto(fd, "numero_registro")),
    data_base: ouNull(texto(fd, "data_base")),
    vigencia_inicio: ouNull(texto(fd, "vigencia_inicio")),
    vigencia_fim: ouNull(texto(fd, "vigencia_fim")),
    abrangencia: ouNull(texto(fd, "abrangencia")),
    situacao: SITUACOES_ACORDO.some((s) => s.chave === situacao)
      ? (situacao as SituacaoAcordo)
      : "em_negociacao",
    observacoes: ouNull(texto(fd, "observacoes")),
    com_funcionarios_entidade: fd.get("com_funcionarios_entidade") === "on",
    fonteIds: fd.getAll("fonte").map(String).filter(Boolean),
  }
}

export async function criarAcordoAction(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  await requireAcordos()
  // PDF lido pela IA: já está no armazenamento como rascunho.
  const rascunho = texto(fd, "rascunho")
  const { caminho, erro: erroArq } = rascunho ? { caminho: null, erro: undefined } : await lerDocumento(fd)
  if (erroArq) return { erro: erroArq }
  const { id, erro } = await criarAcordo({
    ...lerDados(fd),
    documento_url: caminho ?? null,
  })
  if (erro || !id) return { erro: erro ?? "Falha ao criar." }

  let extracao = ""
  if (rascunho) {
    const adotado = await adotarRascunho(id, rascunho)
    if (adotado.erro) {
      extracao = "&extracao=sem-pdf"
    } else if (fd.get("separar_clausulas") === "on") {
      // Falha na separação não desfaz o acordo: a página oferece tentar de novo.
      const r = await extrairClausulasDoAcordo(id)
      extracao = r.erro ? "&extracao=falhou" : `&clausulas=${r.clausulas ?? 0}`
    }
  }
  revalidar(id)
  redirect(`/painel/representacao/acordos/${id}?salvo=1${extracao}`)
}

// ── Novo acordo pelo PDF (09/10/2026) ───────────────────────────────────────

/** Link de envio direto do PDF (rascunho), antes de o acordo existir. */
export async function prepararRascunhoAction(): Promise<{
  caminho?: string
  token?: string
  erro?: string
}> {
  await requireAcordos()
  return criarEnvioRascunho()
}

/** A IA lê o PDF enviado e sugere os dados do acordo. */
export async function lerPdfDoAcordoAction(
  caminho: string
): Promise<{ dados?: DadosLidos; erro?: string }> {
  await requireAcordos()
  return lerDadosDoRascunho(caminho)
}

export async function atualizarAcordoAction(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  const id = texto(fd, "acordo_id")
  if (!id) return { erro: "Acordo inválido." }
  const recusa = await recusaDoAcordo(id)
  if (recusa) return { erro: recusa }
  const { caminho, erro: erroArq } = await lerDocumento(fd)
  if (erroArq) return { erro: erroArq }
  const { erro } = await atualizarAcordo(id, {
    ...lerDados(fd),
    documento_url: caminho,
  })
  if (erro) return { erro }
  revalidar(id)
  redirect(`/painel/representacao/acordos/${id}?salvo=1`)
}

export async function adicionarClausulaAction(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  const id = texto(fd, "acordo_id")
  const recusa = await recusaDoAcordo(id)
  if (recusa) return { erro: recusa }
  const cat = texto(fd, "categoria")
  const { erro } = await adicionarClausula(id, {
    numero: ouNull(texto(fd, "numero")),
    titulo: ouNull(texto(fd, "clausula_titulo")),
    texto: ouNull(texto(fd, "clausula_texto")),
    categoria: CATEGORIAS_CLAUSULA.some((c) => c.chave === cat)
      ? (cat as CategoriaClausula)
      : "outro",
  })
  if (erro) return { erro }
  revalidar(id)
  return { ok: "Cláusula adicionada." }
}

export async function excluirClausulaAction(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  const recusa = await recusaDoAcordo(texto(fd, "acordo_id"))
  if (recusa) return { erro: recusa }
  const { erro } = await excluirClausula(texto(fd, "clausula_id"))
  if (erro) return { erro }
  revalidar(texto(fd, "acordo_id"))
  return { ok: "Cláusula removida." }
}

// ── Texto e cláusulas do PDF (Fase 1 do comparador) ─────────────────────────

const UUID_ACORDO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Link de envio direto ao armazenamento (o PDF não passa pela action: sem limite de 4 MB). */
export async function prepararEnvioDocumentoAction(
  acordoId: string
): Promise<{ caminho?: string; token?: string; erro?: string }> {
  if (!UUID_ACORDO.test(acordoId)) return { erro: "Acordo inválido." }
  const recusa = await recusaDoAcordo(acordoId)
  if (recusa) return { erro: recusa }
  return criarEnvioDocumento(acordoId)
}

export async function confirmarDocumentoAction(
  acordoId: string,
  caminho: string
): Promise<{ erro?: string }> {
  if (!UUID_ACORDO.test(acordoId)) return { erro: "Acordo inválido." }
  const recusa = await recusaDoAcordo(acordoId)
  if (recusa) return { erro: recusa }
  const r = await confirmarDocumento(acordoId, caminho)
  if (!r.erro) revalidar(acordoId)
  return r
}

export type EstadoExtracao = { erro?: string; ok?: string; avisos?: string[] }

export async function extrairClausulasAction(
  _prev: EstadoExtracao,
  fd: FormData
): Promise<EstadoExtracao> {
  const id = texto(fd, "acordo_id")
  if (!UUID_ACORDO.test(id)) return { erro: "Acordo inválido." }
  const recusa = await recusaDoAcordo(id)
  if (recusa) return { erro: recusa }
  const r = await extrairClausulasDoAcordo(id)
  if (r.erro) return { erro: r.erro }
  revalidar(id)
  return {
    ok: `${r.clausulas} cláusula(s) extraída(s). Revise os temas e o texto antes de usar no comparador.`,
    avisos: r.avisos,
  }
}

export async function salvarClausulaAction(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  const id = texto(fd, "clausula_id")
  const acordoId = texto(fd, "acordo_id")
  const recusa = await recusaDoAcordo(acordoId)
  if (recusa) return { erro: recusa }
  const tema = temaClausula(texto(fd, "tema"))
  const corpo = String(fd.get("texto") ?? "").replace(/\r\n?/g, "\n").trim()
  if (!UUID_ACORDO.test(id) || !tema) return { erro: "Dados inválidos." }
  if (!corpo) return { erro: "O texto da cláusula não pode ficar vazio." }
  const { erro } = await salvarClausula(id, {
    numero: ouNull(texto(fd, "numero")),
    titulo: ouNull(texto(fd, "titulo")),
    texto: corpo,
    tema,
  })
  if (erro) return { erro }
  revalidar(acordoId)
  return { ok: "Cláusula salva." }
}

export async function juntarClausulaAction(fd: FormData): Promise<void> {
  const id = texto(fd, "clausula_id")
  const acordoId = texto(fd, "acordo_id")
  if (!UUID_ACORDO.test(id) || (await recusaDoAcordo(acordoId))) return
  await juntarComProxima(id)
  revalidar(acordoId)
}

export async function marcarRevisadasAction(fd: FormData): Promise<void> {
  const sessao = await requirePermissao("acordos_coletivos", ["negociacoes"])
  const acordoId = texto(fd, "acordo_id")
  if (!UUID_ACORDO.test(acordoId) || (await recusaDoAcordo(acordoId))) return
  await marcarClausulasRevisadas(acordoId, String(sessao.usuario.id), fd.get("revisadas") === "1")
  revalidar(acordoId)
}
