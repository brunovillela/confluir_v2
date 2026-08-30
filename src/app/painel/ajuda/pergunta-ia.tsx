"use client"

import { useActionState } from "react"
import { Loader2, Sparkles } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

import { perguntarAjudaAction } from "./actions"

export function PerguntaIA() {
  const [estado, formAction, pendente] = useActionState(perguntarAjudaAction, {})

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="text-primary size-5" />
          Pergunte à IA
        </CardTitle>
        <CardDescription>
          Não achou no manual? Escreva sua dúvida — a IA responde com base no
          manual e, quando a ação for de outra área, indica quem você pode
          procurar.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <form action={formAction} className="grid gap-2">
          <textarea
            name="pergunta"
            rows={2}
            required
            maxLength={1000}
            defaultValue={estado.pergunta ?? ""}
            placeholder="Ex.: Como lanço um contracheque? Quem pode aprovar uma ordem de pagamento?"
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm shadow-xs outline-none"
          />
          <div>
            <Button type="submit" size="sm" disabled={pendente}>
              {pendente ? <Loader2 className="animate-spin" /> : <Sparkles />}
              Perguntar
            </Button>
          </div>
        </form>

        {estado.erro && (
          <Alert variant="destructive">
            <AlertDescription>{estado.erro}</AlertDescription>
          </Alert>
        )}
        {estado.resposta && (
          <div className="bg-background rounded-lg border p-4">
            <p className="text-muted-foreground mb-1 text-xs font-medium">
              Resposta da IA
            </p>
            <p className="text-sm whitespace-pre-wrap">{estado.resposta}</p>
            <p className="text-muted-foreground mt-3 text-[11px]">
              Resposta gerada por IA a partir do manual — confira antes de agir.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
