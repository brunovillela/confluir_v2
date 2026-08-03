"use server"

import { tenantAtual } from "@/lib/tenant"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { calcularSaldo } from "@/lib/db/caixa"
import { createAdminClient } from "@/lib/supabase/admin"
import { parseValorBR } from "@/lib/valores"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function revalidarCaixa(contaId?: string): void {
  revalidatePath("/painel/financeiro/caixas")
  if (contaId) revalidatePath(`/painel/financeiro/caixas/${contaId}`)
  revalidatePath("/painel/perfil/caixa")
  revalidatePath("/painel")
}

/** Autoriza uma pessoa a ter conta de caixa (permissão do Financeiro). */
export async function criarContaCaixa(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await requirePermissao("financeiro_caixa", [
    "financeiro_caixa_admin",
  ])

  const responsavel = String(formData.get("responsavel_usuario_id") ?? "")
  if (!UUID.test(responsavel)) return { erro: "Escolha a pessoa responsável." }
  const nome = String(formData.get("nome") ?? "").trim()
  if (!nome) return { erro: "Dê um nome à conta (ex.: “Caixa da recepção”)." }

  const admin = await createAdminClient()

  const { data: existente } = await admin
    .from("caixa_contas")
    .select("id")
    .eq("responsavel_usuario_id", responsavel)
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("ativa", true)
    .limit(1)
    .maybeSingle()
  if (existente) {
    return { erro: "Esta pessoa já tem uma conta de caixa ativa." }
  }

  const { data: criada, error } = await admin
    .from("caixa_contas")
    .insert({
      responsavel_usuario_id: responsavel,
      nome,
      criada_por_usuario_id: sessao.usuario.id,
      emp_proprietaria_id: await tenantAtual(),
    })
    .select("id")
    .single()
  if (error || !criada) {
    if (error?.code === "PGRST205" || error?.code === "42P01") {
      return {
        erro: "As tabelas do caixa ainda não existem — rode supabase/caixa.sql no SQL Editor.",
      }
    }
    return { erro: `Não foi possível criar: ${error?.message ?? "?"}` }
  }

  revalidarCaixa(criada.id)
  redirect(`/painel/financeiro/caixas/${criada.id}?criada=1`)
}

/** Lança um aporte — fica pendente até o responsável confirmar. */
export async function lancarAporte(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await requirePermissao("financeiro_caixa", [
    "financeiro_caixa_admin",
  ])

  const contaId = String(formData.get("conta_id") ?? "")
  if (!UUID.test(contaId)) return { erro: "Conta inválida." }
  const valor = parseValorBR(String(formData.get("valor") ?? ""))
  if (valor === null || valor <= 0) return { erro: "Informe o valor do aporte." }
  const descricao = String(formData.get("descricao") ?? "").trim() || null

  const admin = await createAdminClient()
  const { data: conta } = await admin
    .from("caixa_contas")
    .select("id, ativa, situacao")
    .eq("id", contaId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (!conta) return { erro: "Conta não encontrada." }
  if (!conta.ativa) return { erro: "A conta está desativada." }
  if (conta.situacao === "prestacao_pendente") {
    return { erro: "A conta está em prestação de contas — decida a prestação antes de um novo aporte." }
  }

  const { error } = await admin.from("caixa_movimentacoes").insert({
    conta_id: contaId,
    tipo: "aporte",
    situacao: "pendente",
    valor,
    descricao,
    criada_por_usuario_id: sessao.usuario.id,
    emp_proprietaria_id: await tenantAtual(),
  })
  if (error) return { erro: `Não foi possível lançar: ${error.message}` }

  revalidarCaixa(contaId)
  redirect(`/painel/financeiro/caixas/${contaId}?salvo=1`)
}

/** Aprova a prestação: acerto zera o saldo e a conta FECHA. */
export async function aprovarPrestacao(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await requirePermissao("financeiro_caixa", [
    "financeiro_caixa_admin",
  ])

  const contaId = String(formData.get("conta_id") ?? "")
  const prestacaoId = String(formData.get("prestacao_id") ?? "")
  if (!UUID.test(contaId) || !UUID.test(prestacaoId)) {
    return { erro: "Prestação inválida." }
  }
  const observacao =
    String(formData.get("observacao_financeiro") ?? "").trim() || null

  const admin = await createAdminClient()
  const { data: prestacao } = await admin
    .from("caixa_prestacoes")
    .select("id, situacao")
    .eq("id", prestacaoId)
    .eq("conta_id", contaId)
    .maybeSingle()
  if (!prestacao || prestacao.situacao !== "aguardando") {
    return { erro: "Prestação não encontrada ou já decidida." }
  }

  const { data: movs } = await admin
    .from("caixa_movimentacoes")
    .select("tipo, situacao, valor")
    .eq("conta_id", contaId)
  const saldo = calcularSaldo(
    (movs ?? []) as { tipo: string; situacao: string; valor: number }[]
  )

  const agora = new Date().toISOString()

  // Acerto de fechamento: devolve o saldo remanescente ao financeiro
  if (saldo !== 0) {
    const { error: erroAcerto } = await admin
      .from("caixa_movimentacoes")
      .insert({
        conta_id: contaId,
        tipo: "acerto",
        situacao: "confirmada",
        valor: saldo,
        descricao: "Acerto de fechamento da prestação de contas",
        criada_por_usuario_id: sessao.usuario.id,
        confirmada_em: agora,
        emp_proprietaria_id: await tenantAtual(),
      })
    if (erroAcerto) {
      return { erro: `Não foi possível lançar o acerto: ${erroAcerto.message}` }
    }
  }

  await admin
    .from("caixa_prestacoes")
    .update({
      situacao: "aprovada",
      observacao_financeiro: observacao,
      decidida_por_usuario_id: sessao.usuario.id,
      decidida_em: agora,
    })
    .eq("id", prestacaoId)
  await admin
    .from("caixa_contas")
    .update({ situacao: "fechada", updated_at: agora })
    .eq("id", contaId)

  revalidarCaixa(contaId)
  redirect(`/painel/financeiro/caixas/${contaId}?salvo=1`)
}

/** Rejeita a prestação: a conta volta a ficar aberta para correções. */
export async function rejeitarPrestacao(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await requirePermissao("financeiro_caixa", [
    "financeiro_caixa_admin",
  ])

  const contaId = String(formData.get("conta_id") ?? "")
  const prestacaoId = String(formData.get("prestacao_id") ?? "")
  if (!UUID.test(contaId) || !UUID.test(prestacaoId)) {
    return { erro: "Prestação inválida." }
  }
  const observacao =
    String(formData.get("observacao_financeiro") ?? "").trim()
  if (!observacao) {
    return { erro: "Explique o motivo da rejeição para o responsável." }
  }

  const agora = new Date().toISOString()
  const admin = await createAdminClient()
  const { error, count } = await admin
    .from("caixa_prestacoes")
    .update(
      {
        situacao: "rejeitada",
        observacao_financeiro: observacao,
        decidida_por_usuario_id: sessao.usuario.id,
        decidida_em: agora,
      },
      { count: "exact" }
    )
    .eq("id", prestacaoId)
    .eq("conta_id", contaId)
    .eq("situacao", "aguardando")
  if (error) return { erro: `Não foi possível rejeitar: ${error.message}` }
  if (count === 0) return { erro: "Prestação não encontrada ou já decidida." }

  await admin
    .from("caixa_contas")
    .update({ situacao: "aberta", updated_at: agora })
    .eq("id", contaId)

  revalidarCaixa(contaId)
  redirect(`/painel/financeiro/caixas/${contaId}?salvo=1`)
}

/** Atualiza uma ocorrência (investigação/resolução, com ajuste opcional). */
export async function atualizarOcorrencia(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await requirePermissao("financeiro_caixa", [
    "financeiro_caixa_admin",
  ])

  const contaId = String(formData.get("conta_id") ?? "")
  const ocorrenciaId = String(formData.get("ocorrencia_id") ?? "")
  if (!UUID.test(contaId) || !UUID.test(ocorrenciaId)) {
    return { erro: "Ocorrência inválida." }
  }
  const situacao = String(formData.get("situacao") ?? "")
  if (!["em_investigacao", "resolvida"].includes(situacao)) {
    return { erro: "Situação inválida." }
  }
  const resolucao = String(formData.get("resolucao") ?? "").trim() || null
  const ajuste = parseValorBR(String(formData.get("ajuste_perda") ?? ""))

  const agora = new Date().toISOString()
  const admin = await createAdminClient()

  const { error, count } = await admin
    .from("caixa_ocorrencias")
    .update(
      {
        situacao,
        resolucao,
        ...(situacao === "resolvida"
          ? { resolvida_por_usuario_id: sessao.usuario.id, resolvida_em: agora }
          : {}),
      },
      { count: "exact" }
    )
    .eq("id", ocorrenciaId)
    .eq("conta_id", contaId)
  if (error) return { erro: `Não foi possível atualizar: ${error.message}` }
  if (count === 0) return { erro: "Ocorrência não encontrada." }

  // Ajuste de perda confirmado na resolução (debita a conta)
  if (situacao === "resolvida" && ajuste !== null && ajuste > 0) {
    await admin.from("caixa_movimentacoes").insert({
      conta_id: contaId,
      tipo: "perda",
      situacao: "confirmada",
      valor: ajuste,
      descricao: `Perda apurada na ocorrência${resolucao ? ` — ${resolucao}` : ""}`,
      criada_por_usuario_id: sessao.usuario.id,
      confirmada_em: agora,
      emp_proprietaria_id: await tenantAtual(),
    })
  }

  revalidarCaixa(contaId)
  redirect(`/painel/financeiro/caixas/${contaId}?salvo=1`)
}

/** Desativa/reativa uma conta de caixa. */
export async function alternarContaAtiva(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("financeiro_caixa", ["financeiro_caixa_admin"])

  const contaId = String(formData.get("conta_id") ?? "")
  if (!UUID.test(contaId)) return { erro: "Conta inválida." }
  const ativar = formData.get("ativar") === "1"

  const admin = await createAdminClient()
  const { error } = await admin
    .from("caixa_contas")
    .update({ ativa: ativar, updated_at: new Date().toISOString() })
    .eq("id", contaId)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: `Não foi possível atualizar: ${error.message}` }

  revalidarCaixa(contaId)
  redirect(`/painel/financeiro/caixas/${contaId}?salvo=1`)
}
