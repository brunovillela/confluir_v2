"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import {
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
} from "@/lib/acordos-constantes"

function texto(fd: FormData, campo: string): string {
  return String(fd.get(campo) ?? "").trim()
}
function ouNull(v: string): string | null {
  return v || null
}
async function requireAcordos() {
  return requirePermissao("acordos_coletivos")
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
    fonteIds: fd.getAll("fonte").map(String).filter(Boolean),
  }
}

export async function criarAcordoAction(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  await requireAcordos()
  const { caminho, erro: erroArq } = await lerDocumento(fd)
  if (erroArq) return { erro: erroArq }
  const { id, erro } = await criarAcordo({
    ...lerDados(fd),
    documento_url: caminho ?? null,
  })
  if (erro || !id) return { erro: erro ?? "Falha ao criar." }
  revalidar(id)
  redirect(`/painel/representacao/acordos/${id}?salvo=1`)
}

export async function atualizarAcordoAction(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  await requireAcordos()
  const id = texto(fd, "acordo_id")
  if (!id) return { erro: "Acordo inválido." }
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
  await requireAcordos()
  const id = texto(fd, "acordo_id")
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
  await requireAcordos()
  const { erro } = await excluirClausula(texto(fd, "clausula_id"))
  if (erro) return { erro }
  revalidar(texto(fd, "acordo_id"))
  return { ok: "Cláusula removida." }
}
