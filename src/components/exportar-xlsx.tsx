"use client"

import { useSearchParams } from "next/navigation"
import { FileSpreadsheet } from "lucide-react"

import { Button } from "@/components/ui/button"

/**
 * Botão "Exportar XLSX" de uma lista (onda 3, I8): leva os parâmetros
 * atuais da URL (filtros e ordem) para a rota de exportação da lista, que
 * devolve a planilha com TODAS as linhas filtradas — não só a página.
 */
export function ExportarXlsx({ href, rotulo = "Exportar XLSX" }: { href: string; rotulo?: string }) {
  const params = useSearchParams()
  const q = new URLSearchParams(params.toString())
  q.delete("pagina")
  q.delete("porPagina")
  const s = q.toString()
  return (
    <Button variant="outline" size="sm" asChild>
      <a href={`${href}${s ? `?${s}` : ""}`} download>
        <FileSpreadsheet />
        {rotulo}
      </a>
    </Button>
  )
}
