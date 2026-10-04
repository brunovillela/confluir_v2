"use server"

import { revalidatePath } from "next/cache"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { alcadaDoUsuario, avaliarOrdemCompra } from "@/lib/db/compras"
import { avaliarSolicitacaoDiaria, buscarSolicitacaoDiaria } from "@/lib/db/diarias"

function campo(fd: FormData, nome: string): string {
  return String(fd.get(nome) ?? "").trim()
}

function revalidar() {
  revalidatePath("/painel/aprovar")
  revalidatePath("/painel/diretor")
  revalidatePath("/painel")
  revalidatePath("/painel/compras/avaliacoes")
  revalidatePath("/painel/pessoal/diarias")
  revalidatePath("/painel/institucional/diretoria/diarias")
}

/** Mesma regra da tela de Avaliações; aqui sem redirecionar, para ficar na lista enxuta. */
export async function aprovarOrdemCelularAction(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const sessao = await requirePermissao("aquisicoes_avaliacoes", ["financeiro_pagamento"])
  const ordemId = campo(fd, "ordem_id")
  if (!ordemId) return { erro: "Ordem inválida." }
  const aprovar = campo(fd, "decisao") === "aprovar"
  const observacao = campo(fd, "observacao") || null
  if (!aprovar && !observacao) return { erro: "Informe o motivo da devolução.", campo: "observacao" }
  const { erro } = await avaliarOrdemCompra(ordemId, sessao.usuario.id as string, alcadaDoUsuario(sessao.permissoes), aprovar, observacao)
  if (erro) return { erro }
  revalidar()
  return { ok: aprovar ? "Ordem aprovada." : "Ordem devolvida." }
}

export async function avaliarDiariaCelularAction(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const id = campo(fd, "id")
  if (!id) return { erro: "Solicitação inválida." }
  const alvo = await buscarSolicitacaoDiaria(id)
  if (!alvo) return { erro: "Solicitação não encontrada." }
  // Quem avalia depende do quadro (a mesma regra de Pessoal → Diárias).
  const sessao =
    alvo.beneficiarioTipo === "diretor"
      ? await requirePermissao("diretoria_diarias", ["configuracoes"])
      : await requirePermissao("pessoal_gestao", ["pessoal_diarias"])
  const aprovar = campo(fd, "decisao") === "aprovar"
  const observacao = campo(fd, "observacao") || null
  if (!aprovar && !observacao) return { erro: "Informe o motivo da reprovação.", campo: "observacao" }
  const { erro } = await avaliarSolicitacaoDiaria(id, sessao.usuario.id as string, aprovar, observacao, true)
  if (erro) return { erro }
  revalidar()
  return { ok: aprovar ? "Diária aprovada." : "Diária reprovada." }
}
