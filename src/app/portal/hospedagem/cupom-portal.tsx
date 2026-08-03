"use client"

import { useActionState } from "react"
import { Loader2, Ticket, X } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import { cancelarMeuCupom, solicitarCupom } from "./actions"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

export function SolicitarCupomForm({
  hoteis,
  hoje,
}: {
  hoteis: { id: string; nome: string | null }[]
  hoje: string
}) {
  const [estado, formAction, pendente] = useActionState(solicitarCupom, {})

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Solicitar cupom</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="grid gap-4 sm:grid-cols-2">
          {estado.erro && (
            <div className="sm:col-span-2">
              <Alert variant="destructive">
                <AlertDescription>{estado.erro}</AlertDescription>
              </Alert>
            </div>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor="hotel_id">Hotel *</Label>
            <select id="hotel_id" name="hotel_id" required defaultValue="" className={SELECT}>
              <option value="" disabled>
                Escolha o hotel parceiro
              </option>
              {hoteis.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.nome ?? "(sem nome)"}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="check_in">Check-in previsto *</Label>
            <Input id="check_in" name="check_in" type="date" min={hoje} required />
          </div>
          <div className="grid content-end pb-1 sm:col-span-2">
            <label className="text-muted-foreground flex items-center gap-2 text-sm">
              <Checkbox name="aceita_quarto_coletivo" />
              Aceito ficar em quarto coletivo (compartilhado com pessoas do mesmo
              sexo)
            </label>
          </div>
          <p className="text-muted-foreground text-xs sm:col-span-2">
            A retirada do cupom não garante a reserva nem o serviço — a reserva é
            confirmada pelo hotel. Mesmo aceitando quarto coletivo, a sua tarifa
            será a referente à quantidade de pessoas no quarto, conforme a
            reserva.
          </p>
          <div className="flex justify-end sm:col-span-2">
            <Button type="submit" disabled={pendente}>
              {pendente ? <Loader2 className="animate-spin" /> : <Ticket />}
              Solicitar cupom
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

export function CancelarMeuCupomBotao({ id }: { id: string }) {
  const [estado, formAction, pendente] = useActionState(cancelarMeuCupom, {})

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!confirm("Cancelar este cupom?")) e.preventDefault()
      }}
    >
      <input type="hidden" name="id" value={id} />
      {estado.erro && (
        <span className="text-destructive mr-2 text-xs">{estado.erro}</span>
      )}
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
