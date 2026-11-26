"use client"

import { useActionState, useState } from "react"
import { Ban, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { confirmarEnvio } from "@/components/ui/confirmacao"
import { useEnvioFormulario } from "@/hooks/use-envio-formulario"

import { cancelarDevolvidaAction } from "./actions"

/** Cancelar com motivo a devolvida que não vai mais ser paga. */
export function CancelarDevolvida({ id, codigo }: { id: string; codigo: string | null }) {
  const [aberto, setAberto] = useState(false)
  const [estado, acao, pendente] = useActionState(cancelarDevolvidaAction, {})
  const envio = useEnvioFormulario(acao, estado, {
    antes: (e) =>
      confirmarEnvio(e, {
        titulo: `Cancelar a ordem ${codigo ?? ""}?`,
        descricao: "Ela não será paga. O motivo fica na trilha da ordem; quem lançou continua vendo o histórico.",
        confirmar: "Cancelar a ordem",
      }),
  })
  if (!aberto) {
    return (
      <Button type="button" size="sm" variant="ghost" className="text-destructive h-7 px-2 text-xs" onClick={() => setAberto(true)}>
        <Ban />
        Cancelar
      </Button>
    )
  }
  return (
    <form action={acao} {...envio} className="grid gap-1">
      <input type="hidden" name="id" value={id} />
      <div className="flex flex-wrap items-center gap-1">
        <Input
          name="motivo"
          required
          minLength={10}
          maxLength={400}
          autoFocus
          placeholder="Por que não será paga"
          className="h-8 w-56 text-sm"
        />
        <Button type="submit" size="sm" variant="destructive" disabled={pendente} className="h-8">
          {pendente ? <Loader2 className="animate-spin" /> : <Ban />}
          Cancelar
        </Button>
        <Button type="button" size="sm" variant="ghost" className="h-8" onClick={() => setAberto(false)}>
          Voltar
        </Button>
      </div>
      {estado.erro && <span className="text-destructive text-xs">{estado.erro}</span>}
    </form>
  )
}
