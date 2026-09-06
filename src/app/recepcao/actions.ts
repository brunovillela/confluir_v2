"use server"

import { revalidatePath } from "next/cache"

import { requirePermissao } from "@/lib/auth"
import {
  buscarNaPorta,
  registrarChegada,
  type PessoaNaPorta,
} from "@/lib/db/eventos-recepcao"

/**
 * Recepção — escrita.
 *
 * Exige `eventos_recepcao` (a gestão entra como retaguarda). Quem opera a porta
 * NÃO edita evento: só confirma quem chegou.
 */

export async function buscarAction(input: {
  eventoId: string
  diaId: string
  termo: string
}): Promise<{ erro?: string; pessoas?: PessoaNaPorta[] }> {
  await requirePermissao("eventos_recepcao", ["eventos_gestao"])
  if (!input.eventoId || !input.diaId) return { erro: "Escolha o evento e o dia." }
  try {
    return { pessoas: await buscarNaPorta(input.eventoId, input.diaId, input.termo) }
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "Falha na busca." }
  }
}

export async function confirmarChegadaAction(input: {
  inscricaoId: string
  diaId: string
  metodo: "qr" | "busca"
}): Promise<{ erro?: string; ok?: boolean; jaEstava?: boolean; nome?: string | null }> {
  const sessao = await requirePermissao("eventos_recepcao", ["eventos_gestao"])
  if (!input.inscricaoId || !input.diaId) return { erro: "Dados incompletos." }

  const res = await registrarChegada(
    input.inscricaoId,
    input.diaId,
    sessao.usuario.id,
    input.metodo
  )
  if (res.erro) return { erro: res.erro }

  revalidatePath("/recepcao")
  return { ok: true, jaEstava: res.jaEstava, nome: res.nome }
}
