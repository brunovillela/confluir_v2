"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import {
  decodificarCsv,
  normalizarCabecalho,
  normalizarDataCsv,
  parseCsv,
} from "@/lib/csv"
import {
  criarAbastecimento,
  importarAbastecimentos,
  type LinhaImportacao,
} from "@/lib/db/veiculos"
import { parseValorBR } from "@/lib/valores"

function texto(formData: FormData, campo: string): string {
  return String(formData.get(campo) ?? "").trim()
}

export async function criarAbastecimentoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("veiculos_gestao")
  const veiculoId = texto(formData, "veiculo_id")
  const condutorId = texto(formData, "condutor_usuario_id")
  const posto = texto(formData, "posto")
  const combustivel = texto(formData, "combustivel")
  const volume = parseValorBR(texto(formData, "volume"))
  const valor = parseValorBR(texto(formData, "valor"))
  const hodometro = parseValorBR(texto(formData, "hodometro"))
  const dataHora = texto(formData, "data_hora")

  if (!veiculoId) return { erro: "Escolha o veículo." }
  if (!condutorId) return { erro: "Escolha o condutor." }
  if (!posto) return { erro: "Informe o posto." }
  if (!combustivel) return { erro: "Informe o combustível." }
  if (volume === null || volume <= 0) return { erro: "Informe os litros." }
  if (valor === null || valor <= 0) return { erro: "Informe o valor." }
  if (hodometro === null || hodometro < 0) {
    return { erro: "Informe o hodômetro — obrigatório nos lançamentos novos." }
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(dataHora)) {
    return { erro: "Informe a data e hora do abastecimento." }
  }

  const { erro } = await criarAbastecimento({
    veiculo_id: veiculoId,
    condutor_usuario_id: condutorId,
    posto,
    cidade: texto(formData, "cidade") || null,
    combustivel,
    volume,
    valor,
    hodometro,
    // Hora local de São Paulo.
    data_hora: `${dataHora}:00-03:00`,
  })
  if (erro) return { erro }
  revalidatePath("/painel/veiculos/abastecimentos")
  redirect("/painel/veiculos/abastecimentos?salvo=1")
}

/**
 * Importação da fatura/planilha (CSV). Cabeçalhos aceitos (com tolerância a
 * acentos/caixa): placa, data, hora, posto, cidade, combustivel,
 * litros|volume, valor, hodometro (opcional).
 */
export async function importarAbastecimentosAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await requirePermissao("veiculos_gestao")
  const arquivo = formData.get("arquivo")
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { erro: "Escolha o arquivo CSV da fatura." }
  }
  if (arquivo.size > 5 * 1024 * 1024) {
    return { erro: "O arquivo deve ter no máximo 5 MB." }
  }

  const linhas = parseCsv(decodificarCsv(await arquivo.arrayBuffer()))
  if (linhas.length < 2) {
    return { erro: "O arquivo está vazio (esperava cabeçalho + lançamentos)." }
  }

  const cabecalho = linhas[0].map(normalizarCabecalho)
  const coluna = (...nomes: string[]) => {
    for (const nome of nomes) {
      const i = cabecalho.indexOf(nome)
      if (i >= 0) return i
    }
    return -1
  }
  const iPlaca = coluna("placa")
  const iData = coluna("data")
  const iHora = coluna("hora")
  const iPosto = coluna("posto")
  const iCidade = coluna("cidade")
  const iCombustivel = coluna("combustivel")
  const iVolume = coluna("litros", "volume", "volumeabastecido")
  const iValor = coluna("valor", "valortotal", "valorabastecimento")
  const iHodometro = coluna("hodometro", "km", "odometro")

  const obrigatorias: [string, number][] = [
    ["placa", iPlaca],
    ["data", iData],
    ["posto", iPosto],
    ["combustivel", iCombustivel],
    ["litros", iVolume],
    ["valor", iValor],
  ]
  const faltando = obrigatorias.filter(([, i]) => i < 0).map(([n]) => n)
  if (faltando.length > 0) {
    return {
      erro: `Cabeçalhos não encontrados no CSV: ${faltando.join(", ")}. Esperado: placa; data; hora; posto; cidade; combustivel; litros; valor; hodometro.`,
    }
  }

  const problemas: string[] = []
  const importaveis: LinhaImportacao[] = []
  for (let n = 1; n < linhas.length; n++) {
    const l = linhas[n]
    const rotulo = `linha ${n + 1}`
    const placa = (l[iPlaca] ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "")
    const data = normalizarDataCsv(l[iData] ?? "")
    const horaBruta = iHora >= 0 ? (l[iHora] ?? "").trim() : ""
    const hora = /^\d{1,2}:\d{2}/.test(horaBruta)
      ? horaBruta.slice(0, 5).padStart(5, "0")
      : "12:00"
    const volume = parseValorBR(l[iVolume] ?? "")
    const valor = parseValorBR(l[iValor] ?? "")
    const hodometro = iHodometro >= 0 ? parseValorBR(l[iHodometro] ?? "") : null

    if (!placa) problemas.push(`${rotulo}: sem placa`)
    else if (!data) problemas.push(`${rotulo}: data inválida`)
    else if (volume === null || volume <= 0) problemas.push(`${rotulo}: litros inválidos`)
    else if (valor === null || valor <= 0) problemas.push(`${rotulo}: valor inválido`)
    else {
      importaveis.push({
        placa,
        condutor_usuario_id: null,
        posto: (l[iPosto] ?? "").trim() || "(sem posto)",
        cidade: iCidade >= 0 ? (l[iCidade] ?? "").trim() || null : null,
        combustivel: (l[iCombustivel] ?? "").trim() || "(sem combustível)",
        volume,
        valor,
        hodometro,
        data_hora: `${data}T${hora}:00-03:00`,
      })
    }
  }

  if (problemas.length > 0) {
    const mostradas = problemas.slice(0, 5).join("; ")
    return {
      erro: `Corrija o arquivo antes de importar (${problemas.length} problema${problemas.length > 1 ? "s" : ""}): ${mostradas}${problemas.length > 5 ? "…" : ""}`,
    }
  }

  const { importados, erro } = await importarAbastecimentos(
    importaveis,
    arquivo.name,
    sessao.usuario.id
  )
  if (erro) return { erro }
  revalidatePath("/painel/veiculos/abastecimentos")
  redirect(`/painel/veiculos/abastecimentos?importados=${importados}`)
}
