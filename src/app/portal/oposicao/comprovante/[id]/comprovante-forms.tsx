"use client"

import { useActionState } from "react"
import { Loader2, Printer } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"

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
      Imprimir / salvar PDF
    </Button>
  )
}

export function EnviarDocumento({
  opositorId,
  campanhaId,
}: {
  opositorId: string
  campanhaId: string | null
}) {
  const [estado, formAction, pendente] = useActionState(enviarDocumento, {})
  return (
    <form action={formAction} className="grid gap-3">
      <input type="hidden" name="opositor_id" value={opositorId} />
      <input type="hidden" name="campanha_id" value={campanhaId ?? ""} />
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <input
        name="documento"
        type="file"
        accept="application/pdf"
        required
        className="border-input bg-background w-full rounded-md border px-3 py-1.5 text-sm shadow-xs outline-none file:mr-3 file:rounded file:border-0 file:bg-muted file:px-2 file:py-1"
      />
      <div>
        <Button type="submit" disabled={pendente}>
          {pendente && <Loader2 className="animate-spin" />}
          Enviar documento assinado
        </Button>
      </div>
    </form>
  )
}
