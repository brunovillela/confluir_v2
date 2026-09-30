"use client"

import { useActionState } from "react"
import Link from "next/link"
import { Loader2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import { salvarPrazoEstornoAction } from "./actions"

export function PrazoEstornoForm({ dias }: { dias: number }) {
  const [estado, acao, pendente] = useActionState(salvarPrazoEstornoAction, {})
  return (
    <form action={acao} className="grid gap-3">
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <div className="grid max-w-xs gap-1.5">
        <Label htmlFor="dias">Dias após o pagamento *</Label>
        <Input id="dias" name="dias" type="number" min={1} max={365} required defaultValue={dias} />
      </div>
      <p className="text-muted-foreground text-xs">
        Enquanto o prazo estiver aberto, a ordem paga mostra o botão &quot;Registrar
        estorno&quot; para quem tem a permissão. O padrão é 15 dias.
      </p>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pendente}>
          {pendente && <Loader2 className="animate-spin" />}
          Salvar
        </Button>
        <Button type="button" size="sm" variant="ghost" asChild>
          <Link href="/painel/financeiro/estornos">Cancelar</Link>
        </Button>
      </div>
    </form>
  )
}
