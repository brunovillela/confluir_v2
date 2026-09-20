"use client"

import { useActionState } from "react"
import { Loader2, Upload } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { AcaoVisualizacao, formVisualizacao } from "@/components/acao-visualizacao"
import { Input } from "@/components/ui/input"

import { subirRelatorioHotel } from "../actions"

/** Upload (ou substituição) do relatório/extrato assinado pelos hóspedes. */
export function RelatorioForm({
  servicoId,
  temRelatorio,
  preview = false,
}: {
  servicoId: string
  temRelatorio: boolean
  preview?: boolean
}) {
  const [estado, formAction, pendente] = useActionState(subirRelatorioHotel, {})

  return (
    <form {...formVisualizacao(preview, formAction)} className="grid gap-2">
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      {estado.ok && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>{estado.ok}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="servico_id" value={servicoId} />
        <Input
          name="relatorio"
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/webp"
          required
          className="max-w-xs"
          aria-label="Arquivo do relatório"
        />
        <AcaoVisualizacao
          preview={preview}
          nota="O relatório assinado é enviado pelo hotel."
        >
          <Button type="submit" variant="secondary" size="sm" disabled={pendente}>
            {pendente ? <Loader2 className="animate-spin" /> : <Upload />}
            {temRelatorio ? "Substituir relatório" : "Enviar relatório"}
          </Button>
        </AcaoVisualizacao>
      </div>
    </form>
  )
}
