"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requireSessaoPainel } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { quadroParaDiaria } from "@/lib/db/diarias-diretoria"
import {
  cancelarMinhaViagem,
  criarViagem,
  lerBeneficiarioDoForm,
  lerEventoDoForm,
  lerItensDoForm,
  type NovaViagem,
} from "@/lib/db/viagens"
import {
  avisarEquipeNovaViagem,
  avisarViajantePedidoPorOutro,
} from "@/lib/db/viagens-atendimento"
import { podeAcessar } from "@/lib/permissoes"

function revalidar() {
  revalidatePath("/painel/perfil/viagens")
  revalidatePath("/painel/institucional/viagens", "layout")
}

export async function solicitarViagem(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await requireSessaoPainel()
  const usuarioId = sessao.usuario.id as string
  const paraTerceiro = formData.get("para_quem") === "terceiro"
  if (
    !podeAcessar(sessao.permissoes, paraTerceiro ? "viagens_solicitar_terceiros" : "viagens_solicitar")
  ) {
    return {
      erro: paraTerceiro
        ? "Sua conta não tem permissão para pedir viagem para outra pessoa."
        : "Sua conta não tem permissão para pedir viagem.",
    }
  }

  const motivo = String(formData.get("motivo") ?? "").trim()
  if (!motivo) return { erro: "Descreva o motivo da viagem." }
  const lidos = lerItensDoForm(formData)
  if ("erro" in lidos) return { erro: lidos.erro }
  const evento = lerEventoDoForm(formData)
  if (formData.get("evento_id") === "__externo" && !evento.eventoExterno) {
    return { erro: "Informe o nome do evento externo." }
  }

  let quem: Pick<NovaViagem, "beneficiarioTipo" | "beneficiarioUsuarioId" | "convidado"> & {
    departamentoDaPessoa: string | null
  }
  if (paraTerceiro) {
    const lido = await lerBeneficiarioDoForm(formData)
    if ("erro" in lido) return { erro: lido.erro }
    // Senão, quem só pede por terceiros pediria para si por este caminho.
    if (lido.beneficiarioUsuarioId === usuarioId) {
      return { erro: "Para viajar você mesmo, escolha “Para mim”." }
    }
    quem = lido
  } else {
    // Mesma régua das diárias: funcionário com vínculo em vigor ou diretor em
    // exercício.
    const quadro = await quadroParaDiaria(usuarioId)
    if (!quadro) {
      return {
        erro: "Só funcionários com vínculo em vigor ou diretores em exercício pedem viagem para si.",
      }
    }
    quem = {
      beneficiarioTipo: quadro.quadro,
      beneficiarioUsuarioId: usuarioId,
      departamentoDaPessoa: quadro.departamentoId,
    }
  }

  const { erro, id } = await criarViagem({
    beneficiarioTipo: quem.beneficiarioTipo,
    beneficiarioUsuarioId: quem.beneficiarioUsuarioId,
    convidado: quem.convidado,
    solicitanteId: usuarioId,
    departamentoId:
      String(formData.get("departamento_id") ?? "").trim() || quem.departamentoDaPessoa,
    ...evento,
    motivo,
    itens: lidos.itens,
  })
  if (erro || !id) return { erro: erro ?? "Não foi possível registrar a viagem." }

  // Aviso à equipe (Configurações): falha de e-mail não desfaz o pedido.
  await avisarEquipeNovaViagem(id).catch((e) => console.error("Aviso de viagem nova:", e))
  // Pedido para outra pessoa: quem viaja fica sabendo.
  await avisarViajantePedidoPorOutro(id).catch((e) =>
    console.error("Aviso a quem viaja:", e)
  )
  revalidar()
  redirect(`/painel/perfil/viagens/${id}?salvo=1`)
}

export async function cancelarViagemAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await requireSessaoPainel()
  const { erro } = await cancelarMinhaViagem(
    String(formData.get("id") ?? ""),
    sessao.usuario.id as string
  )
  if (erro) return { erro }
  revalidar()
  return { ok: "Viagem cancelada." }
}
