"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { type EstadoForm } from "@/lib/contas"
import {
  confirmouDesistencia,
  desistirPeloLink,
  situacaoDoLink,
} from "@/lib/db/desistencia-coletiva"

/**
 * Confirmação na página do link de desistência (sem login). O token vem do
 * formulário e é conferido de novo aqui — assinatura, tenant e prazo — antes
 * de gravar pela mesma regra da área do filiado.
 */
export async function desistirPeloLinkAction(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  const token = String(fd.get("token") ?? "")
  if (!confirmouDesistencia(fd.get("confirmacao"))) {
    return { erro: "Digite CONFIRMO para concluir o pedido.", campo: "confirmacao" }
  }
  const { erro } = await desistirPeloLink(token)
  if (erro) {
    // A situação mudou com a página aberta (desistência já feita em outra
    // aba, prazo encerrado, lote revertido): mostra a situação atual, não um
    // erro de formulário que já não tem conserto.
    const agora = await situacaoDoLink(token)
    if (agora.estado !== "aberto" && agora.estado !== "invalido") {
      redirect(`/desistir/${encodeURIComponent(token)}`)
    }
    return { erro }
  }
  revalidatePath("/painel/filiados/coletivas")
  redirect(`/desistir/${encodeURIComponent(token)}?feito=1`)
}
