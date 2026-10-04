import "server-only"

import * as XLSX from "xlsx"

/**
 * EXPORTAÇÃO XLSX UNIVERSAL (onda 3, I8): toda lista do painel exporta com
 * os filtros da tela. Cada rota de exportação monta `colunas` + `linhas` e
 * devolve `respostaXlsx`; o botão (components/exportar-xlsx.tsx) leva os
 * parâmetros atuais da URL. Datas ISO viram datas de verdade na planilha;
 * números continuam números (dá para somar no Excel).
 */

export type ColunaXlsx<T> = {
  titulo: string
  /** Valor da célula: string, número, Date ou null. */
  valor: (linha: T) => string | number | Date | null | undefined
  /** Largura em caracteres (padrão: 18). */
  largura?: number
}

/** "AAAA-MM-DD" (ou ISO com hora) → Date local, para a célula ser data no Excel. */
export function dataXlsx(iso: string | null | undefined): Date | null {
  if (!iso) return null
  const [a, m, d] = iso.slice(0, 10).split("-").map(Number)
  if (!a || !m || !d) return null
  return new Date(a, m - 1, d)
}

export function planilhaXlsx<T>(aba: string, colunas: ColunaXlsx<T>[], linhas: T[]): Uint8Array {
  const matriz: (string | number | Date | null)[][] = [
    colunas.map((c) => c.titulo),
    ...linhas.map((l) => colunas.map((c) => c.valor(l) ?? null)),
  ]
  const folha = XLSX.utils.aoa_to_sheet(matriz, { cellDates: true })
  folha["!cols"] = colunas.map((c) => ({ wch: c.largura ?? 18 }))
  folha["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(linhas.length, 1), c: colunas.length - 1 } }) }
  const livro = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(livro, folha, aba.slice(0, 31))
  return new Uint8Array(XLSX.write(livro, { type: "array", bookType: "xlsx", cellDates: true }) as ArrayBuffer)
}

export function respostaXlsx(nomeArquivo: string, bytes: Uint8Array): Response {
  const hoje = new Date().toISOString().slice(0, 10)
  return new Response(bytes as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nomeArquivo}-${hoje}.xlsx"`,
      "Cache-Control": "no-store",
    },
  })
}
