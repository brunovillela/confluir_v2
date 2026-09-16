"use server"

import { tenantAtual } from "@/lib/tenant"

import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { invalidarCacheCadastrosPendentes } from "@/lib/db/filiacao-cadastros-pendentes"
import {
  atribuirMatriculaSindical,
  conferirIdentidade,
  type CadastroParecido,
} from "@/lib/db/filiacao-identidade"
import { invalidarCacheFontes } from "@/lib/db/fontes"
import { FILIACAO_CONDICOES } from "@/lib/filiacao"
import { createAdminClient } from "@/lib/supabase/admin"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATA = /^\d{4}-\d{2}-\d{2}$/

export type EstadoNovaFiliacao = EstadoForm & {
  /** Mesmo nome e nascimento em outro cadastro: pede confirmação. */
  parecidos?: CadastroParecido[]
}

/** Registra uma nova filiação (cadastro + vínculo opcional com a fonte). */
export async function registrarFiliacao(
  _prev: EstadoNovaFiliacao,
  formData: FormData
): Promise<EstadoNovaFiliacao> {
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

  const nascimento = data("nascimento_data")
  // CPF e matrícula repetidos bloqueiam; mesmo nome + nascimento pede
  // confirmação — era assim que a refiliação virava um segundo cadastro.
  const identidade = await conferirIdentidade({
    cpf: String(formData.get("cpf") ?? ""),
    matricula: texto("matricula_sindical"),
    nome,
    nascimento,
    cpfObrigatorio: true,
  })
  if (identidade.erro) return { erro: identidade.erro }
  if (identidade.parecidos.length > 0 && formData.get("confirmar_outra_pessoa") !== "on") {
    return {
      erro: "Já existe cadastro com o mesmo nome e a mesma data de nascimento. Se for a mesma pessoa, abra o cadastro existente e adicione o vínculo por lá; se for outra pessoa, confirme abaixo.",
      parecidos: identidade.parecidos,
    }
  }
  const cpf = identidade.cpf

  const admin = await createAdminClient()

  const sexoBruto = String(formData.get("sexo") ?? "")
  const condicaoBruta = String(formData.get("filiacao_condicao") ?? "")
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
      matricula_sindical: identidade.matricula,
      matricula_sindical_numero: identidade.matricula ? Number(identidade.matricula) : null,
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

  // Sem matrícula informada, recebe a próxima livre (a numeração é da entidade).
  if (!identidade.matricula) await atribuirMatriculaSindical(String(criada.id))

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
  invalidarCacheCadastrosPendentes()
  revalidatePath("/painel/filiados")
  revalidatePath("/painel/filiados/lista")
  redirect(`/painel/filiados/${criada.id}?salvo=1`)
}
