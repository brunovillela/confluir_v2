"use server"

import { tenantAtual } from "@/lib/tenant"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import {
  enviarDocumentoDoVinculo,
  removerDocumentoDoVinculo,
  type TipoDocumento,
} from "@/lib/db/filiacao-documentos"
import { FILIACAO_CONDICOES } from "@/lib/filiacao"
import { createAdminClient } from "@/lib/supabase/admin"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATA = /^\d{4}-\d{2}-\d{2}$/

/** Campos editáveis do vínculo de filiação. */
function lerCampos(formData: FormData) {
  const texto = (campo: string) => {
    const v = String(formData.get(campo) ?? "").trim()
    return v === "" ? null : v
  }
  const data = (campo: string) => {
    const v = String(formData.get(campo) ?? "")
    return DATA.test(v) ? v : null
  }
  const fonte = String(formData.get("fonte_pagadora_id") ?? "")
  const condicao = String(formData.get("filiacao_condicao") ?? "")
  return {
    fonte_pagadora_id: UUID.test(fonte) ? fonte : null,
    cargo: texto("cargo"),
    lotacao: texto("lotacao"),
    matricula: texto("matricula"),
    data_entrada_admissao: data("data_entrada_admissao"),
    data_filiacao: data("data_filiacao"),
    data_desfiliacao: data("data_desfiliacao"),
    filiacao_condicao: (FILIACAO_CONDICOES as readonly string[]).includes(
      condicao
    )
      ? condicao
      : null,
  }
}

function validar(dados: ReturnType<typeof lerCampos>): string | null {
  if (!dados.fonte_pagadora_id) return "Selecione a fonte pagadora."
  if (
    dados.data_filiacao &&
    dados.data_desfiliacao &&
    dados.data_desfiliacao < dados.data_filiacao
  ) {
    return "A desfiliação não pode ser anterior à filiação."
  }
  return null
}

export async function criarVinculo(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("filiacao_gestao")

  const filiadoId = String(formData.get("filiado_id") ?? "")
  if (!UUID.test(filiadoId)) return { erro: "Filiado inválido." }

  const dados = lerCampos(formData)
  const erro = validar(dados)
  if (erro) return { erro }

  const admin = await createAdminClient()

  // O vínculo pertence ao registro de filiação — confere tenant.
  const { data: filiado } = await admin
    .from("filiacoes")
    .select("id")
    .eq("id", filiadoId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (!filiado) return { erro: "Filiado não encontrado." }

  const { error } = await admin.from("filiacao_vinculos").insert({
    ...dados,
    filiado_id: filiadoId,
    emp_proprietaria_id: await tenantAtual(),
  })
  if (error) return { erro: `Não foi possível criar: ${error.message}` }

  revalidatePath(`/painel/filiados/${filiadoId}`)
  redirect(`/painel/filiados/${filiadoId}?salvo=1`)
}

export async function atualizarVinculo(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("filiacao_gestao")

  const filiadoId = String(formData.get("filiado_id") ?? "")
  const vinculoId = String(formData.get("vinculo_id") ?? "")
  if (!UUID.test(filiadoId) || !UUID.test(vinculoId)) {
    return { erro: "Vínculo inválido." }
  }

  const dados = lerCampos(formData)
  const erro = validar(dados)
  if (erro) return { erro }

  const admin = await createAdminClient()
  const { error, count } = await admin
    .from("filiacao_vinculos")
    .update(dados, { count: "exact" })
    .eq("id", vinculoId)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: `Não foi possível salvar: ${error.message}` }
  if (count === 0) return { erro: "Vínculo não encontrado." }

  revalidatePath(`/painel/filiados/${filiadoId}`)
  redirect(`/painel/filiados/${filiadoId}?salvo=1`)
}

export async function excluirVinculo(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("filiacao_gestao")

  const filiadoId = String(formData.get("filiado_id") ?? "")
  const vinculoId = String(formData.get("vinculo_id") ?? "")
  if (!UUID.test(filiadoId) || !UUID.test(vinculoId)) {
    return { erro: "Vínculo inválido." }
  }

  const admin = await createAdminClient()
  const { error } = await admin
    .from("filiacao_vinculos")
    .delete()
    .eq("id", vinculoId)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) {
    return {
      erro: "Não foi possível excluir este vínculo — há registros ligados a ele.",
    }
  }

  revalidatePath(`/painel/filiados/${filiadoId}`)
  redirect(`/painel/filiados/${filiadoId}?salvo=1`)
}

/**
 * Ficha de filiação e carta de desfiliação do vínculo.
 *
 * Reusam as colunas `ficha_filiacao` e `carta_desfiliacao`, que já vinham do
 * Bubble — o que faltava era a tela para pôr e ver o papel.
 */
export async function enviarDocumentoAction(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  await requirePermissao("filiacao_gestao")
  const filiadoId = String(fd.get("filiadoId") ?? "")
  const vinculoId = String(fd.get("vinculoId") ?? "")
  const tipo = String(fd.get("tipo") ?? "") as TipoDocumento
  if (!vinculoId || (tipo !== "ficha" && tipo !== "carta")) {
    return { erro: "Documento inválido." }
  }

  const arquivo = fd.get("arquivo")
  if (!(arquivo instanceof File)) return { erro: "Escolha o arquivo." }

  const { erro } = await enviarDocumentoDoVinculo(vinculoId, tipo, arquivo)
  if (erro) return { erro }

  revalidatePath(`/painel/filiados/${filiadoId}`)
  revalidatePath(`/painel/filiados/${filiadoId}/vinculos/${vinculoId}`)
  return {
    ok:
      tipo === "ficha"
        ? "Ficha de filiação anexada."
        : "Carta de desfiliação anexada.",
  }
}

export async function removerDocumentoAction(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  await requirePermissao("filiacao_gestao")
  const filiadoId = String(fd.get("filiadoId") ?? "")
  const vinculoId = String(fd.get("vinculoId") ?? "")
  const tipo = String(fd.get("tipo") ?? "") as TipoDocumento
  if (!vinculoId || (tipo !== "ficha" && tipo !== "carta")) {
    return { erro: "Documento inválido." }
  }

  const { erro } = await removerDocumentoDoVinculo(vinculoId, tipo)
  if (erro) return { erro }

  revalidatePath(`/painel/filiados/${filiadoId}`)
  revalidatePath(`/painel/filiados/${filiadoId}/vinculos/${vinculoId}`)
  return { ok: "Documento removido do vínculo." }
}
