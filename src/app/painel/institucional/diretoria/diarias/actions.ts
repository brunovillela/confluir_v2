"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { criarSolicitacaoDiaria } from "@/lib/db/diarias"
import { diretoresParaDiaria } from "@/lib/db/diarias-diretoria"
import {
  adicionarDespesaDiaria,
  removerDespesaDiaria,
} from "@/lib/db/diarias-despesas"

/**
 * Lançamento da diária de um diretor. Quase nenhum diretor tem conta (2 de 35
 * em 09/2026), então quem lança é a secretaria — o beneficiário é o diretor e
 * o `solicitante_id` guarda quem digitou.
 */
async function exigirAcesso() {
  return requirePermissao("diretoria_diarias", ["configuracoes"])
}

export async function lancarDiariaDiretor(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await exigirAcesso()

  const diretorId = String(formData.get("diretor_id") ?? "")
  const diariaId = String(formData.get("diaria_id") ?? "")
  const motivo = String(formData.get("motivo") ?? "").trim()
  const quantidade = Number(String(formData.get("quantidade") ?? "1").replace(",", "."))
  const inicio = String(formData.get("data_inicio") ?? "").trim() || null
  const termino = String(formData.get("data_termino") ?? "").trim() || null
  const departamentoEscolhido = String(formData.get("departamento_id") ?? "").trim()

  if (!diretorId) return { erro: "Escolha o diretor ou a diretora." }
  if (!diariaId) return { erro: "Escolha o tipo de diária." }
  if (!motivo) return { erro: "Descreva a atividade (motivo da diária)." }
  if (!Number.isFinite(quantidade) || quantidade <= 0) {
    return { erro: "Informe a quantidade de diárias." }
  }
  if (inicio && termino && termino < inicio) {
    return { erro: "O término não pode ser antes do início." }
  }

  const diretores = await diretoresParaDiaria()
  const diretor = diretores.find((d) => d.usuarioId === diretorId)
  if (!diretor) return { erro: "Essa pessoa não está na diretoria em exercício." }

  const { erro, id } = await criarSolicitacaoDiaria({
    funcionario_id: diretorId,
    diaria_id: diariaId,
    quantidade,
    motivo,
    data_inicio: inicio,
    data_termino: termino,
    beneficiario_tipo: "diretor",
    departamento_id: departamentoEscolhido || diretor.departamentoId,
    solicitante_id: sessao.usuario.id as string,
  })
  if (erro) return { erro }

  revalidatePath("/painel/institucional/diretoria/diarias")
  if (id) redirect(`/painel/institucional/diretoria/diarias/${id}?nova=1`)
  return { ok: "Diária lançada." }
}

export async function adicionarDespesaDiretoria(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await exigirAcesso()

  const solicitacaoId = String(formData.get("solicitacao_id") ?? "")
  const tipoId = String(formData.get("tipo_id") ?? "").trim() || null
  const descricao = String(formData.get("descricao") ?? "").trim() || null
  const valor = Number(
    String(formData.get("valor") ?? "").replace(/\./g, "").replace(",", ".")
  )
  const arquivo = formData.get("comprovante")

  const { erro } = await adicionarDespesaDiaria({
    solicitacaoId,
    tipoId,
    descricao,
    valor,
    arquivo: arquivo instanceof File ? arquivo : null,
  })
  if (erro) return { erro }

  revalidatePath(`/painel/institucional/diretoria/diarias/${solicitacaoId}`)
  return { ok: "Despesa lançada." }
}

export async function removerDespesaDiretoria(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await exigirAcesso()

  const id = String(formData.get("id") ?? "")
  const solicitacaoId = String(formData.get("solicitacao_id") ?? "")
  const { erro } = await removerDespesaDiaria(id)
  if (erro) return { erro }

  revalidatePath(`/painel/institucional/diretoria/diarias/${solicitacaoId}`)
  return { ok: "Despesa excluída." }
}
