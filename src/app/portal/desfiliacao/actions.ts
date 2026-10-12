"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { getSessaoPainel } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import {
  confirmouDesistencia,
  linkDesistencia,
  registrarDesistenciaColetiva,
} from "@/lib/db/desistencia-coletiva"
import { podeAcessar } from "@/lib/permissoes"
import { requireVisualizacaoPortal } from "@/lib/visualizacao-filiado"

/**
 * Desistência da FILIAÇÃO COLETIVA pela área do filiado — só é permitida a
 * quem está na condição "Em processo de filiação coletiva" e DENTRO do prazo.
 * A regra (e a gravação) mora em lib/db/desistencia-coletiva.ts, a mesma do
 * link de desistência sem login: o pedido entra na trilha NORMAL de
 * desfiliação (o empregador precisa ser avisado), não some do sistema.
 */
export async function desistirFiliacaoColetiva(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  const { filiado, preview } = await requireVisualizacaoPortal()
  if (preview) {
    return { erro: "Visualização da gestão é somente leitura." }
  }
  if (!confirmouDesistencia(fd.get("confirmacao"))) {
    return { erro: "Digite CONFIRMO para concluir o pedido.", campo: "confirmacao" }
  }

  const { erro } = await registrarDesistenciaColetiva(filiado.filiacaoId, "portal")
  if (erro) return { erro }

  revalidatePath("/portal/desfiliacao")
  revalidatePath("/portal/cadastro")
  revalidatePath("/painel/filiados/coletivas")
  // Meu cadastro mostra a confirmação junto da trilha da desfiliação (A26).
  redirect("/portal/cadastro?salvo=desfiliacao")
}

/**
 * Link de desistência do filiado em visualização, para a gestão copiar e
 * mandar ao trabalhador (o lote coletivo não envia e-mail). Só na
 * visualização "Ver como filiado" e só para quem cuida da filiação.
 */
export async function linkDesistenciaAction(): Promise<{ erro?: string; link?: string }> {
  const { filiado, preview } = await requireVisualizacaoPortal()
  if (!preview) return { erro: "Disponível só para a gestão." }
  const painel = await getSessaoPainel()
  if (!painel || !podeAcessar(painel.permissoes, "filiacao_gestao", ["assembleias"])) {
    return { erro: "Sem permissão para gerar o link de desistência." }
  }
  return linkDesistencia(filiado.filiacaoId)
}
