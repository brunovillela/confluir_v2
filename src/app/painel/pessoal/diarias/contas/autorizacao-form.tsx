"use client"

import { useActionState } from "react"
import { Loader2, Save } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"

import { salvarAutorizacaoDiariasAction } from "./actions"

const OPCOES = [
  {
    valor: "remessa",
    titulo: "Quem aprova a remessa autoriza a ordem",
    texto:
      "A ordem de pagamento nasce A pagar, autorizada por quem aprovou a remessa, sem olhar a alçada financeira.",
  },
  {
    valor: "alcada",
    titulo: "A autorização da ordem depende da alçada financeira",
    texto:
      "Se o valor da remessa couber na alçada de quem a aprovou, a ordem nasce A pagar. Senão, vai para a fila de autorização das ordens.",
  },
] as const

/**
 * Regra de autorização das ordens das remessas de diárias. Quem não pode
 * mudar (sem configurações nem avaliação de ordens) vê a regra em vigor.
 */
export function AutorizacaoDiariasForm({
  modo,
  podeEditar,
}: {
  modo: "remessa" | "alcada"
  podeEditar: boolean
}) {
  const [estado, formAction, pendente] = useActionState(salvarAutorizacaoDiariasAction, {})
  return (
    <form action={formAction} className="grid gap-3">
      {OPCOES.map((o) => (
        <label
          key={o.valor}
          className="has-[:checked]:border-primary has-[:checked]:bg-primary/5 flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm"
        >
          <input
            type="radio"
            name="modo"
            value={o.valor}
            defaultChecked={modo === o.valor}
            disabled={!podeEditar}
            className="mt-1"
          />
          <span>
            <span className="font-medium">{o.titulo}</span>
            <span className="text-muted-foreground block text-xs">{o.texto}</span>
          </span>
        </label>
      ))}
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
      {podeEditar ? (
        <Button type="submit" size="sm" disabled={pendente} className="justify-self-start">
          {pendente ? <Loader2 className="animate-spin" /> : <Save />}
          Salvar regra
        </Button>
      ) : (
        <p className="text-muted-foreground text-xs">
          Só quem tem Configurações ou a avaliação das ordens de pagamento muda esta regra.
        </p>
      )}
    </form>
  )
}
