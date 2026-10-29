import "server-only"

import { extractText, getDocumentProxy } from "unpdf"
import * as XLSX from "xlsx"

import { decodificarCsv } from "@/lib/csv"

/**
 * Preparo de arquivos enviados para leitura por IA (relação de pagamentos das
 * Receitas, lista de trabalhadores): qual imagem vai à visão e o texto de
 * planilha, CSV/TXT e PDF digital. PDF escaneado não tem texto — quem chama
 * manda `pdf` à visão.
 */

/** jpg/png/webp/gif (pelo tipo ou pela extensão) → mime aceito pela visão; senão null. */
export function mimeDeImagem(tipo: string, nomeArquivo: string): string | null {
  if (["image/jpeg", "image/png", "image/webp", "image/gif"].includes(tipo)) return tipo
  const nome = nomeArquivo.toLowerCase()
  if (/\.(jpe?g|jfif)$/.test(nome)) return "image/jpeg"
  if (nome.endsWith(".png")) return "image/png"
  if (nome.endsWith(".webp")) return "image/webp"
  if (nome.endsWith(".gif")) return "image/gif"
  return null
}

/** Imagem que a visão não lê: o aviso para quem enviou. */
export function imagemNaoSuportada(nomeArquivo: string): boolean {
  return /\.(heic|heif|tiff?|bmp)$/.test(nomeArquivo.toLowerCase())
}

export type TextoDoArquivo = {
  /** Texto extraído ("" quando não há: PDF escaneado). */
  texto: string
  ehPdf: boolean
  /** Os bytes do PDF, para a visão quando ele não tem texto. */
  pdf: Uint8Array | null
  erro?: string
}

/**
 * Texto de planilha (todas as abas, em CSV, datas AAAA-MM-DD), PDF digital
 * (páginas juntas) ou CSV/TXT (decodificado). PDF que falha na extração volta
 * sem texto e com os bytes; outro arquivo ilegível volta com `erro`.
 */
export async function textoDoArquivo(arquivo: File): Promise<TextoDoArquivo> {
  const nome = arquivo.name.toLowerCase()
  const ehPdf = arquivo.type === "application/pdf" || nome.endsWith(".pdf")
  const ehPlanilha =
    /\.(xlsx|xls|ods)$/.test(nome) || arquivo.type.includes("spreadsheet") || arquivo.type.includes("ms-excel")
  let pdf: Uint8Array | null = null
  try {
    if (ehPdf) {
      pdf = new Uint8Array(await arquivo.arrayBuffer())
      const texto = (await extractText(await getDocumentProxy(pdf), { mergePages: true })).text.trim()
      return { texto, ehPdf, pdf }
    }
    if (ehPlanilha) {
      const wb = XLSX.read(new Uint8Array(await arquivo.arrayBuffer()), { type: "array", cellDates: true, dateNF: "yyyy-mm-dd" })
      const texto = wb.SheetNames.map((n) => XLSX.utils.sheet_to_csv(wb.Sheets[n], { dateNF: "yyyy-mm-dd" }))
        .join("\n\n")
        .trim()
      return { texto, ehPdf, pdf }
    }
    return { texto: decodificarCsv(await arquivo.arrayBuffer()).trim(), ehPdf, pdf }
  } catch {
    // PDF só-imagem pode falhar na extração de texto: a visão ainda tenta.
    if (ehPdf && pdf) return { texto: "", ehPdf, pdf }
    return { texto: "", ehPdf, pdf, erro: "Não consegui ler o arquivo." }
  }
}
