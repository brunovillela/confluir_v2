"use server"

import { tenantAtual } from "@/lib/tenant"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import {
  avaliarReembolso,
  marcarReembolsoPago,
  tipoReembolsoEmUso,
} from "@/lib/db/reembolsos"
import { createAdminClient } from "@/lib/supabase/admin"

async function exigirAcesso() {
  // Sem chave dedicada no Bubble para reembolsos de ACT — só a gestão.
  return requirePermissao("pessoal_gestao")
}

function revalidar(id?: string) {
  revalidatePath("/painel/pessoal/reembolsos")
  revalidatePath("/painel/pessoal/reembolsos/tipos")
  revalidatePath("/painel/perfil/reembolsos")
  if (id) revalidatePath(`/painel/pessoal/reembolsos/${id}`)
}

function lerValorBR(bruto: string): number | null {
  const limpo = bruto.trim().replace(/\./g, "").replace(",", ".")
  if (!limpo) return null
  const v = Number(limpo)
  return Number.isNaN(v) ? null : v
}

export async function avaliarReembolsoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await exigirAcesso()

  const id = String(formData.get("id") ?? "")
  const decisao = String(formData.get("decisao") ?? "")
  if (!id) return { erro: "Solicitação inválida." }
  if (!["aprovar", "reprovar"].includes(decisao)) {
    return { erro: "Decisão inválida." }
  }

  const mes = String(formData.get("pagamento_mes") ?? "").trim() || null
  const ano = String(formData.get("pagamento_ano") ?? "").trim() || null
  if (decisao === "aprovar" && ano && !/^\d{4}$/.test(ano)) {
    return { erro: "Ano da referência inválido (ex.: 2026)." }
  }

  const { erro } = await avaliarReembolso(id, sessao.usuario.id as string, {
    aprovar: decisao === "aprovar",
    valor_aprovado: lerValorBR(String(formData.get("valor_aprovado") ?? "")),
    observacao: String(formData.get("observacao") ?? "").trim() || null,
    pagamento_mes: mes,
    pagamento_ano: ano,
  })
  if (erro) return { erro }

  revalidar(id)
  redirect(`/painel/pessoal/reembolsos/${id}?salvo=1`)
}

export async function marcarPagoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await exigirAcesso()

  const id = String(formData.get("id") ?? "")
  if (!id) return { erro: "Solicitação inválida." }

  const { erro } = await marcarReembolsoPago(id)
  if (erro) return { erro }

  revalidar(id)
  return { ok: "Reembolso marcado como pago — o funcionário foi avisado." }
}

// ── Tipos de reembolso (ACT) ───────────────────────────────────────────────

function lerCamposTipo(formData: FormData) {
  const nome = String(formData.get("nome") ?? "").trim()
  const descricao = String(formData.get("descricao") ?? "").trim() || null
  const limiteBruto = String(formData.get("valor_limite") ?? "").trim()
  if (!nome) return { erro: "Informe o nome do reembolso (como está no ACT)." }
  const valor_limite = limiteBruto ? lerValorBR(limiteBruto) : null
  if (limiteBruto && (valor_limite === null || valor_limite <= 0)) {
    return { erro: "Teto inválido (ex.: 500,00; em branco = sem teto)." }
  }
  return {
    nome,
    descricao,
    valor_limite,
    ativa: formData.get("ativa") === "on",
  }
}

export async function criarTipoReembolso(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await exigirAcesso()

  const dados = lerCamposTipo(formData)
  if ("erro" in dados) return dados

  const admin = await createAdminClient()
  const { error } = await admin.from("pessoal_reembolsos_act_tipos").insert({
    ...dados,
    emp_proprietaria_id: await tenantAtual(),
  })
  if (error) {
    return {
      erro: /relation|schema|does not exist/i.test(error.message)
        ? "Tabelas ainda não criadas — rode supabase/reembolsos-act.sql no SQL Editor."
        : `Não foi possível criar: ${error.message}`,
    }
  }

  revalidar()
  redirect("/painel/pessoal/reembolsos/tipos?salvo=1")
}

export async function atualizarTipoReembolso(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await exigirAcesso()

  const id = String(formData.get("id") ?? "")
  if (!id) return { erro: "Tipo inválido." }

  const dados = lerCamposTipo(formData)
  if ("erro" in dados) return dados

  const admin = await createAdminClient()
  const { error, count } = await admin
    .from("pessoal_reembolsos_act_tipos")
    .update(
      { ...dados, updated_at: new Date().toISOString() },
      { count: "exact" }
    )
    .eq("id", id)
  if (error) return { erro: `Não foi possível salvar: ${error.message}` }
  if (count === 0) return { erro: "Tipo não encontrado." }

  revalidar()
  redirect("/painel/pessoal/reembolsos/tipos?salvo=1")
}

export async function excluirTipoReembolso(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await exigirAcesso()

  const id = String(formData.get("id") ?? "")
  if (!id) return { erro: "Tipo inválido." }

  const emUso = await tipoReembolsoEmUso(id)
  if (emUso > 0) {
    return {
      erro: `Este tipo é usado por ${emUso} solicitaç${emUso === 1 ? "ão" : "ões"} — desative-o em vez de excluir.`,
    }
  }

  const admin = await createAdminClient()
  const { error, count } = await admin
    .from("pessoal_reembolsos_act_tipos")
    .delete({ count: "exact" })
    .eq("id", id)
  if (error) return { erro: `Não foi possível excluir: ${error.message}` }
  if (count === 0) return { erro: "Tipo não encontrado." }

  revalidar()
  return { ok: "Tipo excluído." }
}
