"use client"

import { useActionState, useState } from "react"
import { Check, Loader2, Merge, ShieldCheck, Undo2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useEnvioFormulario } from "@/hooks/use-envio-formulario"

import {
  conferirContasAction,
  corrigirTitularAction,
  desfazerConferenciaAction,
  juntarContasAction,
  type EstadoAcao,
} from "./actions"

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

/** "Conferida": aceita a conta como está, com o motivo; ela sai da lista e a auditoria para de alertar. */
export function BotaoConferir({ contas }: { contas: string[] }) {
  const [aberto, setAberto] = useState(false)
  const [estado, acao, pendente] = useActionState<EstadoAcao, FormData>(conferirContasAction, {})
  const envio = useEnvioFormulario(acao, estado)
  if (estado.ok) return <span className="text-success-fg text-xs">{estado.ok}</span>
  if (!aberto) {
    return (
      <div>
        <Button type="button" size="sm" variant="ghost" onClick={() => setAberto(true)}>
          <ShieldCheck />
          Está certa
        </Button>
      </div>
    )
  }
  return (
    <form action={acao} {...envio} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="contas" value={contas.join(",")} />
      <Input name="obs" placeholder="Por quê? Ex.: conta do cônjuge, autorizada por e-mail" className="h-8 min-w-64 flex-1" autoFocus />
      <Button type="submit" size="sm" variant="outline" disabled={pendente}>
        {pendente ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
        Marcar conferida
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => setAberto(false)}>
        Cancelar
      </Button>
      {estado.erro && <span className="text-destructive text-xs">{estado.erro}</span>}
    </form>
  )
}

/** Desfaz a conferência: a conta volta para a lista. */
export function BotaoDesfazerConferencia({ conta }: { conta: string }) {
  const [estado, acao, pendente] = useActionState<EstadoAcao, FormData>(desfazerConferenciaAction, {})
  const envio = useEnvioFormulario(acao, estado)
  if (estado.ok) return <span className="text-success-fg text-xs">{estado.ok}</span>
  return (
    <form action={acao} {...envio} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="conta" value={conta} />
      <Button type="submit" size="sm" variant="ghost" disabled={pendente}>
        {pendente ? <Loader2 className="animate-spin" /> : <Undo2 />}
        Desfazer
      </Button>
      {estado.erro && <span className="text-destructive text-xs">{estado.erro}</span>}
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
