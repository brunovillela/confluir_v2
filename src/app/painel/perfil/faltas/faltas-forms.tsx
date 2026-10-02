"use client"

import { useActionState } from "react"
import { Loader2, Send, X } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import { cancelarFaltaAction, solicitarFaltaAction } from "./actions"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full truncate rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

export function SolicitarFaltaForm({ tipos, hoje }: { tipos: string[]; hoje: string }) {
  const [estado, acao, pendente] = useActionState(solicitarFaltaAction, {})
  return (
    <form action={acao} className="grid gap-4">
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      {estado.ok && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>{estado.ok}</AlertDescription>
        </Alert>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="data">Data da falta *</Label>
          <Input id="data" name="data" type="date" required defaultValue={hoje} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="comprovacao">Comprovação (PDF ou foto, se tiver)</Label>
          <Input id="comprovacao" name="comprovacao" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" />
        </div>
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="tipo">Justificativa *</Label>
          <select id="tipo" name="tipo" required defaultValue="" className={SELECT}>
            <option value="" disabled>
              Escolha a justificativa prevista no acordo
            </option>
            {tipos.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="observacao">Observação</Label>
          <Input id="observacao" name="observacao" placeholder="Ex.: consulta da minha mãe às 14h" />
        </div>
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Send />}
          Enviar pedido
        </Button>
      </div>
    </form>
  )
}

export function CancelarFaltaBotao({ id }: { id: string }) {
  const [estado, acao, pendente] = useActionState(cancelarFaltaAction, {})
  return (
    <form
      action={acao}
      onSubmit={(e) => {
        if (!confirm("Cancelar este pedido de falta justificada?")) e.preventDefault()
      }}
      className="inline-flex items-center"
    >
      <input type="hidden" name="id" value={id} />
      {estado.erro && <span className="text-destructive mr-1 text-xs">{estado.erro}</span>}
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        disabled={pendente}
        className="text-destructive hover:text-destructive h-7 px-2"
      >
        {pendente ? <Loader2 className="animate-spin" /> : <X />}
        Cancelar
      </Button>
    </form>
  )
}
