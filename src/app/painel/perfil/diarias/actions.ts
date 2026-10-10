"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requireSessaoPainel } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import {
  cancelarSolicitacaoDiaria,
  criarSolicitacaoDiaria,
} from "@/lib/db/diarias"
import {
  adicionarDespesaDiaria,
  removerDespesaDiaria,
} from "@/lib/db/diarias-despesas"
import { quadroParaDiaria } from "@/lib/db/diarias-diretoria"
import { enviarRemessaParaAvaliacao } from "@/lib/db/diarias-remessas"

function revalidar() {
  revalidatePath("/painel/perfil/diarias")
  revalidatePath("/painel/pessoal/diarias")
  revalidatePath("/painel/institucional/diretoria/diarias")
}

export async function solicitarDiaria(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await requireSessaoPainel()
  // Funcionário com vínculo em vigor OU diretor em exercício — o quadro decide
  // a conta contábil e quem avalia.
  const quadro = await quadroParaDiaria(sessao.usuario.id as string)
  if (!quadro) {
    return {
      erro: "Só funcionários com vínculo em vigor ou diretores em exercício fazem este pedido.",
    }
  }

  const diariaId = String(formData.get("diaria_id") ?? "")
  const quantidadeBruta = String(formData.get("quantidade") ?? "")
    .trim()
    .replace(",", ".")
  const motivo = String(formData.get("motivo") ?? "").trim()
  const dataInicio = String(formData.get("data_inicio") ?? "")
  const dataTermino = String(formData.get("data_termino") ?? "")

  if (!diariaId) return { erro: "Escolha o tipo de diária.", campo: "diaria_id" }
  const quantidade = Number(quantidadeBruta)
  if (!quantidadeBruta || Number.isNaN(quantidade) || quantidade <= 0) {
    return { erro: "Informe a quantidade de diárias (ex.: 2).", campo: "quantidade" }
  }
  if (!motivo) {
    return { erro: "Descreva o motivo (ex.: viagem ao Rio de Janeiro com pernoite).", campo: "motivo" }
  }
  if (dataInicio && dataTermino && dataTermino < dataInicio) {
    return { erro: "O término não pode ser antes do início.", campo: "data_termino" }
  }

  const { erro, remessaId } = await criarSolicitacaoDiaria({
    funcionario_id: sessao.usuario.id as string,
    diaria_id: diariaId,
    quantidade,
    motivo,
    data_inicio: dataInicio || null,
    data_termino: dataTermino || null,
    beneficiario_tipo: quadro.quadro,
    departamento_id: quadro.departamentoId,
  })
  if (erro) return { erro }

  // "Salvar e enviar a remessa": a remessa inteira vai para avaliação.
  if (formData.get("acao") === "enviar" && remessaId) {
    const r = await enviarRemessaParaAvaliacao(remessaId, sessao.usuario.id as string)
    revalidar()
    if (r.erro) return { erro: `Diária salva, mas a remessa não foi enviada: ${r.erro}` }
    redirect("/painel/perfil/diarias?enviada=1")
  }

  revalidar()
  redirect("/painel/perfil/diarias?salvo=1")
}

/** Envia a remessa em preparação para avaliação (Meu perfil). */
export async function enviarMinhaRemessa(_prev: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const sessao = await requireSessaoPainel()
  const { erro } = await enviarRemessaParaAvaliacao(String(formData.get("remessa_id") ?? ""), sessao.usuario.id as string)
  if (erro) return { erro }
  revalidar()
  return { ok: "Remessa enviada para avaliação." }
}

export async function cancelarMinhaDiaria(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await requireSessaoPainel()

  const id = String(formData.get("id") ?? "")
  if (!id) return { erro: "Solicitação inválida." }

  const { erro } = await cancelarSolicitacaoDiaria(
    id,
    sessao.usuario.id as string
  )
  if (erro) return { erro }

  revalidar()
  return { ok: "Solicitação cancelada." }
}

// ── Despesas extras da própria diária ──────────────────────────────────────

export async function adicionarMinhaDespesa(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await requireSessaoPainel()

  const arquivo = formData.get("comprovante")
  const { erro } = await adicionarDespesaDiaria({
    solicitacaoId: String(formData.get("solicitacao_id") ?? ""),
    tipoId: String(formData.get("tipo_id") ?? "").trim() || null,
    descricao: String(formData.get("descricao") ?? "").trim() || null,
    valor: Number(
      String(formData.get("valor") ?? "").replace(/\./g, "").replace(",", ".")
    ),
    arquivo: arquivo instanceof File ? arquivo : null,
    exigirBeneficiario: sessao.usuario.id as string,
  })
  if (erro) return { erro }

  revalidar()
  return { ok: "Despesa lançada." }
}

export async function removerMinhaDespesa(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await requireSessaoPainel()

  const { erro } = await removerDespesaDiaria(String(formData.get("id") ?? ""), {
    exigirBeneficiario: sessao.usuario.id as string,
  })
  if (erro) return { erro }

  revalidar()
  return { ok: "Despesa excluída." }
}
