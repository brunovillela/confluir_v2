"use client"

import { useActionState } from "react"
import { Loader2, Printer, Upload } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import { enviarDocumento } from "../../actions"

export function BotaoImprimir() {
  return (
    <Button
      type="button"
      variant="outline"
      onClick={() => window.print()}
      className="print:hidden"
    >
      <Printer />
      Imprimir
    </Button>
  )
}

/**
 * Envio da carta assinada — a primeira e a troca do arquivo (A53). O campo é
 * o `CampoArquivo` do sistema (o `Input type="file"` o desenha): área de
 * soltar, "PDF · até 4 MB" e o nome do arquivo escolhido.
 */
export function EnviarDocumento({
  opositorId,
  campanhaId,
  rotulo = "Enviar a carta assinada",
}: {
  opositorId: string
  campanhaId: string | null
  rotulo?: string
}) {
  const [estado, formAction, pendente] = useActionState(enviarDocumento, {})
  const idCampo = `documento-${opositorId.slice(0, 8)}`
  return (
    <form action={formAction} className="grid gap-3 print:hidden">
      <input type="hidden" name="opositor_id" value={opositorId} />
      <input type="hidden" name="campanha_id" value={campanhaId ?? ""} />
      {estado.erro && (
        <Alert id={`${idCampo}-erro`} variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <div className="grid gap-1.5">
        <Label htmlFor={idCampo}>PDF assinado no gov.br</Label>
        <Input
          id={idCampo}
          name="documento"
          type="file"
          accept="application/pdf"
          required
          aria-describedby={estado.erro ? `${idCampo}-erro` : undefined}
        />
      </div>
      <div>
        <Button type="submit" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Upload />}
          {rotulo}
        </Button>
      </div>
    </form>
  )
}
