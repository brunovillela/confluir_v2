"use client"

import { useActionState } from "react"
import { CheckCheck, Eye, EyeOff, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

import { ocultarAction, tratarAction } from "./actions"

/** Providência de uma nota baixa — fica registrada com o nome de quem tratou. */
export function ProvidenciaForm({ id }: { id: string }) {
  const [estado, formAction, pendente] = useActionState(tratarAction, {})
  if (estado.ok) return <span className="text-success-fg text-xs">{estado.ok}</span>

  return (
    <form action={formAction} className="grid gap-2">
      <input type="hidden" name="id" value={id} />
      <Textarea
        name="providencia"
        rows={2}
        placeholder="O que foi feito (ex.: liguei para o hotel em 03/10; trocaram o colchão do quarto 12)"
        aria-label="Providência tomada"
        required
        minLength={5}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" variant="outline" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <CheckCheck />}
          Registrar providência
        </Button>
        {estado.erro && <span className="text-destructive text-xs">{estado.erro}</span>}
      </div>
    </form>
  )
}

/** Ocultar do hotel / Mostrar ao hotel, com confirmação. */
export function OcultarBotao({ id, oculta }: { id: string; oculta: boolean }) {
  const [estado, formAction, pendente] = useActionState(ocultarAction, {})

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        const pergunta = oculta
          ? "Mostrar este comentário ao hotel de novo? Ele continua anônimo."
          : "Ocultar este comentário do hotel? O hotel verá a nota e as etiquetas, mas no lugar do texto aparecerá \"Comentário moderado pelo sindicato\"."
        if (!confirm(pergunta)) e.preventDefault()
      }}
      className="flex flex-wrap items-center gap-2"
    >
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="ocultar" value={oculta ? "0" : "1"} />
      <Button type="submit" size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={pendente}>
        {pendente ? <Loader2 className="animate-spin" /> : oculta ? <Eye /> : <EyeOff />}
        {oculta ? "Mostrar ao hotel" : "Ocultar do hotel"}
      </Button>
      {estado.erro && <span className="text-destructive text-xs">{estado.erro}</span>}
    </form>
  )
}
