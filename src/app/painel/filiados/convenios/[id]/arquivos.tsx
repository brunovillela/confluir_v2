"use client"

import { useActionState } from "react"
import { ExternalLink, Loader2, Trash2, Upload } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { ArquivoConvenio } from "@/lib/db/filiacao-convenios-edicao"

import { enviarArquivoAction, removerArquivoAction } from "../actions"

const ROTULO: Record<ArquivoConvenio, { titulo: string; ajuda: string; aceita: string }> = {
  contrato: {
    titulo: "Contrato ou regulamento",
    ajuda: "O filiado abre pelo link “Regras do convênio” no portal. PDF, JPG ou PNG.",
    aceita: "application/pdf,image/jpeg,image/png",
  },
  foto: {
    titulo: "Foto principal",
    ajuda: "Ilustra o convênio no portal. JPG, PNG ou WebP.",
    aceita: "image/jpeg,image/png,image/webp",
  },
}

export function ArquivoConvenioCampo({
  convenioId,
  tipo,
  url,
  noBubble,
}: {
  convenioId: string
  tipo: ArquivoConvenio
  url: string | null
  /** O arquivo ainda mora no CDN do sistema antigo. */
  noBubble: boolean
}) {
  const [estado, formAction, pendente] = useActionState(enviarArquivoAction, {})
  const r = ROTULO[tipo]

  return (
    <div className="grid gap-2 rounded-lg border p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{r.titulo}</p>
          <p className="text-muted-foreground text-xs">{r.ajuda}</p>
        </div>
        {url && (
          <div className="flex shrink-0 items-center gap-1">
            <Button asChild variant="outline" size="sm">
              <a href={url} target="_blank" rel="noreferrer">
                <ExternalLink />
                Abrir
              </a>
            </Button>
            <form action={removerArquivoAction}>
              <input type="hidden" name="convenio_id" value={convenioId} />
              <input type="hidden" name="tipo" value={tipo} />
              <Button
                type="submit"
                variant="ghost"
                size="icon-sm"
                aria-label="Remover arquivo"
                className="text-destructive hover:text-destructive"
                onClick={(e) => {
                  if (!confirm(`Remover ${r.titulo.toLowerCase()}?`)) e.preventDefault()
                }}
              >
                <Trash2 />
              </Button>
            </form>
          </div>
        )}
      </div>

      {noBubble && (
        <p className="text-warning-fg text-xs">
          Este arquivo ainda está no sistema antigo. Abra, baixe e reenvie aqui antes de ele
          ser desligado.
        </p>
      )}

      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}

      <form action={formAction} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="convenio_id" value={convenioId} />
        <input type="hidden" name="tipo" value={tipo} />
        <Input type="file" name="arquivo" accept={r.aceita} required className="max-w-xs" />
        <Button type="submit" size="sm" variant="secondary" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Upload />}
          {url ? "Substituir" : "Enviar"}
        </Button>
      </form>
    </div>
  )
}
