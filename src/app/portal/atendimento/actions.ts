"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requireSessaoPortal } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { abrirAtendimento, responderComoFiliado } from "@/lib/db/portal-atendimentos"

function campo(fd: FormData, nome: string): string {
  return String(fd.get(nome) ?? "").trim()
}

function arquivo(fd: FormData, nome: string): File | null {
  const v = fd.get(nome)
  return v instanceof File && v.size > 0 ? v : null
}

export async function abrirAtendimentoAction(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  // Só o próprio filiado (a visualização pela gestão é somente leitura).
  const { filiado } = await requireSessaoPortal()
  const r = await abrirAtendimento({
    cpf: filiado.cpf,
    filiacaoId: filiado.filiacaoId,
    nome: filiado.nome_completo,
    email: filiado.email,
    assunto: campo(fd, "assunto"),
    titulo: campo(fd, "titulo"),
    texto: campo(fd, "texto"),
    anexo: arquivo(fd, "anexo"),
  })
  if (r.erro || !r.id) return { erro: r.erro ?? "Não foi possível abrir.", campo: r.campo }
  revalidatePath("/portal/atendimento")
  redirect(`/portal/atendimento/${r.id}?aberta=1`)
}

export async function responderAtendimentoPortalAction(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const { filiado } = await requireSessaoPortal()
  const id = campo(fd, "atendimento_id")
  const r = await responderComoFiliado({
    id,
    cpf: filiado.cpf,
    nome: filiado.nome_completo,
    texto: campo(fd, "texto"),
    anexo: arquivo(fd, "anexo"),
  })
  if (r.erro) return { erro: r.erro, campo: r.campo }
  revalidatePath(`/portal/atendimento/${id}`)
  return { ok: "Mensagem enviada." }
}
