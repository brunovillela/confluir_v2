"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import {
  atualizarAta,
  criarAta,
  excluirAta,
  subirDocumentoAta,
  type DadosAta,
} from "@/lib/db/atas"
import { TIPOS_REUNIAO, type TipoReuniao } from "@/lib/atas-constantes"

function texto(fd: FormData, campo: string): string {
  return String(fd.get(campo) ?? "").trim()
}
function ouNull(v: string): string | null {
  return v || null
}
function revalidar(id?: string, mandatoId?: string) {
  revalidatePath("/painel/institucional/atas")
  if (id) revalidatePath(`/painel/institucional/atas/${id}`)
  if (mandatoId) {
    revalidatePath(`/painel/institucional/diretoria/${mandatoId}`)
  }
}

async function lerDocumento(
  fd: FormData
): Promise<{ caminho?: string | null; erro?: string }> {
  const arq = fd.get("documento")
  if (!(arq instanceof File) || arq.size === 0) return { caminho: undefined }
  const { caminho, erro } = await subirDocumentoAta(arq)
  if (erro) return { erro }
  return { caminho }
}

function lerDados(fd: FormData): Omit<DadosAta, "documento_url"> {
  const tipo = texto(fd, "tipo")
  return {
    mandato_id: ouNull(texto(fd, "mandato_id")),
    tipo: TIPOS_REUNIAO.some((t) => t.chave === tipo)
      ? (tipo as TipoReuniao)
      : "outra",
    orgao: ouNull(texto(fd, "orgao")),
    titulo: ouNull(texto(fd, "titulo")),
    data: ouNull(texto(fd, "data")),
    hora: ouNull(texto(fd, "hora")),
    local: ouNull(texto(fd, "local")),
    pauta: ouNull(texto(fd, "pauta")),
    deliberacoes: ouNull(texto(fd, "deliberacoes")),
    presentes: ouNull(texto(fd, "presentes")),
    observacoes: ouNull(texto(fd, "observacoes")),
  }
}

export async function criarAtaAction(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  await requirePermissao("diretoria_reunioes")
  const { caminho, erro: erroArq } = await lerDocumento(fd)
  if (erroArq) return { erro: erroArq }
  const dados = lerDados(fd)
  const { id, erro } = await criarAta({ ...dados, documento_url: caminho ?? null })
  if (erro || !id) return { erro: erro ?? "Falha ao criar." }
  revalidar(id, dados.mandato_id ?? undefined)
  redirect(`/painel/institucional/atas/${id}?salvo=1`)
}

export async function atualizarAtaAction(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  await requirePermissao("diretoria_reunioes")
  const id = texto(fd, "ata_id")
  if (!id) return { erro: "Ata inválida." }
  const { caminho, erro: erroArq } = await lerDocumento(fd)
  if (erroArq) return { erro: erroArq }
  const dados = lerDados(fd)
  const { erro } = await atualizarAta(id, { ...dados, documento_url: caminho })
  if (erro) return { erro }
  revalidar(id, dados.mandato_id ?? undefined)
  redirect(`/painel/institucional/atas/${id}?salvo=1`)
}

export async function excluirAtaAction(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  await requirePermissao("diretoria_reunioes")
  const id = texto(fd, "ata_id")
  const mandatoId = texto(fd, "mandato_id")
  const { erro } = await excluirAta(id)
  if (erro) return { erro }
  revalidar(undefined, mandatoId || undefined)
  redirect(
    mandatoId
      ? `/painel/institucional/diretoria/${mandatoId}?ata_excluida=1`
      : "/painel/institucional/atas?excluida=1"
  )
}
