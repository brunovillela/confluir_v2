"use client"

import { useActionState } from "react"
import { Loader2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { mascaraCpf } from "@/lib/mascaras"

import { assinarRpaAction, pedirCodigoRpaAction, recusarRpaAction } from "./acoes-rpa"

export function AssinarRpaForm({ token }: { token: string }) {
  const [codigo, pedir, pedindo] = useActionState(pedirCodigoRpaAction, {})
  const [assin, assinar, assinando] = useActionState(assinarRpaAction, {})

  return (
    <div className="grid gap-5">
      <div className="grid gap-2">
        <p className="text-sm font-medium">1. Receba o código</p>
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
      </div>

      <form action={assinar} className="grid gap-3">
        <p className="text-sm font-medium">2. Confirme sua identidade e assine</p>
        <input type="hidden" name="token" value={token} />
        <div className="grid gap-3 sm:grid-cols-[9rem_1fr_11rem]">
          <div className="grid gap-1.5">
            <Label htmlFor="codigo">Código recebido</Label>
            <Input id="codigo" name="codigo" inputMode="numeric" maxLength={6} required className="text-center text-lg tracking-widest" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="nome">Seu nome completo</Label>
            <Input id="nome" name="nome" required autoComplete="name" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="cpf">Seu CPF</Label>
            <Input
              id="cpf"
              name="cpf"
              inputMode="numeric"
              required
              placeholder="000.000.000-00"
              onChange={(e) => {
                e.target.value = mascaraCpf(e.target.value)
              }}
            />
          </div>
        </div>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="aceite_conteudo" className="mt-1" required />
          <span>Li o recibo acima na íntegra e concordo com todo o seu conteúdo.</span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="aceite_eletronico" className="mt-1" required />
          <span>
            Aceito assinar este recibo eletronicamente e reconheço esta assinatura como válida e
            vinculante, com o mesmo efeito da assinatura de próprio punho (MP 2.200-2/2001, art. 10,
            § 2º).
          </span>
        </label>
        {assin.erro && (
          <Alert variant="destructive">
            <AlertDescription>{assin.erro}</AlertDescription>
          </Alert>
        )}
        <div>
          <Button type="submit" disabled={assinando}>
            {assinando && <Loader2 className="animate-spin" />}
            Assinar o recibo
          </Button>
        </div>
      </form>
    </div>
  )
}

export function RecusarRpaForm({ token }: { token: string }) {
  const [estado, recusar, recusando] = useActionState(recusarRpaAction, {})
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
