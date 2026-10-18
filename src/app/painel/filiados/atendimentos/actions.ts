"use server"

import { revalidatePath } from "next/cache"

import { ENTRADA_ATENDIMENTOS, type EstadoFormAtendimento } from "@/lib/atendimento-constantes"
import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { obterAtendimento, obterAtendimentoPara, reabrirAtendimento, responderAtendimento } from "@/lib/db/portal-atendimentos"

const PERMISSAO = ENTRADA_ATENDIMENTOS[0]
const ALTERNATIVAS = [...ENTRADA_ATENDIMENTOS[1]]
const NAO_ENCONTRADA = "Solicitação não encontrada."

function campo(fd: FormData, nome: string): string {
  return String(fd.get(nome) ?? "").trim()
}

function revalidar(id: string, demandaId: string | null) {
  revalidatePath("/painel/filiados/atendimentos")
  revalidatePath(`/painel/filiados/atendimentos/${id}`)
  revalidatePath("/painel/ferramentas/demandas")
  if (demandaId) revalidatePath(`/painel/ferramentas/demandas/${demandaId}`)
}

export async function responderAtendimentoAction(_prev: EstadoFormAtendimento, fd: FormData): Promise<EstadoFormAtendimento> {
  const sessao = await requirePermissao(PERMISSAO, ALTERNATIVAS)
  const id = campo(fd, "atendimento_id")
  // Saúde só pela equipe de saúde; os demais, pela equipe geral (R2).
  if (!(await obterAtendimentoPara(sessao.permissoes, id))) return { erro: NAO_ENCONTRADA }
  const anexo = fd.get("anexo")
  const r = await responderAtendimento({
    id,
    usuarioId: sessao.usuario.id as string,
    usuarioNome: (sessao.usuario.nome_completo as string | null) ?? null,
    texto: campo(fd, "texto"),
    anexo: anexo instanceof File && anexo.size > 0 ? anexo : null,
    concluir: campo(fd, "acao") === "concluir",
  })
  // A resposta escrita volta ao campo quando o servidor recusa (o React limpa o formulário).
  if (r.erro) return { erro: r.erro, campo: r.campo, valores: { texto: String(fd.get("texto") ?? "") } }
  const atual = await obterAtendimento(id)
  revalidar(id, atual?.atendimento.demandaId ?? null)
  return { ok: campo(fd, "acao") === "concluir" ? "Solicitação concluída e filiado avisado." : "Resposta enviada ao filiado." }
}

export async function reabrirAtendimentoAction(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const sessao = await requirePermissao(PERMISSAO, ALTERNATIVAS)
  const id = campo(fd, "atendimento_id")
  if (!(await obterAtendimentoPara(sessao.permissoes, id))) return { erro: NAO_ENCONTRADA }
  const r = await reabrirAtendimento(id)
  if (r.erro) return { erro: r.erro }
  const atual = await obterAtendimento(id)
  revalidar(id, atual?.atendimento.demandaId ?? null)
  return { ok: "Solicitação reaberta." }
}
