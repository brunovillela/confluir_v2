"use server"

import { tenantAtual } from "@/lib/tenant"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requireSessaoPortal } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { cadastroDoFiliado, registrosDoCpf } from "@/lib/db/filiado-portal"
import { buscarHotel, contratoDoHotel } from "@/lib/db/hospedagem"
import {
  cancelarEspera,
  cancelarReservaGarantida,
  confirmarOferta,
  conferirPodeReservar,
  ehGarantida,
  entrarNaEspera,
  enviarEmailReservaConfirmada,
  reservarEstadia,
} from "@/lib/db/hospedagem-garantida"
import { conferirCondicoesHospedagem } from "@/lib/db/hospedagem-condicoes"
import { createAdminClient } from "@/lib/supabase/admin"

/** Data BR (DD/MM/AAAA) de um AAAA-MM-DD. */
function dataBr(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso
}

/** Data de hoje no fuso de São Paulo (AAAA-MM-DD). */
function hojeSP(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date())
}

/**
 * Solicitação de cupom pelo próprio filiado (portal). Regras atuais — a
 * retirada não garante reserva nem serviço; regras adicionais do sindicato
 * podem ser acrescentadas aqui:
 *  - filiação ativa (garantida pela sessão do portal);
 *  - hotel parceiro ativo;
 *  - check-in de hoje em diante;
 *  - sem cupom AGUARDANDO duplicado (mesmo hotel e mesmo check-in);
 *  - condições definidas pelo sindicato: fonte, regime, quantidade por
 *    período e lista de beneficiários (src/lib/db/hospedagem-condicoes.ts).
 */
/** Estado do pedido: sem vaga na demanda garantida, oferece a lista de espera. */
export type EstadoPedidoHospedagem = EstadoForm & {
  espera?: { hotelId: string; checkIn: string; checkOut: string }
}

function revalidarHospedagem(cupomId?: string) {
  revalidatePath("/portal/hospedagem")
  if (cupomId) revalidatePath(`/portal/hospedagem/reserva/${cupomId}`)
  revalidatePath("/painel/hospedagem")
  revalidatePath("/painel/hospedagem/cupons")
  revalidatePath("/painel/hospedagem/mapa")
  revalidatePath("/hotel/hospedes")
}

export async function solicitarCupom(
  _prev: EstadoPedidoHospedagem,
  formData: FormData
): Promise<EstadoPedidoHospedagem> {
  const { filiado } = await requireSessaoPortal()

  const hotelId = String(formData.get("hotel_id") ?? "")
  const checkIn = String(formData.get("check_in") ?? "")
  const aceitaColetivo = formData.get("aceita_quarto_coletivo") === "on"

  if (!hotelId) return { erro: "Escolha o hotel." }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkIn)) {
    return { erro: "Informe a data de check-in." }
  }
  if (checkIn < hojeSP()) {
    return { erro: "O check-in precisa ser de hoje em diante." }
  }

  const admin = await createAdminClient()
  const [{ data: hotel }, cadastro, registros] = await Promise.all([
    admin
      .from("hospedagem_hotel")
      .select("id, ativo")
      .eq("id", hotelId)
      .eq("emp_proprietaria_id", await tenantAtual())
      .maybeSingle(),
    cadastroDoFiliado(filiado.cpf),
    registrosDoCpf(filiado.cpf),
  ])
  if (!hotel || hotel.ativo === false) {
    return { erro: "Hotel indisponível para novos cupons." }
  }
  if (!cadastro) return { erro: "Cadastro não encontrado." }

  // Demanda garantida: o pedido já é a reserva, com o quarto definido na hora.
  const hotelCompleto = await buscarHotel(hotelId)
  if (hotelCompleto && ehGarantida(hotelCompleto)) {
    const checkOut = String(formData.get("check_out") ?? "")
    const pode = await conferirPodeReservar({ cpf: filiado.cpf, registros, checkIn })
    if (pode.erro) return { erro: pode.erro }
    const reserva = await reservarEstadia({
      hotel: hotelCompleto,
      filiadoId: cadastro.id,
      registros,
      sexo: cadastro.sexo,
      checkIn,
      checkOut,
    })
    if (!reserva.ok) {
      return {
        erro: reserva.erro,
        espera: reserva.semVaga ? { hotelId, checkIn, checkOut } : undefined,
      }
    }
    await enviarEmailReservaConfirmada({
      cpf: filiado.cpf,
      hotelNome: hotelCompleto.nome ?? "hotel",
      checkIn,
      checkOut,
    })
    revalidarHospedagem(reserva.cupomId)
    redirect(`/portal/hospedagem/reserva/${reserva.cupomId}?salvo=1`)
  }

  // Cupons só entre hoje e o TÉRMINO DA VIGÊNCIA do contrato do hotel.
  const contrato = await contratoDoHotel(hotelId)
  if (!contrato || !contrato.vigente) {
    return {
      erro: "Este hotel está fora do período de convênio no momento — cupons indisponíveis.",
    }
  }
  if (contrato.vigenciaTermino && checkIn > contrato.vigenciaTermino) {
    return {
      erro: `O check-in deve ser até o fim da vigência do convênio (${dataBr(contrato.vigenciaTermino)}).`,
    }
  }

  const { data: duplicado } = await admin
    .from("hospedagem_cupom")
    .select("id")
    .in("filiado_id", registros)
    .eq("hotel_id", hotelId)
    .eq("check_in", checkIn)
    .eq("cancelado", false)
    .is("servico_id", null)
    .limit(1)
  if ((duplicado ?? []).length > 0) {
    return {
      erro: "Você já tem um cupom aguardando reserva para este hotel nesta data.",
    }
  }

  // Condições definidas pelo sindicato em Configurações de filiação.
  const condicoes = await conferirCondicoesHospedagem({
    cpf: filiado.cpf,
    registros,
    checkIn,
  })
  if (condicoes.erro) return { erro: condicoes.erro }

  const { error } = await admin.from("hospedagem_cupom").insert({
    filiado_id: cadastro.id,
    hotel_id: hotelId,
    check_in: checkIn,
    sexo: cadastro.sexo,
    aceita_quarto_coletivo: aceitaColetivo,
    cancelado: false,
    compareceu: false,
  })
  if (error) return { erro: `Não foi possível emitir o cupom: ${error.message}` }

  revalidatePath("/portal/hospedagem")
  revalidatePath("/painel/hospedagem")
  revalidatePath("/painel/hospedagem/cupons")
  redirect("/portal/hospedagem?salvo=1")
}

/** Cancela um cupom PRÓPRIO que ainda está aguardando reserva. */
export async function cancelarMeuCupom(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const { filiado } = await requireSessaoPortal()

  const id = String(formData.get("id") ?? "")
  if (!id) return { erro: "Cupom inválido." }

  const registros = await registrosDoCpf(filiado.cpf)
  const admin = await createAdminClient()
  const { error, count } = await admin
    .from("hospedagem_cupom")
    .update({ cancelado: true }, { count: "exact" })
    .eq("id", id)
    .in("filiado_id", registros)
    .eq("cancelado", false)
    .is("servico_id", null)
  if (error) return { erro: `Não foi possível cancelar: ${error.message}` }
  if (count === 0) {
    return { erro: "Cupom não encontrado ou já reservado — fale com o sindicato." }
  }

  revalidatePath("/portal/hospedagem")
  revalidatePath("/painel/hospedagem")
  revalidatePath("/painel/hospedagem/cupons")
  return { ok: "Cupom cancelado." }
}

// ── Demanda garantida ───────────────────────────────────────────────────────

/** Entra na lista de espera de um hotel de demanda garantida sem vaga. */
export async function entrarNaEsperaPortal(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const { filiado } = await requireSessaoPortal()
  const hotelId = String(formData.get("hotel_id") ?? "")
  const checkIn = String(formData.get("check_in") ?? "")
  const checkOut = String(formData.get("check_out") ?? "")

  const [hotel, cadastro, registros] = await Promise.all([
    buscarHotel(hotelId),
    cadastroDoFiliado(filiado.cpf),
    registrosDoCpf(filiado.cpf),
  ])
  if (!hotel || hotel.ativo === false) return { erro: "Hotel indisponível." }
  if (!cadastro) return { erro: "Cadastro não encontrado." }

  const pode = await conferirPodeReservar({ cpf: filiado.cpf, registros, checkIn })
  if (pode.erro) return { erro: pode.erro }

  const { erro } = await entrarNaEspera({
    hotel,
    filiadoId: cadastro.id,
    registros,
    cpf: filiado.cpf,
    sexo: cadastro.sexo,
    checkIn,
    checkOut,
  })
  if (erro) return { erro }

  revalidarHospedagem()
  return {
    ok: "Você entrou na lista de espera. Se abrir vaga, avisamos por e-mail e aqui no portal, com um botão para confirmar.",
  }
}

export async function cancelarReservaPortal(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const { filiado } = await requireSessaoPortal()
  const id = String(formData.get("id") ?? "")
  const registros = await registrosDoCpf(filiado.cpf)
  const { erro } = await cancelarReservaGarantida(id, { registros, porEquipe: false })
  if (erro) return { erro }
  revalidarHospedagem(id)
  return { ok: "Reserva cancelada." }
}

export async function cancelarEsperaPortal(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const { filiado } = await requireSessaoPortal()
  const id = String(formData.get("id") ?? "")
  const registros = await registrosDoCpf(filiado.cpf)
  const { erro } = await cancelarEspera(id, registros)
  if (erro) return { erro }
  revalidarHospedagem()
  return { ok: "Você saiu da lista de espera." }
}

export async function confirmarOfertaPortal(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requireSessaoPortal()
  const token = String(formData.get("token") ?? "")
  const { erro } = await confirmarOferta(token)
  if (erro) return { erro }
  revalidarHospedagem()
  return { ok: "Reserva confirmada! O QR Code está em Minhas reservas." }
}
