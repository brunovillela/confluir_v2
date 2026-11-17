"use client"

import { useActionState, useState } from "react"
import { Loader2, Timer } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useEnvioFormulario } from "@/hooks/use-envio-formulario"

import { salvarPrazoCotacaoAction } from "./actions"

/**
 * Prazo para iniciar a cotação (16/11/2026): passado, a solicitação fica "fora
 * do prazo" aqui e o lembrete diário avisa os compradores e o coordenador do
 * departamento solicitante.
 */
export function PrazoCotacaoForm({ prazo, podeEditar }: { prazo: number | null; podeEditar: boolean }) {
  const [editando, setEditando] = useState(false)
  const [estado, formAction, pendente] = useActionState(salvarPrazoCotacaoAction, {})
  const envio = useEnvioFormulario(formAction, estado, { manter: true })
  // Salvou: volta para a frase com o prazo novo (ajuste na renderização, sem efeito).
  const [visto, setVisto] = useState(estado)
  if (estado !== visto) {
    setVisto(estado)
    if (estado.ok) setEditando(false)
  }
  const texto =
    prazo === null
      ? "Sem prazo para iniciar a cotação."
      : `Prazo para iniciar a cotação: ${prazo} dia${prazo === 1 ? "" : "s"} út${prazo === 1 ? "il" : "eis"} depois da solicitação. Passado o prazo, os compradores e o coordenador do departamento solicitante são avisados.`

  if (!editando) {
    return (
      <p className="text-muted-foreground mt-2 flex flex-wrap items-center gap-2 text-xs">
        <Timer className="size-3.5" />
        <span>{estado.ok ? `${estado.ok} ` : ""}{texto}</span>
        {podeEditar && (
          <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => setEditando(true)}>
            Alterar
          </Button>
        )}
      </p>
    )
  }

  return (
    <form
      action={formAction}
      {...envio}
      className="mt-2 flex flex-wrap items-end gap-2"
    >
      <div className="grid gap-1">
        <label htmlFor="prazo-cotacao" className="text-xs font-medium">
          Prazo para iniciar a cotação (dias úteis)
        </label>
        <Input
          id="prazo-cotacao"
          name="prazo"
          type="number"
          min={1}
          max={60}
          defaultValue={prazo ?? ""}
          placeholder="Sem prazo"
          className="w-40"
        />
      </div>
      <Button type="submit" size="sm" disabled={pendente}>
        {pendente && <Loader2 className="animate-spin" />}
        Salvar
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => setEditando(false)}>
        Cancelar
      </Button>
      <p className="text-muted-foreground w-full text-xs">Deixe em branco para não ter prazo.</p>
      {estado.erro && <p className="text-destructive w-full text-xs">{estado.erro}</p>}
    </form>
  )
}
