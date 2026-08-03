"use server"

import { tenantAtual } from "@/lib/tenant"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import {
  atualizarAnuenio,
  baseEmUso,
  criarAnuenio,
  listarAnuenioBase,
} from "@/lib/db/carreira"
import { createAdminClient } from "@/lib/supabase/admin"

async function exigirAcesso() {
  // Chave dedicada do Bubble libera a seção sem a gestão completa.
  await requirePermissao("pessoal_gestao", ["pessoal_anuenios"])
}

function revalidar(funcionarioId?: string | null) {
  revalidatePath("/painel/pessoal/anuenios")
  revalidatePath("/painel/pessoal/anuenios/tabela")
  revalidatePath("/painel/perfil/contracheques")
  if (funcionarioId) revalidatePath(`/painel/pessoal/${funcionarioId}`)
}

function lerCamposLancamento(formData: FormData) {
  const funcionario_id = String(formData.get("funcionario_id") ?? "")
  const nivel_atual_id = String(formData.get("nivel_atual_id") ?? "")
  const nivel_atual_data = String(formData.get("nivel_atual_data") ?? "")
  if (!funcionario_id) return { erro: "Escolha o funcionário." }
  if (!nivel_atual_id) return { erro: "Escolha o nível do anuênio." }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(nivel_atual_data)) {
    return { erro: "Informe a data em que o nível passou a valer." }
  }
  return {
    funcionario_id,
    nivel_atual_id,
    nivel_atual_data,
    informado_contabilidade: formData.get("informado_contabilidade") === "on",
  }
}

export async function criarLancamentoAnuenio(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await exigirAcesso()

  const dados = lerCamposLancamento(formData)
  if ("erro" in dados) return dados

  const { erro } = await criarAnuenio(dados)
  if (erro) return { erro }

  revalidar(dados.funcionario_id)
  redirect("/painel/pessoal/anuenios?salvo=1")
}

export async function atualizarLancamentoAnuenio(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await exigirAcesso()

  const id = String(formData.get("id") ?? "")
  if (!id) return { erro: "Lançamento inválido." }

  const dados = lerCamposLancamento(formData)
  if ("erro" in dados) return dados

  const { erro } = await atualizarAnuenio(id, dados)
  if (erro) return { erro }

  revalidar(dados.funcionario_id)
  redirect("/painel/pessoal/anuenios?salvo=1")
}

export async function excluirLancamentoAnuenio(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await exigirAcesso()

  const id = String(formData.get("id") ?? "")
  if (!id) return { erro: "Lançamento inválido." }

  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("pessoal_anuenio")
    .delete()
    .eq("id", id)
    .select("funcionario_id")
  if (error) return { erro: `Não foi possível excluir: ${error.message}` }
  if ((data ?? []).length === 0) return { erro: "Lançamento não encontrado." }

  revalidar(data![0].funcionario_id)
  redirect("/painel/pessoal/anuenios?excluido=1")
}

// ── Tabela base de alíquotas ───────────────────────────────────────────────

/** Aceita '4,6' ou '4.6' (em %) → 0.046; nível é inteiro >= 0. */
function lerCamposBase(formData: FormData) {
  const nivelBruto = String(formData.get("nivel") ?? "").trim()
  const aliquotaBruta = String(formData.get("aliquota") ?? "")
    .trim()
    .replace(",", ".")
  const nivel = Number(nivelBruto)
  const aliquotaPct = Number(aliquotaBruta)
  if (!nivelBruto || !Number.isInteger(nivel) || nivel < 0) {
    return { erro: "Informe o nível (anos de casa, número inteiro)." }
  }
  if (!aliquotaBruta || Number.isNaN(aliquotaPct) || aliquotaPct < 0) {
    return { erro: "Informe a alíquota em % (ex.: 4,6)." }
  }
  return { nivel, aliquota: aliquotaPct / 100 }
}

export async function criarNivelAnuenioBase(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await exigirAcesso()

  const dados = lerCamposBase(formData)
  if ("erro" in dados) return dados

  const existentes = await listarAnuenioBase()
  if (existentes.some((b) => b.nivel === dados.nivel)) {
    return { erro: `Já existe um degrau para o nível ${dados.nivel}.` }
  }

  const admin = await createAdminClient()
  const { error } = await admin.from("pessoal_anuenio_base").insert({
    ...dados,
    emp_proprietaria_id: await tenantAtual(),
    sindicato_id: await tenantAtual(),
  })
  if (error) return { erro: `Não foi possível criar: ${error.message}` }

  revalidar()
  redirect("/painel/pessoal/anuenios/tabela?salvo=1")
}

export async function atualizarNivelAnuenioBase(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await exigirAcesso()

  const id = String(formData.get("id") ?? "")
  if (!id) return { erro: "Degrau inválido." }

  const dados = lerCamposBase(formData)
  if ("erro" in dados) return dados

  const existentes = await listarAnuenioBase()
  if (existentes.some((b) => b.id !== id && b.nivel === dados.nivel)) {
    return { erro: `Já existe um degrau para o nível ${dados.nivel}.` }
  }

  const admin = await createAdminClient()
  const { error, count } = await admin
    .from("pessoal_anuenio_base")
    .update(dados, { count: "exact" })
    .eq("id", id)
  if (error) return { erro: `Não foi possível salvar: ${error.message}` }
  if (count === 0) return { erro: "Degrau não encontrado." }

  revalidar()
  redirect("/painel/pessoal/anuenios/tabela?salvo=1")
}

export async function excluirNivelAnuenioBase(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await exigirAcesso()

  const id = String(formData.get("id") ?? "")
  if (!id) return { erro: "Degrau inválido." }

  const emUso = await baseEmUso("pessoal_anuenio", id)
  if (emUso > 0) {
    return {
      erro: `Este degrau é usado por ${emUso} lançamento${emUso === 1 ? "" : "s"} — não pode ser excluído.`,
    }
  }

  const admin = await createAdminClient()
  const { error, count } = await admin
    .from("pessoal_anuenio_base")
    .delete({ count: "exact" })
    .eq("id", id)
  if (error) return { erro: `Não foi possível excluir: ${error.message}` }
  if (count === 0) return { erro: "Degrau não encontrado." }

  revalidar()
  return { ok: "Degrau excluído." }
}
