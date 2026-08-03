"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import {
  atualizarRegistro,
  criarRegistro,
  excluirRegistro,
  subirDocumentoRegistro,
  type DadosRegistro,
} from "@/lib/db/registro-mte"
import {
  SITUACOES_REGISTRO_MTE,
  TIPOS_REGISTRO_MTE,
  type SituacaoRegistroMte,
  type TipoRegistroMte,
} from "@/lib/registro-mte-constantes"

function texto(fd: FormData, campo: string): string {
  return String(fd.get(campo) ?? "").trim()
}
function ouNull(v: string): string | null {
  return v || null
}
function revalidar(id?: string) {
  revalidatePath("/painel/institucional/registro-mte")
  revalidatePath("/painel/institucional")
  if (id) revalidatePath(`/painel/institucional/registro-mte/${id}`)
}

async function lerDocumento(
  fd: FormData
): Promise<{ caminho?: string | null; erro?: string }> {
  const arq = fd.get("documento")
  if (!(arq instanceof File) || arq.size === 0) return { caminho: undefined }
  const { caminho, erro } = await subirDocumentoRegistro(arq)
  if (erro) return { erro }
  return { caminho }
}

function lerDados(fd: FormData): Omit<DadosRegistro, "documento_url"> {
  const tipo = texto(fd, "tipo")
  const situacao = texto(fd, "situacao")
  return {
    tipo: TIPOS_REGISTRO_MTE.some((t) => t.chave === tipo)
      ? (tipo as TipoRegistroMte)
      : "registro_sindical",
    numero: ouNull(texto(fd, "numero")),
    categoria: ouNull(texto(fd, "categoria")),
    abrangencia: ouNull(texto(fd, "abrangencia")),
    data_registro: ouNull(texto(fd, "data_registro")),
    data_publicacao: ouNull(texto(fd, "data_publicacao")),
    situacao: SITUACOES_REGISTRO_MTE.some((s) => s.chave === situacao)
      ? (situacao as SituacaoRegistroMte)
      : "ativo",
    observacoes: ouNull(texto(fd, "observacoes")),
  }
}

export async function criarRegistroAction(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  await requirePermissao("registro_mte")
  const { caminho, erro: erroArq } = await lerDocumento(fd)
  if (erroArq) return { erro: erroArq }
  const { id, erro } = await criarRegistro({
    ...lerDados(fd),
    documento_url: caminho ?? null,
  })
  if (erro || !id) return { erro: erro ?? "Falha ao criar." }
  revalidar(id)
  redirect(`/painel/institucional/registro-mte/${id}?salvo=1`)
}

export async function atualizarRegistroAction(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  await requirePermissao("registro_mte")
  const id = texto(fd, "registro_id")
  if (!id) return { erro: "Registro inválido." }
  const { caminho, erro: erroArq } = await lerDocumento(fd)
  if (erroArq) return { erro: erroArq }
  const { erro } = await atualizarRegistro(id, {
    ...lerDados(fd),
    documento_url: caminho,
  })
  if (erro) return { erro }
  revalidar(id)
  redirect(`/painel/institucional/registro-mte/${id}?salvo=1`)
}

export async function excluirRegistroAction(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  await requirePermissao("registro_mte")
  const { erro } = await excluirRegistro(texto(fd, "registro_id"))
  if (erro) return { erro }
  revalidar()
  redirect("/painel/institucional/registro-mte?excluido=1")
}
