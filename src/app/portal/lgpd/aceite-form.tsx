"use client"

import { useActionState } from "react"
import { Loader2, ShieldCheck } from "lucide-react"

import { AcaoVisualizacao, formVisualizacao } from "@/components/acao-visualizacao"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"

import { registrarAceiteLgpd } from "./actions"

export function AceiteLgpdForm({ preview = false }: { preview?: boolean }) {
  const [estado, formAction, pendente] = useActionState(registrarAceiteLgpd, {})

  return (
    <form {...formVisualizacao(preview, formAction)} className="grid gap-3">
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <label className="flex items-start gap-2 text-sm">
        <Checkbox name="li_e_aceito" className="mt-0.5" />
        Li e aceito o tratamento dos meus dados pessoais pelo Sindipetro-NF nos
        termos acima.
      </label>
      <div>
        <AcaoVisualizacao
          preview={preview}
          nota="O aceite é um ato do próprio titular — a gestão não pode dá-lo por ele."
        >
          <Button type="submit" disabled={pendente}>
            {pendente ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
            Registrar aceite
          </Button>
        </AcaoVisualizacao>
      </div>
    </form>
  )
}
