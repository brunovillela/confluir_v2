"use server"

import { revalidatePath } from "next/cache"

import { requirePermissao } from "@/lib/auth"
import { TIPOS_CARTAO } from "@/lib/compras-constantes"
import { type EstadoForm } from "@/lib/contas"
import { criarCartao, definirCartaoAtivo } from "@/lib/db/compras-pagamento"

function texto(formData: FormData, campo: string): string {
  return String(formData.get(campo) ?? "").trim()
}

export async function criarCartaoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await requirePermissao("financeiro_pagamento", ["financeiro_caixa"])
  const apelido = texto(formData, "apelido")
  if (!apelido) return { erro: "Dê um nome ao cartão (ex.: Cartão da Sede)." }
  const tipo = texto(formData, "tipo")
  if (!TIPOS_CARTAO.some((t) => t.valor === tipo)) return { erro: "Escolha o tipo do cartão." }
  const final = texto(formData, "final").replace(/\D/g, "")
  if (final.length !== 4) return { erro: "Informe só os 4 últimos dígitos do cartão." }

  const { erro } = await criarCartao({
    apelido,
    tipo,
    bandeira: texto(formData, "bandeira") || null,
    final,
    titularId: texto(formData, "titular_id") || null,
    criadoPor: sessao.usuario.id,
  })
  if (erro) return { erro }
  revalidatePath("/painel/financeiro/cartoes")
  return { ok: "Cartão cadastrado." }
}

export async function alternarCartaoAction(formData: FormData): Promise<void> {
  await requirePermissao("financeiro_pagamento", ["financeiro_caixa"])
  const id = texto(formData, "cartao_id")
  if (!id) return
  await definirCartaoAtivo(id, texto(formData, "ativo") === "1")
  revalidatePath("/painel/financeiro/cartoes")
}
