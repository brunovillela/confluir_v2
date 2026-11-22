"use client"

import { useActionState } from "react"
import { LogOut, Loader2, ShieldOff } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"

import { encerrarSessoesAction, redefinirSegundoFatorAction } from "./actions"
import { confirmarEnvio } from "@/components/ui/confirmacao"
import { useEnvioFormulario } from "@/hooks/use-envio-formulario"

/** Gestão: apaga o aplicativo autenticador da pessoa que perdeu o celular. */
export function RedefinirSegundoFator({ usuarioId, acessoId }: { usuarioId: string; acessoId: string }) {
  const [estado, acao, pendente] = useActionState(redefinirSegundoFatorAction, {})
  const envio = useEnvioFormulario(acao, estado, {
    antes: (e) => {
        confirmarEnvio(e, "Redefinir a verificação em duas etapas desta pessoa? O aplicativo atual deixa de valer e ela precisará cadastrar outro. Confirme só depois de ter certeza de quem está pedindo.")
      },
  })
  return (
    <form
      action={acao} {...envio}
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

/** Gestão: tira a pessoa de todos os aparelhos (ela entra de novo com a senha). */
export function EncerrarSessoes({ usuarioId }: { usuarioId: string }) {
  const [estado, acao, pendente] = useActionState(encerrarSessoesAction, {})
  const envio = useEnvioFormulario(acao, estado, {
    antes: (e) => {
      confirmarEnvio(e, "Encerrar as sessões desta pessoa? Ela sai do Confluir em todos os aparelhos (inclusive da área do filiado, se usar) e precisa entrar de novo.")
    },
  })
  return (
    <form action={acao} {...envio} className="grid gap-2">
      <input type="hidden" name="usuario_id" value={usuarioId} />
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
          {pendente ? <Loader2 className="animate-spin" /> : <LogOut />}
          Encerrar sessões
        </Button>
      </div>
    </form>
  )
}
