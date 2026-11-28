"use server"

import { revalidatePath } from "next/cache"

import { requirePermissao } from "@/lib/auth"
import { registrarPresencaNoProntuario } from "@/lib/db/eventos-filiados"
import { ajustarPresencas } from "@/lib/db/eventos-presencas-manual"
import { tenantAtual } from "@/lib/tenant"

/**
 * Lançar presenças depois (27/11/2026): grava de uma vez o que foi marcado e
 * desmarcado na lista do dia. Só a gestão de eventos — a recepção continua
 * registrando na porta.
 */
export async function salvarPresencasAction(input: {
  eventoId: string
  diaId: string
  marcar: string[]
  retirar: string[]
}): Promise<{ erro?: string; lancadas?: number; retiradas?: number }> {
  const sessao = await requirePermissao("eventos_gestao")
  if (!input.eventoId || !input.diaId) return { erro: "Escolha o dia." }
  const r = await ajustarPresencas({ ...input, usuarioId: sessao.usuario.id })
  if (r.erro) return { erro: r.erro }

  // Como na porta: quem compareceu vai para o prontuário do filiado, uma vez
  // por evento. Falha aqui nunca derruba o lançamento.
  const emp = await tenantAtual()
  for (const id of r.lancadas ?? []) {
    try {
      await registrarPresencaNoProntuario(id, emp)
    } catch (e) {
      console.error("prontuário da presença:", e)
    }
  }

  revalidatePath(`/painel/eventos/${input.eventoId}`)
  revalidatePath(`/painel/eventos/${input.eventoId}/presencas`)
  return { lancadas: r.lancadas?.length ?? 0, retiradas: r.retiradas ?? 0 }
}
