"use client"

import { useSearchParams } from "next/navigation"
import { FileSpreadsheet, FileText } from "lucide-react"

import { Button } from "@/components/ui/button"

/**
 * Extração dos aptos da rodada (09/11/2026): planilha e PDF com os filtros
 * da aba (busca, já votou / não votou, link pessoal) e TODAS as linhas
 * filtradas, não só a página. Só os filtros que a extração entende vão na URL.
 */
export function ExportarAptos({ rodadaId }: { rodadaId: string }) {
  const params = useSearchParams()
  const q = new URLSearchParams()
  for (const chave of ["busca", "votou", "link"]) {
    const v = params.get(chave)
    if (v) q.set(chave, v)
  }
  const sufixo = q.toString() ? `?${q.toString()}` : ""
  const base = `/painel/representacao/votacoes/rodadas/${rodadaId}/aptos`
  return (
    <>
      <Button variant="outline" size="sm" asChild>
        <a href={`${base}/exportar${sufixo}`} download>
          <FileSpreadsheet />
          Planilha
        </a>
      </Button>
      <Button variant="outline" size="sm" asChild>
        <a href={`${base}/pdf${sufixo}`} target="_blank" rel="noreferrer">
          <FileText />
          PDF
        </a>
      </Button>
    </>
  )
}
