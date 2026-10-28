"use client"

import { useActionState } from "react"
import { Check, Loader2, Merge } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useEnvioFormulario } from "@/hooks/use-envio-formulario"

import { corrigirTitularAction, juntarContasAction, type EstadoAcao } from "./actions"

/** "Juntar": a conta sugerida fica, as cópias saem e as ordens delas passam para ela. */
export function BotaoJuntar({ fica, copias }: { fica: string; copias: string[] }) {
  const [estado, acao, pendente] = useActionState<EstadoAcao, FormData>(juntarContasAction, {})
  const envio = useEnvioFormulario(acao, estado)
  return (
    <form action={acao} {...envio} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="fica" value={fica} />
      <input type="hidden" name="copias" value={copias.join(",")} />
      <Button type="submit" size="sm" variant="outline" disabled={pendente || Boolean(estado.ok)}>
        {pendente ? <Loader2 className="animate-spin" /> : <Merge />}
        Juntar
      </Button>
      {estado.erro && <span className="text-destructive text-xs">{estado.erro}</span>}
      {estado.ok && <span className="text-success-fg text-xs">{estado.ok}</span>}
    </form>
  )
}

/** Campo para gravar o CPF/CNPJ do titular de uma conta. */
export function CorrigirTitular({ conta, sugestao }: { conta: string; sugestao?: string | null }) {
  const [estado, acao, pendente] = useActionState<EstadoAcao, FormData>(corrigirTitularAction, {})
  const envio = useEnvioFormulario(acao, estado)
  if (estado.ok) return <span className="text-success-fg text-xs">{estado.ok}</span>
  return (
    <form action={acao} {...envio} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="conta" value={conta} />
      <Input name="documento" inputMode="numeric" defaultValue={sugestao ?? ""} placeholder="CPF/CNPJ do titular" className="h-8 w-48" />
      <Button type="submit" size="sm" variant="outline" disabled={pendente}>
        {pendente ? <Loader2 className="animate-spin" /> : <Check />}
        Gravar
      </Button>
      {estado.erro && <span className="text-destructive text-xs">{estado.erro}</span>}
    </form>
  )
}
