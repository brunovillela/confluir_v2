"use client"

import { useState } from "react"
import { Trash2, TriangleAlert, X } from "lucide-react"

import { Button } from "@/components/ui/button"

import { excluirConvenioAction } from "../actions"

/**
 * Exclusão do convênio. A confirmação mostra o que vai junto: as unidades e
 * os arquivos. Um convênio encerrado normalmente se INATIVA (fica no
 * histórico); excluir é para cadastro errado.
 */
export function ExcluirConvenio({
  convenioId,
  conveniador,
  unidades,
  temArquivos,
}: {
  convenioId: string
  conveniador: string | null
  unidades: number
  temArquivos: boolean
}) {
  const [confirmando, setConfirmando] = useState(false)

  if (!confirmando) {
    return (
      <div className="flex justify-end border-t pt-4">
        <Button
          type="button"
          variant="ghost"
          onClick={() => setConfirmando(true)}
          className="text-destructive hover:text-destructive"
        >
          <Trash2 />
          Excluir este convênio
        </Button>
      </div>
    )
  }

  return (
    <div className="border-destructive/40 bg-destructive/5 grid gap-4 rounded-lg border p-4">
      <div className="flex items-start gap-2">
        <TriangleAlert className="text-destructive mt-0.5 size-5 shrink-0" />
        <div>
          <h3 className="font-medium">Excluir o convênio com {conveniador ?? "este conveniador"}?</h3>
          <p className="text-muted-foreground mt-1 text-sm">
            Vão junto {unidades} unidade(s) de atendimento
            {temArquivos ? " e os arquivos anexados" : ""}. Se o convênio só acabou, prefira
            desmarcar <strong>Ativo</strong>: ele sai do portal e fica no histórico.
          </p>
        </div>
      </div>
      <form action={excluirConvenioAction} className="flex justify-end gap-2">
        <input type="hidden" name="convenio_id" value={convenioId} />
        <Button type="button" variant="ghost" onClick={() => setConfirmando(false)}>
          <X />
          Cancelar
        </Button>
        <Button type="submit" variant="destructive">
          <Trash2 />
          Excluir mesmo assim
        </Button>
      </form>
    </div>
  )
}
