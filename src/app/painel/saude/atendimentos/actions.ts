"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import {
  atualizarAtendimento,
  buscarAtendimento,
  criarAtendimento,
  gravarRelatorio,
  perfilClinico,
  type DadosAtendimento,
} from "@/lib/db/atendimentos"
import { invalidarCacheProntuarios } from "@/lib/db/prontuario"

const PERMISSAO = "saude_atendimento"
const ALTERNATIVAS = ["saude_gestao"]

function texto(formData: FormData, campo: string): string {
  return String(formData.get(campo) ?? "").trim()
}

function lerDados(formData: FormData): DadosAtendimento | { erro: string } {
  const assistidoId = texto(formData, "assistido_id")
  const data = texto(formData, "data_atendimento")
  if (!assistidoId) return { erro: "Escolha o assistido." }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    return { erro: "Informe a data do atendimento." }
  }
  return {
    assistido_id: assistidoId,
    tipo_id: texto(formData, "tipo_id") || null,
    profissional_id: texto(formData, "profissional_id") || null,
    data_atendimento: data,
    observacao_aberta: texto(formData, "observacao_aberta") || null,
  }
}

export async function criarAtendimentoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await requirePermissao(PERMISSAO, ALTERNATIVAS)
  const dados = lerDados(formData)
  if ("erro" in dados) return dados

  const { id, erro } = await criarAtendimento(dados, sessao.usuario.id)
  if (erro || !id) return { erro: erro ?? "Não foi possível gravar." }

  // O apontamento no prontuário do filiado acabou de mudar.
  invalidarCacheProntuarios()
  revalidatePath("/painel/saude/atendimentos")
  revalidatePath(`/painel/saude/assistidos/${dados.assistido_id}`)
  redirect(`/painel/saude/atendimentos/${id}?salvo=1`)
}

export async function atualizarAtendimentoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao(PERMISSAO, ALTERNATIVAS)
  const id = texto(formData, "id")
  if (!id) return { erro: "Registro não identificado." }

  const dados = lerDados(formData)
  if ("erro" in dados) return dados

  const { erro } = await atualizarAtendimento(id, dados)
  if (erro) return { erro }

  invalidarCacheProntuarios()
  revalidatePath("/painel/saude/atendimentos")
  revalidatePath(`/painel/saude/atendimentos/${id}`)
  redirect(`/painel/saude/atendimentos/${id}?salvo=1`)
}

/**
 * Grava o relatório clínico.
 *
 * A autorização é decidida no servidor a partir do cadastro de profissional
 * do usuário logado — nunca do que o formulário enviou. `gravarRelatorio`
 * recusa e registra a tentativa na trilha de auditoria quando não há
 * habilitação.
 */
export async function gravarRelatorioAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await requirePermissao(PERMISSAO, ALTERNATIVAS)

  const id = texto(formData, "atendimento_id")
  if (!id) return { erro: "Atendimento não identificado." }

  const atendimento = await buscarAtendimento(id)
  if (!atendimento) return { erro: "Atendimento não encontrado." }

  const perfil = await perfilClinico(sessao.usuario.id)
  const { erro } = await gravarRelatorio(
    id,
    String(formData.get("relatorio") ?? ""),
    perfil,
    {
      tipoId: atendimento.tipo_id,
      profissionalId: atendimento.profissional_id,
      atendenteId: atendimento.atendente_id,
    }
  )
  if (erro) return { erro }

  revalidatePath(`/painel/saude/atendimentos/${id}`)
  redirect(`/painel/saude/atendimentos/${id}?relatorio=1`)
}
