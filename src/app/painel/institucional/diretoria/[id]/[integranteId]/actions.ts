"use server"

import { revalidatePath } from "next/cache"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { salvarFichaDiretor, type FichaDiretor } from "@/lib/db/diretoria"

function txt(fd: FormData, k: string): string | null {
  const v = String(fd.get(k) ?? "").trim()
  return v || null
}

export async function salvarFichaAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("diretoria_mandatos")

  const integranteId = String(formData.get("integrante_id") ?? "")
  const mandatoId = String(formData.get("mandato_id") ?? "")
  if (!integranteId) return { erro: "Diretor inválido." }

  const dados: FichaDiretor = {
    data_nascimento: txt(formData, "data_nascimento"),
    email_particular: txt(formData, "email_particular"),
    telefone_particular: txt(formData, "telefone_particular"),
    telefone_whatsapp: formData.get("telefone_whatsapp") === "on",
    tamanho_camisa: txt(formData, "tamanho_camisa"),
    tipo_sanguineo: txt(formData, "tipo_sanguineo"),
    cep: txt(formData, "cep"),
    logradouro: txt(formData, "logradouro"),
    numero: txt(formData, "numero"),
    complemento: txt(formData, "complemento"),
    bairro: txt(formData, "bairro"),
    cidade: txt(formData, "cidade"),
    estado: txt(formData, "estado"),
    tipo_vinculo: txt(formData, "tipo_vinculo"),
    empregador_id: txt(formData, "empregador_id"),
    matricula_empregador: txt(formData, "matricula_empregador"),
    base_operacional: txt(formData, "base_operacional"),
    banco: txt(formData, "banco"),
    agencia: txt(formData, "agencia"),
    conta_corrente: txt(formData, "conta_corrente"),
    pix: txt(formData, "pix"),
    tipo_chave_pix: txt(formData, "tipo_chave_pix"),
    tem_restricao: formData.get("tem_restricao") === "on",
    restricao_descricao: txt(formData, "restricao_descricao"),
    contato_emergencia: txt(formData, "contato_emergencia"),
    telefone_emergencia: txt(formData, "telefone_emergencia"),
  }

  const { erro } = await salvarFichaDiretor(integranteId, dados)
  if (erro) return { erro }
  if (mandatoId) {
    revalidatePath(
      `/painel/institucional/diretoria/${mandatoId}/${integranteId}`
    )
  }
  return { ok: "Ficha salva." }
}
