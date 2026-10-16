"use client"

import { useActionState } from "react"
import { CheckCheck, Loader2, Send } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { confirmarEnvio } from "@/components/ui/confirmacao"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { type EstadoForm } from "@/lib/contas"

import { enviarCompetenciaAction, receberCompetenciaAction } from "./actions"

function Retorno({ estado }: { estado: EstadoForm }) {
  if (estado.erro) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{estado.erro}</AlertDescription>
      </Alert>
    )
  }
  if (estado.ok) {
    return (
      <Alert className="border-success/40 text-success-fg">
        <AlertDescription>{estado.ok}</AlertDescription>
      </Alert>
    )
  }
  return null
}

export function EnviarCompetenciaForm({
  competencia,
  rotulo,
  total,
  antesDoCorte,
}: {
  competencia: string
  rotulo: string
  total: number
  antesDoCorte: boolean
}) {
  const [estado, formAction, pendente] = useActionState(enviarCompetenciaAction, {})
  if (estado.ok) return <Retorno estado={estado} />
  return (
    <form
      action={formAction}
      className="grid gap-3"
      onSubmit={(e) =>
        confirmarEnvio(e, {
          titulo: `Enviar o movimento de ${rotulo} (${total} item(ns))?`,
          descricao:
            (antesDoCorte ? "Ainda não chegou o dia do corte (15). " : "") +
            "Enviada, a competência fica congelada como foi entregue. O que for lançado depois vai para a competência seguinte, marcado como retroativo.",
          confirmar: "Enviar",
        })
      }
    >
      <input type="hidden" name="competencia" value={competencia} />
      <div className="grid gap-1.5">
        <Label htmlFor="observacao">Observação para a contabilidade (opcional)</Label>
        <Textarea id="observacao" name="observacao" rows={3} placeholder="Ex.: reajuste do ACT a partir deste mês; conferir o salário de todos." />
      </div>
      <Retorno estado={estado} />
      <Button type="submit" disabled={pendente} className="justify-self-start">
        {pendente ? <Loader2 className="animate-spin" /> : <Send />}
        Enviar à contabilidade
      </Button>
    </form>
  )
}

export function ReceberCompetenciaBotao({ competencia }: { competencia: string }) {
  const [estado, formAction, pendente] = useActionState(receberCompetenciaAction, {})
  if (estado.ok) return <Retorno estado={estado} />
  return (
    <form action={formAction} className="grid gap-2">
      <input type="hidden" name="competencia" value={competencia} />
      <Retorno estado={estado} />
      <Button type="submit" disabled={pendente} className="justify-self-start">
        {pendente ? <Loader2 className="animate-spin" /> : <CheckCheck />}
        Marcar como recebido
      </Button>
    </form>
  )
}
