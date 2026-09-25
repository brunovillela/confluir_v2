"use server"

import { revalidatePath } from "next/cache"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import {
  definirContaDiaria,
  salvarTipoDespesaDiaria,
  type QuadroConta,
} from "@/lib/db/diarias-config"

/**
 * Configuração das contas das diárias. Vale para as duas portas, então
 * qualquer uma das permissões de diária entra — o RH cuida das contas de
 * funcionário e a Diretoria das dela, na mesma tela.
 */
async function exigirAcesso() {
  return requirePermissao("pessoal_gestao", [
    "pessoal_diarias",
    "diretoria_diarias",
    // Viagens configura as contas dos convidados (passagem e hospedagem).
    "viagens_gestao",
    "configuracoes",
  ])
}

function revalidar() {
  revalidatePath("/painel/pessoal/diarias/contas")
}

/** Salva de uma vez as contas de um quadro/departamento (uma por gasto). */
export async function salvarContasDiaria(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await exigirAcesso()

  const quadro = String(formData.get("quadro") ?? "funcionario") as QuadroConta
  if (!["funcionario", "diretor", "convidado"].includes(quadro)) {
    return { erro: "Quadro inválido." }
  }
  const departamentoId = String(formData.get("departamento_id") ?? "").trim() || null

  let salvas = 0
  for (const [campo, valor] of formData.entries()) {
    if (!campo.startsWith("conta_")) continue
    const alvo = campo.slice("conta_".length)
    const { erro } = await definirContaDiaria({
      quadro,
      departamentoId,
      // "diaria" é a diária em si; o resto é id de tipo de despesa.
      despesaTipoId: alvo === "diaria" ? null : alvo,
      centroCustoId: String(valor).trim() || null,
    })
    if (erro) return { erro }
    salvas++
  }

  revalidar()
  return { ok: `${salvas} conta(s) salva(s).` }
}

export async function salvarTipoDespesa(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await exigirAcesso()

  const nome = String(formData.get("nome") ?? "").trim()
  if (!nome) return { erro: "Informe o nome do tipo de despesa." }
  const { erro } = await salvarTipoDespesaDiaria({
    id: String(formData.get("id") ?? "").trim() || undefined,
    nome,
    descricao: String(formData.get("descricao") ?? "").trim() || null,
    exigeComprovante: formData.get("exige_comprovante") === "on",
    ativa: formData.get("ativa") === "on",
    ordem: Number(formData.get("ordem") ?? 0) || 0,
  })
  if (erro) return { erro }

  revalidar()
  return { ok: "Tipo de despesa salvo." }
}
