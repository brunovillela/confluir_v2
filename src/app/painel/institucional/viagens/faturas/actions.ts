"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { DETALHE_DA_FORMA, type FormaPagamentoCompras } from "@/lib/compras-constantes"
import { meiosPagamentoFornecedor, type DetalhePagamento } from "@/lib/db/compras-pagamento"
import { lerDetalhePagamento } from "@/lib/db/compras-pagamento-form"
import { desfazerFatura, registrarFatura } from "@/lib/db/viagens-faturas"

const CHAVE = "viagens_gestao"

/** "1.234,56" (com vírgula: ponto é milhar) ou "1234.56" (só ponto: decimal). */
function lerValor(bruto: FormDataEntryValue | null): number {
  const s = String(bruto ?? "").replace(/\s|R\$/g, "")
  if (!s) return 0
  return Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s)
}

function revalidar() {
  revalidatePath("/painel/institucional/viagens", "layout")
  revalidatePath("/painel/institucional/viagens/faturas")
  revalidatePath("/painel/compras")
  revalidatePath("/painel/financeiro/ordens")
}

/**
 * Lança a fatura. Os itens vêm como `item_<id>` (marcado), `valor_<id>` e
 * `conta_<id>` — uma linha da tabela do formulário por item.
 */
export async function registrarFaturaAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await requirePermissao(CHAVE)

  const arquivo = formData.get("arquivo")
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { erro: "Anexe o PDF da fatura (ou da nota fiscal)." }
  }
  const linhas = [...formData.keys()]
    .filter((k) => k.startsWith("item_"))
    .map((k) => {
      const id = k.slice("item_".length)
      return {
        itemId: id,
        valor: lerValor(formData.get(`valor_${id}`)),
        centroCustoId: String(formData.get(`conta_${id}`) ?? "").trim(),
      }
    })

  // Pix/TED: a chave ou conta da agência (cadastrada ou nova); Pix por QR
  // Code: o código. Sem o destino, a ordem não nasce (ordens-destino.ts).
  const fornecedorId = String(formData.get("fornecedor_id") ?? "").trim()
  const forma = String(formData.get("forma_pagamento") ?? "").trim()
  let detalhe: DetalhePagamento | undefined
  const tipo = DETALHE_DA_FORMA[forma as FormaPagamentoCompras]
  if (fornecedorId && (tipo === "pix_fornecedor" || tipo === "conta_fornecedor" || tipo === "pix_codigo")) {
    const lido = await lerDetalhePagamento(formData, forma as FormaPagamentoCompras, fornecedorId, 0)
    if (lido.erro || !lido.detalhe) return { erro: lido.erro ?? "Informe para onde pagar." }
    detalhe = lido.detalhe
  }

  const { erro, id } = await registrarFatura(
    {
      fornecedorId,
      detalhe,
      numero: String(formData.get("numero") ?? ""),
      emissao: String(formData.get("emissao") ?? ""),
      vencimento: String(formData.get("vencimento") ?? "").trim() || null,
      formaPagamento: String(formData.get("forma_pagamento") ?? "").trim() || null,
      departamentoId: String(formData.get("departamento_id") ?? "").trim() || null,
      taxas: lerValor(formData.get("taxas")),
      observacao: String(formData.get("observacao") ?? "").trim() || null,
      arquivo,
      linhas,
    },
    sessao.usuario.id as string
  )
  if (erro) return { erro }

  revalidar()
  redirect(`/painel/institucional/viagens/faturas/${id}?salvo=1`)
}

export async function desfazerFaturaAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao(CHAVE)
  const { erro } = await desfazerFatura(String(formData.get("id") ?? ""))
  if (erro) return { erro }
  revalidar()
  redirect("/painel/institucional/viagens/faturas?desfeita=1")
}

/** Chaves Pix e contas da agência, para o seletor do "para onde pagar". */
export async function meiosDaAgencia(fornecedorId: string) {
  await requirePermissao(CHAVE)
  if (!fornecedorId) return { pix: [], contas: [] }
  return meiosPagamentoFornecedor(fornecedorId)
}
