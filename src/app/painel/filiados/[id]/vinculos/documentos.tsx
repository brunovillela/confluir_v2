"use client"

import { useActionState } from "react"
import { Download, FileCheck2, Loader2, Trash2, Upload } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import { enviarDocumentoAction, removerDocumentoAction } from "./actions"

export type DocumentoNaTela = {
  tipo: "ficha" | "carta"
  url: string | null
  noBubble: boolean
}

const TITULO = {
  ficha: "Ficha de filiação",
  carta: "Carta de desfiliação",
} as const

const EXPLICACAO = {
  ficha:
    "O papel assinado pelo associado. É o que autoriza o desconto e prova a vontade de se filiar.",
  carta: "O pedido de saída, assinado. É o que prova a desfiliação.",
} as const

export function DocumentoDoVinculo({
  filiadoId,
  vinculoId,
  doc,
}: {
  filiadoId: string
  vinculoId: string
  doc: DocumentoNaTela
}) {
  const [envio, enviarAction, enviando] = useActionState(
    enviarDocumentoAction,
    {}
  )
  const [remocao, removerAction, removendo] = useActionState(
    removerDocumentoAction,
    {}
  )
  const estado = envio.erro || envio.ok ? envio : remocao

  return (
    <div className="grid gap-3 rounded-lg border p-4">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-medium">
          <FileCheck2 className="size-4" />
          {TITULO[doc.tipo]}
        </h3>
        <p className="text-muted-foreground mt-1 text-xs">
          {EXPLICACAO[doc.tipo]}
        </p>
      </div>

      {(estado.erro || estado.ok) && (
        <Alert variant={estado.erro ? "destructive" : "success"}>
          <AlertDescription className="text-sm">
            {estado.erro ?? estado.ok}
          </AlertDescription>
        </Alert>
      )}

      {doc.url ? (
        <div className="grid gap-2">
          {doc.noBubble && (
            <Alert variant="warning">
              <AlertDescription className="text-xs">
                Este arquivo ainda está hospedado no <strong>Bubble</strong>, o
                sistema antigo — não no Confluir. Ele abre enquanto aquele
                serviço estiver no ar. Para não perdê-lo, baixe e reenvie aqui.
              </AlertDescription>
            </Alert>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <a href={doc.url} target="_blank" rel="noopener noreferrer">
                <Download />
                Abrir documento
              </a>
            </Button>
            <form action={removerAction}>
              <input type="hidden" name="filiadoId" value={filiadoId} />
              <input type="hidden" name="vinculoId" value={vinculoId} />
              <input type="hidden" name="tipo" value={doc.tipo} />
              <Button
                type="submit"
                variant="ghost"
                size="sm"
                disabled={removendo}
              >
                {removendo ? <Loader2 className="animate-spin" /> : <Trash2 />}
                Remover
              </Button>
            </form>
          </div>
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">
          Nenhum documento anexado a este vínculo.
        </p>
      )}

      <form action={enviarAction} className="grid gap-2 border-t pt-3">
        <input type="hidden" name="filiadoId" value={filiadoId} />
        <input type="hidden" name="vinculoId" value={vinculoId} />
        <input type="hidden" name="tipo" value={doc.tipo} />
        <Label htmlFor={`arquivo-${doc.tipo}`} className="text-xs">
          {doc.url ? "Substituir por outro PDF" : "Anexar PDF assinado"}
        </Label>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            id={`arquivo-${doc.tipo}`}
            name="arquivo"
            type="file"
            accept="application/pdf"
            required
            className="max-w-xs"
          />
          <Button type="submit" size="sm" disabled={enviando}>
            {enviando ? <Loader2 className="animate-spin" /> : <Upload />}
            Enviar
          </Button>
        </div>
      </form>
    </div>
  )
}
