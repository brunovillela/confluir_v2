"use client"

import { useActionState } from "react"
import { Loader2 } from "lucide-react"

import { AcaoVisualizacao, formVisualizacao } from "@/components/acao-visualizacao"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"

import { alterarComunicadosPortal } from "./actions"

/** Receber ou não os comunicados da mala direta. */
export function ComunicadosForm({ preview = false, recebe }: { preview?: boolean; recebe: boolean }) {
  const [estado, formAction, pendente] = useActionState(alterarComunicadosPortal, {})

  return (
    <form {...formVisualizacao(preview, formAction)} className="grid gap-3">
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <input type="hidden" name="receber" value={recebe ? "0" : "1"} />
      <div>
        <AcaoVisualizacao preview={preview} nota="Receber ou não os comunicados é escolha do próprio filiado.">
          <Button type="submit" variant={recebe ? "outline" : "default"} disabled={pendente}>
            {pendente && <Loader2 className="animate-spin" />}
            {recebe ? "Não quero mais receber" : "Voltar a receber"}
          </Button>
        </AcaoVisualizacao>
      </div>
    </form>
  )
}
