import { podeAcessar, type Permissoes } from "@/lib/permissoes"

/**
 * Quem faz o quê em Fornecedores (05/10/2026):
 * - CONSULTA: `aquisicoes_fornecedores` (ou quem edita).
 * - EDIÇÃO (cadastrar, editar, inativar, excluir, mesclar):
 *   `aquisicoes_fornecedores_edicao` — chave própria; supabase/
 *   fornecedores-edicao-mescla.sql a concedeu a quem tinha a de compras.
 * - INFORMAÇÕES FINANCEIRAS (quanto foi pago, em aberto, ticket médio, as
 *   ordens de pagamento do fornecedor): só quem tem permissão do Financeiro.
 * - DADOS BANCÁRIOS: quem edita o cadastro ou quem é do Financeiro.
 */
export const CHAVE_EDICAO_FORNECEDORES = "aquisicoes_fornecedores_edicao"

export function podeEditarFornecedores(p: Permissoes): boolean {
  return podeAcessar(p, CHAVE_EDICAO_FORNECEDORES)
}

export function podeVerFinanceiroFornecedores(p: Permissoes): boolean {
  return podeAcessar(p, "financeiro_pagamento", ["financeiro_leitura"])
}

export function podeVerBancarioFornecedores(p: Permissoes): boolean {
  return podeEditarFornecedores(p) || podeVerFinanceiroFornecedores(p)
}
