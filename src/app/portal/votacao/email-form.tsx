"use client"

import { useActionState } from "react"
import { CheckCircle2, Loader2, MailCheck } from "lucide-react"

import { AcaoVisualizacao, formVisualizacao } from "@/components/acao-visualizacao"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import {
  confirmarCodigoEmailVotacao,
  enviarCodigoEmailVotacao,
} from "./actions"

/**
 * E-mail de votação verificado. Quando a empresa não cede CPF nas listas de
 * aptos, o casamento é por e-mail — por isso ele precisa ser verificado aqui.
 */
export function EmailVotacaoForm({
  emailAtual,
  pendente,
  preview = false,
}: {
  emailAtual: string | null
  pendente: string | null
  /** "Ver como filiado": o e-mail é do associado — só ele verifica o dele. */
  preview?: boolean
}) {
  const [estEnvio, actEnvio, pendEnvio] = useActionState(
    enviarCodigoEmailVotacao,
    {}
  )
  const [estConf, actConf, pendConf] = useActionState(
    confirmarCodigoEmailVotacao,
    {}
  )

  const aguardandoCodigo = Boolean(pendente || estEnvio.ok?.includes("código"))

  return (
    <div className="grid gap-4">
      {emailAtual && (
        <p className="flex items-center gap-2 text-sm">
          <MailCheck className="text-success-fg size-4" />
          E-mail de votação verificado:{" "}
          <span className="font-medium">{emailAtual}</span>
        </p>
      )}

      <form {...formVisualizacao(preview, actEnvio)} className="grid gap-2 sm:max-w-md">
        <Label htmlFor="email">
          {emailAtual ? "Trocar o e-mail de votação" : "E-mail de votação"}
        </Label>
        {estEnvio.erro && (
          <Alert variant="destructive">
            <AlertDescription>{estEnvio.erro}</AlertDescription>
          </Alert>
        )}
        {estEnvio.ok && !aguardandoCodigo && (
          <Alert className="border-success/40 text-success-fg">
            <AlertDescription>{estEnvio.ok}</AlertDescription>
          </Alert>
        )}
        <div className="flex gap-2">
          <Input
            id="email"
            name="email"
            type="email"
            placeholder="seu@email.com"
            defaultValue={pendente ?? ""}
            required
          />
          <AcaoVisualizacao preview={preview} nota="">
            <Button type="submit" variant="outline" disabled={pendEnvio}>
              {pendEnvio ? <Loader2 className="animate-spin" /> : "Enviar código"}
            </Button>
          </AcaoVisualizacao>
        </div>
        <p className="text-muted-foreground text-xs">
          Se for o mesmo e-mail com que você entra no portal, ele já vale.
        </p>
      </form>

      {aguardandoCodigo && (
        <form {...formVisualizacao(preview, actConf)} className="grid gap-2 sm:max-w-md">
          <Label htmlFor="codigo">Código enviado por e-mail</Label>
          {estEnvio.ok && (
            <Alert>
              <AlertDescription>{estEnvio.ok}</AlertDescription>
            </Alert>
          )}
          {estConf.erro && (
            <Alert variant="destructive">
              <AlertDescription>{estConf.erro}</AlertDescription>
            </Alert>
          )}
          {estConf.ok && (
            <Alert className="border-success/40 text-success-fg">
              <CheckCircle2 className="size-4" />
              <AlertDescription>{estConf.ok}</AlertDescription>
            </Alert>
          )}
          <div className="flex gap-2">
            <Input
              id="codigo"
              name="codigo"
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              placeholder="000000"
              className="tracking-[0.4em]"
              required
            />
            <AcaoVisualizacao preview={preview} nota="">
              <Button type="submit" disabled={pendConf}>
                {pendConf ? <Loader2 className="animate-spin" /> : "Confirmar"}
              </Button>
            </AcaoVisualizacao>
          </div>
        </form>
      )}
    </div>
  )
}
