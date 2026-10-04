"use client"

import { useActionState } from "react"
import { CheckCheck, Loader2, RotateCcw, Send } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { confirmarEnvio } from "@/components/ui/confirmacao"
import { ErroNoCampo } from "@/components/ui/erro-no-campo"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

import { reabrirAtendimentoAction, responderAtendimentoAction } from "./actions"

/** Resposta da entidade: envia e mantém aberta, ou envia e conclui. */
export function RespostaAtendimentoForm({ atendimentoId, concluida }: { atendimentoId: string; concluida: boolean }) {
  const [estado, action, enviando] = useActionState(responderAtendimentoAction, {})
  const [estadoReabrir, reabrir, reabrindo] = useActionState(reabrirAtendimentoAction, {})

  if (concluida) {
    return (
      <form action={reabrir} className="grid gap-3">
        <input type="hidden" name="atendimento_id" value={atendimentoId} />
        <p className="text-muted-foreground text-sm">Esta solicitação está concluída. Reabra para continuar a conversa.</p>
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
    <form action={action} className="grid gap-3" key={estado.ok ?? "form"}>
      <input type="hidden" name="atendimento_id" value={atendimentoId} />
      <ErroNoCampo estado={estado} />
      <div className="grid gap-1.5">
        <Label htmlFor="texto">Resposta ao filiado</Label>
        <Textarea id="texto" name="texto" rows={4} placeholder="O filiado lê esta mensagem no portal e recebe um aviso." />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="anexo">Anexo (opcional)</Label>
        <Input id="anexo" name="anexo" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,.docx,.xlsx,.txt" />
      </div>
      {estado.erro && !estado.campo && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      {estado.ok && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>{estado.ok}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" name="acao" value="responder" disabled={enviando}>
          {enviando ? <Loader2 className="animate-spin" /> : <Send />}
          Responder
        </Button>
        <Button
          type="submit"
          name="acao"
          value="concluir"
          variant="outline"
          disabled={enviando}
          onClick={(e) => confirmarEnvio(e, "Concluir a solicitação? O filiado é avisado e não poderá mais responder nela.")}
        >
          <CheckCheck />
          Responder e concluir
        </Button>
      </div>
    </form>
  )
}
