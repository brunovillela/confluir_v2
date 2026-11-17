"use client"

import { useActionState, useState } from "react"
import Link from "next/link"
import { Loader2, Pencil, Undo2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useEnvioFormulario } from "@/hooks/use-envio-formulario"

import { reenviarOrdemDevolvidaAction } from "./actions"

/**
 * Ordem devolvida pelo avaliador (16/11/2026): o motivo à vista e as duas
 * saídas — Editar compra (reenvia ao salvar) ou responder e reenviar, quando
 * não há nada a mudar na compra.
 */
export function OrdemDevolvida({
  processoId,
  ordemId,
  codigo,
  motivo,
  devolvidaPor,
  devolvidaEm,
  podeEditar,
  podeReenviar,
}: {
  processoId: string
  ordemId: string
  codigo: string | null
  motivo: string | null
  devolvidaPor: string | null
  devolvidaEm: string | null
  /** Pode editar a compra (antes da autorização, quem registrou). */
  podeEditar: boolean
  podeReenviar: boolean
}) {
  const [respondendo, setRespondendo] = useState(false)
  const [estado, formAction, pendente] = useActionState(reenviarOrdemDevolvidaAction, {})
  const envio = useEnvioFormulario(formAction, estado)
  return (
    <Alert variant="warning" id="ordem-devolvida" className="scroll-mt-24">
      <Undo2 />
      <AlertDescription>
        <div className="grid w-full gap-2">
          <p>
            <strong>Ordem {codigo ?? ""} devolvida</strong>
            {devolvidaPor ? ` por ${devolvidaPor}` : ""}
            {devolvidaEm ? ` em ${devolvidaEm}` : ""}. Motivo: <strong>{motivo ?? "não informado"}</strong>
          </p>
          <p className="text-xs">
            Corrija a compra em <strong>Editar compra</strong> (ao salvar, a ordem volta para autorização) ou, se não
            há o que mudar, responda ao avaliador e reenvie.
          </p>
          {(podeEditar || podeReenviar) && !respondendo && (
            <div className="flex flex-wrap gap-2">
              {podeEditar && (
                <Button asChild size="sm" variant="outline">
                  <Link href={`/painel/compras/${processoId}/editar`}>
                    <Pencil />
                    Editar compra
                  </Link>
                </Button>
              )}
              {podeReenviar && (
                <Button type="button" size="sm" variant="outline" onClick={() => setRespondendo(true)}>
                  Responder e reenviar
                </Button>
              )}
            </div>
          )}
          {respondendo && (
            <form action={formAction} {...envio} className="grid gap-2">
              <input type="hidden" name="processo_id" value={processoId} />
              <input type="hidden" name="ordem_id" value={ordemId} />
              <Label htmlFor={`resposta-${ordemId}`}>Resposta ao avaliador *</Label>
              <Textarea
                id={`resposta-${ordemId}`}
                name="resposta"
                required
                minLength={10}
                maxLength={1000}
                rows={2}
                placeholder="Ex.: a quantidade está na nota anexada (2 caixas com 12 unidades)."
              />
              {estado.erro && <p className="text-destructive text-xs">{estado.erro}</p>}
              <div className="flex gap-2">
                <Button type="submit" size="sm" disabled={pendente}>
                  {pendente && <Loader2 className="animate-spin" />}
                  Reenviar para autorização
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setRespondendo(false)}>
                  Cancelar
                </Button>
              </div>
            </form>
          )}
        </div>
      </AlertDescription>
    </Alert>
  )
}
