"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { TIPOS_CARTAO } from "@/lib/compras-constantes"
import { type EstadoForm } from "@/lib/contas"
import { fecharFatura } from "@/lib/db/cartao-faturas"
import { criarCartao, definirCartaoAtivo, definirUsoCartao } from "@/lib/db/compras-pagamento"
import { parseValorBR } from "@/lib/valores"

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
  const uso = texto(formData, "uso") === "responsavel" ? "responsavel" : "corporativo"
  const titularId = texto(formData, "titular_id") || null
  if (uso === "responsavel" && !titularId) return { erro: "Escolha o responsável que fica com o cartão." }

  const { erro } = await criarCartao({
    apelido,
    tipo,
    bandeira: texto(formData, "bandeira") || null,
    final,
    titularId,
    uso,
    criadoPor: sessao.usuario.id,
  })
  if (erro) return { erro }
  revalidatePath("/painel/financeiro/cartoes")
  return { ok: "Cartão cadastrado." }
}

/**
 * Fecha a fatura do cartão de crédito: valor, vencimento, arquivo, forma e o
 * centro da diferença → ordem de pagamento rateada (lib/db/cartao-faturas).
 */
export async function fecharFaturaAction(_prev: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const sessao = await requirePermissao("financeiro_pagamento", ["financeiro_caixa"])
  const id = texto(formData, "fatura_id")
  const valor = parseValorBR(texto(formData, "valor"))
  if (!id) return { erro: "Fatura não informada." }
  if (valor === null || !(valor > 0)) return { erro: "Informe o valor da fatura." }
  const arquivo = formData.get("arquivo")
  if (!(arquivo instanceof File) || arquivo.size === 0) return { erro: "Anexe a fatura (PDF ou foto)." }
  const forma = texto(formData, "forma_pagamento") === "Pix (QR Code)" ? "Pix (QR Code)" : "Boleto"
  const r = await fecharFatura(
    id,
    {
      valor,
      vencimento: texto(formData, "vencimento"),
      arquivo,
      formaPagamento: forma,
      linhaDigitavel: texto(formData, "linha_digitavel").replace(/\D/g, "") || null,
      pixCodigo: texto(formData, "pix_codigo") || null,
      centroDiferencaId: texto(formData, "centro_diferenca_id") || null,
      observacao: texto(formData, "observacao") || null,
    },
    sessao.usuario.id
  )
  if (r.erro) return { erro: r.erro }
  revalidatePath("/painel/financeiro/cartoes", "layout")
  revalidatePath("/painel/financeiro/ordens")
  redirect(`/painel/financeiro/cartoes/faturas/${id}?fechada=1`)
}

/** Uso do cartão (corporativo ou com responsável) e quem é o responsável. */
export async function definirUsoCartaoAction(_prev: EstadoForm, formData: FormData): Promise<EstadoForm> {
  await requirePermissao("financeiro_pagamento", ["financeiro_caixa"])
  const id = texto(formData, "cartao_id")
  if (!id) return { erro: "Cartão não informado." }
  const uso = texto(formData, "uso") === "responsavel" ? "responsavel" : "corporativo"
  const { erro } = await definirUsoCartao(id, uso, texto(formData, "titular_id") || null)
  if (erro) return { erro }
  revalidatePath("/painel/financeiro/cartoes", "layout")
  revalidatePath("/painel", "layout")
  return { ok: uso === "responsavel" ? "Salvo: o responsável passa a ver as faturas em Meu cartão." : "Salvo: cartão corporativo, fatura só no Financeiro." }
}

export async function alternarCartaoAction(formData: FormData): Promise<void> {
  await requirePermissao("financeiro_pagamento", ["financeiro_caixa"])
  const id = texto(formData, "cartao_id")
  if (!id) return
  await definirCartaoAtivo(id, texto(formData, "ativo") === "1")
  revalidatePath("/painel/financeiro/cartoes")
}
