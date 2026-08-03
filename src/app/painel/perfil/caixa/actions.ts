"use server"

import { tenantAtual } from "@/lib/tenant"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requireSessaoPainel } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { calcularSaldo } from "@/lib/db/caixa"
import { createAdminClient } from "@/lib/supabase/admin"
import { parseValorBR } from "@/lib/valores"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Conta ativa do usuário logado — toda action daqui exige titularidade. */
async function contaDoResponsavel(usuarioId: string) {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("caixa_contas")
    .select("id, situacao, ativa")
    .eq("responsavel_usuario_id", usuarioId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("ativa", true)
    .limit(1)
    .maybeSingle()
  return data
}

function revalidar(contaId: string): never {
  revalidatePath("/painel/perfil/caixa")
  revalidatePath("/painel/financeiro/caixas")
  revalidatePath(`/painel/financeiro/caixas/${contaId}`)
  revalidatePath("/painel")
  redirect("/painel/perfil/caixa?salvo=1")
}

/** Confirma o recebimento do aporte — a verba é liberada e a conta ABRE. */
export async function confirmarAporte(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await requireSessaoPainel()

  const movId = String(formData.get("movimentacao_id") ?? "")
  if (!UUID.test(movId)) return { erro: "Aporte inválido." }

  const conta = await contaDoResponsavel(sessao.usuario.id)
  if (!conta) return { erro: "Você não tem uma conta de caixa ativa." }

  const agora = new Date().toISOString()
  const admin = await createAdminClient()
  const { error, count } = await admin
    .from("caixa_movimentacoes")
    .update(
      { situacao: "confirmada", confirmada_em: agora },
      { count: "exact" }
    )
    .eq("id", movId)
    .eq("conta_id", conta.id)
    .eq("tipo", "aporte")
    .eq("situacao", "pendente")
  if (error) return { erro: `Não foi possível confirmar: ${error.message}` }
  if (count === 0) return { erro: "Aporte não encontrado ou já confirmado." }

  if (conta.situacao !== "aberta") {
    await admin
      .from("caixa_contas")
      .update({ situacao: "aberta", updated_at: agora })
      .eq("id", conta.id)
  }

  revalidar(conta.id)
}

/** Registra uma compra em dinheiro (débito no extrato). */
export async function registrarCompra(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await requireSessaoPainel()

  const conta = await contaDoResponsavel(sessao.usuario.id)
  if (!conta) return { erro: "Você não tem uma conta de caixa ativa." }
  if (conta.situacao !== "aberta") {
    return {
      erro: "A conta não está aberta — confirme o aporte ou aguarde a decisão da prestação de contas.",
    }
  }

  const valor = parseValorBR(String(formData.get("valor") ?? ""))
  if (valor === null || valor <= 0) return { erro: "Informe o valor da compra." }
  const descricao = String(formData.get("descricao") ?? "").trim()
  if (!descricao) return { erro: "Descreva a compra." }

  const admin = await createAdminClient()
  const { data: movs } = await admin
    .from("caixa_movimentacoes")
    .select("tipo, situacao, valor")
    .eq("conta_id", conta.id)
  const saldo = calcularSaldo(
    (movs ?? []) as { tipo: string; situacao: string; valor: number }[]
  )
  if (valor > saldo) {
    return {
      erro: `A compra (${valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}) é maior que o saldo disponível (${saldo.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}).`,
    }
  }

  const agora = new Date().toISOString()
  const { error } = await admin.from("caixa_movimentacoes").insert({
    conta_id: conta.id,
    tipo: "compra",
    situacao: "confirmada",
    valor,
    descricao,
    criada_por_usuario_id: sessao.usuario.id,
    confirmada_em: agora,
    emp_proprietaria_id: await tenantAtual(),
  })
  if (error) return { erro: `Não foi possível registrar: ${error.message}` }

  revalidar(conta.id)
}

/** Pede a prestação de contas — a conta trava até a decisão do financeiro. */
export async function prestarContas(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await requireSessaoPainel()

  const conta = await contaDoResponsavel(sessao.usuario.id)
  if (!conta) return { erro: "Você não tem uma conta de caixa ativa." }
  if (conta.situacao !== "aberta") {
    return { erro: "A conta precisa estar aberta para prestar contas." }
  }

  const observacao = String(formData.get("observacao") ?? "").trim() || null
  const saldoDeclarado = parseValorBR(
    String(formData.get("saldo_declarado") ?? "")
  )

  const agora = new Date().toISOString()
  const admin = await createAdminClient()
  const { error } = await admin.from("caixa_prestacoes").insert({
    conta_id: conta.id,
    observacao,
    saldo_declarado: saldoDeclarado,
    aberta_por_usuario_id: sessao.usuario.id,
    emp_proprietaria_id: await tenantAtual(),
  })
  if (error) return { erro: `Não foi possível abrir a prestação: ${error.message}` }

  await admin
    .from("caixa_contas")
    .update({ situacao: "prestacao_pendente", updated_at: agora })
    .eq("id", conta.id)

  revalidar(conta.id)
}

/** Relata perda/problema com o dinheiro — abre ocorrência para investigação. */
export async function relatarPerda(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await requireSessaoPainel()

  const conta = await contaDoResponsavel(sessao.usuario.id)
  if (!conta) return { erro: "Você não tem uma conta de caixa ativa." }

  const descricao = String(formData.get("descricao") ?? "").trim()
  if (!descricao) return { erro: "Descreva o que aconteceu." }
  const valor = parseValorBR(String(formData.get("valor") ?? ""))

  const admin = await createAdminClient()
  const { error } = await admin.from("caixa_ocorrencias").insert({
    conta_id: conta.id,
    descricao,
    valor,
    relatada_por_usuario_id: sessao.usuario.id,
    emp_proprietaria_id: await tenantAtual(),
  })
  if (error) return { erro: `Não foi possível relatar: ${error.message}` }

  revalidar(conta.id)
}
