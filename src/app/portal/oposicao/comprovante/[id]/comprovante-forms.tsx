"use client"

import { useActionState, useState } from "react"
import { Loader2, Printer, Upload } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import { TAMANHO_MAX_CARTA } from "@/lib/oposicao-constantes"

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
  // Barrado aqui, antes de subir (M3): acima do limite o servidor nem recebe.
  const [erroLocal, setErroLocal] = useState<string | null>(null)
  const idCampo = `documento-${opositorId.slice(0, 8)}`
  const erro = erroLocal ?? estado.erro
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        const arquivo = (e.currentTarget.elements.namedItem("documento") as HTMLInputElement | null)?.files?.[0]
        if (arquivo && arquivo.size > TAMANHO_MAX_CARTA) {
          e.preventDefault()
          setErroLocal(
            `O arquivo tem ${(arquivo.size / 1024 / 1024).toFixed(1).replace(".", ",")} MB; o limite é 3,8 MB. Baixe de novo a carta assinada no gov.br (o PDF dele é pequeno) — fotos e PDFs escaneados ficam grandes demais.`
          )
          return
        }
        setErroLocal(null)
      }}
      className="grid gap-3 print:hidden"
    >
      <input type="hidden" name="opositor_id" value={opositorId} />
      <input type="hidden" name="campanha_id" value={campanhaId ?? ""} />
      {erro && (
        <Alert id={`${idCampo}-erro`} variant="destructive">
          <AlertDescription>{erro}</AlertDescription>
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
          onChange={() => setErroLocal(null)}
          aria-describedby={erro ? `${idCampo}-erro` : undefined}
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
