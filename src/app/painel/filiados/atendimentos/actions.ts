"use server"

import { revalidatePath } from "next/cache"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { obterAtendimento, reabrirAtendimento, responderAtendimento } from "@/lib/db/portal-atendimentos"

const PERMISSAO = "ferramentas_demandas"
const ALTERNATIVAS = ["ferramentas_tarefas", "filiacao_filiados"]

function campo(fd: FormData, nome: string): string {
  return String(fd.get(nome) ?? "").trim()
}

function revalidar(id: string, demandaId: string | null) {
  revalidatePath("/painel/filiados/atendimentos")
  revalidatePath(`/painel/filiados/atendimentos/${id}`)
  revalidatePath("/painel/ferramentas/demandas")
  if (demandaId) revalidatePath(`/painel/ferramentas/demandas/${demandaId}`)
}

export async function responderAtendimentoAction(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const sessao = await requirePermissao(PERMISSAO, ALTERNATIVAS)
  const id = campo(fd, "atendimento_id")
  const anexo = fd.get("anexo")
  const r = await responderAtendimento({
    id,
    usuarioId: sessao.usuario.id as string,
    usuarioNome: (sessao.usuario.nome_completo as string | null) ?? null,
    texto: campo(fd, "texto"),
    anexo: anexo instanceof File && anexo.size > 0 ? anexo : null,
    concluir: campo(fd, "acao") === "concluir",
  })
  if (r.erro) return { erro: r.erro, campo: r.campo }
  const atual = await obterAtendimento(id)
  revalidar(id, atual?.atendimento.demandaId ?? null)
  return { ok: campo(fd, "acao") === "concluir" ? "Solicitação concluída e filiado avisado." : "Resposta enviada ao filiado." }
}

export async function reabrirAtendimentoAction(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  await requirePermissao(PERMISSAO, ALTERNATIVAS)
  const id = campo(fd, "atendimento_id")
  const r = await reabrirAtendimento(id)
  if (r.erro) return { erro: r.erro }
  const atual = await obterAtendimento(id)
  revalidar(id, atual?.atendimento.demandaId ?? null)
  return { ok: "Solicitação reaberta." }
}
