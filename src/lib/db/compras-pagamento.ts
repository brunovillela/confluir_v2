import "server-only"

import { calcularSaldo } from "@/lib/db/caixa"
import { esquemaAusente } from "@/lib/db/comum"
import { formatarMoeda } from "@/lib/formato"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Detalhe do pagamento da aquisição direta (supabase/compras-pagamento.sql):
 * cartões da entidade, chaves Pix e contas do fornecedor, débito no caixa.
 * Sem o SQL, as leituras degradam para listas vazias e `disponivel: false`.
 */

export const AVISO_SQL_PAGAMENTO =
  "Detalhe de pagamento indisponível — rode supabase/compras-pagamento.sql no Supabase."

// ── Cartões da entidade ─────────────────────────────────────────────────────

export type Cartao = {
  id: string
  apelido: string
  tipo: string
  bandeira: string | null
  final: string
  titular: string | null
  ativo: boolean
}

/** "Cartão Sede — Crédito Visa final 1234" (para listas e ordens). */
export function nomeCartao(c: Pick<Cartao, "apelido" | "bandeira" | "final">): string {
  return `${c.apelido}${c.bandeira ? ` (${c.bandeira})` : ""} — final ${c.final}`
}

export async function listarCartoes(): Promise<{
  disponivel: boolean
  cartoes: Cartao[]
}> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("cartoes")
    .select("id, apelido, tipo, bandeira, final, ativo, titular:titular_usuario_id (nome_completo, nome_guerra)")
    .eq("emp_proprietaria_id", await tenantAtual())
    .order("ativo", { ascending: false })
    .order("apelido")
  if (error) {
    if (esquemaAusente(error)) return { disponivel: false, cartoes: [] }
    throw new Error(`Falha ao listar cartões: ${error.message}`)
  }
  return {
    disponivel: true,
    cartoes: (data ?? []).map((c) => {
      const titular = c.titular as { nome_completo?: string | null; nome_guerra?: string | null } | null
      return {
        id: String(c.id),
        apelido: String(c.apelido),
        tipo: String(c.tipo),
        bandeira: (c.bandeira as string | null) ?? null,
        final: String(c.final),
        titular: titular?.nome_completo ?? titular?.nome_guerra ?? null,
        ativo: c.ativo === true,
      }
    }),
  }
}

export async function criarCartao(dados: {
  apelido: string
  tipo: string
  bandeira: string | null
  final: string
  titularId: string | null
  criadoPor: string
}): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin.from("cartoes").insert({
    emp_proprietaria_id: await tenantAtual(),
    apelido: dados.apelido,
    tipo: dados.tipo,
    bandeira: dados.bandeira,
    final: dados.final,
    titular_usuario_id: dados.titularId,
    criado_por_usuario_id: dados.criadoPor,
  })
  if (error) {
    if (esquemaAusente(error)) return { erro: AVISO_SQL_PAGAMENTO }
    return { erro: `Não foi possível cadastrar o cartão: ${error.message}` }
  }
  return {}
}

export async function definirCartaoAtivo(
  id: string,
  ativo: boolean
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin
    .from("cartoes")
    .update({ ativo })
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: `Não foi possível atualizar o cartão: ${error.message}` }
  return {}
}

async function cartaoAtivoDoTenant(id: string): Promise<boolean> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("cartoes")
    .select("id")
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("ativo", true)
    .maybeSingle()
  return Boolean(data)
}

// ── Chaves Pix e contas do fornecedor ───────────────────────────────────────

export type PixFornecedor = { id: string; chave: string; tipo: string | null }
export type ContaFornecedor = {
  id: string
  banco: string
  agencia: string | null
  conta: string
  tipo_conta: string | null
  favorecido: string | null
}

/** Chaves Pix e contas bancárias cadastradas para o fornecedor. */
export async function meiosPagamentoFornecedor(fornecedorId: string): Promise<{
  pix: PixFornecedor[]
  contas: ContaFornecedor[]
}> {
  if (!(await fornecedorDoTenant(fornecedorId))) return { pix: [], contas: [] }
  const admin = await createAdminClient()
  const { data } = await admin
    .from("dados_bancarios")
    .select("id, banco, agencia, conta, tipo_conta, pix, pix_tipo, favorecido")
    .eq("fornecedor_id", fornecedorId)
    .order("created_at", { ascending: false })
  const linhas = (data ?? []) as Record<string, string | null>[]
  return {
    pix: linhas
      .filter((d) => d.pix?.trim())
      .map((d) => ({ id: String(d.id), chave: d.pix!.trim(), tipo: d.pix_tipo })),
    contas: linhas
      .filter((d) => d.banco?.trim() && d.conta?.trim())
      .map((d) => ({
        id: String(d.id),
        banco: d.banco!.trim(),
        agencia: d.agencia,
        conta: d.conta!.trim(),
        tipo_conta: d.tipo_conta,
        favorecido: d.favorecido,
      })),
  }
}

async function fornecedorDoTenant(fornecedorId: string): Promise<boolean> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("empresa")
    .select("id")
    .eq("id", fornecedorId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  return Boolean(data)
}

/** Grava uma chave Pix ou conta nova do fornecedor e devolve o id. */
export async function inserirMeioFornecedor(
  fornecedorId: string,
  dados:
    | { pix: string; pix_tipo: string }
    | {
        banco: string
        agencia: string
        conta: string
        tipo_conta: string
        favorecido: string
      }
): Promise<{ id?: string; erro?: string }> {
  if (!(await fornecedorDoTenant(fornecedorId))) {
    return { erro: "Fornecedor inválido." }
  }
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("dados_bancarios")
    .insert({
      ...dados,
      ...("pix" in dados ? { prefere_pix: true } : {}),
      fornecedor_id: fornecedorId,
    })
    .select("id")
    .single()
  if (error || !data) {
    return { erro: `Não foi possível gravar o dado bancário: ${error?.message}` }
  }
  return { id: String(data.id) }
}

// ── Caixa ───────────────────────────────────────────────────────────────────

/** Saldo atual de uma conta de caixa ABERTA do tenant (null = não usável). */
async function saldoCaixaAberta(contaId: string): Promise<number | null> {
  const admin = await createAdminClient()
  const { data: conta } = await admin
    .from("caixa_contas")
    .select("id")
    .eq("id", contaId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("ativa", true)
    .eq("situacao", "aberta")
    .maybeSingle()
  if (!conta) return null
  const { data: movs } = await admin
    .from("caixa_movimentacoes")
    .select("tipo, situacao, valor")
    .eq("conta_id", contaId)
  return calcularSaldo(
    (movs ?? []).map((m) => ({
      tipo: String(m.tipo),
      situacao: String(m.situacao),
      valor: Number(m.valor),
    }))
  )
}

// ── Validação e gravação do detalhe ─────────────────────────────────────────

export type DetalhePagamento = {
  cartao_id: string | null
  caixa_conta_id: string | null
  dados_bancarios_id: string | null
  pix_codigo: string | null
  /** Caminho do boleto no bucket compras (coluna já existente da ordem). */
  arquivo_boleto: string | null
}

/**
 * Confere que o cartão/caixa/chave/conta escolhidos existem e pertencem ao
 * tenant (e ao fornecedor), e que o caixa tem saldo. Chave/conta NOVA já foi
 * gravada pela action antes de chegar aqui.
 */
export async function validarDetalhePagamento(
  detalhe: DetalhePagamento,
  fornecedorId: string,
  valor: number
): Promise<string | null> {
  if (detalhe.cartao_id && !(await cartaoAtivoDoTenant(detalhe.cartao_id))) {
    return "Cartão inválido ou desativado."
  }
  if (detalhe.caixa_conta_id) {
    const saldo = await saldoCaixaAberta(detalhe.caixa_conta_id)
    if (saldo === null) return "A conta de caixa escolhida não está aberta."
    if (saldo < valor) {
      return `Saldo insuficiente no caixa (${formatarMoeda(saldo)}). Peça um aporte ao financeiro antes de lançar a compra.`
    }
  }
  if (detalhe.dados_bancarios_id) {
    const meios = await meiosPagamentoFornecedor(fornecedorId)
    const ok = [...meios.pix, ...meios.contas].some(
      (m) => m.id === detalhe.dados_bancarios_id
    )
    if (!ok) return "A chave Pix/conta escolhida não é deste fornecedor."
  }
  return null
}

/** Compra em dinheiro: debita a conta de caixa (movimentação confirmada). */
export async function debitarCaixaCompra({
  contaId,
  valor,
  descricao,
  usuarioId,
  ordemId,
}: {
  contaId: string
  valor: number
  descricao: string
  usuarioId: string
  ordemId: string
}): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin.from("caixa_movimentacoes").insert({
    conta_id: contaId,
    tipo: "compra",
    situacao: "confirmada",
    valor,
    descricao,
    criada_por_usuario_id: usuarioId,
    confirmada_em: new Date().toISOString(),
    ordem_pagamento_id: ordemId,
    emp_proprietaria_id: await tenantAtual(),
  })
  if (error) return { erro: `Não foi possível debitar o caixa: ${error.message}` }
  return {}
}

/**
 * "Pago com": descreve o detalhe gravado na ordem (cartão, caixa, chave Pix
 * ou conta do fornecedor) para a tela da ordem. Código Pix copia e cola e
 * boleto já têm campo próprio. Null quando a ordem não tem detalhe.
 */
export async function descreverPagoCom(
  ordem: Record<string, unknown>
): Promise<string | null> {
  const admin = await createAdminClient()
  const empId = await tenantAtual()
  const cartaoId = ordem.cartao_id as string | null | undefined
  const caixaId = ordem.caixa_conta_id as string | null | undefined
  const dadosId = ordem.dados_bancarios_id as string | null | undefined

  if (cartaoId) {
    const { data } = await admin
      .from("cartoes")
      .select("apelido, bandeira, final, tipo")
      .eq("id", cartaoId)
      .eq("emp_proprietaria_id", empId)
      .maybeSingle()
    return data ? `Cartão ${nomeCartao(data as Pick<Cartao, "apelido" | "bandeira" | "final">)}` : null
  }
  if (caixaId) {
    const { data } = await admin
      .from("caixa_contas")
      .select("nome")
      .eq("id", caixaId)
      .eq("emp_proprietaria_id", empId)
      .maybeSingle()
    return data ? `Dinheiro da conta de caixa "${data.nome}"` : null
  }
  if (dadosId) {
    const { data } = await admin
      .from("dados_bancarios")
      .select("banco, agencia, conta, pix, pix_tipo, favorecido")
      .eq("id", dadosId)
      .maybeSingle()
    if (!data) return null
    // Um mesmo cadastro pode ter chave e conta: a forma da ordem decide.
    if (data.pix && (ordem.forma_pagamento === "Pix" || !(data.banco && data.conta))) {
      return `Chave Pix do fornecedor — ${data.pix_tipo ? `${data.pix_tipo}: ` : ""}${data.pix}`
    }
    return `Conta do fornecedor — ${data.banco}, ag. ${data.agencia ?? "—"}, conta ${data.conta}${data.favorecido ? ` (${data.favorecido})` : ""}`
  }
  return null
}
