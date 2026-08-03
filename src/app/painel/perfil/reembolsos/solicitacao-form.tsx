"use client"

import { useActionState } from "react"
import { Loader2, Send, X } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import { cancelarMeuReembolso, solicitarReembolso } from "./actions"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

export function SolicitarReembolsoForm({
  tipos,
}: {
  tipos: { id: string; rotulo: string }[]
}) {
  const [estado, formAction, pendente] = useActionState(solicitarReembolso, {})

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Solicitar reembolso</CardTitle>
        <CardDescription>
          Benefícios aprovados no acordo coletivo — anexe o comprovante da
          despesa; o pagamento aprovado entra no contracheque.
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
              <Label htmlFor="tipo_id">Tipo de reembolso *</Label>
              <select
                id="tipo_id"
                name="tipo_id"
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
              <Label htmlFor="valor_solicitado">Valor da despesa (R$) *</Label>
              <Input
                id="valor_solicitado"
                name="valor_solicitado"
                inputMode="decimal"
                placeholder="Ex.: 350,00"
                required
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="comprovante">
                Comprovante (PDF/JPG/PNG) *
              </Label>
              <Input
                id="comprovante"
                name="comprovante"
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/webp"
                required
              />
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="descricao">Descrição da despesa *</Label>
              <textarea
                id="descricao"
                name="descricao"
                rows={2}
                required
                placeholder="Ex.: mensalidade da creche — junho/2026"
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

export function CancelarReembolsoBotao({ id }: { id: string }) {
  const [estado, formAction, pendente] = useActionState(
    cancelarMeuReembolso,
    {}
  )

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!confirm("Cancelar esta solicitação de reembolso?")) {
          e.preventDefault()
        }
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
