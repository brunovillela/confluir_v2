"use client"

import { useActionState, useState } from "react"
import Link from "next/link"
import { FileUp, Loader2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import { ACEITA_NOTA, prepararArquivo } from "../../../compras/nova/arquivo-envio"
import { salvarDocumentosOrdemAction } from "./actions"

/**
 * Nota fiscal e boleto da ordem, anexados ou substituídos pela própria tela
 * da ordem (as migradas do Bubble e as lançadas sem documento ganham o
 * arquivo aqui). Nota: PDF ou foto (reduzida no navegador); boleto: PDF.
 */
export function DocumentosForm({
  ordemId,
  temNota,
  temBoleto,
  pedeBoleto,
  rotuloNota,
}: {
  ordemId: string
  temNota: boolean
  temBoleto: boolean
  /** Forma da ordem é boleto: o campo ganha destaque. */
  pedeBoleto: boolean
  rotuloNota: string
}) {
  const [estado, acao, pendente] = useActionState(salvarDocumentosOrdemAction, {})
  const [erroArquivo, setErroArquivo] = useState<string | null>(null)

  return (
    <form action={acao} className="mt-4 grid gap-4 border-t pt-4">
      <input type="hidden" name="id" value={ordemId} />
      {(erroArquivo ?? estado.erro) && (
        <Alert variant="destructive">
          <AlertDescription>{erroArquivo ?? estado.erro}</AlertDescription>
        </Alert>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="doc_nota">
            {rotuloNota} (PDF ou foto{temNota ? " — substitui a atual" : ""})
          </Label>
          <Input
            id="doc_nota"
            name="nota"
            type="file"
            accept={ACEITA_NOTA}
            onChange={async (e) => {
              const { erro } = await prepararArquivo(e.currentTarget)
              setErroArquivo(erro ?? null)
            }}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="doc_boleto">
            Boleto (PDF{temBoleto ? " — substitui o atual" : ""})
            {pedeBoleto && !temBoleto && (
              <span className="text-warning-fg font-normal"> · forma da ordem é boleto</span>
            )}
          </Label>
          <Input id="doc_boleto" name="boleto" type="file" accept="application/pdf" />
        </div>
      </div>
      <p className="text-muted-foreground text-xs">
        Anexar ou trocar documentos não muda a situação da ordem; a troca fica no histórico.
      </p>
      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/painel/financeiro/ordens/${ordemId}`}>Cancelar</Link>
        </Button>
        <Button type="submit" size="sm" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <FileUp />}
          Salvar documentos
        </Button>
      </div>
    </form>
  )
}
