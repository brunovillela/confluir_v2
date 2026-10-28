"use server"

import { extractText, getDocumentProxy } from "unpdf"

import { requirePermissao } from "@/lib/auth"
import { TIPOS_COMPROVANTE_COMPRAS } from "@/lib/db/compras"
import { buscarContrato } from "@/lib/db/veiculos"
import { formatarData } from "@/lib/formato"
import {
  gerarJsonIA,
  gerarJsonIADeImagem,
  gerarJsonIADePdf,
  type EsquemaJsonIA,
} from "@/lib/ia"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Leitura da FATURA (ou do boleto) da locadora pela IA: ao escolher o arquivo
 * em "Gerar cobrança", período, valor, vencimento e linha digitável vêm
 * preenchidos para conferir. Mesmo caminho da guia do tributo: PDF com texto
 * vai como texto (barato); digitalizado ou foto, pela visão. Nada é gravado
 * aqui — quem grava é a pessoa, ao gerar a cobrança.
 */

const SISTEMA_FATURA = `Você lê faturas e boletos de LOCADORAS DE VEÍCULOS emitidos contra um sindicato (fatura de locação, nota de débito, demonstrativo de diárias, boleto bancário) — muitas vezes digitalizados ou fotografados.

Devolva um JSON com estas chaves (use null quando o dado não aparecer ou estiver ilegível — NUNCA chute):
- "periodo_inicio": primeiro dia do PERÍODO DE LOCAÇÃO cobrado (retirada / início das diárias / início do período de referência), AAAA-MM-DD. NÃO é a data de emissão nem o vencimento.
- "periodo_fim": último dia do período cobrado (devolução / fim das diárias / fim do período de referência), AAAA-MM-DD. Se a fatura só disser o mês de referência, use o primeiro e o último dia desse mês.
- "vencimento": data de vencimento / "pagar até", AAAA-MM-DD.
- "valor_total": valor TOTAL a pagar (com acréscimos e descontos já aplicados), número com ponto decimal.
- "linha_digitavel": a linha digitável do boleto, SÓ OS DÍGITOS, na ordem em que aparecem (boleto bancário tem 47 dígitos). null se o documento não tiver boleto.
- "numero_documento": número da fatura / nota de débito, se houver.
- "emitente_nome": nome da locadora como aparece.
- "emitente_cnpj": CNPJ da locadora (só dígitos), se houver.
- "placas": lista das placas dos veículos que aparecem (formato AAA0A00 ou AAA0000, sem hífen). Lista vazia se nenhuma.
- "avisos": lista de strings com o que ficou ilegível, ambíguo ou incoerente (ex.: total diferente da soma dos itens, dois períodos na mesma fatura, linha digitável incompleta). Lista vazia se nada.`

const ESQUEMA_FATURA: EsquemaJsonIA = {
  nome: "fatura_locacao",
  schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "periodo_inicio",
      "periodo_fim",
      "vencimento",
      "valor_total",
      "linha_digitavel",
      "numero_documento",
      "emitente_nome",
      "emitente_cnpj",
      "placas",
      "avisos",
    ],
    properties: {
      periodo_inicio: { type: ["string", "null"] },
      periodo_fim: { type: ["string", "null"] },
      vencimento: { type: ["string", "null"] },
      valor_total: { type: ["number", "null"] },
      linha_digitavel: { type: ["string", "null"] },
      numero_documento: { type: ["string", "null"] },
      emitente_nome: { type: ["string", "null"] },
      emitente_cnpj: { type: ["string", "null"] },
      placas: { type: "array", items: { type: "string" } },
      avisos: { type: "array", items: { type: "string" } },
    },
  },
}

export type LeituraFaturaLocacao = {
  erro?: string
  periodoInicio?: string
  periodoFim?: string
  /** "1234,56", no formato do campo. */
  valor?: string
  vencimento?: string
  linhaDigitavel?: string
  /** "Fatura 123 — Locadora X · placas ABC1D23". */
  resumo?: string
  avisos?: string[]
}

function str(v: unknown): string {
  return typeof v === "string"
    ? v.trim()
    : typeof v === "number"
      ? String(v)
      : ""
}
function num(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null
  const s = str(v)
  if (!s) return null
  const n = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s)
  return Number.isFinite(n) ? n : null
}
function dataIso(v: unknown): string {
  const s = str(v)
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  const iso = br
    ? `${br[3]}-${br[2]}-${br[1]}`
    : /^\d{4}-\d{2}-\d{2}/.test(s)
      ? s.slice(0, 10)
      : ""
  return iso && !Number.isNaN(new Date(`${iso}T12:00:00`).getTime()) ? iso : ""
}

/**
 * Lê a fatura (papel "fatura") ou o boleto (papel "boleto") escolhido e
 * devolve os campos para pré-preencher a cobrança, com avisos do que não bate
 * com o contrato (CNPJ da locadora, vigência, placas).
 */
export async function lerFaturaLocacao(
  formData: FormData,
): Promise<LeituraFaturaLocacao> {
  await requirePermissao("veiculos_gestao")
  const arquivo = formData.get("arquivo")
  const contratoId = str(formData.get("contrato_id"))
  const papel = str(formData.get("papel")) === "boleto" ? "boleto" : "fatura"
  if (!(arquivo instanceof File) || arquivo.size === 0)
    return { erro: "Selecione o arquivo." }
  if (!TIPOS_COMPROVANTE_COMPRAS[arquivo.type])
    return { erro: "Envie um PDF ou uma imagem (JPG, PNG ou WEBP)." }
  if (arquivo.size > 4 * 1024 * 1024)
    return { erro: "O arquivo deve ter no máximo 4 MB." }

  const buffer = new Uint8Array(await arquivo.arrayBuffer())
  const base64 = Buffer.from(buffer).toString("base64")
  const prompt = `Leia este ${papel === "boleto" ? "boleto" : "documento de cobrança"} da locadora e devolva o JSON pedido.`
  let resultado
  if (arquivo.type === "application/pdf") {
    let texto = ""
    try {
      // getDocumentProxy esvazia o buffer (transfere): o base64 já foi tirado antes.
      const pdf = await getDocumentProxy(buffer)
      texto = (await extractText(pdf, { mergePages: true })).text.trim()
    } catch {
      // PDF só-imagem: segue para a visão.
    }
    resultado =
      texto.length >= 60
        ? await gerarJsonIA({
            system: SISTEMA_FATURA,
            prompt: `Texto do documento:\n\n${texto.slice(0, 40000)}`,
            esquema: ESQUEMA_FATURA,
          })
        : await gerarJsonIADePdf({
            system: SISTEMA_FATURA,
            prompt,
            pdfBase64: base64,
            esquema: ESQUEMA_FATURA,
          })
  } else {
    resultado = await gerarJsonIADeImagem({
      system: SISTEMA_FATURA,
      prompt,
      imagemBase64: base64,
      mimeType: arquivo.type,
    })
  }
  const { dados, erro } = resultado
  if (erro || !dados)
    return { erro: erro ?? "A IA não conseguiu ler o documento." }

  const avisos = Array.isArray(dados.avisos)
    ? dados.avisos.map(str).filter(Boolean)
    : []
  const valor = num(dados.valor_total)
  const vencimento = dataIso(dados.vencimento)
  let inicio = dataIso(dados.periodo_inicio)
  let fim = dataIso(dados.periodo_fim)
  const linha = str(dados.linha_digitavel).replace(/\D/g, "")
  const placas = Array.isArray(dados.placas)
    ? [
        ...new Set(
          dados.placas
            .map((p) =>
              str(p)
                .toUpperCase()
                .replace(/[^A-Z0-9]/g, ""),
            )
            .filter(Boolean),
        ),
      ]
    : []

  if (linha && ![44, 47, 48].includes(linha.length)) {
    avisos.push(
      `A linha digitável lida tem ${linha.length} dígitos (o boleto tem 47) — confira no documento.`,
    )
  }
  if (inicio && fim && fim < inicio) {
    avisos.push("O período lido termina antes de começar — confira as datas.")
    ;[inicio, fim] = [fim, inicio]
  }
  if (papel === "fatura") {
    if (!inicio || !fim)
      avisos.push("O período cobrado não foi encontrado — preencha à mão.")
    if (!valor) avisos.push("O valor não foi encontrado — preencha à mão.")
    if (!vencimento)
      avisos.push("O vencimento não foi encontrado — preencha à mão.")
  }

  // Conferência com o contrato: é desta locadora? cabe na vigência? são os
  // veículos do contrato? Só avisa — quem decide é a pessoa.
  const contrato = contratoId ? await buscarContrato(contratoId) : null
  if (contrato) {
    const cnpjLido = str(dados.emitente_cnpj).replace(/\D/g, "")
    if (cnpjLido && contrato.fornecedor_id) {
      const admin = await createAdminClient()
      const { data: f } = await admin
        .from("empresa")
        .select("cnpj_cpf")
        .eq("id", contrato.fornecedor_id)
        .maybeSingle()
      const cnpjContrato = str(f?.cnpj_cpf).replace(/\D/g, "")
      if (cnpjContrato && cnpjContrato !== cnpjLido) {
        avisos.push(
          `O CNPJ do documento (${cnpjLido}) não é o da locadora do contrato (${contrato.fornecedorNome ?? cnpjContrato}).`,
        )
      }
    }
    if (
      fim &&
      contrato.vigencia_inicio &&
      fim < contrato.vigencia_inicio.slice(0, 10)
    ) {
      avisos.push(
        `O período lido é anterior ao início da vigência (${formatarData(contrato.vigencia_inicio)}).`,
      )
    }
    if (
      inicio &&
      contrato.vigencia_termino &&
      inicio > contrato.vigencia_termino.slice(0, 10)
    ) {
      avisos.push(
        `O período lido começa depois do término da vigência (${formatarData(contrato.vigencia_termino)}) — talvez seja preciso prorrogar o contrato.`,
      )
    }
    const doContrato = new Set(
      contrato.veiculos
        .map((v) =>
          str(v.placa)
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, ""),
        )
        .filter(Boolean),
    )
    const fora = doContrato.size ? placas.filter((p) => !doContrato.has(p)) : []
    if (fora.length) {
      avisos.push(
        `Placa${fora.length > 1 ? "s" : ""} fora deste contrato: ${fora.join(", ")}.`,
      )
    }
  }

  const numero = str(dados.numero_documento)
  const emitente = str(dados.emitente_nome)
  return {
    periodoInicio: inicio,
    periodoFim: fim,
    valor: valor ? valor.toFixed(2).replace(".", ",") : "",
    vencimento,
    linhaDigitavel: linha,
    resumo:
      [
        numero ? `${papel === "boleto" ? "Boleto" : "Fatura"} ${numero}` : "",
        emitente,
      ]
        .filter(Boolean)
        .join(" — ") + (placas.length ? ` · ${placas.join(", ")}` : ""),
    avisos,
  }
}
