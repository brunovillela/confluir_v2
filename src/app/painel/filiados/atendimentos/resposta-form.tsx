"use client"

import { useActionState } from "react"
import { CheckCheck, Loader2, RotateCcw, Send } from "lucide-react"

import { CampoAnexo, useAnexo } from "@/components/atendimento/campo-anexo"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { confirmarEnvio } from "@/components/ui/confirmacao"
import { ErroNoCampo } from "@/components/ui/erro-no-campo"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { PRAZO_REABRIR_DIAS, rotuloDias } from "@/lib/atendimento-constantes"

import { reabrirAtendimentoAction, responderAtendimentoAction } from "./actions"
import { useEnvioFormulario } from "@/hooks/use-envio-formulario"

/**
 * Resposta da entidade: envia e mantém aberta, ou envia e conclui.
 * `prazoReabrirDias`: o prazo do associado reabrir pelo portal, escolhido em
 * Filiados › Área do associado (0 = não reabre); sem ele, o padrão.
 */
export function RespostaAtendimentoForm({
  atendimentoId,
  concluida,
  prazoReabrirDias = PRAZO_REABRIR_DIAS,
}: {
  atendimentoId: string
  concluida: boolean
  prazoReabrirDias?: number
}) {
  const [estado, action, enviando] = useActionState(responderAtendimentoAction, {})
  const [estadoReabrir, reabrir, reabrindo] = useActionState(reabrirAtendimentoAction, {})
  const envio = useEnvioFormulario(reabrir, estadoReabrir)
  const anexo = useAnexo()
  const envio2 = useEnvioFormulario(action, estado, {
    antes: anexo.conferirEnvio,
  })

  if (concluida) {
    return (
      <form action={reabrir} {...envio} className="grid gap-3">
        <input type="hidden" name="atendimento_id" value={atendimentoId} />
        <p className="text-muted-foreground text-sm">Esta solicitação está concluída. Reabra para continuar a conversa — o filiado é avisado no portal.</p>
        {estadoReabrir.erro && (
          <Alert variant="destructive">
            <AlertDescription>{estadoReabrir.erro}</AlertDescription>
          </Alert>
        )}
        <div>
          <Button type="submit" variant="outline" disabled={reabrindo}>
            {reabrindo ? <Loader2 className="animate-spin" /> : <RotateCcw />}
            Reabrir
          </Button>
        </div>
      </form>
    )
  }

  return (
    <form action={action} {...envio2} className="grid gap-3" key={estado.ok ?? "form"}>
      <input type="hidden" name="atendimento_id" value={atendimentoId} />
      <ErroNoCampo estado={estado} />
      <div className="grid gap-1.5">
        <Label htmlFor="texto">Resposta ao filiado</Label>
        <Textarea
          id="texto"
          name="texto"
          rows={4}
          defaultValue={estado.valores?.texto}
          placeholder="O filiado lê esta mensagem no portal e recebe um aviso."
        />
      </div>
      <CampoAnexo anexo={anexo} />
      {estado.erro && !estado.campo && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      {estado.ok && (
        <Alert variant="success">
          <AlertDescription>{estado.ok}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" name="acao" value="responder" disabled={enviando || anexo.preparando}>
          {enviando ? <Loader2 className="animate-spin" /> : <Send />}
          Responder
        </Button>
        <Button
          type="submit"
          name="acao"
          value="concluir"
          variant="outline"
          disabled={enviando || anexo.preparando}
          onClick={(e) =>
            confirmarEnvio(
              e,
              prazoReabrirDias > 0
                ? `Concluir a solicitação? O filiado é avisado. Se não tiver resolvido, ele pode reabri-la pelo portal por até ${rotuloDias(prazoReabrirDias)}.`
                : "Concluir a solicitação? O filiado é avisado. Pelo portal ele não reabre: se o assunto voltar, abre uma nova solicitação."
            )
          }
        >
          <CheckCheck />
          Responder e concluir
        </Button>
      </div>
    </form>
  )
}
