"use client"

import { useActionState } from "react"
import Link from "next/link"
import { Check, Loader2, QrCode } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"

import { confirmarOfertaPublicaAction, type EstadoOfertaPublica } from "./actions"

export function ConfirmarOfertaPublica({ token }: { token: string }) {
  const [estado, formAction, pendente] = useActionState<EstadoOfertaPublica, FormData>(
    confirmarOfertaPublicaAction,
    {}
  )

  if (estado.ok) {
    return (
      <div className="grid gap-3">
        <Alert variant="success">
          <AlertDescription>
            {estado.ok} Na chegada, apresente o QR Code da reserva e um documento oficial
            com foto.
          </AlertDescription>
        </Alert>
        {/* O QR fica a um toque — quem não tem e-mail no cadastro não recebe o link. */}
        {estado.reserva && (
          <Button asChild variant="outline">
            <Link href={estado.reserva}>
              <QrCode />
              Ver a reserva e o QR Code
            </Link>
          </Button>
        )}
      </div>
    )
  }

  return (
    <form action={formAction} className="grid gap-3">
      <input type="hidden" name="token" value={token} />
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" size="lg" disabled={pendente}>
        {pendente ? <Loader2 className="animate-spin" /> : <Check />}
        Confirmar minha reserva
      </Button>
    </form>
  )
}
