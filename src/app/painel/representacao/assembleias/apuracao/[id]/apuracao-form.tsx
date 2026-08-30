"use client"

import { useActionState } from "react"
import { CheckCircle2, Loader2, Lock, Unlock } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import { encerrarApuracaoAction, reabrirApuracaoAction } from "./actions"

type Resultado = {
  aprovado: number | null
  reprovado: number | null
  em_branco: number | null
  abstencao: number | null
  total_votos: number | null
}

const CAMPOS: { chave: keyof Resultado; rotulo: string }[] = [
  { chave: "aprovado", rotulo: "Aprovado" },
  { chave: "reprovado", rotulo: "Reprovado" },
  { chave: "em_branco", rotulo: "Em branco" },
  { chave: "abstencao", rotulo: "Abstenção" },
  { chave: "total_votos", rotulo: "Total de votos" },
]

export function ApuracaoForm({
  assembleiaId,
  resultado,
  encerrada,
  disponivel = true,
}: {
  assembleiaId: string
  resultado: Resultado
  encerrada: boolean
  disponivel?: boolean
}) {
  const [estEnc, actEnc, pendEnc] = useActionState(encerrarApuracaoAction, {})
  const [estReab, actReab, pendReab] = useActionState(reabrirApuracaoAction, {})

  if (encerrada) {
    return (
      <div className="grid gap-4">
        <Alert className="border-success/40 text-success-fg">
          <CheckCircle2 className="size-4" />
          <AlertDescription>
            Apuração <strong>encerrada</strong> — o resultado final está visível
            ao filiado em Minhas votações.
          </AlertDescription>
        </Alert>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-5">
          {CAMPOS.map((c) => (
            <div key={c.chave}>
              <dt className="text-muted-foreground text-xs">{c.rotulo}</dt>
              <dd className="font-medium tabular-nums">
                {resultado[c.chave] ?? "—"}
              </dd>
            </div>
          ))}
        </dl>
        {estReab.erro && (
          <Alert variant="destructive">
            <AlertDescription>{estReab.erro}</AlertDescription>
          </Alert>
        )}
        <form action={actReab}>
          <input type="hidden" name="assembleia_id" value={assembleiaId} />
          <Button type="submit" variant="outline" size="sm" disabled={pendReab}>
            {pendReab ? <Loader2 className="animate-spin" /> : <Unlock />}
            Reabrir apuração
          </Button>
        </form>
      </div>
    )
  }

  return (
    <form action={actEnc} className="grid gap-4">
      <input type="hidden" name="assembleia_id" value={assembleiaId} />
      {estEnc.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estEnc.erro}</AlertDescription>
        </Alert>
      )}
      <p className="text-muted-foreground text-sm">
        Confirme o resultado agregado da deliberação. Nas assembleias online, use
        a contagem acima como base; nas presenciais (urna/reunião), informe os
        números apurados.
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {CAMPOS.map((c) => (
          <div key={c.chave} className="grid gap-1.5">
            <Label htmlFor={c.chave}>{c.rotulo}</Label>
            <Input
              id={c.chave}
              name={c.chave}
              inputMode="numeric"
              defaultValue={resultado[c.chave] ?? ""}
              placeholder="0"
            />
          </div>
        ))}
      </div>
      {!disponivel && (
        <Alert variant="warning">
          <AlertDescription>
            A apuração só pode ser encerrada após o término da rodada.
          </AlertDescription>
        </Alert>
      )}
      <div>
        <Button type="submit" disabled={pendEnc || !disponivel}>
          {pendEnc ? <Loader2 className="animate-spin" /> : <Lock />}
          Encerrar apuração
        </Button>
      </div>
    </form>
  )
}
