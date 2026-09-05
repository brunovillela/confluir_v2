"use client"

import { useActionState } from "react"
import { Loader2, Trash2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"

import { excluirAtividade } from "../../actions"

export function ExcluirAtividade({ id }: { id: string }) {
  const [estado, action, pend] = useActionState(excluirAtividade, {})
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm("Excluir esta atividade e toda a análise SST? Não pode ser desfeito.")) {
          e.preventDefault()
        }
      }}
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
