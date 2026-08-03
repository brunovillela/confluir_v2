"use server"

import { tenantAtual } from "@/lib/tenant"

import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { limparCpf, validarCpf } from "@/lib/cpf"
import { invalidarCacheFontes } from "@/lib/db/fontes"
import { FILIACAO_CONDICOES } from "@/lib/filiacao"
import { createAdminClient } from "@/lib/supabase/admin"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATA = /^\d{4}-\d{2}-\d{2}$/

/** Registra uma nova filiação (cadastro + vínculo opcional com a fonte). */
export async function registrarFiliacao(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("filiacao_gestao")

  const texto = (campo: string) => {
    const v = String(formData.get(campo) ?? "").trim()
    return v === "" ? null : v
  }
  const data = (campo: string) => {
    const v = String(formData.get(campo) ?? "")
    return DATA.test(v) ? v : null
  }

  const nome = texto("nome_completo")
  if (!nome) return { erro: "O nome completo é obrigatório." }

  const cpf = limparCpf(String(formData.get("cpf") ?? ""))
  if (!validarCpf(cpf)) return { erro: "CPF inválido." }

  const admin = await createAdminClient()

  const { data: existente } = await admin
    .from("filiacoes")
    .select("id")
    .eq("cpf", cpf)
    .eq("emp_proprietaria_id", await tenantAtual())
    .limit(1)
    .maybeSingle()
  if (existente) {
    return {
      erro: "Já existe um registro de filiação com este CPF — abra o cadastro pela busca e, se for o caso, adicione um novo vínculo por lá.",
    }
  }

  const sexoBruto = String(formData.get("sexo") ?? "")
  const condicaoBruta = String(formData.get("filiacao_condicao") ?? "")
  const nascimento = data("nascimento_data")
  const telefone = texto("telefone_1")
  const email = texto("email_pessoal")
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { erro: "Email inválido." }
  }

  const condicao = (FILIACAO_CONDICOES as readonly string[]).includes(
    condicaoBruta
  )
    ? condicaoBruta
    : "Ativo"

  const { data: criada, error } = await admin
    .from("filiacoes")
    .insert({
      nome_completo: nome,
      cpf,
      matricula_sindical: texto("matricula_sindical"),
      sexo: ["Masculino", "Feminino", "Outro"].includes(sexoBruto)
        ? sexoBruto
        : null,
      nascimento_data: nascimento,
      nascimento_dia: nascimento ? Number(nascimento.slice(8, 10)) : null,
      nascimento_mes: nascimento ? Number(nascimento.slice(5, 7)) : null,
      email_pessoal: email,
      telefone_1: telefone ? telefone.replace(/\D/g, "") : null,
      filiacao_condicao: condicao,
      emp_proprietaria_id: await tenantAtual(),
    })
    .select("id")
    .single()
  if (error || !criada) {
    return { erro: `Não foi possível registrar: ${error?.message ?? "?"}` }
  }

  // Vínculo com a fonte pagadora (opcional)
  const fonte = String(formData.get("fonte_pagadora_id") ?? "")
  if (UUID.test(fonte)) {
    const { error: erroVinculo } = await admin.from("filiacao_vinculos").insert({
      filiado_id: criada.id,
      fonte_pagadora_id: fonte,
      cargo: texto("cargo"),
      lotacao: texto("lotacao"),
      matricula: texto("matricula_fonte"),
      data_entrada_admissao: data("data_entrada_admissao"),
      data_filiacao: data("data_filiacao"),
      filiacao_condicao: condicao,
      emp_proprietaria_id: await tenantAtual(),
    })
    if (erroVinculo) {
      return {
        erro: `Cadastro criado, mas o vínculo falhou: ${erroVinculo.message}. Adicione o vínculo pelo perfil.`,
      }
    }
  }

  invalidarCacheFontes()
  revalidatePath("/painel/filiados")
  revalidatePath("/painel/filiados/lista")
  redirect(`/painel/filiados/${criada.id}?salvo=1`)
}
