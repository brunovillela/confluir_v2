"use server"

import { revalidatePath } from "next/cache"

import { requireSessaoHotel } from "@/lib/auth"
import { buscarFiliadoEmergencial, registrarCupomEmergencial, type FiliadoEmergencial } from "@/lib/db/hospedagem-emergencial"

export type EstadoBusca = { erro?: string; cpf?: string; filiado?: FiliadoEmergencial }
export type EstadoRegistro = { erro?: string; ok?: string; garantida?: boolean }

/**
 * Só a sessão REAL do hotel grava (requireSessaoHotel): no "Ver como o hotel"
 * da gestão não há sessão de hotel e a ação não passa. O hotel vem da
 * sessão — nunca do formulário — e a data é sempre hoje.
 */
export async function buscarFiliadoEmergencialAction(_prev: EstadoBusca, fd: FormData): Promise<EstadoBusca> {
  const { hotel } = await requireSessaoHotel()
  const cpf = String(fd.get("cpf") ?? "").replace(/\D/g, "")
  if (cpf.length !== 11) return { erro: "Informe os 11 dígitos do CPF." }
  const { erro, filiado } = await buscarFiliadoEmergencial(hotel, cpf)
  return erro ? { erro, cpf } : { cpf, filiado }
}

export async function registrarCupomEmergencialAction(_prev: EstadoRegistro, fd: FormData): Promise<EstadoRegistro> {
  const { hotel, usuarioHotel } = await requireSessaoHotel()
  const r = await registrarCupomEmergencial({
    hotel,
    usuarioHotelId: usuarioHotel.id,
    cpf: String(fd.get("cpf") ?? "").replace(/\D/g, ""),
    motivo: String(fd.get("motivo") ?? ""),
    checkOut: String(fd.get("check_out") ?? "") || null,
    aceitaColetivo: fd.get("aceita_quarto_coletivo") === "on",
  })
  if (r.erro) return { erro: r.erro }
  revalidatePath("/hotel/inicio")
  revalidatePath("/hotel/cupons")
  revalidatePath("/hotel/reservas/nova")
  revalidatePath("/hotel/hospedes")
  revalidatePath("/painel/hospedagem")
  revalidatePath("/painel/hospedagem/cupons")
  return {
    garantida: r.garantida,
    ok: r.garantida
      ? "Reserva emergencial feita para hoje, com o quarto definido. O filiado recebe a confirmação por e-mail."
      : "Cupom emergencial registrado para hoje. Agora registre a reserva em \"Registrar reserva\", como de costume.",
  }
}
