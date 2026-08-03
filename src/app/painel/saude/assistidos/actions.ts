"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { salvarAssistido } from "@/lib/db/atendimentos"

const PERMISSAO = "saude_atendimento"
const ALTERNATIVAS = ["saude_gestao"]

function texto(formData: FormData, campo: string): string {
  return String(formData.get(campo) ?? "").trim()
}

export async function salvarAssistidoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao(PERMISSAO, ALTERNATIVAS)

  const id = texto(formData, "id") || undefined
  const retencaoAte = texto(formData, "retencao_ate")

  if (retencaoAte && !/^\d{4}-\d{2}-\d{2}$/.test(retencaoAte)) {
    return { erro: "Data de guarda inválida." }
  }

  const { id: novoId, erro } = await salvarAssistido(
    {
      nome: texto(formData, "nome"),
      filiado_id: texto(formData, "filiado_id") || null,
      observacoes: texto(formData, "observacoes"),
      retencao_ate: retencaoAte,
      retencao_regime: texto(formData, "retencao_regime"),
      retencao_observacao: texto(formData, "retencao_observacao"),
      exposicao_cancerigeno_quimico:
        formData.get("exposicao_cancerigeno_quimico") === "on",
      exposicao_radiacao_ionizante:
        formData.get("exposicao_radiacao_ionizante") === "on",
    },
    id
  )
  if (erro || !novoId) return { erro: erro ?? "Não foi possível gravar." }

  revalidatePath("/painel/saude/assistidos")
  redirect(`/painel/saude/assistidos/${novoId}?salvo=1`)
}
