import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, Send } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { requireSessaoPainel } from "@/lib/auth"
import { statusTelegram } from "@/lib/db/telegram"
import { telegramConfigurado } from "@/lib/telegram"

import { TelegramVinculo } from "./telegram-form"
import { TelegramTelefone } from "./telegram-telefone"

export const metadata: Metadata = { title: "Telegram — Confluir" }

export default async function TelegramPerfilPage() {
  const { usuario } = await requireSessaoPainel()
  const { vinculado, telefone, telefonePendente } = await statusTelegram(
    usuario.id as string
  )
  const configurado = telegramConfigurado()
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
          <CardContent className="grid gap-3">
            <p className="text-muted-foreground text-sm">
              O que chega pelo Telegram (e pelo e-mail) se escolhe por tipo de
              aviso, em um lugar só.
            </p>
            <Button variant="outline" size="sm" asChild className="w-fit">
              <Link href="/painel/perfil/avisos">Escolher o que receber</Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </>
  )
}
