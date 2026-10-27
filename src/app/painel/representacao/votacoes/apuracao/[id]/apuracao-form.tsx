"use client"

import { useActionState, useState } from "react"
import { CheckCircle2, Loader2, Lock, Unlock } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

import { encerrarApuracaoAction, reabrirApuracaoAction } from "./actions"
import { useEnvioFormulario } from "@/hooks/use-envio-formulario"

export function ApuracaoForm({
  assembleiaId,
  encerrada,
  disponivel = true,
}: {
  assembleiaId: string
  encerrada: boolean
  disponivel?: boolean
}) {
  const [estEnc, actEnc, pendEnc] = useActionState(encerrarApuracaoAction, {})
  const envio1 = useEnvioFormulario(actEnc, estEnc)
  const [estReab, actReab, pendReab] = useActionState(reabrirApuracaoAction, {})
  const envio2 = useEnvioFormulario(actReab, estReab)
  const [reabrindo, setReabrindo] = useState(false)
  const [motivo, setMotivo] = useState("")

  if (encerrada) {
    return (
      <div className="grid gap-4">
        <Alert className="border-success/40 text-success-fg">
          <CheckCircle2 className="size-4" />
          <AlertDescription>
            Apuração <strong>encerrada</strong> — o resultado final (por opção,
            com branco e nulo) está visível ao filiado em Minhas votações.
          </AlertDescription>
        </Alert>
        {estReab.erro && (
          <Alert variant="destructive">
            <AlertDescription>{estReab.erro}</AlertDescription>
          </Alert>
        )}
        {reabrindo ? (
          <form action={actReab} {...envio2} className="grid gap-2">
            <input type="hidden" name="assembleia_id" value={assembleiaId} />
            <Label htmlFor="motivo-reabertura">Motivo da reabertura</Label>
            <Textarea
              id="motivo-reabertura"
              name="motivo"
              required
              minLength={5}
              maxLength={2000}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ex.: a comissão eleitoral pediu recontagem da urna 2 (ata de 20/10)."
            />
            <p className="text-muted-foreground text-xs">
              Fica no livro da apuração, com o seu nome, a hora e o resultado
              que deixa de valer. Não se apaga.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="submit"
                variant="outline"
                size="sm"
                disabled={pendReab || motivo.trim().length < 5}
              >
                {pendReab ? <Loader2 className="animate-spin" /> : <Unlock />}
                Confirmar reabertura
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setReabrindo(false)}>
                Cancelar
              </Button>
            </div>
          </form>
        ) : (
          <div>
            <Button type="button" variant="outline" size="sm" onClick={() => setReabrindo(true)}>
              <Unlock />
              Reabrir apuração
            </Button>
          </div>
        )}
      </div>
    )
  }

  return (
    <form action={actEnc} {...envio1} className="grid gap-4">
      <input type="hidden" name="assembleia_id" value={assembleiaId} />
      {estEnc.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estEnc.erro}</AlertDescription>
        </Alert>
      )}
      <p className="text-muted-foreground text-sm">
        A contagem acima soma os votos digitais/online e o que os apuradores
        lançaram nas urnas físicas (por opção, com branco e nulo). Ao encerrar,
        esse resultado é congelado e liberado ao filiado, o banco calcula o
        hash dele (para qualquer pessoa conferir depois) e roda a conferência
        da votação.
      </p>
      {!disponivel && (
        <Alert variant="warning">
          <AlertDescription>
            A apuração só pode ser encerrada após o término da assembleia.
          </AlertDescription>
        </Alert>
      )}
      <div>
        <Button type="submit" disabled={pendEnc || !disponivel}>
          {pendEnc ? <Loader2 className="animate-spin" /> : <Lock />}
          Encerrar apuração
        </Button>
      </div>
    </form>
  )
}
