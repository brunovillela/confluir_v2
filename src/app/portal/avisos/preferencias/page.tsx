import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, BellRing, Smartphone } from "lucide-react"

import { AcaoVisualizacao } from "@/components/acao-visualizacao"
import { PushCelular, type RotasPush } from "@/components/pwa/push-celular"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { preferenciasDoFiliado } from "@/lib/db/portal-avisos"
import { estadoPushPortal } from "@/lib/db/push"
import { requireVisualizacaoPortal } from "@/lib/visualizacao-filiado"

import { PreferenciasForm } from "./preferencias-form"

export const metadata: Metadata = { title: "Preferências de avisos — Portal do Associado" }

/** Rotas do push do associado (A52) — as do painel exigem a sessão de funcionário. */
const ROTAS_PUSH_PORTAL: RotasPush = {
  assinar: "/api/portal/push/assinar",
  desassinar: "/api/portal/push/desassinar",
  estado: "/api/portal/push/estado",
}

/**
 * Avisos → Preferências: o que, além do sino, chega fora do portal. Um
 * interruptor por tipo vale para o e-mail e para o celular (A52) — uma decisão
 * só para o associado. O card "Receber no celular" aparece só com as chaves
 * VAPID configuradas e a tabela supabase/portal-push.sql criada; sem isso, a
 * página é a de antes, só com o e-mail.
 */
export default async function PreferenciasAvisosPage() {
  const { filiado, preview } = await requireVisualizacaoPortal()
  const [prefs, celular] = await Promise.all([
    preferenciasDoFiliado(filiado.cpf),
    estadoPushPortal(filiado.cpf).catch(() => ({ disponivel: false, aparelhos: 0 })),
  ])

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2">
          <Link href="/portal/avisos">
            <ArrowLeft />
            Avisos
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Preferências de avisos</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          O sino do portal recebe tudo. Aqui você escolhe o que também chega por e-mail
          {filiado.email ? ` (${filiado.email})` : ""}
          {celular.disponivel ? " e no celular" : ""}.
        </p>
      </div>

      {celular.disponivel && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Smartphone className="text-muted-foreground size-4" aria-hidden />
              Receber no celular
            </CardTitle>
            <CardDescription className="text-xs">
              Os tipos de aviso ligados abaixo chegam como notificação nos aparelhos em que você ligar, mesmo com o
              portal fechado. Ligue em cada celular ou computador que você usa.
              {celular.aparelhos > 0
                ? ` Ligado em ${celular.aparelhos} aparelho${celular.aparelhos === 1 ? "" : "s"}.`
                : ""}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {preview ? (
              // Na visualização o aparelho é o do atendente: nada é conferido
              // nem gravado — só o botão, desligado, para orientar o associado.
              <AcaoVisualizacao preview nota="Só o próprio associado liga o aviso no aparelho dele.">
                <Button type="button" className="min-h-11 w-full sm:w-auto">
                  <BellRing />
                  Ligar neste aparelho
                </Button>
              </AcaoVisualizacao>
            ) : (
              <PushCelular
                chavePublica={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY as string}
                rotas={ROTAS_PUSH_PORTAL}
                cancelarNoNavegador={false}
                nomeApp="o portal"
              />
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{celular.disponivel ? "Por e-mail e no celular" : "Por e-mail"}</CardTitle>
          <CardDescription className="text-xs">
            {celular.disponivel
              ? "Desligue um tipo e ele continua aparecendo no sino, só não vai para o seu e-mail nem para o celular."
              : "Desligue um tipo e ele continua aparecendo no sino, só não vai para a sua caixa de entrada."}{" "}
            O QR Code da reserva de hospedagem e o link de voto que você mesmo pede chegam sempre por e-mail.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!filiado.email && (
            <p className="text-muted-foreground mb-4 text-sm">
              {celular.disponivel
                ? "Seu cadastro não tem e-mail — inclua um em Meu cadastro para receber os avisos também por e-mail."
                : "Seu cadastro não tem e-mail — inclua um em Meu cadastro para receber avisos fora do portal."}
            </p>
          )}
          <AcaoVisualizacao preview={preview}>
            <PreferenciasForm prefs={prefs} canal={celular.disponivel ? "E-mail e celular" : "E-mail"} />
          </AcaoVisualizacao>
        </CardContent>
      </Card>
    </>
  )
}
