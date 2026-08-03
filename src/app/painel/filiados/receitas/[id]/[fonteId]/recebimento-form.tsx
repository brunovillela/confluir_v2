"use client"

import { useActionState } from "react"
import { Loader2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import { registrarRecebimento } from "./actions"

export function RecebimentoForm({
  remessaId,
  fonteId,
  atual,
}: {
  remessaId: string
  fonteId: string
  atual: { data: string | null; valor: number | null } | null
}) {
  const [estado, formAction, pendente] = useActionState(registrarRecebimento, {})

  return (
    <form action={formAction} className="grid gap-3">
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <input type="hidden" name="remessa_id" value={remessaId} />
      <input type="hidden" name="fonte_id" value={fonteId} />
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="grid gap-1.5">
          <Label htmlFor="data">Data do depósito *</Label>
          <Input
            id="data"
            name="data"
            type="date"
            defaultValue={(atual?.data ?? "").slice(0, 10)}
            required
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="valor">Valor depositado *</Label>
          <Input
            id="valor"
            name="valor"
            inputMode="decimal"
            placeholder="0,00"
            defaultValue={
              atual?.valor !== null && atual?.valor !== undefined
                ? atual.valor.toLocaleString("pt-BR", {
                    minimumFractionDigits: 2,
                  })
                : ""
            }
            required
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="comprovante">Comprovante do depósito</Label>
          <Input
            id="comprovante"
            name="comprovante"
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp"
          />
          <p className="text-muted-foreground text-xs">
            PDF ou imagem, até 3 MB — fica guardado no Supabase.
          </p>
        </div>
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={pendente} size="sm">
          {pendente && <Loader2 className="animate-spin" />}
          {atual ? "Atualizar recebimento" : "Registrar recebimento"}
        </Button>
      </div>
    </form>
  )
}
