"use client"

import { useActionState } from "react"
import { Check, Loader2, X } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"

import { formatarMoeda } from "@/lib/formato"

import { avaliarDiaria } from "../actions"

export type InfracaoPendente = {
  id: string
  codigo: string | null
  valor: number
  descricao: string | null
  data: string | null
}

const SELECT =
  "border-input bg-background text-foreground h-9 rounded-md border px-3 text-sm shadow-xs outline-none"

export function AvaliacaoDiariaForm({
  solicitacaoId,
  valorTexto,
  infracoesPendentes = [],
}: {
  solicitacaoId: string
  valorTexto: string
  infracoesPendentes?: InfracaoPendente[]
}) {
  const [estado, formAction, pendente] = useActionState(avaliarDiaria, {})
  const totalPendente = infracoesPendentes.reduce((s, i) => s + i.valor, 0)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Avaliar solicitação</CardTitle>
        <CardDescription>
          Aprovar gera a ordem de pagamento de {valorTexto} direta ao
          funcionário (segue autorização e pagamento no financeiro). Reprovar
          exige o motivo.
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
                ? `Aprovar esta diária e gerar a ordem de pagamento de ${valorTexto}?`
                : "Reprovar esta solicitação de diária?"
            if (!confirm(pergunta)) e.preventDefault()
          }}
          className="grid gap-4"
        >
          {estado.erro && (
            <Alert variant="destructive">
              <AlertDescription>{estado.erro}</AlertDescription>
            </Alert>
          )}
          <input type="hidden" name="id" value={solicitacaoId} />

          {infracoesPendentes.length > 0 && (
            <div className="border-warning/40 bg-warning/5 grid gap-2 rounded-md border p-3">
              <p className="text-sm font-medium">
                Infrações de trânsito pendentes deste infrator (
                {formatarMoeda(totalPendente)})
              </p>
              <ul className="grid gap-1 text-sm">
                {infracoesPendentes.map((i) => (
                  <li
                    key={i.id}
                    className="flex flex-wrap items-center justify-between gap-2"
                  >
                    <span className="text-muted-foreground min-w-0">
                      <span className="tabular-nums">
                        {i.codigo ?? "(sem código)"}
                      </span>
                      {i.descricao ? ` — ${i.descricao}` : ""}
                    </span>
                    <span className="tabular-nums">{formatarMoeda(i.valor)}</span>
                  </li>
                ))}
              </ul>
              <div className="grid gap-1.5">
                <Label htmlFor="aplicar_descontos">Ao aprovar</Label>
                <select
                  id="aplicar_descontos"
                  name="aplicar_descontos"
                  defaultValue="sim"
                  className={SELECT}
                >
                  <option value="sim">
                    Descontar as infrações do valor da diária (até o limite dela)
                  </option>
                  <option value="nao">
                    Pagar a diária cheia (não descontar)
                  </option>
                </select>
                <p className="text-muted-foreground text-xs">
                  As infrações descontadas ficam quitadas; a ordem de pagamento
                  sai pelo valor líquido.
                </p>
              </div>
            </div>
          )}

          <div className="grid gap-1.5">
            <Label htmlFor="observacao">
              Observação (obrigatória para reprovar)
            </Label>
            <textarea
              id="observacao"
              name="observacao"
              rows={3}
              placeholder="Ex.: fora da política de viagens deste exercício"
              className="border-input bg-background text-foreground w-full rounded-md border px-3 py-2 text-sm shadow-xs outline-none"
            />
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
              Aprovar e gerar ordem
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
