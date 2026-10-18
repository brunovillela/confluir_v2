"use server"

import { revalidatePath } from "next/cache"

import { type EstadoForm } from "@/lib/contas"
import { confirmarOferta } from "@/lib/db/hospedagem-garantida"
import { bloqueioDaParte } from "@/lib/db/portal-partes"

/** Confirmada, leva também o caminho da reserva (QR Code sem login). */
export type EstadoOfertaPublica = EstadoForm & { reserva?: string }

/**
 * Confirmação de vaga da lista de espera pelo link do e-mail. Sem login: o
 * token (aleatório, um por pedido) é a credencial, como nos links de evento.
 * Segue a Hospedagem do portal (Filiados › Área do associado): suspensa ou
 * desabilitada — ou o portal em consulta —, a vaga não se confirma por aqui
 * também. A rota roda no host da entidade, então a configuração é a dela.
 */
export async function confirmarOfertaPublicaAction(
  _prev: EstadoOfertaPublica,
  formData: FormData
): Promise<EstadoOfertaPublica> {
  // Rota pública, fora de /portal: o primeiro acesso pendente não a trava.
  const bloqueio = await bloqueioDaParte("hospedagem", undefined, { ignorarPrimeiroAcesso: true })
  if (bloqueio) return { erro: bloqueio }
  const token = String(formData.get("token") ?? "")
  const r = await confirmarOferta(token)
  if (r.erro) return { erro: r.erro }
  revalidatePath("/portal/hospedagem")
  revalidatePath("/painel/hospedagem/mapa")
  revalidatePath("/hotel/hospedes")
  // Só diz que mandou e-mail quando mandou (sem e-mail no cadastro, não sai).
  return {
    ok: r.jaConfirmada
      ? "Esta reserva já estava confirmada."
      : r.email
        ? "Reserva confirmada! Enviamos os detalhes para o seu e-mail."
        : "Reserva confirmada!",
    reserva: r.reservaToken ? `/hospedagem/reserva/${r.reservaToken}` : undefined,
  }
}
