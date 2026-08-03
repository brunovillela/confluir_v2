"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requireSessaoHotel } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import {
  contasDoHotel,
  descreverConta,
  faturarServicos,
  vencimentoMinimoFatura,
} from "@/lib/db/hospedagem"
import { createAdminClient } from "@/lib/supabase/admin"

const FORMAS = ["Pix", "Pix (QR Code)", "Depósito bancário (TED)", "Boleto"] as const

export async function criarFaturaHotel(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const { hotel } = await requireSessaoHotel()

  const servicoIds = formData.getAll("servicos").map(String).filter(Boolean)
  if (servicoIds.length === 0) {
    return { erro: "Selecione pelo menos um serviço para faturar." }
  }

  const vencimento = String(formData.get("vencimento") ?? "")
  if (!/^\d{4}-\d{2}-\d{2}$/.test(vencimento)) {
    return { erro: "Informe o vencimento." }
  }
  const minimo = vencimentoMinimoFatura()
  if (vencimento < minimo) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(minimo)!
    return {
      erro: `O vencimento tem carência mínima de 4 dias — a partir de ${m[3]}/${m[2]}/${m[1]}.`,
    }
  }

  const forma = String(formData.get("forma") ?? "") as (typeof FORMAS)[number]
  if (!FORMAS.includes(forma)) {
    return { erro: "Escolha a forma de recebimento." }
  }

  const admin = await createAdminClient()

  // Resolve os dados de recebimento conforme a forma escolhida.
  let pixCodigo: string | null = null
  let boletoCaminho: string | null = null
  let recebimento: string | null = null
  if (forma === "Boleto") {
    const boleto = formData.get("boleto")
    if (!(boleto instanceof File) || boleto.size === 0) {
      return { erro: "Envie o boleto em PDF." }
    }
    if (boleto.type !== "application/pdf") {
      return { erro: "O boleto deve ser um arquivo PDF." }
    }
    if (boleto.size > 3 * 1024 * 1024) {
      return { erro: "O boleto deve ter no máximo 3 MB." }
    }
    // Bucket 'comprovantes': é dele que a página da ordem resolve o
    // arquivo_boleto quando o valor é um caminho (não URL).
    boletoCaminho = `boletos/hospedagem/${hotel.id}/${Date.now()}.pdf`
    const { error: erroBoleto } = await admin.storage
      .from("comprovantes")
      .upload(boletoCaminho, boleto, { contentType: "application/pdf" })
    if (erroBoleto) {
      return { erro: `Falha ao subir o boleto: ${erroBoleto.message}` }
    }
    recebimento = "Boleto (anexado à ordem)"
  } else if (forma === "Pix (QR Code)") {
    pixCodigo = String(formData.get("pix_codigo") ?? "").trim() || null
    if (!pixCodigo) {
      return { erro: "Cole o código Pix (copia e cola) do QR Code." }
    }
    recebimento = "Pix via QR Code (código na ordem)"
  } else {
    const contaId = String(formData.get("conta_id") ?? "")
    if (!contaId) return { erro: "Escolha a conta de recebimento." }
    const { contas } = await contasDoHotel(hotel.id)
    const conta = contas.find(
      (c) =>
        c.id === contaId &&
        c.ativo &&
        c.tipo === (forma === "Pix" ? "pix" : "deposito")
    )
    if (!conta) {
      return { erro: "Conta de recebimento inválida para a forma escolhida." }
    }
    recebimento = descreverConta(conta)
    if (forma === "Pix") pixCodigo = conta.chave_pix
  }

  // DANFE em PDF no valor total do subsídio (impostos já inclusos).
  const arquivo = formData.get("danfe")
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { erro: "Envie a DANFE em PDF." }
  }
  if (arquivo.type !== "application/pdf") {
    return { erro: "A DANFE deve ser um arquivo PDF." }
  }
  if (arquivo.size > 5 * 1024 * 1024) {
    return { erro: "A DANFE deve ter no máximo 5 MB." }
  }

  const caminho = `faturas/${hotel.id}/${Date.now()}.pdf`
  const { error: erroUpload } = await admin.storage
    .from("hospedagem")
    .upload(caminho, arquivo, { contentType: "application/pdf" })
  if (erroUpload) {
    return { erro: `Falha ao subir a DANFE: ${erroUpload.message}` }
  }

  const resultado = await faturarServicos({
    hotel,
    servicoIds,
    notaFiscalCaminho: caminho,
    vencimento,
    forma,
    pixCodigo,
    boletoCaminho,
    recebimento,
  })
  if ("erro" in resultado) return resultado

  revalidatePath("/hotel/faturamento")
  revalidatePath("/hotel/inicio")
  revalidatePath("/painel/hospedagem")
  revalidatePath("/painel/hospedagem/servicos")
  revalidatePath("/painel/financeiro/ordens")
  redirect("/hotel/faturamento?salvo=1")
}
