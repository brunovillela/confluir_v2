"use client"

import { useActionState } from "react"
import { Loader2, Trash2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"

import { excluirFuncao } from "../../actions"
import { confirmarEnvio } from "@/components/ui/confirmacao"
import { useEnvioFormulario } from "@/hooks/use-envio-formulario"

export function ExcluirFuncao({ id }: { id: string }) {
  const [estado, action, pend] = useActionState(excluirFuncao, {})
  const envio = useEnvioFormulario(action, estado, {
    antes: (e) => {
        confirmarEnvio(e, "Excluir esta função? Esta ação não pode ser desfeita.")
      },
  })
  return (
    <form
      action={action} {...envio}
    >
      {estado.erro && (
        <Alert variant="destructive" className="mb-3">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <input type="hidden" name="id" value={id} />
      <Button
        type="submit"
        variant="ghost"
        disabled={pend}
        className="text-destructive hover:text-destructive"
      >
        {pend ? <Loader2 className="animate-spin" /> : <Trash2 />}
        Excluir função
      </Button>
    </form>
  )
}
