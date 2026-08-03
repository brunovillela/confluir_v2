"use server"

import { tenantAtual } from "@/lib/tenant"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { SITE_URL } from "@/lib/env"
import { createAdminClient } from "@/lib/supabase/admin"

function lerCampos(formData: FormData) {
  const texto = (campo: string) => {
    const v = String(formData.get(campo) ?? "").trim()
    return v === "" ? null : v
  }
  const inteiro = (campo: string) => {
    const v = texto(campo)
    if (v === null) return null
    const n = Number(v)
    return Number.isInteger(n) && n >= 0 ? n : null
  }
  const data = (campo: string) => {
    const v = texto(campo)
    return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null
  }
  return {
    nome: texto("nome"),
    ativo: formData.get("ativo") === "on",
    demanda_garantida: formData.get("demanda_garantida") === "on",
    quant_quartos_dedicados: inteiro("quant_quartos_dedicados"),
    max_hospedes_por_quarto: inteiro("max_hospedes_por_quarto"),
    max_hospedes_por_dia: inteiro("max_hospedes_por_dia"),
    exige_relatorio_para_faturar:
      formData.get("exige_relatorio_para_faturar") === "on",
    acordo_vigencia_inicio: data("acordo_vigencia_inicio"),
    acordo_vigencia_fim: data("acordo_vigencia_fim"),
  }
}

export async function criarHotel(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("filiacao_hospedagens_gestao")

  const dados = lerCampos(formData)
  if (!dados.nome) return { erro: "O nome do hotel é obrigatório." }

  const admin = await createAdminClient()
  const { error } = await admin.from("hospedagem_hotel").insert({
    ...dados,
    emp_proprietaria_id: await tenantAtual(),
  })
  if (error) return { erro: `Não foi possível criar: ${error.message}` }

  revalidatePath("/painel/hospedagem/hoteis")
  revalidatePath("/painel/hospedagem")
  redirect("/painel/hospedagem/hoteis?salvo=1")
}

export async function atualizarHotel(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("filiacao_hospedagens_gestao")

  const id = String(formData.get("id") ?? "")
  if (!id) return { erro: "Hotel inválido." }

  const dados = lerCampos(formData)
  if (!dados.nome) return { erro: "O nome do hotel é obrigatório." }

  const admin = await createAdminClient()
  const { error, count } = await admin
    .from("hospedagem_hotel")
    .update(dados, { count: "exact" })
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: `Não foi possível salvar: ${error.message}` }
  if (count === 0) return { erro: "Hotel não encontrado." }

  revalidatePath("/painel/hospedagem/hoteis")
  revalidatePath(`/painel/hospedagem/hoteis/${id}`)
  revalidatePath("/painel/hospedagem")
  redirect("/painel/hospedagem/hoteis?salvo=1")
}

export async function criarTarifa(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("filiacao_hospedagens_gestao")

  const hotelId = String(formData.get("hotel_id") ?? "")
  if (!hotelId) return { erro: "Hotel inválido." }

  const numero = (campo: string) => {
    const v = String(formData.get(campo) ?? "").trim().replace(",", ".")
    if (v === "") return null
    const n = Number(v)
    return Number.isFinite(n) && n >= 0 ? n : null
  }
  const pessoas = numero("pessoas_por_quarto")
  const custoFiliado = numero("custo_por_filiado")
  const custoEntidade = numero("custo_entidade")

  if (pessoas === null || !Number.isInteger(pessoas) || pessoas < 1) {
    return { erro: "Informe quantas pessoas por quarto (número inteiro)." }
  }
  if (custoFiliado === null && custoEntidade === null) {
    return { erro: "Informe pelo menos um dos custos (filiado ou entidade)." }
  }

  const admin = await createAdminClient()
  const { error } = await admin.from("hospedagem_tarifas").insert({
    hotel_id: hotelId,
    pessoas_por_quarto: pessoas,
    custo_por_filiado: custoFiliado,
    custo_entidade: custoEntidade,
  })
  if (error) return { erro: `Não foi possível criar a tarifa: ${error.message}` }

  revalidatePath(`/painel/hospedagem/hoteis/${hotelId}`)
  revalidatePath("/painel/hospedagem/hoteis")
  return { ok: "Tarifa adicionada." }
}

// ── Usuários do hotel (interface do hotel — Porta 4) ──────────────────────

/**
 * Cria o acesso do pessoal do hotel: registro em hospedagem_hotel_usuarios +
 * convite por email (define a senha em /definir-senha e cai em /hotel/inicio).
 * Se o email já tiver conta no Auth, o vínculo vale mesmo assim — a pessoa
 * entra em /hotel com a senha que já tem.
 */
export async function criarUsuarioHotel(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("filiacao_hospedagens_gestao")

  const hotelId = String(formData.get("hotel_id") ?? "")
  const nome = String(formData.get("nome") ?? "").trim() || null
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase()
  if (!hotelId) return { erro: "Hotel inválido." }
  if (!/^\S+@\S+\.\S+$/.test(email)) return { erro: "Informe um email válido." }

  const admin = await createAdminClient()

  const { data: hotel } = await admin
    .from("hospedagem_hotel")
    .select("id")
    .eq("id", hotelId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (!hotel) return { erro: "Hotel não encontrado." }

  const { data: convite, error: erroConvite } =
    await admin.auth.admin.inviteUserByEmail(email, {
      data: { tipo: "hotel" },
      redirectTo: `${SITE_URL}/auth/confirm?next=/definir-senha`,
    })

  const { error } = await admin.from("hospedagem_hotel_usuarios").insert({
    hotel_id: hotelId,
    email,
    nome,
    auth_user_id: convite?.user?.id ?? null,
    ativo: true,
    emp_proprietaria_id: await tenantAtual(),
  })
  if (error) {
    if (error.code === "PGRST205" || error.code === "42P01") {
      return {
        erro: "A tabela de usuários de hotel ainda não existe — rode supabase/hospedagem-hotel.sql no SQL Editor.",
      }
    }
    if (error.code === "23505") {
      return { erro: "Este email já tem acesso de hotel cadastrado." }
    }
    return { erro: `Não foi possível criar o acesso: ${error.message}` }
  }

  revalidatePath(`/painel/hospedagem/hoteis/${hotelId}`)
  return {
    ok: erroConvite
      ? "Acesso criado. O email já tinha conta — a pessoa entra em /hotel com a senha existente (ou usa a recuperação de senha)."
      : "Acesso criado — convite enviado por email para definição de senha.",
  }
}

export async function alternarUsuarioHotel(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("filiacao_hospedagens_gestao")

  const id = String(formData.get("id") ?? "")
  const hotelId = String(formData.get("hotel_id") ?? "")
  const ativo = String(formData.get("ativo") ?? "") === "true"
  if (!id) return { erro: "Usuário inválido." }

  const admin = await createAdminClient()
  const { error, count } = await admin
    .from("hospedagem_hotel_usuarios")
    .update({ ativo }, { count: "exact" })
    .eq("id", id)
  if (error) return { erro: `Não foi possível salvar: ${error.message}` }
  if (count === 0) return { erro: "Usuário não encontrado." }

  if (hotelId) revalidatePath(`/painel/hospedagem/hoteis/${hotelId}`)
  return { ok: ativo ? "Acesso reativado." : "Acesso desativado." }
}

export async function excluirTarifa(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("filiacao_hospedagens_gestao")

  const id = String(formData.get("id") ?? "")
  const hotelId = String(formData.get("hotel_id") ?? "")
  if (!id) return { erro: "Tarifa inválida." }

  const admin = await createAdminClient()
  const { error } = await admin.from("hospedagem_tarifas").delete().eq("id", id)
  if (error) return { erro: `Não foi possível excluir: ${error.message}` }

  if (hotelId) revalidatePath(`/painel/hospedagem/hoteis/${hotelId}`)
  revalidatePath("/painel/hospedagem/hoteis")
  return { ok: "Tarifa excluída." }
}
