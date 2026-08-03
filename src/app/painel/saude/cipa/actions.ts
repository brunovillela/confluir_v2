"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import {
  adicionarRepresentante,
  definirComparecimento,
  excluirReuniaoCipa,
  gravarAta,
  removerRepresentante,
  salvarReuniaoCipa,
  SITUACOES_CIPA,
} from "@/lib/db/cipa"

/**
 * Gate do módulo Saúde: quem opera a CIPA é quem tem permissão de Saúde
 * (decisão do Bruno em 21/07/2026), inclusive a secretaria do departamento.
 * Não é área clínica — nada aqui tem o sigilo do relatório de atendimento.
 */
const PERMISSAO = "saude_cat"
const ALTERNATIVAS = ["saude_atendimento", "saude_gestao"]

function texto(formData: FormData, campo: string): string {
  return String(formData.get(campo) ?? "").trim()
}

/**
 * Erro de validação devolve junto o que foi digitado.
 *
 * O React 19 limpa formulário não-controlado depois da action, então sem
 * isto o usuário perderia os 12 campos por causa de um só que faltou.
 */
export type EstadoReuniao = EstadoForm & {
  valores?: Record<string, string>
  /**
   * Contador de tentativas. Serve de gatilho para o formulário re-sincronizar
   * o DOM: sem ele, dois envios seguidos com os mesmos valores não mudariam
   * nada no estado e o campo controlado ficaria com o valor do reset.
   */
  tentativa?: number
}

export async function salvarReuniaoAction(
  prev: EstadoReuniao,
  formData: FormData
): Promise<EstadoReuniao> {
  await requirePermissao(PERMISSAO, ALTERNATIVAS)

  const id = texto(formData, "id") || undefined
  const data = texto(formData, "data_reuniao")
  const situacao = texto(formData, "situacao") || "convidado"
  const motivo = texto(formData, "motivo_ausencia")

  const tentativa = (prev.tentativa ?? 0) + 1

  // Eco do que veio, para repovoar o formulário se a validação recusar.
  const valores: Record<string, string> = {
    empresa_id: texto(formData, "empresa_id"),
    data_reuniao: data,
    convite_recebido_em: texto(formData, "convite_recebido_em"),
    unidade: texto(formData, "unidade"),
    situacao,
    motivo_ausencia: motivo,
    motivo_especifico: texto(formData, "motivo_especifico"),
    assuntos: texto(formData, "assuntos"),
    observacoes: texto(formData, "observacoes"),
    ordinaria: formData.get("ordinaria") === "on" ? "1" : "",
    online: formData.get("online") === "on" ? "1" : "",
    demanda_embarque: formData.get("demanda_embarque") === "on" ? "1" : "",
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    return { erro: "Informe a data da reunião.", valores, tentativa }
  }
  if (!SITUACOES_CIPA.some((s) => s.valor === situacao)) {
    return { erro: "Situação inválida.", valores, tentativa }
  }
  if ((situacao === "recusado" || situacao === "nao_compareceu") && !motivo) {
    return {
      erro:
        "Informe o motivo — é ele que dá sentido à estatística de ausência.",
      valores,
      tentativa,
    }
  }

  const { id: novoId, erro } = await salvarReuniaoCipa(
    {
      empresa_id: texto(formData, "empresa_id") || null,
      data_reuniao: data,
      unidade: texto(formData, "unidade"),
      ordinaria: formData.get("ordinaria") === "on",
      online: formData.get("online") === "on",
      demanda_embarque: formData.get("demanda_embarque") === "on",
      convite_recebido_em: texto(formData, "convite_recebido_em") || null,
      situacao,
      motivo_ausencia: motivo,
      motivo_especifico: texto(formData, "motivo_especifico"),
      assuntos: texto(formData, "assuntos"),
      observacoes: texto(formData, "observacoes"),
    },
    id
  )
  if (erro || !novoId) {
    return { erro: erro ?? "Não foi possível gravar.", valores, tentativa }
  }

  revalidatePath("/painel/saude/cipa")
  redirect(`/painel/saude/cipa/${novoId}?salvo=1`)
}

export async function excluirReuniaoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao(PERMISSAO, ALTERNATIVAS)
  const { erro } = await excluirReuniaoCipa(texto(formData, "id"))
  if (erro) return { erro }
  revalidatePath("/painel/saude/cipa")
  redirect("/painel/saude/cipa?excluido=1")
}

export async function adicionarRepresentanteAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao(PERMISSAO, ALTERNATIVAS)
  const reuniaoId = texto(formData, "reuniao_id")
  if (!reuniaoId) return { erro: "Reunião não identificada." }

  const { erro } = await adicionarRepresentante(reuniaoId, {
    usuario_id: texto(formData, "usuario_id") || null,
    filiado_id: texto(formData, "filiado_id") || null,
    nome: texto(formData, "nome") || null,
  })
  if (erro) return { erro }

  revalidatePath(`/painel/saude/cipa/${reuniaoId}`)
  redirect(`/painel/saude/cipa/${reuniaoId}`)
}

export async function comparecimentoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao(PERMISSAO, ALTERNATIVAS)
  const { erro } = await definirComparecimento(
    texto(formData, "id"),
    formData.get("compareceu") === "1"
  )
  if (erro) return { erro }
  revalidatePath(`/painel/saude/cipa/${texto(formData, "reuniao_id")}`)
  redirect(`/painel/saude/cipa/${texto(formData, "reuniao_id")}`)
}

export async function removerRepresentanteAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao(PERMISSAO, ALTERNATIVAS)
  const { erro } = await removerRepresentante(texto(formData, "id"))
  if (erro) return { erro }
  revalidatePath(`/painel/saude/cipa/${texto(formData, "reuniao_id")}`)
  redirect(`/painel/saude/cipa/${texto(formData, "reuniao_id")}`)
}

export async function enviarAtaAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao(PERMISSAO, ALTERNATIVAS)

  const reuniaoId = texto(formData, "reuniao_id")
  const arquivo = formData.get("ata")
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { erro: "Escolha o PDF da ata." }
  }
  if (arquivo.size > 5 * 1024 * 1024) {
    return { erro: "O arquivo deve ter no máximo 5 MB." }
  }

  const { erro } = await gravarAta(reuniaoId, arquivo)
  if (erro) return { erro }

  revalidatePath(`/painel/saude/cipa/${reuniaoId}`)
  redirect(`/painel/saude/cipa/${reuniaoId}?ata=1`)
}
