"use client"

import { useActionState } from "react"
import { Loader2, Printer } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

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
      <Input
        name="documento"
        type="file"
        accept="application/pdf"
        required
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
