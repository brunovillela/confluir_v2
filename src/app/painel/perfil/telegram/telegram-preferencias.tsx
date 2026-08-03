"use client"

import { useActionState } from "react"
import { Loader2, Save } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  EVENTOS_TELEGRAM,
  type PreferenciasTelegram,
} from "@/lib/telegram-eventos"

import { salvarPreferenciasTelegramAction } from "./actions"

export function TelegramPreferencias({
  prefs,
}: {
  prefs: PreferenciasTelegram
}) {
  const [estado, action, salvando] = useActionState(
    salvarPreferenciasTelegramAction,
    {}
  )

  return (
    <form action={action} className="grid gap-4">
      <p className="text-muted-foreground text-sm">
        Escolha o que você quer receber no Telegram. Desmarcar aqui não afeta o
        sino nem o e-mail — só o Telegram.
      </p>

      <div className="grid gap-3">
        {EVENTOS_TELEGRAM.map(({ chave, rotulo }) => (
          <label key={chave} className="flex items-center gap-2 text-sm">
            <Checkbox name={chave} defaultChecked={prefs[chave]} />
            {rotulo}
          </label>
        ))}
      </div>

      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      {estado.ok && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Preferências salvas.</AlertDescription>
        </Alert>
      )}

      <Button type="submit" size="sm" disabled={salvando} className="w-fit">
        {salvando ? <Loader2 className="animate-spin" /> : <Save />}
        Salvar preferências
      </Button>
    </form>
  )
}
