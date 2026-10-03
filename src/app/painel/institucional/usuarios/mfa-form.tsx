"use client"

import { useActionState } from "react"
import { Loader2, ShieldOff } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"

import { redefinirSegundoFatorAction } from "./actions"

/** Gestão: apaga o aplicativo autenticador da pessoa que perdeu o celular. */
export function RedefinirSegundoFator({ usuarioId, acessoId }: { usuarioId: string; acessoId: string }) {
  const [estado, acao, pendente] = useActionState(redefinirSegundoFatorAction, {})
  return (
    <form
      action={acao}
      onSubmit={(e) => {
        if (
          !confirm(
            "Redefinir a verificação em duas etapas desta pessoa? O aplicativo atual deixa de valer e ela precisará cadastrar outro. Confirme só depois de ter certeza de quem está pedindo."
          )
        ) {
          e.preventDefault()
        }
      }}
      className="grid gap-2"
    >
      <input type="hidden" name="usuario_id" value={usuarioId} />
      <input type="hidden" name="acesso_id" value={acessoId} />
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      {estado.ok && (
        <Alert variant="success">
          <AlertDescription>{estado.ok}</AlertDescription>
        </Alert>
      )}
      <div>
        <Button type="submit" variant="outline" size="sm" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <ShieldOff />}
          Redefinir verificação em duas etapas
        </Button>
      </div>
    </form>
  )
}
