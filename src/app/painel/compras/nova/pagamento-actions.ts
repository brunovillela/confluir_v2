"use server"

import { requirePermissao } from "@/lib/auth"
import {
  meiosPagamentoFornecedor,
  type ContaFornecedor,
  type PixFornecedor,
} from "@/lib/db/compras-pagamento"

/** Chaves Pix e contas do fornecedor escolhido na aquisição direta. */
export async function meiosDoFornecedor(
  fornecedorId: string
): Promise<{ pix: PixFornecedor[]; contas: ContaFornecedor[] }> {
  await requirePermissao("aquisicoes_compra_direta")
  if (!fornecedorId) return { pix: [], contas: [] }
  return meiosPagamentoFornecedor(fornecedorId)
}
