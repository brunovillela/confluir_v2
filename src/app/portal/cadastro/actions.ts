"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requireSessaoPortal } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { atualizarRegistrosDoCpf } from "@/lib/db/filiado-portal"

/**
 * Auto-atualização do filiado — SOMENTE contato e endereço (telefones,
 * emails, endereço). Nome, CPF, matrícula e condição só mudam pela filiação.
 * Atualiza todos os registros do CPF para manter o cadastro coeso.
 */
const CAMPOS_TEXTO = [
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

export async function atualizarMeuCadastro(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const { filiado } = await requireSessaoPortal()

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
  dados.telefone_1_whatsapp = formData.get("telefone_1_whatsapp") === "on"
  dados.telefone_2_whatsapp = formData.get("telefone_2_whatsapp") === "on"

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  for (const campo of ["email_pessoal", "email_corporativo"] as const) {
    if (dados[campo] && !emailRegex.test(String(dados[campo]))) {
      return { erro: `Email inválido em "${campo.replace("_", " ")}".` }
    }
  }

  const uf = String(dados.endereco_estado ?? "").toUpperCase()
  if (uf && !/^[A-Z]{2}$/.test(uf)) {
    return { erro: "UF deve ter 2 letras (ex.: RJ)." }
  }
  if (uf) dados.endereco_estado = uf

  const erro = await atualizarRegistrosDoCpf(filiado.cpf, dados)
  if (erro) return { erro }

  revalidatePath("/portal/cadastro")
  redirect("/portal/cadastro?salvo=1")
}
