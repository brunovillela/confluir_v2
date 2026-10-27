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
import { confirmarEnvio } from "@/components/ui/confirmacao"
import { useEnvioFormulario } from "@/hooks/use-envio-formulario"

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

/**
 * Contracheque sugerido: o do mês até o dia 15 (corte do movimento da folha);
 * depois dele, o do mês seguinte.
 */
function contrachequeSugerido(): { mes: string; ano: string } {
  const [a, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" })
    .format(new Date())
    .split("-")
    .map(Number)
  const seguinte = d > 15
  const mes = seguinte ? (m % 12) + 1 : m
  const ano = seguinte && m === 12 ? a + 1 : a
  return { mes: MESES[mes - 1], ano: String(ano) }
}

export function AvaliacaoReembolsoForm({
  reembolsoId,
  valorReembolsavelTexto,
  calculoTexto,
}: {
  reembolsoId: string
  /** Valor reembolsável (porcentagem com teto) em pt-BR: default e máximo do aprovado. */
  valorReembolsavelTexto: string
  /** A conta por extenso (ex.: "70% de R$ 3.000,00, limitado ao teto de R$ 1.957,00"). */
  calculoTexto: string
}) {
  const [estado, formAction, pendente] = useActionState(
    avaliarReembolsoAction,
    {}
  )
  const envio = useEnvioFormulario(formAction, estado, {
    antes: (e) => {
      const decisao = (
        (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement
      )?.value
      const pergunta =
        decisao === "aprovar"
          ? "Aprovar este reembolso para pagamento em contracheque?"
          : "Reprovar esta solicitação de reembolso?"
      confirmarEnvio(e, pergunta)},
  })
  const sugerido = contrachequeSugerido()

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Avaliar solicitação</CardTitle>
        <CardDescription>
          Aprovar define o valor e o contracheque (mês e ano, obrigatórios) em
          que o reembolso será pago — é por ele que o reembolso entra no
          movimento da folha. O valor vem calculado pelo ACT ({calculoTexto})
          e pode ser reduzido — nunca aumentado. Reprovar exige o motivo.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          action={formAction} {...envio}
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
                defaultValue={valorReembolsavelTexto}
              />
              <p className="text-muted-foreground text-xs">Máximo: R$ {valorReembolsavelTexto}</p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="pagamento_mes">Contracheque — mês</Label>
              <select
                id="pagamento_mes"
                name="pagamento_mes"
                defaultValue={sugerido.mes}
                className={SELECT}
              >
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
                defaultValue={sugerido.ano}
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
  const envio2 = useEnvioFormulario(formAction, estado, {
    antes: (e) => {
        confirmarEnvio(e, "Marcar este reembolso como pago no contracheque? O funcionário será avisado.")
      },
  })

  return (
    <form
      action={formAction} {...envio2}
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
