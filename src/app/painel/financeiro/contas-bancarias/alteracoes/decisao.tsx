"use client"

import { useActionState, useState } from "react"
import { BadgeCheck, Loader2, X } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { confirmarEnvio } from "@/components/ui/confirmacao"

import type { EstadoAcao } from "../actions"
import { confirmarAlteracaoAction, recusarAlteracaoAction } from "./actions"

/** Confirmar (Financeiro ciente) ou recusar com motivo um pedido de conta. */
export function DecisaoAlteracao({ id, resumo }: { id: string; resumo: string }) {
  const [conf, confAction, confirmando] = useActionState<EstadoAcao, FormData>(confirmarAlteracaoAction, {})
  const [rec, recAction, recusando] = useActionState<EstadoAcao, FormData>(recusarAlteracaoAction, {})
  const [recusar, setRecusar] = useState(false)
  const erro = conf.erro ?? rec.erro
  return (
    <div className="grid gap-2">
      {erro && (
        <Alert variant="destructive">
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      )}
      {recusar ? (
        <form action={recAction} className="grid gap-2">
          <input type="hidden" name="id" value={id} />
          <textarea
            name="motivo"
            required
            minLength={5}
            rows={2}
            autoFocus
            placeholder="Motivo da recusa (a pessoa vê): titular diferente, conta não confere…"
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm shadow-xs outline-none"
          />
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setRecusar(false)} disabled={recusando}>
              Voltar
            </Button>
            <Button type="submit" variant="destructive" size="sm" disabled={recusando}>
              {recusando ? <Loader2 className="animate-spin" /> : <X />}
              Recusar pedido
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" size="sm" className="text-destructive" onClick={() => setRecusar(true)}>
            <X />
            Recusar
          </Button>
          <form action={confAction} onSubmit={(e) => confirmarEnvio(e, `Confirmar ${resumo}? A conta passa a valer para os pagamentos.`)}>
            <input type="hidden" name="id" value={id} />
            <Button type="submit" size="sm" disabled={confirmando}>
              {confirmando ? <Loader2 className="animate-spin" /> : <BadgeCheck />}
              Confirmar — Financeiro ciente
            </Button>
          </form>
        </div>
      )}
    </div>
  )
}
