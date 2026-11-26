"use client"

import { useActionState, useState } from "react"
import { Loader2, LockKeyhole, LockKeyholeOpen } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { confirmarEnvio } from "@/components/ui/confirmacao"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useEnvioFormulario } from "@/hooks/use-envio-formulario"

import { fecharInscricoesAction, reabrirInscricoesAction } from "../actions"

/**
 * Fechar / reabrir as inscrições à mão (26/11/2026). Fechar abre uma caixa que
 * avisa o efeito — quem ainda não se inscreveu perde o caminho — e aceita um
 * recado opcional, mostrado a quem tentar se inscrever. Reabrir confirma sem
 * tom de alerta: é desfazer o fechamento.
 */
export function FecharInscricoesForm({ eventoId }: { eventoId: string }) {
  const [aberto, setAberto] = useState(false)
  const [estado, formAction, pendente] = useActionState(fecharInscricoesAction, {})
  const envio = useEnvioFormulario(formAction, estado)

  // Fechou com sucesso: a página revalida, o botão (e a caixa com ele) some.
  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <LockKeyhole />
          Fechar inscrições
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Fechar as inscrições?</DialogTitle>
          <DialogDescription>
            As pessoas não conseguirão mais se inscrever — nem pelo link público,
            nem pelo portal do associado.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} {...envio} className="grid gap-4">
          <input type="hidden" name="id" value={eventoId} />
          <ul className="text-muted-foreground list-disc space-y-1 pl-5 text-sm">
            <li>Quem já se inscreveu continua inscrito, e ninguém recebe e-mail.</li>
            <li>A equipe continua podendo lançar convidados.</li>
            <li>Enquanto o prazo de inscrição configurado não terminar, dá para reabrir.</li>
          </ul>
          <div className="grid gap-1.5">
            <Label htmlFor="fechar-mensagem">Recado para quem tentar se inscrever (opcional)</Label>
            <Textarea
              id="fechar-mensagem"
              name="mensagem"
              maxLength={300}
              rows={3}
              placeholder="Ex.: Vagas esgotadas. Haverá nova turma em março — fale com a secretaria."
            />
            <span className="text-muted-foreground text-xs">
              Aparece logo depois de &quot;As inscrições foram encerradas.&quot; na
              página pública e no portal.
            </span>
          </div>
          {estado.erro && (
            <Alert variant="destructive">
              <AlertDescription>{estado.erro}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAberto(false)}>
              Voltar
            </Button>
            <Button type="submit" variant="destructive" disabled={pendente}>
              {pendente ? <Loader2 className="animate-spin" /> : <LockKeyhole />}
              Fechar inscrições
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function ReabrirInscricoesForm({ eventoId }: { eventoId: string }) {
  const [estado, formAction, pendente] = useActionState(reabrirInscricoesAction, {})
  const envio = useEnvioFormulario(formAction, estado, {
    antes: (e) =>
      confirmarEnvio(e, {
        titulo: "Reabrir as inscrições?",
        descricao:
          "O link público e o portal do associado voltam a aceitar inscrições, dentro do prazo e das vagas configurados.",
        confirmar: "Reabrir inscrições",
        destrutivo: false,
      }),
  })

  return (
    <form action={formAction} {...envio} className="grid gap-2">
      <input type="hidden" name="id" value={eventoId} />
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <div>
        <Button type="submit" size="sm" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <LockKeyholeOpen />}
          Reabrir inscrições
        </Button>
      </div>
    </form>
  )
}
