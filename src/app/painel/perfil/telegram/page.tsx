import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, Send } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { requireSessaoPainel } from "@/lib/auth"
import { preferenciasTelegram, statusTelegram } from "@/lib/db/telegram"
import { telegramConfigurado } from "@/lib/telegram"

import { TelegramVinculo } from "./telegram-form"
import { TelegramPreferencias } from "./telegram-preferencias"
import { TelegramTelefone } from "./telegram-telefone"

export const metadata: Metadata = { title: "Telegram — Confluir" }

export default async function TelegramPerfilPage() {
  const { usuario } = await requireSessaoPainel()
  const { vinculado, telefone, telefonePendente } = await statusTelegram(
    usuario.id as string
  )
  const configurado = telegramConfigurado()
  const prefs = await preferenciasTelegram(usuario.id as string)
  const telefoneConfirmado = Boolean(telefone)

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/perfil">
            <ArrowLeft />
            Meu perfil
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <Send className="text-muted-foreground size-5" />
          <h1 className="text-2xl font-semibold tracking-tight">Telegram</h1>
        </div>
        <p className="text-muted-foreground mt-1 text-xs">
          Ligue seu Telegram à sua conta para falar com o bot do Confluir
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Vínculo com o bot</CardTitle>
        </CardHeader>
        <CardContent>
          <TelegramVinculo vinculado={vinculado} configurado={configurado} />
        </CardContent>
      </Card>

      {configurado && vinculado && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Telefone</CardTitle>
          </CardHeader>
          <CardContent>
            <TelegramTelefone
              key={telefonePendente ?? telefone ?? "novo"}
              telefone={telefone}
              pendente={telefonePendente}
            />
          </CardContent>
        </Card>
      )}

      {configurado && vinculado && telefoneConfirmado && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Notificações</CardTitle>
          </CardHeader>
          <CardContent>
            <TelegramPreferencias prefs={prefs} />
          </CardContent>
        </Card>
      )}
    </>
  )
}
