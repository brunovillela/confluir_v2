import "server-only"

import { beneficiariosDasOrdens, calcularSaldo } from "@/lib/db/caixa"
import { hojeSP } from "@/lib/db/comum"
import { registrarEvento } from "@/lib/db/ordens-ciclo"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * "Vincular ordem de pagamento" em Meu caixa (08/10/2026) — substitui o
 * "Registrar compra" avulso. O responsável acha a ordem (por beneficiário ou
 * código) e a liga ao próprio caixa: a ordem passa a "Dinheiro" com este
 * caixa, e a despesa entra no extrato ligada a ela. Ordem autorizada ainda
 * não paga (A pagar / Processando) fica Paga — o dinheiro saiu do caixa.
 */

/** Situações que podem ser pagas pelo caixa (autorizadas ou já pagas). */
const SITUACOES_VINCULAVEIS = ["Paga", "A pagar", "Processando"]
export const FORMA_DINHEIRO = "Dinheiro"

export type OrdemVinculavel = {
  id: string
  codigo: string | null
  beneficiario: string | null
  descricao: string | null
  valor: number
  situacao: string
  forma: string | null
  data: string | null
}

function txt(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null
}

/** Termo seguro para filtro do PostgREST (sem vírgula, parênteses, curingas). */
function termoSeguro(termo: string): string {
  return termo.replace(/[,()%*\\"]/g, " ").replace(/\s+/g, " ").trim()
}

export async function buscarOrdensParaVincular(termo: string): Promise<OrdemVinculavel[]> {
  const t = termoSeguro(termo)
  if (t.length < 2) return []
  const admin = await createAdminClient()
  const emp = await tenantAtual()

  const [empresas, usuarios] = await Promise.all([
    admin
      .from("empresa")
      .select("id")
      .eq("emp_proprietaria_id", emp)
      .or(`nome_fantasia.ilike.%${t}%,empresa.ilike.%${t}%,nome_razao.ilike.%${t}%`)
      .limit(50),
    admin.from("usuarios").select("id").eq("emp_proprietaria_id", emp).ilike("nome_completo", `%${t}%`).limit(50),
  ])
  const empIds = (empresas.data ?? []).map((e) => String(e.id))
  const usuIds = (usuarios.data ?? []).map((u) => String(u.id))
  const filtros = [`codigo.ilike.%${t}%`, `beneficiario_nome_avulso.ilike.%${t}%`]
  if (empIds.length) {
    filtros.push(`fornecedor_id.in.(${empIds.join(",")})`, `beneficiario_fornecedor_id.in.(${empIds.join(",")})`)
  }
  if (usuIds.length) filtros.push(`beneficiario_usuario_id.in.(${usuIds.join(",")})`)

  const { data } = await admin
    .from("ordens_pagamento")
    .select("id, codigo, descricao, valor_inicial_cobranca, valor_pago, situacao, forma_pagamento, data_pagamento, vencimento, processo_compra_id")
    .eq("emp_proprietaria_id", emp)
    .not("excluido", "is", true)
    .is("caixa_conta_id", null)
    .in("situacao", SITUACOES_VINCULAVEIS)
    .or(filtros.join(","))
    .order("created_at", { ascending: false })
    .limit(40)
  const ordens = data ?? []
  if (ordens.length === 0) return []

  // Já tem despesa num caixa (mesmo sem caixa_conta_id): fica fora.
  const { data: noCaixa } = await admin
    .from("caixa_movimentacoes")
    .select("ordem_pagamento_id")
    .in("ordem_pagamento_id", ordens.map((o) => o.id))
    .neq("situacao", "cancelada")
  const usadas = new Set((noCaixa ?? []).map((m) => String(m.ordem_pagamento_id)))
  const livres = ordens.filter((o) => !usadas.has(String(o.id))).slice(0, 20)

  const [benef, produtos] = await Promise.all([
    beneficiariosDasOrdens(livres.map((o) => String(o.id))),
    (async () => {
      const ids = livres.map((o) => txt(o.processo_compra_id)).filter((v): v is string => Boolean(v))
      if (ids.length === 0) return new Map<string, string>()
      const { data: sol } = await admin.from("compras_solicitacoes").select("id, solicitacao_produto").in("id", ids)
      return new Map((sol ?? []).map((s) => [String(s.id), txt(s.solicitacao_produto) ?? ""]))
    })(),
  ])

  return livres.map((o) => ({
    id: String(o.id),
    codigo: txt(o.codigo),
    beneficiario: benef.get(String(o.id))?.beneficiario ?? null,
    descricao: (o.processo_compra_id ? produtos.get(String(o.processo_compra_id)) : null) || txt(o.descricao),
    valor: Number(o.valor_pago ?? o.valor_inicial_cobranca ?? 0),
    situacao: String(o.situacao ?? ""),
    forma: txt(o.forma_pagamento),
    data: txt(o.data_pagamento) ?? txt(o.vencimento),
  }))
}

export async function vincularOrdemAoCaixa(
  usuarioId: string,
  ordemId: string
): Promise<{ erro?: string; codigo?: string | null }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()

  const { data: conta } = await admin
    .from("caixa_contas")
    .select("id, nome, situacao")
    .eq("responsavel_usuario_id", usuarioId)
    .eq("emp_proprietaria_id", emp)
    .eq("ativa", true)
    .limit(1)
    .maybeSingle()
  if (!conta) return { erro: "Você não tem uma conta de caixa ativa." }
  if (conta.situacao !== "aberta") {
    return { erro: "A conta não está aberta — confirme o aporte ou aguarde a decisão da prestação de contas." }
  }

  const { data: o } = await admin
    .from("ordens_pagamento")
    .select("id, codigo, situacao, excluido, caixa_conta_id, valor_inicial_cobranca, valor_pago, processo_compra_id, descricao")
    .eq("id", ordemId)
    .eq("emp_proprietaria_id", emp)
    .maybeSingle()
  if (!o || o.excluido === true) return { erro: "Ordem não encontrada." }
  if (o.caixa_conta_id) return { erro: "Esta ordem já está ligada a um caixa." }
  const situacao = String(o.situacao ?? "")
  if (!SITUACOES_VINCULAVEIS.includes(situacao)) {
    return { erro: `Ordem “${situacao}” não pode ser paga pelo caixa — só ordens autorizadas (A pagar, Processando) ou já pagas.` }
  }
  const { data: ja } = await admin
    .from("caixa_movimentacoes")
    .select("id")
    .eq("ordem_pagamento_id", ordemId)
    .neq("situacao", "cancelada")
    .limit(1)
  if ((ja ?? []).length > 0) return { erro: "Esta ordem já tem despesa lançada num caixa." }

  const valor = Number(o.valor_pago ?? o.valor_inicial_cobranca ?? 0)
  if (!(valor > 0)) return { erro: "A ordem não tem valor." }
  const { data: movs } = await admin
    .from("caixa_movimentacoes")
    .select("tipo, situacao, valor, reconhecimento")
    .eq("conta_id", conta.id)
  const saldo = calcularSaldo(
    (movs ?? []) as { tipo: string; situacao: string; valor: number; reconhecimento: string | null }[]
  )
  if (valor > saldo + 0.005) {
    const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    return { erro: `A ordem (${moeda(valor)}) é maior que o saldo disponível (${moeda(saldo)}).` }
  }

  const benef = (await beneficiariosDasOrdens([ordemId])).get(ordemId)?.beneficiario ?? null
  let produto: string | null = null
  if (o.processo_compra_id) {
    const { data: sol } = await admin
      .from("compras_solicitacoes")
      .select("solicitacao_produto")
      .eq("id", o.processo_compra_id)
      .maybeSingle()
    produto = txt(sol?.solicitacao_produto)
  }
  const agora = new Date().toISOString()
  const descricao = `Ordem ${o.codigo ?? ""} — ${produto ?? benef ?? txt(o.descricao) ?? "pagamento"}`.slice(0, 200)

  const { error: erroMov } = await admin.from("caixa_movimentacoes").insert({
    conta_id: conta.id,
    tipo: "compra",
    situacao: "confirmada",
    valor,
    descricao,
    criada_por_usuario_id: usuarioId,
    confirmada_em: agora,
    ordem_pagamento_id: ordemId,
    emp_proprietaria_id: emp,
  })
  if (erroMov) return { erro: `Não foi possível lançar no caixa: ${erroMov.message}` }

  const pagarAgora = situacao !== "Paga"
  const { error: erroOrdem } = await admin
    .from("ordens_pagamento")
    .update({
      forma_pagamento: FORMA_DINHEIRO,
      caixa_conta_id: conta.id,
      dados_bancarios_id: null,
      cartao_id: null,
      ...(pagarAgora ? { situacao: "Paga", valor_pago: valor, data_pagamento: hojeSP() } : {}),
    })
    .eq("id", ordemId)
    .eq("situacao", situacao)
  if (erroOrdem) {
    // Desfaz a despesa: a ordem não mudou.
    await admin
      .from("caixa_movimentacoes")
      .update({ situacao: "cancelada" })
      .eq("ordem_pagamento_id", ordemId)
      .eq("conta_id", conta.id)
      .eq("situacao", "confirmada")
    return { erro: `Não foi possível atualizar a ordem: ${erroOrdem.message}` }
  }

  await registrarEvento(
    ordemId,
    "corrigida",
    usuarioId,
    `Vinculada ao caixa “${conta.nome}” pelo responsável: forma de pagamento Dinheiro.`,
    { caixa_conta_id: conta.id, valor }
  )
  if (pagarAgora) {
    await registrarEvento(ordemId, "paga", usuarioId, `Paga em dinheiro pelo caixa “${conta.nome}”.`, {
      caixa_conta_id: conta.id,
      valor_pago: valor,
    })
  }
  return { codigo: txt(o.codigo) }
}
