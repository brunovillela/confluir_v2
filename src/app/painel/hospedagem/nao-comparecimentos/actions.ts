"use server"

import { revalidatePath } from "next/cache"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { limparCpf, validarCpf } from "@/lib/cpf"
import {
  abonarNaoComparecimento,
  liberarPenalidade,
} from "@/lib/db/hospedagem-garantida"

function revalidar() {
  revalidatePath("/painel/hospedagem/nao-comparecimentos")
  revalidatePath("/portal/hospedagem")
}

/** Abono: a falta deixa de contar para a punição. Justificativa obrigatória. */
export async function abonarAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await requirePermissao("filiacao_hospedagens_gestao")
  const cupomId = String(formData.get("cupom_id") ?? "")
  const motivo = String(formData.get("motivo") ?? "").trim()
  if (motivo.length < 10) {
    return { erro: "Escreva a justificativa do abono — ela fica registrada com o seu nome." }
  }
  const { erro } = await abonarNaoComparecimento(cupomId, motivo, sessao.usuario.id)
  if (erro) return { erro }
  revalidar()
  return { ok: "Falta abonada." }
}

/** Liberação: as faltas anteriores a ela deixam de contar para a pessoa. */
export async function liberarAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await requirePermissao("filiacao_hospedagens_gestao")
  const cpf = limparCpf(String(formData.get("cpf") ?? ""))
  if (!validarCpf(cpf)) return { erro: "Informe um CPF válido." }
  const motivo = String(formData.get("motivo") ?? "").trim()
  if (motivo.length < 10) {
    return { erro: "Escreva a justificativa da liberação — ela fica registrada com o seu nome." }
  }
  const { erro } = await liberarPenalidade(cpf, motivo, sessao.usuario.id)
  if (erro) return { erro }
  revalidar()
  return { ok: "Punição liberada. As faltas anteriores deixam de contar." }
}
