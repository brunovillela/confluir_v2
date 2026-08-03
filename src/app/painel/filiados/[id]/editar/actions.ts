"use server"

import { tenantAtual } from "@/lib/tenant"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { FILIACAO_CONDICOES } from "@/lib/filiacao"
import { createAdminClient } from "@/lib/supabase/admin"

/** Campos do cadastro editáveis pela tela. CPF e matrícula ficam de fora — são identidade. */
const CAMPOS_TEXTO = [
  "nome_completo",
  "nome_social",
  "email_pessoal",
  "email_corporativo",
  "telefone_1",
  "telefone_2",
  "endereco_cep",
  "endereco_logradouro",
  "endereco_numero",
  "endereco_complemento",
  "endereco_bairro",
  "endereco_cidade",
  "endereco_estado",
] as const

const CAMPOS_BOOLEAN = [
  "telefone_1_whatsapp",
  "telefone_2_whatsapp",
  "recebe_mensagens",
] as const

export async function atualizarCadastroFiliado(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  // Edição de cadastro exige o perfil de gestão da filiação.
  await requirePermissao("filiacao_gestao")

  const id = String(formData.get("id") ?? "")
  if (!id) return { erro: "Registro inválido." }

  const dados: Record<string, unknown> = {}

  for (const campo of CAMPOS_TEXTO) {
    const valor = String(formData.get(campo) ?? "").trim()
    dados[campo] = valor === "" ? null : valor
  }

  // Telefones e CEP chegam mascarados da tela — guarda só os dígitos.
  for (const campo of ["telefone_1", "telefone_2", "endereco_cep"] as const) {
    if (typeof dados[campo] === "string") {
      const digitos = (dados[campo] as string).replace(/\D/g, "")
      dados[campo] = digitos === "" ? null : digitos
    }
  }
  for (const campo of CAMPOS_BOOLEAN) {
    dados[campo] = formData.get(campo) === "on"
  }

  const sexo = String(formData.get("sexo") ?? "")
  dados.sexo = ["Masculino", "Feminino", "Outro"].includes(sexo) ? sexo : null

  const condicao = String(formData.get("filiacao_condicao") ?? "")
  dados.filiacao_condicao = (FILIACAO_CONDICOES as readonly string[]).includes(
    condicao
  )
    ? condicao
    : null

  const nascimento = String(formData.get("nascimento_data") ?? "")
  dados.nascimento_data = /^\d{4}-\d{2}-\d{2}$/.test(nascimento)
    ? nascimento
    : null

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  for (const campo of ["email_pessoal", "email_corporativo"] as const) {
    if (dados[campo] && !emailRegex.test(String(dados[campo]))) {
      return { erro: `Email inválido em "${campo.replace("_", " ")}".` }
    }
  }
  if (!dados.nome_completo) {
    return { erro: "O nome completo é obrigatório." }
  }

  const admin = await createAdminClient()
  const { error, count } = await admin
    .from("filiacoes")
    .update(dados, { count: "exact" })
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())

  if (error) {
    return { erro: `Não foi possível salvar: ${error.message}` }
  }
  if (count === 0) {
    return { erro: "Registro não encontrado." }
  }

  revalidatePath(`/painel/filiados/${id}`)
  revalidatePath("/painel/filiados/lista")
  redirect(`/painel/filiados/${id}?salvo=1`)
}
