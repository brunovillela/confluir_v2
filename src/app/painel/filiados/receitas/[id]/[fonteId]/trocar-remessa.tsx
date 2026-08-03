"use client"

import { useActionState } from "react"
import { ArrowRightLeft, Loader2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"

import { trocarRemessa } from "./actions"

export type OpcaoRemessa = { id: string; rotulo: string }

/** Move os recebimentos desta fonte para outra remessa. */
export function TrocarRemessa({
  remessaId,
  fonteId,
  opcoes,
}: {
  remessaId: string
  fonteId: string
  opcoes: OpcaoRemessa[]
}) {
  const [estado, formAction, pendente] = useActionState(trocarRemessa, {})

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        const select = e.currentTarget.querySelector<HTMLSelectElement>(
          'select[name="remessa_destino"]'
        )
        const rotulo = select?.selectedOptions[0]?.textContent ?? "outra remessa"
        if (
          !confirm(
            `Mover TODOS os lançamentos e o recebimento desta fonte para a remessa ${rotulo}?`
          )
        ) {
          e.preventDefault()
        }
      }}
      className="grid gap-3"
    >
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <input type="hidden" name="remessa_id" value={remessaId} />
      <input type="hidden" name="fonte_id" value={fonteId} />
      <div className="grid gap-1.5">
        <Label htmlFor="remessa_destino">Remessa de destino</Label>
        <select
          id="remessa_destino"
          name="remessa_destino"
          required
          defaultValue=""
          className="border-input bg-background text-foreground h-9 w-full max-w-xs rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"
        >
          <option value="" disabled>
            Escolha a remessa…
          </option>
          {opcoes.map((o) => (
            <option key={o.id} value={o.id}>
              {o.rotulo}
            </option>
          ))}
        </select>
        <p className="text-muted-foreground text-xs">
          Move os lançamentos desta fonte e o registro de depósito para a
          remessa escolhida — use quando a relação foi importada na remessa
          errada.
        </p>
      </div>
      <div className="flex justify-end">
        <Button type="submit" size="sm" variant="outline" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <ArrowRightLeft />}
          Mover para a remessa escolhida
        </Button>
      </div>
    </form>
  )
}
