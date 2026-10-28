"use client"

import { useActionState } from "react"
import { Loader2 } from "lucide-react"

import { AcaoVisualizacao, formVisualizacao } from "@/components/acao-visualizacao"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"

import { alterarComunicadosPortal } from "./actions"
import { useEnvioFormulario } from "@/hooks/use-envio-formulario"

/**
 * Receber ou não os comunicados da mala direta. Mora aqui (LGPD) e aparece
 * também em Preferências de avisos (A176), com `voltar="preferencias"`: lá a
 * resposta fica na própria página em vez de voltar para a LGPD.
 */
export function ComunicadosForm({
  preview = false,
  recebe,
  voltar,
}: {
  preview?: boolean
  recebe: boolean
  voltar?: "preferencias"
}) {
  const [estado, formAction, pendente] = useActionState(alterarComunicadosPortal, {})
  const envio = useEnvioFormulario(formAction, estado)

  return (
    <form {...formVisualizacao(preview, formAction)} {...(preview ? {} : envio)} className="grid gap-3">
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
      <input type="hidden" name="receber" value={recebe ? "0" : "1"} />
      {voltar && <input type="hidden" name="voltar" value={voltar} />}
      <div>
        <AcaoVisualizacao preview={preview} nota="Receber ou não os comunicados é escolha do próprio filiado.">
          <Button
            type="submit"
            variant={recebe ? "outline" : "default"}
            disabled={pendente}
            className="pointer-coarse:min-h-11"
          >
            {pendente && <Loader2 className="animate-spin" />}
            {recebe ? "Não quero mais receber" : "Voltar a receber"}
          </Button>
        </AcaoVisualizacao>
      </div>
    </form>
  )
}
