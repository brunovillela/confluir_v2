"use client"

import { useActionState } from "react"
import { Loader2, Send, X } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import { cancelarMinhaDiaria, solicitarDiaria } from "./actions"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

export function SolicitarDiariaForm({
  tipos,
}: {
  tipos: { id: string; rotulo: string }[]
}) {
  const [estado, formAction, pendente] = useActionState(solicitarDiaria, {})

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Solicitar diária</CardTitle>
        <CardDescription>
          Descreva a atividade — a solicitação vai para avaliação do
          departamento de pessoal e, aprovada, gera a ordem de pagamento.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="grid gap-4">
          {estado.erro && (
            <Alert variant="destructive">
              <AlertDescription>{estado.erro}</AlertDescription>
            </Alert>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="diaria_id">Tipo de diária *</Label>
              <select
                id="diaria_id"
                name="diaria_id"
                required
                defaultValue=""
                className={SELECT}
              >
                <option value="" disabled>
                  Escolha o tipo
                </option>
                {tipos.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.rotulo}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="quantidade">Quantidade de diárias *</Label>
              <Input
                id="quantidade"
                name="quantidade"
                inputMode="decimal"
                placeholder="Ex.: 2"
                defaultValue="1"
                required
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="data_inicio">Início da atividade</Label>
              <Input id="data_inicio" name="data_inicio" type="date" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="data_termino">Término</Label>
              <Input id="data_termino" name="data_termino" type="date" />
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="motivo">Motivo *</Label>
              <textarea
                id="motivo"
                name="motivo"
                rows={3}
                required
                placeholder="Ex.: viagem ao Rio de Janeiro com pernoite para reunião da federação"
                className="border-input bg-background text-foreground w-full rounded-md border px-3 py-2 text-sm shadow-xs outline-none"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={pendente}>
              {pendente ? <Loader2 className="animate-spin" /> : <Send />}
              Enviar solicitação
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

export function CancelarDiariaBotao({ id }: { id: string }) {
  const [estado, formAction, pendente] = useActionState(cancelarMinhaDiaria, {})

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!confirm("Cancelar esta solicitação de diária?")) e.preventDefault()
      }}
      className="inline-flex items-center"
    >
      <input type="hidden" name="id" value={id} />
      {estado.erro && (
        <span className="text-destructive mr-1 text-xs">{estado.erro}</span>
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
