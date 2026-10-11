"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { type EstadoFormAtendimento } from "@/lib/atendimento-constantes"
import { requireSessaoPortal } from "@/lib/auth"
import {
  abrirAtendimento,
  encerrarComoFiliado,
  reabrirComoFiliado,
  responderComoFiliado,
} from "@/lib/db/portal-atendimentos"

function campo(fd: FormData, nome: string): string {
  return String(fd.get(nome) ?? "").trim()
}

function arquivo(fd: FormData, nome: string): File | null {
  const v = fd.get(nome)
  return v instanceof File && v.size > 0 ? v : null
}

/** Os textos como a pessoa os escreveu (sem o trim), para voltarem ao formulário quando o servidor recusa. */
function escrito(fd: FormData, nome: string): string {
  return String(fd.get(nome) ?? "")
}

export async function abrirAtendimentoAction(_prev: EstadoFormAtendimento, fd: FormData): Promise<EstadoFormAtendimento> {
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
  if (r.erro || !r.id) {
    return {
      erro: r.erro ?? "Não foi possível abrir.",
      campo: r.campo,
      valores: { assunto: campo(fd, "assunto"), titulo: escrito(fd, "titulo"), texto: escrito(fd, "texto") },
    }
  }
  revalidatePath("/portal/atendimento")
  redirect(`/portal/atendimento/${r.id}?aberta=1`)
}

export async function responderAtendimentoPortalAction(_prev: EstadoFormAtendimento, fd: FormData): Promise<EstadoFormAtendimento> {
  const { filiado } = await requireSessaoPortal()
  const id = campo(fd, "atendimento_id")
  const r = await responderComoFiliado({
    id,
    cpf: filiado.cpf,
    nome: filiado.nome_completo,
    texto: campo(fd, "texto"),
    anexo: arquivo(fd, "anexo"),
  })
  if (r.erro) return { erro: r.erro, campo: r.campo, valores: { texto: escrito(fd, "texto") } }
  revalidatePath(`/portal/atendimento/${id}`)
  return { ok: "Mensagem enviada." }
}

/** "Resolvido, pode encerrar" — o associado conclui a própria solicitação (A97). */
export async function encerrarAtendimentoPortalAction(_prev: EstadoFormAtendimento, fd: FormData): Promise<EstadoFormAtendimento> {
  const { filiado } = await requireSessaoPortal()
  const id = campo(fd, "atendimento_id")
  const r = await encerrarComoFiliado({ id, cpf: filiado.cpf, nome: filiado.nome_completo })
  if (r.erro) return { erro: r.erro }
  revalidatePath("/portal/atendimento")
  redirect(`/portal/atendimento/${id}?encerrada=1`)
}

/** "Não resolveu — reabrir" dentro do prazo (A97). */
export async function reabrirAtendimentoPortalAction(_prev: EstadoFormAtendimento, fd: FormData): Promise<EstadoFormAtendimento> {
  const { filiado } = await requireSessaoPortal()
  const id = campo(fd, "atendimento_id")
  const r = await reabrirComoFiliado({ id, cpf: filiado.cpf, nome: filiado.nome_completo })
  if (r.erro) return { erro: r.erro }
  revalidatePath("/portal/atendimento")
  redirect(`/portal/atendimento/${id}?reaberta=1`)
}
