"use client"

import { useActionState } from "react"
import { Loader2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

import {
  assinarCessaoAction,
  pedirCodigoCessaoAction,
  recusarCessaoAction,
} from "./acoes-cessao"

export function AssinarCessaoForm({ token }: { token: string }) {
  const [codigo, pedir, pedindo] = useActionState(pedirCodigoCessaoAction, {})
  const [assin, assinar, assinando] = useActionState(assinarCessaoAction, {})

  return (
    <div className="grid gap-4">
      {codigo.erro && (
        <Alert variant="destructive">
          <AlertDescription>{codigo.erro}</AlertDescription>
        </Alert>
      )}
      {codigo.ok && (
        <Alert variant="success">
          <AlertDescription>{codigo.ok}</AlertDescription>
        </Alert>
      )}
      <form action={pedir}>
        <input type="hidden" name="token" value={token} />
        <Button type="submit" variant="outline" disabled={pedindo}>
          {pedindo && <Loader2 className="animate-spin" />}
          Enviar código para o meu e-mail
        </Button>
      </form>

      {assin.erro && (
        <Alert variant="destructive">
          <AlertDescription>{assin.erro}</AlertDescription>
        </Alert>
      )}
      <form action={assinar} className="grid gap-3">
        <input type="hidden" name="token" value={token} />
        <div className="grid gap-1.5">
          <Label htmlFor="codigo">Código recebido</Label>
          <Input
            id="codigo"
            name="codigo"
            inputMode="numeric"
            maxLength={6}
            required
            className="w-36 text-center text-lg tracking-widest"
          />
        </div>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="aceite" className="mt-1" required />
          <span>
            Li o termo acima na íntegra e concordo em assiná-lo eletronicamente.
          </span>
        </label>
        <div>
          <Button type="submit" disabled={assinando}>
            {assinando && <Loader2 className="animate-spin" />}
            Assinar
          </Button>
        </div>
      </form>
    </div>
  )
}

export function RecusarCessaoForm({ token }: { token: string }) {
  const [estado, recusar, recusando] = useActionState(recusarCessaoAction, {})
  return (
    <form action={recusar} className="grid gap-3">
      <input type="hidden" name="token" value={token} />
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <div className="grid gap-1.5">
        <Label htmlFor="motivo">Motivo</Label>
        <Textarea id="motivo" name="motivo" rows={3} required />
      </div>
      <div>
        <Button type="submit" variant="outline" disabled={recusando}>
          {recusando && <Loader2 className="animate-spin" />}
          Recusar assinatura
        </Button>
      </div>
    </form>
  )
}
