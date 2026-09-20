"use client"

import { useActionState } from "react"
import { CheckCircle2, Loader2, Vote } from "lucide-react"

import { AcaoVisualizacao, formVisualizacao } from "@/components/acao-visualizacao"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import type { EstadoForm } from "@/lib/contas"
import type { PerguntaVoto } from "@/lib/db/votacao-portal"

export function CedulaForm({
  assembleiaId,
  perguntas,
  acao,
  camposOcultos,
  preview = false,
}: {
  assembleiaId: string
  perguntas: PerguntaVoto[]
  acao: (prev: EstadoForm, formData: FormData) => Promise<EstadoForm>
  camposOcultos?: Record<string, string>
  /** "Ver como filiado": a cédula aparece para o atendente mostrar como é,
   *  mas o voto não sai daqui — ele é secreto e pessoal. */
  preview?: boolean
}) {
  const [estado, action, pendente] = useActionState(acao, {})

  if (estado.ok) {
    return (
      <Alert className="border-success/40 text-success-fg">
        <CheckCircle2 className="size-4" />
        <AlertDescription>{estado.ok}</AlertDescription>
      </Alert>
    )
  }

  return (
    <form {...formVisualizacao(preview, action)} className="grid gap-6">
      <input type="hidden" name="assembleia_id" value={assembleiaId} />
      {camposOcultos &&
        Object.entries(camposOcultos).map(([nome, valor]) => (
          <input key={nome} type="hidden" name={nome} value={valor} />
        ))}
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}

      {perguntas.map((p, i) => (
        <fieldset key={p.id} className="grid gap-2">
          <legend className="text-sm font-medium">
            {i + 1}. {p.pergunta ?? "Pergunta"}
          </legend>
          <div className="grid gap-2">
            {p.opcoes.map((o) => (
              <label
                key={o.id}
                className="hover:bg-muted/50 flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm"
              >
                <input
                  type="radio"
                  name={`p_${p.id}`}
                  value={o.id}
                  required
                  className="size-4"
                />
                {o.texto ?? "(opção)"}
              </label>
            ))}
          </div>
        </fieldset>
      ))}

      <Alert>
        <AlertDescription>
          Seu voto é <strong>secreto</strong>: o sistema registra que você
          participou, nunca em quem votou. Confira suas escolhas — não é possível
          votar de novo depois de confirmar.
        </AlertDescription>
      </Alert>

      <div className="flex justify-end">
        <AcaoVisualizacao
          preview={preview}
          nota="O voto é secreto e pessoal — só o associado, na conta dele."
        >
          <Button type="submit" disabled={pendente}>
            {pendente ? <Loader2 className="animate-spin" /> : <Vote />}
            Confirmar voto
          </Button>
        </AcaoVisualizacao>
      </div>
    </form>
  )
}
