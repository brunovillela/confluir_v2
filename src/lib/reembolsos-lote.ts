import * as XLSX from "xlsx"

import type { LinhaLote } from "@/lib/db/filiacao-reembolsos-edicao"

/**
 * Leitura da lista do lançamento de reembolsos em lote (28/10/2026) — só o
 * FORMATO, sem banco. Aceita a lista colada (uma linha por filiado: CPF e
 * valor, separados por tabulação, ponto e vírgula ou espaço — o que sai ao
 * copiar duas colunas do Excel) e a planilha (.xlsx ou .csv) com as mesmas
 * duas colunas; outras colunas (nome, matrícula…) são ignoradas. Linha sem
 * CPF reconhecível conta como ignorada (cabeçalho, título).
 */

const CPF = /\d{3}\.?\d{3}\.?\d{3}-?\d{2}/
const VALOR = /(?:R\$\s*)?-?\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|(?:R\$\s*)?-?\d+(?:[.,]\d{1,2})?/g

/** "1.234,56", "1234,56", "1234.56", "R$ 35" → número; "" → null. */
export function lerValor(bruto: string): number | null {
  let v = bruto.replace(/R\$\s*/, "").trim()
  if (!v) return null
  if (v.includes(",")) v = v.replace(/\./g, "").replace(",", ".")
  else if (/^\d{1,3}(\.\d{3})+$/.test(v)) v = v.replace(/\./g, "")
  const n = Number(v)
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null
}

/** Uma linha de texto → CPF e valor (o último número depois do CPF). */
function lerLinha(texto: string, linha: number): LinhaLote | null {
  const cpf = texto.match(CPF)
  if (!cpf) return null
  const resto = texto.slice(0, cpf.index) + " " + texto.slice((cpf.index ?? 0) + cpf[0].length)
  const numeros = resto.match(VALOR) ?? []
  const valor = numeros.length ? lerValor(numeros[numeros.length - 1]) : null
  return { linha, cpf: cpf[0], valor }
}

export function lerTextoLote(texto: string): { linhas: LinhaLote[]; ignoradas: number } {
  const linhas: LinhaLote[] = []
  let ignoradas = 0
  texto.split(/\r?\n/).forEach((l, i) => {
    if (!l.trim()) return
    const lida = lerLinha(l, i + 1)
    if (lida) linhas.push(lida)
    else ignoradas++
  })
  return { linhas, ignoradas }
}

/**
 * Planilha → o mesmo texto da lista colada (células separadas por tabulação).
 * CPF gravado como número perde o zero da frente no Excel: inteiro de 9 a 11
 * dígitos volta com os zeros.
 */
function planilhaComoTexto(bytes: Uint8Array): string | null {
  let wb: XLSX.WorkBook
  try {
    wb = XLSX.read(bytes, { type: "array" })
  } catch {
    return null
  }
  const aba = wb.SheetNames[0] ? wb.Sheets[wb.SheetNames[0]] : undefined
  if (!aba) return ""
  const grade = XLSX.utils.sheet_to_json<unknown[]>(aba, { header: 1, blankrows: false, defval: "" })
  return grade
    .map((linha) =>
      linha
        .map((c) =>
          typeof c === "number"
            ? Number.isInteger(c) && c >= 1e8 && c < 1e11
              ? String(c).padStart(11, "0")
              : String(c)
            : String(c ?? "")
        )
        .join("\t")
    )
    .join("\n")
}

/** A lista do lote: a planilha, se veio; senão o texto colado. */
export async function lerListaLote(
  texto: string,
  planilha: File | null
): Promise<{ linhas: LinhaLote[]; ignoradas: number } | { erro: string }> {
  if (planilha) {
    if (planilha.size > 4 * 1024 * 1024) return { erro: "A planilha passa de 4 MB." }
    const conteudo = planilhaComoTexto(new Uint8Array(await planilha.arrayBuffer()))
    if (conteudo == null) return { erro: "Não consegui abrir o arquivo. Envie uma planilha .xlsx ou .csv." }
    return lerTextoLote(conteudo)
  }
  return lerTextoLote(texto)
}
