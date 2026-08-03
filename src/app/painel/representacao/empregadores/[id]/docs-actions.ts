"use server"

import { revalidatePath } from "next/cache"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import {
  adicionarDocumento,
  excluirDocumento,
  subirArquivoDocumento,
  type DadosDocumento,
} from "@/lib/db/representacao-docs"
import {
  TIPOS_DOC_REPRESENTACAO,
  type TipoDocRepresentacao,
} from "@/lib/representacao-docs-constantes"

function texto(fd: FormData, campo: string): string {
  return String(fd.get(campo) ?? "").trim()
}
function ouNull(v: string): string | null {
  return v || null
}

export async function adicionarDocumentoAction(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  await requirePermissao("empregadores")
  const empresaId = texto(fd, "empresa_id")
  if (!empresaId) return { erro: "Empregador inválido." }

  const arq = fd.get("arquivo")
  let caminho: string | null = null
  if (arq instanceof File && arq.size > 0) {
    const r = await subirArquivoDocumento(arq)
    if (r.erro) return { erro: r.erro }
    caminho = r.caminho ?? null
  }

  const tipo = texto(fd, "tipo")
  const dados: DadosDocumento = {
    tipo: TIPOS_DOC_REPRESENTACAO.some((t) => t.chave === tipo)
      ? (tipo as TipoDocRepresentacao)
      : "outro",
    titulo: ouNull(texto(fd, "titulo")),
    numero: ouNull(texto(fd, "numero")),
    data_documento: ouNull(texto(fd, "data_documento")),
    vigencia_fim: ouNull(texto(fd, "vigencia_fim")),
    observacoes: ouNull(texto(fd, "observacoes")),
  }
  const { erro } = await adicionarDocumento(empresaId, dados, caminho)
  if (erro) return { erro }
  revalidatePath(`/painel/representacao/empregadores/${empresaId}`)
  return { ok: "Documento adicionado." }
}

export async function excluirDocumentoAction(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  await requirePermissao("empregadores")
  const empresaId = texto(fd, "empresa_id")
  const { erro } = await excluirDocumento(texto(fd, "documento_id"))
  if (erro) return { erro }
  revalidatePath(`/painel/representacao/empregadores/${empresaId}`)
  return { ok: "Documento removido." }
}
