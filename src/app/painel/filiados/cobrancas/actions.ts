"use server"

import { revalidatePath } from "next/cache"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { baixarCobranca, cancelarCobranca, gerarCobrancas, salvarConfigCobranca } from "@/lib/db/cobrancas"
import { hojeSP } from "@/lib/db/comum"

const ROTA = "/painel/filiados/cobrancas"

function campo(fd: FormData, nome: string): string {
  return String(fd.get(nome) ?? "").trim()
}

function numeroBR(v: string): number | null {
  if (!v) return null
  const n = Number(v.replace(/\./g, "").replace(",", "."))
  return Number.isFinite(n) ? n : null
}

function revalidar() {
  revalidatePath(ROTA)
  revalidatePath("/painel/filiados")
  revalidatePath("/portal/contribuicao")
}

export async function salvarConfigCobrancaAction(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  await requirePermissao("filiacao_receitas", ["filiacao_gestao"])
  const valor = numeroBR(campo(fd, "valor_mensal"))
  const dia = Number(campo(fd, "dia_vencimento") || 10)
  const r = await salvarConfigCobranca({ valorMensal: valor, diaVencimento: dia, gerarAutomatico: fd.get("gerar_automatico") !== null, mensagem: campo(fd, "mensagem") || null })
  if (r.erro) return { erro: r.erro }
  revalidar()
  return { ok: "Configuração salva." }
}

export async function gerarCobrancasAction(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  await requirePermissao("filiacao_receitas", ["filiacao_gestao"])
  const competencia = campo(fd, "competencia")
  if (!/^\d{4}-\d{2}$/.test(competencia)) return { erro: "Informe a competência (AAAA-MM).", campo: "competencia" }
  const r = await gerarCobrancas(competencia)
  if (r.erro) return { erro: r.erro }
  revalidar()
  return { ok: `${r.geradas} cobrança(s) gerada(s)${r.jaExistiam ? `, ${r.jaExistiam} já existia(m)` : ""}${r.semValor ? `, ${r.semValor} sem valor definido` : ""}; ${r.avisadas} filiado(s) avisado(s).` }
}

export async function baixarCobrancaAction(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const sessao = await requirePermissao("filiacao_receitas", ["filiacao_gestao"])
  const id = campo(fd, "cobranca_id")
  const valor = numeroBR(campo(fd, "valor_pago"))
  const data = campo(fd, "data_pagamento") || hojeSP()
  if (!valor || valor <= 0) return { erro: "Informe o valor recebido.", campo: "valor_pago" }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return { erro: "Data inválida.", campo: "data_pagamento" }
  const r = await baixarCobranca({ cobrancaId: id, dataPagamento: data, valorPago: valor, usuarioId: sessao.usuario.id as string })
  if (r.erro) return { erro: r.erro }
  revalidar()
  return { ok: "Baixa registrada e filiado avisado." }
}

export async function cancelarCobrancaAction(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  await requirePermissao("filiacao_receitas", ["filiacao_gestao"])
  const r = await cancelarCobranca(campo(fd, "cobranca_id"))
  if (r.erro) return { erro: r.erro }
  revalidar()
  return { ok: "Cobrança cancelada." }
}
