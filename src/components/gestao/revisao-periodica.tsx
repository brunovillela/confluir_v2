"use client"

import { useActionState } from "react"
import { Check, Loader2, Lock, PencilLine, Play, X } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { confirmarEnvio } from "@/components/ui/confirmacao"
import { ErroNoCampo } from "@/components/ui/erro-no-campo"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  abrirRevisaoAction,
  decidirRevisaoAction,
  encerrarRevisaoAction,
  tratarItemAction,
} from "@/app/painel/gestao/usuarios/revisao/periodica-actions"
import { useEnvioFormulario } from "@/hooks/use-envio-formulario"
import { type EstadoForm } from "@/lib/contas"

/** Formulários da revisão periódica de acessos (Gestão e Coordenação). */

function Retorno({ estado }: { estado: EstadoForm }) {
  if (estado.ok) {
    return (
      <Alert variant="success">
        <AlertDescription>{estado.ok}</AlertDescription>
      </Alert>
    )
  }
  if (estado.erro && !estado.campo) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{estado.erro}</AlertDescription>
      </Alert>
    )
  }
  return null
}

/** Resposta do revisor: ainda precisa, pode retirar ou precisa ajustar. */
export function RespostaItem({ itemId, nome, observacao }: { itemId: string; nome: string; observacao: string | null }) {
  const [estado, action, pendente] = useActionState<EstadoForm, FormData>(decidirRevisaoAction, {})
  const envio = useEnvioFormulario(action, estado, { manter: true })
  return (
    <form action={action} {...envio} className="grid gap-2">
      <ErroNoCampo estado={estado} />
      <input type="hidden" name="item_id" value={itemId} />
      <Label htmlFor={`obs-${itemId}`} className="sr-only">
        Observação sobre o acesso de {nome}
      </Label>
      <Textarea
        id={`obs-${itemId}`}
        name="observacao"
        defaultValue={observacao ?? ""}
        placeholder="Observação (obrigatória para ajustar: o que tirar ou mudar)"
        rows={2}
        maxLength={500}
        className="text-sm"
      />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" name="decisao" value="manter" size="sm" variant="outline" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Check />}
          Ainda precisa
        </Button>
        <Button type="submit" name="decisao" value="ajustar" size="sm" variant="outline" disabled={pendente}>
          <PencilLine />
          Precisa ajustar
        </Button>
        <Button type="submit" name="decisao" value="retirar" size="sm" variant="outline" disabled={pendente}>
          <X />
          Pode retirar
        </Button>
      </div>
      <Retorno estado={estado} />
    </form>
  )
}

/** A Gestão registra o que fez com o item. */
export function TratarItem({ itemId, sugestao }: { itemId: string; sugestao: string }) {
  const [estado, action, pendente] = useActionState<EstadoForm, FormData>(tratarItemAction, {})
  const envio = useEnvioFormulario(action, estado)
  return (
    <form action={action} {...envio} className="grid gap-2">
      <ErroNoCampo estado={estado} />
      <input type="hidden" name="item_id" value={itemId} />
      <div className="flex flex-wrap items-center gap-2">
        <Input name="tratamento" defaultValue={sugestao} placeholder="O que foi feito" className="h-8 w-64 text-sm" maxLength={300} aria-label="O que foi feito" />
        <Button type="submit" size="sm" variant="outline" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Check />}
          Resolvido
        </Button>
      </div>
      <Retorno estado={estado} />
    </form>
  )
}

export function AbrirRevisao({ tituloSugerido, prazoSugerido }: { tituloSugerido: string; prazoSugerido: string }) {
  const [estado, action, pendente] = useActionState<EstadoForm, FormData>(abrirRevisaoAction, {})
  const envio = useEnvioFormulario(action, estado, {
    antes: (e) => confirmarEnvio(e, "Abrir a revisão? Cada coordenador recebe a lista da equipe para confirmar."),
  })
  return (
    <form action={action} {...envio} className="grid gap-3">
      <ErroNoCampo estado={estado} />
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="titulo">Nome</Label>
          <Input id="titulo" name="titulo" defaultValue={tituloSugerido} className="w-56" maxLength={80} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="prazo">Prazo para os coordenadores</Label>
          <Input id="prazo" name="prazo" type="date" defaultValue={prazoSugerido} className="w-44" />
        </div>
        <Button type="submit" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Play />}
          Abrir revisão
        </Button>
      </div>
      <Retorno estado={estado} />
    </form>
  )
}

export function EncerrarRevisao({ cicloId, pendentes }: { cicloId: string; pendentes: number }) {
  const [estado, action, pendente] = useActionState<EstadoForm, FormData>(encerrarRevisaoAction, {})
  const envio = useEnvioFormulario(action, estado, {
    antes: (e) =>
      confirmarEnvio(
        e,
        pendentes
          ? `Ainda há ${pendentes} ${pendentes === 1 ? "item" : "itens"} sem resposta ou sem solução. Encerrar mesmo assim? Eles ficam registrados como estão.`
          : "Encerrar a revisão? Ela fica no histórico como registro."
      ),
  })
  return (
    <form action={action} {...envio} className="grid gap-2">
      <input type="hidden" name="ciclo_id" value={cicloId} />
      <div>
        <Button type="submit" size="sm" variant="outline" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Lock />}
          Encerrar revisão
        </Button>
      </div>
      <Retorno estado={estado} />
    </form>
  )
}
