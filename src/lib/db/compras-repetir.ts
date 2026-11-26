import "server-only"

import { separarQuantidade } from "@/lib/compras-quantidade"
import { buscarProcesso } from "@/lib/db/compras"
import { compraNoEscopo, escopoComprasDoUsuario } from "@/lib/db/compras-acesso"

/**
 * REPETIR COMPRA (17/11/2026). Compra recorrente (segurança, transporte,
 * lanche) era preenchida do zero a cada vez. O formulário de nova compra abre
 * com o que se repete — descrição, quantidade, tipo, departamento, centro,
 * projeto, fornecedor e forma; valor, data e nota são sempre novos.
 */
export type InicialCompra = {
  origemId: string
  origemCodigo: string | null
  direta: boolean
  produto: string
  quantidade: string | null
  unidade: string | null
  finalidade: string | null
  observacao: string | null
  tipo: "bem" | "servico" | ""
  departamentoId: string | null
  centroCustoId: string | null
  projetoId: string | null
  fornecedorId: string | null
  formaPagamento: string | null
}

/** O ponto de partida de uma compra repetida; null se não existe ou está fora do escopo. */
export async function compraParaRepetir(processoId: string, usuarioId: string): Promise<InicialCompra | null> {
  const p = await buscarProcesso(processoId).catch(() => null)
  if (!p) return null
  const escopo = await escopoComprasDoUsuario(usuarioId)
  if (!compraNoEscopo(escopo, { departamentoId: p.departamento_id, solicitanteId: p.solicitante_id })) return null
  const fornecimento = (p.fornecimentos ?? []).find((f) => f.fornecedor_id) ?? null
  const { produto, quantidade, unidade, finalidade } = separarQuantidade(p.produto ?? "")
  return {
    origemId: p.id,
    origemCodigo: p.codigo,
    direta: p.aquisicao_direta === true,
    produto,
    quantidade,
    unidade,
    finalidade,
    observacao: p.observacao,
    tipo: p.e_produto === true ? "bem" : p.e_produto === false ? "servico" : "",
    departamentoId: p.departamento_id,
    centroCustoId: p.centro_custo_id,
    projetoId: p.projeto_id,
    fornecedorId: fornecimento?.fornecedor_id ?? p.compra_fornecedor_id,
    formaPagamento: fornecimento?.forma_pagamento ?? null,
  }
}
