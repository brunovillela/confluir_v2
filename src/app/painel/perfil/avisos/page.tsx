import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, BellRing } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { requireSessaoPainel } from "@/lib/auth"
import { preferenciasDeAviso } from "@/lib/db/avisos"
import { contarAssinaturasPush, pushConfigurado } from "@/lib/db/push"
import { statusTelegram } from "@/lib/db/telegram"
import { telegramConfigurado } from "@/lib/telegram"

import { AvisosForm } from "./avisos-form"
import { PushCelular } from "./push-celular"

export const metadata: Metadata = { title: "Avisos — Confluir" }

/**
 * Meu perfil → Avisos (onda 2, U3): por tipo de aviso, a pessoa escolhe se
 * recebe por e-mail e por Telegram. O sino recebe só as notificações; as
 * pendências ficam na caixa de entrada (06/10/2026).
 */
export default async function AvisosPerfilPage() {
  const { usuario } = await requireSessaoPainel()
  const [prefs, aparelhos, telegram] = await Promise.all([
    preferenciasDeAviso(usuario.id as string),
    pushConfigurado() ? contarAssinaturasPush(usuario.id as string).catch(() => 0) : Promise.resolve(0),
    statusTelegram(usuario.id as string).catch(() => ({ vinculado: false, telefone: null, telefonePendente: null })),
  ])
  const telegramAtivo = telegramConfigurado() && telegram.vinculado && Boolean(telegram.telefone)

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
          <BellRing className="text-muted-foreground size-5" />
          <h1 className="text-2xl font-semibold tracking-tight">Avisos</h1>
        </div>
        <p className="text-muted-foreground mt-1 text-xs">
          Escolha por onde quer receber cada tipo de aviso. O sino do painel guarda as notificações sobre você; o que
          espera você agir fica na caixa de entrada, no topo do painel.
        </p>
      </div>

      {pushConfigurado() && (
        <Card>
          <CardContent>
            <PushCelular chavePublica={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY as string} aparelhos={aparelhos} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Por tipo de aviso</CardTitle>
        </CardHeader>
        <CardContent>
          <AvisosForm
            prefs={prefs}
            temEmail={Boolean(usuario.email)}
            telegramAtivo={telegramAtivo}
          />
        </CardContent>
      </Card>
    </>
  )
}
