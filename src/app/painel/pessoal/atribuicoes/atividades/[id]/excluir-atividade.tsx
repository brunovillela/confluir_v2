"use client"

import { useActionState } from "react"
import { Loader2, Trash2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"

import { excluirAtividade } from "../../actions"
import { confirmarEnvio } from "@/components/ui/confirmacao"
import { useEnvioFormulario } from "@/hooks/use-envio-formulario"

export function ExcluirAtividade({ id }: { id: string }) {
  const [estado, action, pend] = useActionState(excluirAtividade, {})
  const envio = useEnvioFormulario(action, estado, {
    antes: (e) => {
        confirmarEnvio(e, "Excluir esta atividade e toda a análise SST? Não pode ser desfeito.")
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
        Excluir atividade
      </Button>
    </form>
  )
}
