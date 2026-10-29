import type { Metadata } from "next"
import { BellRing, Send } from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { VoltarPerfil } from "@/components/voltar-perfil"
import { requireSessaoPainel } from "@/lib/auth"
import { preferenciasDeAviso } from "@/lib/db/avisos"
import { contarAssinaturasPush, pushConfigurado } from "@/lib/db/push"
import { statusTelegram } from "@/lib/db/telegram"
import { telegramConfigurado } from "@/lib/telegram"

import { AvisosForm } from "./avisos-form"
import { avisosPermitidos } from "./perfil-avisos"
import { PushCelular } from "./push-celular"
import { TelegramVinculo } from "../telegram/telegram-form"
import { TelegramTelefone } from "../telegram/telegram-telefone"

export const metadata: Metadata = { title: "Avisos e Telegram — Confluir" }

/**
 * Meu perfil → Avisos (onda 2, U3): por tipo de aviso, a pessoa escolhe se
 * recebe por e-mail, Telegram e celular. O sino recebe só as notificações; as
 * pendências ficam na caixa de entrada (06/10/2026). Desde 07/10/2026 só
 * aparecem os avisos das áreas em que a pessoa tem permissão, e tudo nasce
 * desmarcado (opt-in). Desde 29/10/2026 o Telegram (vínculo com o bot e
 * telefone) também mora aqui — antes tinha página própria, um segundo lugar
 * para o mesmo assunto.
 */
export default async function AvisosPerfilPage() {
  const sessao = await requireSessaoPainel()
  const { usuario } = sessao
  const [prefs, aparelhos, telegram, permitidos] = await Promise.all([
    preferenciasDeAviso(usuario.id as string),
    pushConfigurado() ? contarAssinaturasPush(usuario.id as string).catch(() => 0) : Promise.resolve(0),
    statusTelegram(usuario.id as string).catch(() => ({ vinculado: false, telefone: null, telefonePendente: null })),
    avisosPermitidos(sessao),
  ])
  const configurado = telegramConfigurado()
  const telegramAtivo = configurado && telegram.vinculado && Boolean(telegram.telefone)

  return (
    <>
      <div>
        <VoltarPerfil />
        <div className="flex flex-wrap items-center gap-2">
          <BellRing className="text-muted-foreground size-5" />
          <h1 className="text-2xl font-semibold tracking-tight">Avisos e Telegram</h1>
        </div>
        <p className="text-muted-foreground mt-1 text-xs">
          Marque o que quer receber e por onde — nada chega por e-mail, Telegram ou celular sem você escolher. Só
          aparecem os avisos das áreas em que você tem permissão. O sino do painel guarda as notificações sobre você;
          o que espera você agir fica na caixa de entrada, no topo do painel.
        </p>
      </div>

      {/* Canais: celular e Telegram lado a lado. */}
      <div className="grid items-start gap-4 lg:grid-cols-2">
        {pushConfigurado() && (
          <Card>
            <CardContent>
              <PushCelular chavePublica={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY as string} aparelhos={aparelhos} />
            </CardContent>
          </Card>
        )}
        <Card id="telegram" className="scroll-mt-20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Send className="text-muted-foreground size-4" />
              Telegram
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <TelegramVinculo vinculado={telegram.vinculado} configurado={configurado} />
            {configurado && telegram.vinculado && (
              <div className="border-t pt-4">
                <p className="mb-2 text-sm font-medium">Telefone</p>
                <TelegramTelefone
                  key={telegram.telefonePendente ?? telegram.telefone ?? "novo"}
                  telefone={telegram.telefone}
                  pendente={telegram.telefonePendente}
                />
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Por tipo de aviso</CardTitle>
        </CardHeader>
        <CardContent>
          <AvisosForm
            prefs={prefs}
            permitidos={permitidos}
            temEmail={Boolean(usuario.email)}
            telegramAtivo={telegramAtivo}
            celular={pushConfigurado()}
            celularAtivo={aparelhos > 0}
          />
        </CardContent>
      </Card>
    </>
  )
}
