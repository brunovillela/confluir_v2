"use server"

import { revalidatePath } from "next/cache"

import { requireSessaoPortal } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { obterEvento } from "@/lib/db/eventos"
import { registrarRsvpNoProntuario } from "@/lib/db/eventos-filiados"
import {
  cancelarInscricaoDoFiliado,
  inscreverFiliado,
} from "@/lib/db/eventos-portal"
import { responderRsvp } from "@/lib/db/eventos-publico"
import { tenantAtual } from "@/lib/tenant"

/**
 * Eventos na área do filiado.
 *
 * A sessão do portal é a identidade — nada aqui aceita CPF vindo do
 * formulário, senão bastaria trocar o campo escondido para se inscrever no
 * lugar de outra pessoa.
 */

function txt(fd: FormData, campo: string): string {
  return String(fd.get(campo) ?? "").trim()
}

export async function inscreverAction(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  const { filiado } = await requireSessaoPortal()
  if (!filiado.ativo) {
    return { erro: "Sua filiação precisa estar ativa para se inscrever." }
  }

  const evento = await obterEvento(txt(fd, "eventoId"))
  if (!evento) return { erro: "Evento não encontrado." }

  const { erro, token } = await inscreverFiliado(
    evento,
    {
      cpf: filiado.cpf,
      nome: filiado.nome_completo,
      email: filiado.email,
      filiacaoId: filiado.filiacaoId,
    },
    await tenantAtual()
  )
  if (erro) return { erro }

  revalidatePath("/portal/eventos")
  return {
    ok: token
      ? "Inscrição feita. Você pode acompanhá-la aqui mesmo."
      : "Inscrição feita.",
  }
}

export async function responderRsvpPortalAction(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  const { filiado } = await requireSessaoPortal()
  const token = txt(fd, "token")
  const vem = txt(fd, "vem") === "sim"
  if (!token) return { erro: "Inscrição inválida." }

  const tenantId = await tenantAtual()
  const { erro, inscricaoId } = await responderRsvp(token, tenantId, vem)
  if (erro) return { erro }
  if (inscricaoId) {
    await registrarRsvpNoProntuario(inscricaoId, tenantId, vem)
  }

  revalidatePath("/portal/eventos")
  return {
    ok: vem
      ? `Obrigado, ${filiado.nome_completo?.split(" ")[0] ?? ""}! Sua presença está confirmada.`.trim()
      : "Obrigado por avisar que não poderá comparecer.",
  }
}

export async function cancelarAction(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  const { filiado } = await requireSessaoPortal()
  const { erro } = await cancelarInscricaoDoFiliado(
    txt(fd, "inscricaoId"),
    filiado.cpf,
    await tenantAtual()
  )
  if (erro) return { erro }

  revalidatePath("/portal/eventos")
  return { ok: "Inscrição cancelada. Sua vaga voltou para a fila." }
}
