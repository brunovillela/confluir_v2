"use client"

import { useActionState } from "react"
import { Link2Off, Loader2, Send } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

import {
  desvincularTelegramAction,
  gerarCodigoTelegramAction,
} from "./actions"

export function TelegramVinculo({
  vinculado,
  configurado,
}: {
  vinculado: boolean
  configurado: boolean
}) {
  const [gerar, gerarAction, gerando] = useActionState(
    gerarCodigoTelegramAction,
    {}
  )
  const [desv, desvAction, desvinculando] = useActionState(
    desvincularTelegramAction,
    {}
  )

  if (!configurado) {
    return (
      <Alert variant="warning">
        <AlertDescription>
          O bot do Telegram ainda não está configurado no servidor. Assim que a
          entidade configurar, o vínculo aparece aqui.
        </AlertDescription>
      </Alert>
    )
  }

  // Já vinculado (e não acabou de desvincular nesta tela).
  if (vinculado && !desv.desvinculado) {
    return (
      <div className="grid gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="border-success/40 text-success-fg">
            Vinculado
          </Badge>
          <span className="text-muted-foreground text-sm">
            Seu Telegram está ligado à sua conta do Confluir.
          </span>
        </div>
        {desv.erro && (
          <Alert variant="destructive">
            <AlertDescription>{desv.erro}</AlertDescription>
          </Alert>
        )}
        <form action={desvAction}>
          <Button
            type="submit"
            variant="outline"
            size="sm"
            disabled={desvinculando}
          >
            {desvinculando ? <Loader2 className="animate-spin" /> : <Link2Off />}
            Desvincular
          </Button>
        </form>
      </div>
    )
  }

  return (
    <div className="grid gap-3">
      {desv.desvinculado && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Telegram desvinculado.</AlertDescription>
        </Alert>
      )}

      <p className="text-muted-foreground text-sm">
        Gere um link e abra no Telegram para ligar sua conta ao bot do Confluir.
        O link vale por 15 minutos.
      </p>

      {gerar.erro && (
        <Alert variant="destructive">
          <AlertDescription>{gerar.erro}</AlertDescription>
        </Alert>
      )}

      {gerar.codigo ? (
        <div className="border-border grid gap-2 rounded-md border p-3">
          {gerar.link ? (
            <Button asChild size="sm" className="w-fit">
              <a href={gerar.link} target="_blank" rel="noreferrer">
                <Send />
                Abrir no Telegram
              </a>
            </Button>
          ) : (
            <p className="text-sm">
              Abra o bot do Confluir no Telegram e envie:{" "}
              <code className="bg-muted rounded px-1.5 py-0.5 font-mono">
                /start {gerar.codigo}
              </code>
            </p>
          )}
          <p className="text-muted-foreground text-xs">
            Depois de confirmar no Telegram, recarregue esta página para ver o
            status como “Vinculado”.
          </p>
        </div>
      ) : (
        <form action={gerarAction}>
          <Button type="submit" size="sm" disabled={gerando}>
            {gerando ? <Loader2 className="animate-spin" /> : <Send />}
            Gerar link de vínculo
          </Button>
        </form>
      )}
    </div>
  )
}
