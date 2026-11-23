"use client"

import { useActionState, useState } from "react"
import { Loader2, Send } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { type EstadoForm } from "@/lib/contas"

import { enviarPedidoAction } from "./actions"

/** O formulário de um pedido: o quê, os detalhes e para quando. */
export function PedidoForm({ formularioId, nome }: { formularioId: string; nome: string }) {
  const [estado, enviar, enviando] = useActionState<EstadoForm, FormData>(enviarPedidoAction, {})
  const [aberto, setAberto] = useState(false)
  if (!aberto) {
    return (
      <Button type="button" size="sm" className="justify-self-start" onClick={() => setAberto(true)}>
        <Send />
        Fazer um pedido
      </Button>
    )
  }
  return (
    <form action={enviar} className="grid gap-3">
      <input type="hidden" name="formulario_id" value={formularioId} />
      <div className="grid gap-1.5">
        <Label htmlFor={`titulo-${formularioId}`}>O que você precisa</Label>
        <Input id={`titulo-${formularioId}`} name="titulo" required maxLength={150} placeholder={`Resumo do pedido para ${nome}`} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`descricao-${formularioId}`}>Detalhes</Label>
        <Textarea id={`descricao-${formularioId}`} name="descricao" rows={4} maxLength={4000} placeholder="O que, para quem, onde, links e o que mais ajudar" />
      </div>
      <div className="grid gap-1.5 sm:max-w-56">
        <Label htmlFor={`prazo-${formularioId}`}>Para quando (opcional)</Label>
        <Input id={`prazo-${formularioId}`} name="prazo" type="date" className="[color-scheme:light] dark:[color-scheme:dark]" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={enviando}>
          {enviando ? <Loader2 className="animate-spin" /> : <Send />}
          Enviar pedido
        </Button>
        <Button type="button" variant="ghost" onClick={() => setAberto(false)}>
          Fechar
        </Button>
        {estado.erro && <span className="text-destructive text-sm">{estado.erro}</span>}
        {estado.ok && <span className="text-success-fg text-sm">{estado.ok}</span>}
      </div>
    </form>
  )
}
