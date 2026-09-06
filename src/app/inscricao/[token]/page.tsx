import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Check, Circle } from "lucide-react"

import QRCode from "qrcode"

import { Marca } from "@/components/marca"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { obterInscricaoPorToken } from "@/lib/db/eventos-publico"
import { formatarDataHora } from "@/lib/formato"
import { tenantAtual } from "@/lib/tenant"

import { ConfirmarEmail, RespostaRsvp } from "./inscricao-passos"
import { CapturaSelfie } from "./selfie"

export const metadata: Metadata = {
  title: "Sua inscrição — Confluir",
  robots: { index: false },
}

function Passo({
  numero,
  titulo,
  feito,
  children,
}: {
  numero: number
  titulo: string
  feito: boolean
  children?: React.ReactNode
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {feito ? (
            <Check className="text-success-fg size-5" />
          ) : (
            <Circle className="text-muted-foreground size-5" />
          )}
          <span>
            {numero}. {titulo}
          </span>
        </CardTitle>
      </CardHeader>
      {children && <CardContent>{children}</CardContent>}
    </Card>
  )
}

export default async function InscricaoPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const insc = await obterInscricaoPorToken(token, await tenantAtual())
  if (!insc) notFound()

  if (insc.anonimizada) {
    return (
      <main className="mx-auto w-full max-w-xl px-4 py-10">
        <div className="mb-8 flex justify-center">
          <Marca variante="completa" />
        </div>
        <Alert>
          <AlertDescription>
            Os dados desta inscrição foram anonimizados a pedido do titular.
          </AlertDescription>
        </Alert>
      </main>
    )
  }

  const precisaFoto = insc.fotoObrigatoria || insc.modoFoto !== "nenhuma"
  const confirmada = insc.situacao === "confirmada"
  const recusada = insc.situacao === "recusada" || insc.situacao === "cancelada"

  // O QR carrega o TOKEN, não uma URL: a recepção lê e busca direto, sem
  // depender de o aparelho abrir navegador.
  const qrDataUrl = confirmada
    ? await QRCode.toDataURL(insc.token, { errorCorrectionLevel: "M", margin: 1, width: 512 })
    : ""

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-10">
      <div className="mb-8 flex flex-col items-center text-center">
        <Marca variante="completa" />
        <h1 className="mt-6 text-2xl font-semibold tracking-tight text-balance">
          {insc.eventoTitulo ?? "Sua inscrição"}
        </h1>
        {insc.eventoInicio && (
          <p className="text-muted-foreground mt-1 text-sm">
            {formatarDataHora(insc.eventoInicio)}
          </p>
        )}
        <div className="mt-3">
          <Badge
            variant={
              confirmada ? "success" : recusada ? "destructive" : "secondary"
            }
          >
            {confirmada
              ? "Inscrição confirmada"
              : recusada
                ? "Inscrição não confirmada"
                : "Inscrição em análise"}
          </Badge>
        </div>
      </div>

      {recusada && (
        <Alert variant="destructive" className="mb-6">
          <AlertDescription>
            Sua inscrição não foi confirmada. Procure a secretaria da entidade
            se tiver dúvidas.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4">
        <Passo numero={1} titulo="Confirmar o e-mail" feito={insc.emailConfirmado}>
          {!insc.emailConfirmado && (
            <ConfirmarEmail token={insc.token} email={insc.email} />
          )}
        </Passo>

        {precisaFoto && (
          <Passo
            numero={2}
            titulo={
              insc.modoFoto === "biometrica"
                ? "Enviar a foto para o controle de acesso"
                : "Enviar a foto"
            }
            feito={insc.temFoto}
          >
            {!insc.emailConfirmado ? (
              <p className="text-muted-foreground text-sm">
                Confirme o e-mail acima para liberar esta etapa.
              </p>
            ) : (
              <div className="grid gap-3">
                <p className="text-muted-foreground text-sm">
                  {insc.modoFoto === "biometrica"
                    ? "Sua foto será usada para reconhecimento facial na catraca, liberando sua entrada sem fila."
                    : "Sua foto será usada apenas para conferência na recepção, por uma pessoa da equipe."}{" "}
                  Ela é apagada em até {insc.retencaoFotoDias} dias após o fim do
                  evento.
                </p>
                {insc.fotoObrigatoria && !insc.temFoto && (
                  <Alert variant="warning">
                    <AlertDescription>
                      Neste evento a foto é <strong>obrigatória</strong> — sem
                      ela a inscrição não se completa.
                    </AlertDescription>
                  </Alert>
                )}
                <CapturaSelfie token={insc.token} jaTemFoto={insc.temFoto} />
              </div>
            )}
          </Passo>
        )}

        {insc.exigeRsvp && (
          <Passo
            numero={precisaFoto ? 3 : 2}
            titulo="Confirmar que vai comparecer"
            feito={insc.rsvpConfirmado !== null}
          >
            {!confirmada ? (
              <p className="text-muted-foreground text-sm">
                Assim que sua inscrição for confirmada, você poderá responder
                aqui.
              </p>
            ) : !insc.rsvpAberto ? (
              // Antes da data: a pessoa precisa saber que ainda vai ser
              // chamada, senão fecha a página achando que faltou algo.
              <div className="grid gap-2">
                <p className="text-sm">
                  {insc.rsvpAbreEm ? (
                    <>
                      Perto do evento vamos perguntar se você conseguiu se
                      organizar para vir. Você receberá um e-mail a partir de{" "}
                      <strong>{formatarDataHora(insc.rsvpAbreEm)}</strong>, e a
                      resposta é dada aqui mesmo.
                    </>
                  ) : (
                    <>
                      Perto do evento vamos perguntar por e-mail se você
                      conseguiu se organizar para vir. A resposta é dada aqui
                      mesmo.
                    </>
                  )}
                </p>
                <p className="text-muted-foreground text-xs">
                  Sua inscrição já está garantida — não há nada a fazer agora.
                </p>
              </div>
            ) : (
              <RespostaRsvp
                token={insc.token}
                resposta={insc.rsvpConfirmado}
              />
            )}
          </Passo>
        )}
      </div>

      {confirmada && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-base">Seu código de entrada</CardTitle>
          </CardHeader>
          <CardContent className="grid justify-items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrDataUrl}
              alt="QR Code da sua inscrição"
              className="size-56 rounded-md bg-white p-2"
            />
            <p className="text-muted-foreground text-center text-xs">
              Mostre este código na recepção. Se preferir, a equipe também
              encontra você pelo nome ou CPF.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="text-muted-foreground mt-8 grid gap-2 text-center text-xs">
        <p>
          Guarde esta página: é o seu acesso à inscrição. O endereço é pessoal —
          não compartilhe.
        </p>
        <p>
          Para ver, corrigir ou excluir seus dados, entre em{" "}
          <Link href="/meus-dados" className="underline">
            Meus dados
          </Link>{" "}
          com o e-mail usado nesta inscrição. Se preferir, procure a secretaria
          da entidade.
        </p>
        {insc.eventoSlug && (
          <p>
            <Link
              href={`/evento/${insc.eventoSlug}`}
              className="underline"
            >
              Ver a página do evento
            </Link>
          </p>
        )}
      </div>
    </main>
  )
}
