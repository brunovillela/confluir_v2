"use client"

import { useActionState } from "react"
import { Ban, Loader2, Send, Upload } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { confirmarEnvio } from "@/components/ui/confirmacao"
import { ErroNoCampo } from "@/components/ui/erro-no-campo"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import { cancelarRemessaAction, marcarEnviadaAction, processarRetornoAction } from "../actions"

export function MarcarEnviadaBotao({ remessaId }: { remessaId: string }) {
  const [estado, action, pendente] = useActionState(marcarEnviadaAction, {})
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="remessa_id" value={remessaId} />
      <Button type="submit" variant="outline" size="sm" disabled={pendente}>
        {pendente ? <Loader2 className="animate-spin" /> : <Send />}
        Marcar como enviada ao banco
      </Button>
      {estado.erro && <span className="text-destructive text-xs">{estado.erro}</span>}
    </form>
  )
}

export function CancelarRemessaBotao({ remessaId, numero }: { remessaId: string; numero: number }) {
  const [estado, action, pendente] = useActionState(cancelarRemessaAction, {})
  return (
    <form action={action} className="flex items-center gap-2" onSubmit={(e) => confirmarEnvio(e, `Cancelar a remessa ${numero}? Se o arquivo já foi enviado ao banco, cancele lá também — as ordens voltam a ficar disponíveis aqui.`)}>
      <input type="hidden" name="remessa_id" value={remessaId} />
      <Button type="submit" variant="ghost" size="sm" disabled={pendente}>
        {pendente ? <Loader2 className="animate-spin" /> : <Ban />}
        Cancelar remessa
      </Button>
      {estado.erro && <span className="text-destructive text-xs">{estado.erro}</span>}
    </form>
  )
}

export function RetornoForm({ remessaId }: { remessaId: string }) {
  const [estado, action, pendente] = useActionState(processarRetornoAction, {})
  return (
    <form action={action} className="grid gap-3" key={estado.ok ?? "form"}>
      <input type="hidden" name="remessa_id" value={remessaId} />
      <ErroNoCampo estado={estado} />
      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <div className="grid gap-1.5">
          <Label htmlFor="arquivo">Arquivo de retorno (CNAB 240)</Label>
          <Input id="arquivo" name="arquivo" type="file" accept=".ret,.txt,.rem,.240" required />
        </div>
        <Button type="submit" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Upload />}
          Processar retorno
        </Button>
      </div>
      <p className="text-muted-foreground text-xs">
        Cada item é encontrado pelo &quot;Seu número&quot; (o código da ordem). Pago: a ordem vira Paga com a data e o valor do banco. Rejeitado: a ordem continua a pagar, com o motivo no histórico.
      </p>
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
    </form>
  )
}
