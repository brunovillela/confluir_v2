"use client"

import { useActionState } from "react"
import { CheckCircle2, Loader2, Lock, Unlock } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"

import { encerrarApuracaoAction, reabrirApuracaoAction } from "./actions"

export function ApuracaoForm({
  assembleiaId,
  encerrada,
  disponivel = true,
}: {
  assembleiaId: string
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
            Apuração <strong>encerrada</strong> — o resultado final (por opção,
            com branco e nulo) está visível ao filiado em Minhas votações.
          </AlertDescription>
        </Alert>
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
        A contagem acima soma os votos digitais/online e o que os apuradores
        lançaram nas urnas físicas (por opção, com branco e nulo). Ao encerrar,
        esse resultado é congelado e liberado ao filiado.
      </p>
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
