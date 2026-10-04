"use client"

import { useActionState } from "react"
import { Loader2, Save } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { EVENTOS_PORTAL, type PreferenciasPortal } from "@/lib/portal-avisos-eventos"

import { salvarPreferenciasPortalAction } from "./actions"

/** Um interruptor por tipo de aviso; o nome do campo é a chave do evento. */
export function PreferenciasForm({ prefs }: { prefs: PreferenciasPortal }) {
  const [estado, action, salvando] = useActionState(salvarPreferenciasPortalAction, {})

  return (
    <form action={action} className="grid gap-4">
      <ul className="divide-y">
        {EVENTOS_PORTAL.map((e) => (
          <li key={e.chave} className="flex min-h-14 items-center justify-between gap-4 py-3">
            <label htmlFor={`pref-${e.chave}`} className="min-w-0 flex-1 cursor-pointer">
              <span className="block text-sm font-medium">{e.rotulo}</span>
              <span className="text-muted-foreground block text-xs">{e.descricao}</span>
            </label>
            <Switch id={`pref-${e.chave}`} name={e.chave} defaultChecked={prefs[e.chave]} aria-label={`E-mail de ${e.rotulo}`} />
          </li>
        ))}
      </ul>

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

      <div>
        <Button type="submit" disabled={salvando} className="min-h-11 w-full sm:w-auto">
          {salvando ? <Loader2 className="animate-spin" /> : <Save />}
          Salvar
        </Button>
      </div>
    </form>
  )
}
