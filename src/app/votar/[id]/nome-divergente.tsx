"use client"

import { useActionState } from "react"
import { Loader2, MessageSquareWarning } from "lucide-react"

import { AcaoVisualizacao, formVisualizacao } from "@/components/acao-visualizacao"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"

import { avisarNomeDivergente, type EstadoDadosEleitor } from "./actions"

/**
 * Saída para quando o erro está na LISTA da empregadora: tentar de novo nunca
 * resolve, porque a comparação é contra um nome escrito errado. Aqui o eleitor
 * avisa o sindicato sem perder o acesso — corrigido o cadastro, ele volta pelo
 * mesmo link e vota.
 */
export function NomeDivergente({
  assembleiaId,
  nome,
  preview = false,
}: {
  assembleiaId: string
  /** O nome que a pessoa digitou na tentativa recusada. */
  nome: string
  preview?: boolean
}) {
  const [estado, formAction, pendente] = useActionState<EstadoDadosEleitor, FormData>(
    avisarNomeDivergente,
    {}
  )

  if (estado.ok) {
    return (
      <Alert variant="success" className="mt-3">
        <AlertDescription>{estado.ok}</AlertDescription>
      </Alert>
    )
  }

  return (
    <form {...formVisualizacao(preview, formAction)} className="mt-3 grid gap-2">
      <input type="hidden" name="assembleia_id" value={assembleiaId} />
      <input type="hidden" name="nome" value={nome} />
      <p className="text-muted-foreground text-xs">
        Escreveu certo e mesmo assim não passou? Pode ser o seu nome escrito errado na lista
        que a empresa enviou — nesse caso, só o sindicato corrige.
      </p>
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <AcaoVisualizacao preview={preview} nota="Na visualização, o aviso não é enviado.">
        <Button type="submit" variant="outline" size="sm" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <MessageSquareWarning />}
          Meu nome está diferente na lista
        </Button>
      </AcaoVisualizacao>
    </form>
  )
}
