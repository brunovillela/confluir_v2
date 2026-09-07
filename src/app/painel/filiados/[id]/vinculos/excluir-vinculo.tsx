"use client"

import { useActionState, useState } from "react"
import { Loader2, Trash2, TriangleAlert, X } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"

import { excluirVinculo } from "./actions"

/**
 * Exclusão de um registro do histórico de filiação.
 *
 * Antes disto era um `confirm()` do navegador — uma caixa cinza, sem contexto,
 * que a pessoa aceita no automático. Aqui a confirmação MOSTRA o que vai
 * embora: qual vínculo, de qual empregador, de qual período, e se há ficha ou
 * carta anexadas (que somem junto). Quem apaga sabe o que está apagando.
 */
export function ExcluirVinculo({
  filiadoId,
  vinculoId,
  fonteNome,
  dataFiliacao,
  dataDesfiliacao,
  temFicha,
  temCarta,
}: {
  filiadoId: string
  vinculoId: string
  fonteNome: string | null
  dataFiliacao: string | null
  dataDesfiliacao: string | null
  temFicha: boolean
  temCarta: boolean
}) {
  const [estado, formAction, pendente] = useActionState(excluirVinculo, {})
  const [confirmando, setConfirmando] = useState(false)

  const documentos = [
    temFicha ? "a ficha de filiação" : null,
    temCarta ? "a carta de desfiliação" : null,
  ].filter(Boolean)

  if (!confirmando) {
    return (
      <div className="grid gap-2 border-t pt-4">
        {estado.erro && (
          <Alert variant="destructive">
            <AlertDescription>{estado.erro}</AlertDescription>
          </Alert>
        )}
        <div className="flex justify-end">
          <Button
            type="button"
            variant="ghost"
            onClick={() => setConfirmando(true)}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 />
            Excluir este registro do histórico
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="border-destructive/40 bg-destructive/5 grid gap-4 rounded-lg border p-4">
      <div className="flex items-start gap-2">
        <TriangleAlert className="text-destructive mt-0.5 size-5 shrink-0" />
        <div>
          <h3 className="font-medium">Excluir este registro do histórico?</h3>
          <p className="text-muted-foreground mt-1 text-sm">
            O histórico de filiação é a memória do vínculo da pessoa com a
            entidade. Apagar um registro não tem volta.
          </p>
        </div>
      </div>

      <dl className="grid gap-1 rounded-md border bg-background p-3 text-sm">
        <div className="flex flex-wrap gap-2">
          <dt className="text-muted-foreground">Fonte pagadora:</dt>
          <dd className="font-medium">{fonteNome ?? "não informada"}</dd>
        </div>
        <div className="flex flex-wrap gap-2">
          <dt className="text-muted-foreground">Filiação:</dt>
          <dd>{dataFiliacao ?? "sem data"}</dd>
        </div>
        <div className="flex flex-wrap gap-2">
          <dt className="text-muted-foreground">Desfiliação:</dt>
          <dd>{dataDesfiliacao ?? "em aberto"}</dd>
        </div>
      </dl>

      {documentos.length > 0 && (
        <Alert variant="destructive">
          <AlertDescription>
            Some junto <strong>{documentos.join(" e ")}</strong> deste vínculo.
            Se o documento ainda for necessário, baixe antes de excluir.
          </AlertDescription>
        </Alert>
      )}

      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={() => setConfirmando(false)}
          disabled={pendente}
        >
          <X />
          Cancelar
        </Button>
        <form action={formAction}>
          <input type="hidden" name="filiado_id" value={filiadoId} />
          <input type="hidden" name="vinculo_id" value={vinculoId} />
          <Button type="submit" variant="destructive" disabled={pendente}>
            {pendente ? <Loader2 className="animate-spin" /> : <Trash2 />}
            Sim, excluir o registro
          </Button>
        </form>
      </div>
    </div>
  )
}
