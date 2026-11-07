"use server"

import { revalidatePath } from "next/cache"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import {
  conciliarComCobranca,
  conciliarComComprovacao,
  conciliarComOrdem,
  criarComprovacaoEConciliar,
  desfazerConciliacao,
  excluirExtrato,
  ignorarLancamento,
  importarExtrato,
} from "@/lib/db/conciliacao"

const ROTA = "/painel/financeiro/conciliacao"

function campo(fd: FormData, nome: string): string {
  return String(fd.get(nome) ?? "").trim()
}

async function sessaoEscrita() {
  return requirePermissao("financeiro_pagamento")
}

function revalidar() {
  revalidatePath(ROTA)
  revalidatePath("/painel/financeiro")
}

export async function importarExtratoAction(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const sessao = await sessaoEscrita()
  const arquivo = fd.get("arquivo")
  if (!(arquivo instanceof File) || arquivo.size === 0) return { erro: "Escolha o arquivo do extrato.", campo: "arquivo" }
  const r = await importarExtrato({ arquivo, contaRotulo: campo(fd, "conta_rotulo") || null, usuarioId: sessao.usuario.id as string })
  if (r.erro) return { erro: r.erro }
  revalidar()
  return {
    ok: `${r.novos} lançamento${r.novos === 1 ? "" : "s"} novo${r.novos === 1 ? "" : "s"}${r.repetidos ? `, ${r.repetidos} já importado${r.repetidos === 1 ? "" : "s"}` : ""}; ${r.conciliados} conciliado${r.conciliados === 1 ? "" : "s"} automaticamente.`,
  }
}

export async function conciliarOrdemAction(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const sessao = await sessaoEscrita()
  const r = await conciliarComOrdem(campo(fd, "lancamento_id"), campo(fd, "ordem_id"), sessao.usuario.id as string)
  if (r.erro) return { erro: r.erro }
  revalidar()
  return { ok: "Conciliado com a ordem." }
}

export async function conciliarComprovacaoAction(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const sessao = await sessaoEscrita()
  const r = await conciliarComComprovacao(campo(fd, "lancamento_id"), campo(fd, "comprovacao_id"), sessao.usuario.id as string)
  if (r.erro) return { erro: r.erro }
  revalidar()
  return { ok: "Conciliado com o depósito." }
}

export async function conciliarCobrancaAction(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const sessao = await sessaoEscrita()
  const r = await conciliarComCobranca(campo(fd, "lancamento_id"), campo(fd, "cobranca_id"), sessao.usuario.id as string)
  if (r.erro) return { erro: r.erro }
  revalidar()
  return { ok: "Cobrança baixada e conciliada." }
}

export async function criarComprovacaoAction(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const sessao = await sessaoEscrita()
  const remessa = campo(fd, "remessa_id")
  const fonte = campo(fd, "fonte_id")
  if (!remessa) return { erro: "Escolha a remessa.", campo: "remessa_id" }
  if (!fonte) return { erro: "Escolha a fonte pagadora.", campo: "fonte_id" }
  const r = await criarComprovacaoEConciliar(campo(fd, "lancamento_id"), remessa, fonte, sessao.usuario.id as string)
  if (r.erro) return { erro: r.erro }
  revalidar()
  return { ok: "Depósito registrado e conciliado." }
}

export async function ignorarLancamentoAction(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const sessao = await sessaoEscrita()
  const r = await ignorarLancamento(campo(fd, "lancamento_id"), sessao.usuario.id as string, campo(fd, "motivo") || null)
  if (r.erro) return { erro: r.erro }
  revalidar()
  return { ok: "Lançamento ignorado." }
}

export async function desfazerAction(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  await sessaoEscrita()
  const r = await desfazerConciliacao(campo(fd, "lancamento_id"))
  if (r.erro) return { erro: r.erro }
  revalidar()
  return { ok: "Voltou para pendente." }
}

export async function excluirExtratoAction(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  await sessaoEscrita()
  const r = await excluirExtrato(campo(fd, "extrato_id"))
  if (r.erro) return { erro: r.erro }
  revalidar()
  return { ok: "Extrato excluído." }
}

/**
 * Pagar pelo extrato: cada débito marcado paga a ordem escolhida (data e valor
 * do extrato) e fica conciliado com ela. Um a um; cada um pode recusar sozinho.
 */
export async function pagarPeloExtratoAction(
  itens: { lancamentoId: string; ordemId: string }[],
  centroReceitaId: string
): Promise<{ lancamentoId: string; ok: boolean; erro?: string }[]> {
  const sessao = await sessaoEscrita()
  const { pagarPeloLancamento } = await import("@/lib/db/conciliacao-pagar")
  if (!centroReceitaId) return itens.map((i) => ({ lancamentoId: i.lancamentoId, ok: false, erro: "escolha a conta de débito." }))
  const saida: { lancamentoId: string; ok: boolean; erro?: string }[] = []
  const usadas = new Set<string>()
  for (const i of itens.slice(0, 200)) {
    if (usadas.has(i.ordemId)) {
      saida.push({ lancamentoId: i.lancamentoId, ok: false, erro: "a mesma ordem foi escolhida para outro lançamento." })
      continue
    }
    usadas.add(i.ordemId)
    const r = await pagarPeloLancamento(i.lancamentoId, i.ordemId, { centroReceitaId, usuarioId: sessao.usuario.id as string })
    saida.push({ lancamentoId: i.lancamentoId, ok: !r.erro, erro: r.erro })
    if (!r.erro) revalidatePath(`/painel/financeiro/ordens/${i.ordemId}`)
  }
  revalidar()
  revalidatePath("/painel/financeiro/ordens")
  return saida
}
