"use server"

import { tenantAtual } from "@/lib/tenant"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { registrosDoCpf } from "@/lib/db/filiado-portal"
import { buscarHotel, contratoDoHotel } from "@/lib/db/hospedagem"
import {
  cancelarReservaGarantida,
  conferirPodeReservar,
  ehGarantida,
  enviarEmailReservaConfirmada,
  reservarEstadia,
} from "@/lib/db/hospedagem-garantida"
import { conferirCondicoesHospedagem } from "@/lib/db/hospedagem-condicoes"
import { createAdminClient } from "@/lib/supabase/admin"

import { CHAVE_EMITIR_CUPOM, CHAVES_EMITIR_CUPOM_ALT } from "./chaves"

const SEXOS = ["Masculino", "Feminino", "Outro"]

function dataBr(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso
}

export async function criarCupom(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao(CHAVE_EMITIR_CUPOM, CHAVES_EMITIR_CUPOM_ALT)

  const filiadoId = String(formData.get("filiado_id") ?? "")
  const hotelId = String(formData.get("hotel_id") ?? "")
  const checkIn = String(formData.get("check_in") ?? "")
  const sexoBruto = String(formData.get("sexo") ?? "")
  const sexo = SEXOS.includes(sexoBruto) ? sexoBruto : null
  const aceitaColetivo = formData.get("aceita_quarto_coletivo") === "on"

  if (!filiadoId) return { erro: "Selecione o filiado." }
  if (!hotelId) return { erro: "Selecione o hotel." }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkIn)) {
    return { erro: "Informe a data de check-in." }
  }

  const admin = await createAdminClient()

  const [{ data: filiado }, { data: hotel }] = await Promise.all([
    admin
      .from("filiacoes")
      .select("id, cpf, sexo, filiacao_condicao")
      .eq("id", filiadoId)
      .eq("emp_proprietaria_id", await tenantAtual())
      .maybeSingle(),
    admin
      .from("hospedagem_hotel")
      .select("id, ativo")
      .eq("id", hotelId)
      .eq("emp_proprietaria_id", await tenantAtual())
      .maybeSingle(),
  ])
  if (!filiado) return { erro: "Filiado não encontrado." }
  if (filiado.filiacao_condicao !== "Ativo") {
    return {
      erro: "O subsídio de hospedagem é para filiados com condição “Ativo” — confira a situação do cadastro.",
    }
  }
  if (!hotel) return { erro: "Hotel não encontrado." }
  if (hotel.ativo === false) {
    return { erro: "Este hotel está inativo e não recebe novos cupons." }
  }

  // Demanda garantida: a equipe faz a RESERVA em nome do filiado, com as
  // mesmas conferências do portal (condições e não comparecimento).
  const hotelCompleto = await buscarHotel(hotelId)
  if (hotelCompleto && ehGarantida(hotelCompleto)) {
    const checkOut = String(formData.get("check_out") ?? "")
    const cpfPessoa = (filiado.cpf as string | null) ?? null
    const registrosPessoa = cpfPessoa ? await registrosDoCpf(cpfPessoa) : []
    const registros = registrosPessoa.length > 0 ? registrosPessoa : [filiadoId]
    const pode = await conferirPodeReservar({ cpf: cpfPessoa, registros, checkIn })
    if (pode.erro) {
      return { erro: `Este filiado não pode reservar: ${pode.erro}` }
    }
    const reserva = await reservarEstadia({
      hotel: hotelCompleto,
      filiadoId,
      registros,
      sexo: (filiado.sexo as string | null) ?? null,
      checkIn,
      checkOut,
    })
    if (!reserva.ok) return { erro: reserva.erro }
    await enviarEmailReservaConfirmada({
      cpf: cpfPessoa,
      hotelNome: hotelCompleto.nome ?? "hotel",
      checkIn,
      checkOut,
    })
    revalidatePath("/painel/hospedagem")
    revalidatePath("/painel/hospedagem/cupons")
    revalidatePath("/painel/hospedagem/mapa")
    revalidatePath("/hotel/hospedes")
    redirect(`/painel/hospedagem/mapa?hotel=${hotelId}&noite=${checkIn}&salvo=1`)
  }

  // Cupom só dentro da vigência do contrato do hotel (mesma regra do portal).
  const contrato = await contratoDoHotel(hotelId)
  if (!contrato) {
    return {
      erro: "Este hotel não tem contrato vinculado — vincule um contrato antes de emitir cupons.",
    }
  }
  if (!contrato.vigente) {
    return { erro: "O contrato deste hotel não está vigente — cupons indisponíveis." }
  }
  if (contrato.vigenciaTermino && checkIn > contrato.vigenciaTermino) {
    return {
      erro: `O check-in deve ser até o fim da vigência do contrato (${dataBr(contrato.vigenciaTermino)}).`,
    }
  }

  // As condições definidas pelo sindicato valem também na emissão pela equipe.
  // Vínculos e cupons contam por PESSOA: todos os registros do CPF.
  const cpfFiliado = (filiado.cpf as string | null) ?? null
  const registrosDaPessoa = cpfFiliado ? await registrosDoCpf(cpfFiliado) : []
  const condicoes = await conferirCondicoesHospedagem({
    cpf: cpfFiliado,
    registros: registrosDaPessoa.length > 0 ? registrosDaPessoa : [filiadoId],
    checkIn,
  })
  if (condicoes.erro) {
    return { erro: `Este filiado não atende às condições da hospedagem: ${condicoes.erro}` }
  }

  const { error } = await admin.from("hospedagem_cupom").insert({
    filiado_id: filiadoId,
    hotel_id: hotelId,
    check_in: checkIn,
    sexo,
    aceita_quarto_coletivo: aceitaColetivo,
    cancelado: false,
    compareceu: false,
  })
  if (error) return { erro: `Não foi possível emitir o cupom: ${error.message}` }

  revalidatePath("/painel/hospedagem/cupons")
  revalidatePath("/painel/hospedagem")
  redirect("/painel/hospedagem/cupons?salvo=1")
}

export async function cancelarCupom(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao(CHAVE_EMITIR_CUPOM, CHAVES_EMITIR_CUPOM_ALT)

  const id = String(formData.get("id") ?? "")
  if (!id) return { erro: "Cupom inválido." }

  const admin = await createAdminClient()

  // Reserva de demanda garantida: cancela liberando o quarto e oferecendo a
  // vaga à lista de espera (só marcar cancelado deixaria a fila parada).
  const { data: alvo } = await admin
    .from("hospedagem_cupom")
    .select("*")
    .eq("id", id)
    .maybeSingle()
  if (alvo?.reserva_garantida === true) {
    const { erro } = await cancelarReservaGarantida(id, { porEquipe: true })
    if (erro) return { erro }
    revalidatePath("/painel/hospedagem/cupons")
    revalidatePath("/painel/hospedagem")
    revalidatePath("/painel/hospedagem/mapa")
    revalidatePath("/hotel/hospedes")
    return { ok: "Reserva cancelada. A vaga foi oferecida à lista de espera." }
  }

  const { error, count } = await admin
    .from("hospedagem_cupom")
    .update({ cancelado: true }, { count: "exact" })
    .eq("id", id)
    .eq("cancelado", false)
  if (error) return { erro: `Não foi possível cancelar: ${error.message}` }
  if (count === 0) return { erro: "Cupom não encontrado ou já cancelado." }

  revalidatePath("/painel/hospedagem/cupons")
  revalidatePath("/painel/hospedagem")
  return { ok: "Cupom cancelado." }
}
