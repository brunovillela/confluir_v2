"use server"

import { tenantAtual } from "@/lib/tenant"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { invalidarCacheRemessa } from "@/lib/db/receitas"
import { createAdminClient } from "@/lib/supabase/admin"

import { MESES, TIPOS_REMESSA } from "./remessa-constantes"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function lerCampos(formData: FormData):
  | {
      ano: number
      mes: number
      tipo: string
      aberto: boolean
      ordem: number
      nomeMes: string
    }
  | { erro: string } {
  const mes = Number(formData.get("mes"))
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) {
    return { erro: "Escolha o mês da remessa." }
  }
  const ano = Number(formData.get("ano"))
  if (!Number.isInteger(ano) || ano < 2000 || ano > 2100) {
    return { erro: "Informe um ano válido." }
  }
  const tipo = String(formData.get("tipo") ?? "")
  if (!(TIPOS_REMESSA as readonly string[]).includes(tipo)) {
    return { erro: "Escolha o tipo da remessa." }
  }
  return {
    ano,
    mes,
    tipo,
    aberto: formData.get("aberto") === "on",
    ordem: ano * 100 + mes,
    nomeMes: MESES[mes - 1],
  }
}

export async function criarRemessa(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("filiacao_receitas", ["filiacao_gestao"])

  const campos = lerCampos(formData)
  if ("erro" in campos) return campos

  const admin = await createAdminClient()

  const { data: existente } = await admin
    .from("filiacao_recebe_remessa")
    .select("id")
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("ordem", campos.ordem)
    .eq("tipo", campos.tipo)
    .limit(1)
    .maybeSingle()
  if (existente) {
    return {
      erro: `Já existe a remessa ${campos.tipo} de ${campos.mes}/${campos.ano}.`,
    }
  }

  const { data: criada, error } = await admin
    .from("filiacao_recebe_remessa")
    .insert({
      ano: String(campos.ano),
      mes: campos.nomeMes,
      tipo: campos.tipo,
      aberto: campos.aberto,
      ordem: campos.ordem,
      emp_proprietaria_id: await tenantAtual(),
    })
    .select("id")
    .single()
  if (error || !criada) {
    return { erro: `Não foi possível criar: ${error?.message ?? "?"}` }
  }

  revalidatePath("/painel/filiados/receitas")
  redirect(`/painel/filiados/receitas/${criada.id}?criada=1`)
}

export async function atualizarRemessa(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("filiacao_receitas", ["filiacao_gestao"])

  const id = String(formData.get("remessa_id") ?? "")
  if (!UUID.test(id)) return { erro: "Remessa inválida." }

  const campos = lerCampos(formData)
  if ("erro" in campos) return campos

  const admin = await createAdminClient()

  const { data: existente } = await admin
    .from("filiacao_recebe_remessa")
    .select("id")
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("ordem", campos.ordem)
    .eq("tipo", campos.tipo)
    .neq("id", id)
    .limit(1)
    .maybeSingle()
  if (existente) {
    return {
      erro: `Já existe outra remessa ${campos.tipo} de ${campos.mes}/${campos.ano}.`,
    }
  }

  const { error, count } = await admin
    .from("filiacao_recebe_remessa")
    .update(
      {
        ano: String(campos.ano),
        mes: campos.nomeMes,
        tipo: campos.tipo,
        aberto: campos.aberto,
        ordem: campos.ordem,
      },
      { count: "exact" }
    )
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: `Não foi possível salvar: ${error.message}` }
  if (count === 0) return { erro: "Remessa não encontrada." }

  invalidarCacheRemessa(id)
  revalidatePath("/painel/filiados/receitas")
  revalidatePath(`/painel/filiados/receitas/${id}`)
  redirect(`/painel/filiados/receitas/${id}?salva=1`)
}

export async function excluirRemessa(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("filiacao_receitas", ["filiacao_gestao"])

  const id = String(formData.get("remessa_id") ?? "")
  if (!UUID.test(id)) return { erro: "Remessa inválida." }

  const admin = await createAdminClient()

  // Remessa com lançamentos ou recebimentos não pode ser excluída
  const [{ count: lancamentos }, { count: recebimentos }] = await Promise.all([
    admin
      .from("filiacao_recebe")
      .select("id", { count: "exact", head: true })
      .eq("remessa_id", id),
    admin
      .from("filiacao_recebe_comprovacao")
      .select("id", { count: "exact", head: true })
      .eq("remessa_id", id),
  ])
  if ((lancamentos ?? 0) > 0 || (recebimentos ?? 0) > 0) {
    return {
      erro: `A remessa tem ${(lancamentos ?? 0).toLocaleString("pt-BR")} lançamento(s) e ${(recebimentos ?? 0).toLocaleString("pt-BR")} recebimento(s) — mova-os para outra remessa (ou exclua-os) antes de excluir a remessa.`,
    }
  }

  const { error } = await admin
    .from("filiacao_recebe_remessa")
    .delete()
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: `Não foi possível excluir: ${error.message}` }

  invalidarCacheRemessa(id)
  revalidatePath("/painel/filiados/receitas")
  redirect("/painel/filiados/receitas?excluida=1")
}
