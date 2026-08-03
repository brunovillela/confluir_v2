"use server"

import { tenantAtual } from "@/lib/tenant"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import {
  avaliarSolicitacaoDiaria,
  tipoDiariaEmUso,
} from "@/lib/db/diarias"
import { categoriaDiariaValida } from "@/lib/diarias-constantes"
import { createAdminClient } from "@/lib/supabase/admin"

async function exigirAcesso() {
  // Chave dedicada do Bubble libera a avaliação sem a gestão completa.
  return requirePermissao("pessoal_gestao", ["pessoal_diarias"])
}

function revalidar(id?: string) {
  revalidatePath("/painel/pessoal/diarias")
  revalidatePath("/painel/pessoal/diarias/tipos")
  revalidatePath("/painel/perfil/diarias")
  if (id) revalidatePath(`/painel/pessoal/diarias/${id}`)
}

export async function avaliarDiaria(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await exigirAcesso()

  const id = String(formData.get("id") ?? "")
  const decisao = String(formData.get("decisao") ?? "")
  const observacao = String(formData.get("observacao") ?? "").trim() || null
  if (!id) return { erro: "Solicitação inválida." }
  if (!["aprovar", "reprovar"].includes(decisao)) {
    return { erro: "Decisão inválida." }
  }
  if (decisao === "reprovar" && !observacao) {
    return { erro: "Informe o motivo da reprovação." }
  }
  // Desconto de infrações pendentes do infrator (ligado por padrão; o gestor
  // pode desmarcar para pagar a diária cheia e deixar a multa pendente).
  const aplicarDescontos = formData.get("aplicar_descontos") !== "nao"

  const { erro } = await avaliarSolicitacaoDiaria(
    id,
    sessao.usuario.id as string,
    decisao === "aprovar",
    observacao,
    aplicarDescontos
  )
  if (erro) return { erro }

  revalidar(id)
  redirect(`/painel/pessoal/diarias/${id}?salvo=1`)
}

// ── Tipos de diária ────────────────────────────────────────────────────────

function lerCamposTipo(formData: FormData) {
  const nome = String(formData.get("nome") ?? "").trim()
  const valorBruto = String(formData.get("valor_reembolso") ?? "")
    .trim()
    .replace(/\./g, "")
    .replace(",", ".")
  if (!nome) return { erro: "Informe o nome do tipo de diária." }
  const valor_reembolso = Number(valorBruto)
  if (!valorBruto || Number.isNaN(valor_reembolso) || valor_reembolso <= 0) {
    return { erro: "Informe o valor da diária (ex.: 350,00)." }
  }
  // `diaria` (categoria) é enum NOT NULL — sempre gravamos um valor válido.
  const diaria = categoriaDiariaValida(String(formData.get("categoria") ?? ""))
  return { nome, diaria, valor_reembolso, ativa: formData.get("ativa") === "on" }
}

function erroTipo(mensagem: string): EstadoForm {
  if (/nome|ativa|column|schema/i.test(mensagem)) {
    return {
      erro: "Tabela de tipos ainda não preparada — rode supabase/diarias.sql no SQL Editor.",
    }
  }
  return { erro: mensagem }
}

export async function criarTipoDiaria(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await exigirAcesso()

  const dados = lerCamposTipo(formData)
  if ("erro" in dados) return dados

  const admin = await createAdminClient()
  const { error } = await admin.from("financeiro_diarias").insert({
    ...dados,
    emp_proprietaria_id: await tenantAtual(),
  })
  if (error) return erroTipo(`Não foi possível criar: ${error.message}`)

  revalidar()
  redirect("/painel/pessoal/diarias/tipos?salvo=1")
}

export async function atualizarTipoDiaria(
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
    .from("financeiro_diarias")
    .update(dados, { count: "exact" })
    .eq("id", id)
  if (error) return erroTipo(`Não foi possível salvar: ${error.message}`)
  if (count === 0) return { erro: "Tipo não encontrado." }

  revalidar()
  redirect("/painel/pessoal/diarias/tipos?salvo=1")
}

export async function excluirTipoDiaria(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await exigirAcesso()

  const id = String(formData.get("id") ?? "")
  if (!id) return { erro: "Tipo inválido." }

  const emUso = await tipoDiariaEmUso(id)
  if (emUso > 0) {
    return {
      erro: `Este tipo é usado por ${emUso} solicitaç${emUso === 1 ? "ão" : "ões"} — desative-o em vez de excluir.`,
    }
  }

  const admin = await createAdminClient()
  const { error, count } = await admin
    .from("financeiro_diarias")
    .delete({ count: "exact" })
    .eq("id", id)
  if (error) return { erro: `Não foi possível excluir: ${error.message}` }
  if (count === 0) return { erro: "Tipo não encontrado." }

  revalidar()
  return { ok: "Tipo excluído." }
}
