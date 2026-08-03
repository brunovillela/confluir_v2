"use client"

import { useActionState } from "react"
import { BadgeCheck, Check, Loader2, X } from "lucide-react"

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

import { avaliarReembolsoAction, marcarPagoAction } from "../actions"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

const MESES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
]

export function AvaliacaoReembolsoForm({
  reembolsoId,
  valorSolicitadoTexto,
  tetoTexto,
}: {
  reembolsoId: string
  /** Valor solicitado já em pt-BR, usado como default do aprovado. */
  valorSolicitadoTexto: string
  tetoTexto: string | null
}) {
  const [estado, formAction, pendente] = useActionState(
    avaliarReembolsoAction,
    {}
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Avaliar solicitação</CardTitle>
        <CardDescription>
          Aprovar define o valor e a referência do contracheque em que o
          reembolso será pago{tetoTexto ? ` (teto do ACT: ${tetoTexto})` : ""}.
          Reprovar exige o motivo.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          action={formAction}
          onSubmit={(e) => {
            const decisao = (
              (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement
            )?.value
            const pergunta =
              decisao === "aprovar"
                ? "Aprovar este reembolso para pagamento em contracheque?"
                : "Reprovar esta solicitação de reembolso?"
            if (!confirm(pergunta)) e.preventDefault()
          }}
          className="grid gap-4"
        >
          {estado.erro && (
            <Alert variant="destructive">
              <AlertDescription>{estado.erro}</AlertDescription>
            </Alert>
          )}
          <input type="hidden" name="id" value={reembolsoId} />

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-1.5">
              <Label htmlFor="valor_aprovado">Valor aprovado (R$)</Label>
              <Input
                id="valor_aprovado"
                name="valor_aprovado"
                inputMode="decimal"
                defaultValue={valorSolicitadoTexto}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="pagamento_mes">Contracheque — mês</Label>
              <select
                id="pagamento_mes"
                name="pagamento_mes"
                defaultValue=""
                className={SELECT}
              >
                <option value="">A definir</option>
                {MESES.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="pagamento_ano">Ano</Label>
              <Input
                id="pagamento_ano"
                name="pagamento_ano"
                inputMode="numeric"
                placeholder="Ex.: 2026"
              />
            </div>
            <div className="grid gap-1.5 sm:col-span-3">
              <Label htmlFor="observacao">
                Observação (obrigatória para reprovar)
              </Label>
              <textarea
                id="observacao"
                name="observacao"
                rows={2}
                placeholder="Ex.: nota fiscal fora do período do ACT"
                className="border-input bg-background text-foreground w-full rounded-md border px-3 py-2 text-sm shadow-xs outline-none"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2">
            <Button
              type="submit"
              name="decisao"
              value="reprovar"
              variant="outline"
              disabled={pendente}
              className="text-destructive hover:text-destructive"
            >
              {pendente ? <Loader2 className="animate-spin" /> : <X />}
              Reprovar
            </Button>
            <Button
              type="submit"
              name="decisao"
              value="aprovar"
              disabled={pendente}
            >
              {pendente ? <Loader2 className="animate-spin" /> : <Check />}
              Aprovar para o contracheque
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

export function MarcarPagoBotao({ reembolsoId }: { reembolsoId: string }) {
  const [estado, formAction, pendente] = useActionState(marcarPagoAction, {})

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (
          !confirm(
            "Marcar este reembolso como pago no contracheque? O funcionário será avisado."
          )
        ) {
          e.preventDefault()
        }
      }}
      className="grid gap-2"
    >
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
      <input type="hidden" name="id" value={reembolsoId} />
      <Button type="submit" disabled={pendente} className="justify-self-end">
        {pendente ? <Loader2 className="animate-spin" /> : <BadgeCheck />}
        Marcar como pago no contracheque
      </Button>
    </form>
  )
}
