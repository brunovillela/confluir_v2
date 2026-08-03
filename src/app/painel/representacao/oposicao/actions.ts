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
  MODOS_FORMALIZACAO,
  SITUACOES_CAMPANHA,
  type ModoFormalizacao,
  type SituacaoCampanha,
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
  await requireOposicao()
  const { caminho, erro: erroArq } = await lerModelo(fd)
  if (erroArq) return { erro: erroArq }
  const { id, erro } = await criarCampanha({
    ...lerDados(fd),
    documento_modelo_url: caminho ?? null,
  })
  if (erro || !id) return { erro: erro ?? "Falha ao criar." }
  revalidar(id)
  redirect(`/painel/representacao/oposicao/${id}?salvo=1`)
}

export async function atualizarCampanhaAction(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  await requireOposicao()
  const id = texto(fd, "campanha_id")
  if (!id) return { erro: "Campanha inválida." }
  const { caminho, erro: erroArq } = await lerModelo(fd)
  if (erroArq) return { erro: erroArq }
  const { erro } = await atualizarCampanha(id, {
    ...lerDados(fd),
    documento_modelo_url: caminho,
  })
  if (erro) return { erro }
  revalidar(id)
  redirect(`/painel/representacao/oposicao/${id}?salvo=1`)
}

export async function adicionarPerguntaAction(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  await requireOposicao()
  const id = texto(fd, "campanha_id")
  const { erro } = await adicionarPergunta(id, texto(fd, "pergunta"))
  if (erro) return { erro }
  revalidar(id)
  return { ok: "Pergunta adicionada." }
}

export async function excluirPerguntaAction(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  await requireOposicao()
  const { erro } = await excluirPergunta(texto(fd, "pergunta_id"))
  if (erro) return { erro }
  revalidar(texto(fd, "campanha_id"))
  return { ok: "Pergunta removida." }
}

export async function avaliarOpositorAction(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  const sessao = await requireOposicao()
  const id = texto(fd, "opositor_id")
  if (!id) return { erro: "Oposição inválida." }
  const aprovar = texto(fd, "decisao") === "aprovar"
  const { erro } = await avaliarOpositor(
    id,
    aprovar,
    texto(fd, "motivo") || null,
    sessao.usuario.id
  )
  if (erro) return { erro }
  const campanhaId = texto(fd, "campanha_id")
  revalidar(campanhaId)
  redirect(
    `/painel/representacao/oposicao/${campanhaId}/opositor/${id}?avaliado=1`
  )
}
