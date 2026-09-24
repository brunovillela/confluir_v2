import type { Metadata } from "next"
import { headers } from "next/headers"
import { CheckCircle2, Download, ExternalLink, FileText, ShieldCheck } from "lucide-react"

import { Marca } from "@/components/marca"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import {
  destinoDaAssinatura,
  envelopePorToken,
  formatarMomento,
  registrarAbertura,
  type SituacaoAssinatura,
} from "@/lib/db/oficios-assinatura"
import { formatarData } from "@/lib/formato"

import {
  envelopeCessaoPorToken,
  registrarAberturaCessao,
} from "@/lib/db/cessao-assinatura"

import { AssinarCessao } from "./cessao"
import { AssinarForm, RecusarForm } from "./assinatura-forms"

export const metadata: Metadata = {
  title: "Assinatura de ofício — Confluir",
  robots: { index: false },
}

const STATUS: Record<SituacaoAssinatura, { rotulo: string; classe: string }> = {
  pendente: { rotulo: "Aguardando sua assinatura", classe: "border-warning/40 text-warning-fg" },
  assinado: { rotulo: "Assinado", classe: "border-success/40 text-success-fg" },
  recusado: { rotulo: "Recusado", classe: "border-destructive/40 text-destructive" },
  cancelado: { rotulo: "Envio cancelado", classe: "text-muted-foreground" },
}

/**
 * Página do assinante, aberta pelo link do e-mail (sem login). Mostra o
 * documento e, conforme o estado, o passo a passo para assinar ou o status
 * atual — já assinado, recusado ou cancelado.
 */
export default async function AssinarOficioPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params

  // O envelope agora serve a mais de um tipo de documento. A cessão tem tela
  // própria (dois assinantes, ordem entre eles); o caminho do ofício segue
  // exatamente como estava.
  const cessao = await envelopeCessaoPorToken(token)
  if (cessao) {
    const h = await headers()
    await registrarAberturaCessao(cessao, {
      ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null,
      userAgent: h.get("user-agent"),
    })
    return <AssinarCessao envelope={cessao} token={token} />
  }

  const envelope = await envelopePorToken(token)

  if (!envelope) {
    return (
      <main className="mx-auto w-full max-w-md px-4 py-12 text-center">
        <Marca variante="completa" />
        <p className="text-muted-foreground mt-8 text-sm">
          Link de assinatura não encontrado. Confira se abriu o endereço completo enviado ao seu
          e-mail.
        </p>
      </main>
    )
  }

  const h = await headers()
  await registrarAbertura(envelope, {
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null,
    userAgent: h.get("user-agent"),
  })

  const { assinatura: a, oficio, remetente } = envelope
  const numero = oficio.numero != null ? `${oficio.numero}/${oficio.ano}` : "sem número"
  const status = STATUS[a.situacao]
  const pdf = `/assinar/${token}/pdf`
  const mostraDocumento = a.situacao !== "cancelado"

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <div className="mb-8 flex flex-col items-center text-center">
        <Marca variante="completa" />
        <h1 className="mt-6 text-2xl font-semibold tracking-tight">Ofício {numero}</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {remetente} · para assinatura de {a.nome ?? "—"}
        </p>
        <Badge variant="outline" className={`mt-3 ${status.classe}`}>
          {status.rotulo}
        </Badge>
      </div>

      <div className="grid gap-4">
        {a.situacao === "assinado" && (
          <Alert className="border-success/40 text-success-fg">
            <CheckCircle2 />
            <AlertDescription>
              Este ofício já foi assinado por <strong>{a.nome}</strong> em{" "}
              {formatarMomento(a.assinadoEm)} (horário de Brasília).
              {oficio.situacao === "Cancelado" && " Depois disso, o remetente cancelou o ofício."}
            </AlertDescription>
          </Alert>
        )}
        {a.situacao === "recusado" && (
          <Alert variant="destructive">
            <AlertDescription>
              A assinatura foi recusada em {formatarMomento(a.recusadoEm)}. Motivo: {a.motivoRecusa}.
              Se o ofício for corrigido, chegará um novo e-mail.
            </AlertDescription>
          </Alert>
        )}
        {a.situacao === "cancelado" && (
          <Alert>
            <AlertDescription>
              {remetente} cancelou este envio — este link não vale mais. Se ainda houver algo a
              assinar, você receberá um novo e-mail.
            </AlertDescription>
          </Alert>
        )}

        {mostraDocumento && (
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <FileText className="size-4" />
                    O documento
                  </CardTitle>
                  <CardDescription>
                    Leia o ofício por inteiro antes de assinar.
                  </CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" asChild>
                    <a href={pdf} target="_blank" rel="noreferrer">
                      <ExternalLink />
                      Abrir em tela cheia
                    </a>
                  </Button>
                  {a.situacao === "assinado" && (
                    <Button size="sm" asChild>
                      <a href={`${pdf}?baixar=1`}>
                        <Download />
                        Baixar assinado
                      </a>
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="grid gap-4">
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <Campo rotulo="Assunto" valor={oficio.assunto} />
                <Campo rotulo="Para" valor={oficio.destinatarioNome ?? oficio.destinatarioTexto} />
                <Campo rotulo="Data do ofício" valor={oficio.data ? formatarData(oficio.data) : null} />
                <Campo rotulo="Enviado para assinatura" valor={formatarMomento(a.enviadoEm)} />
              </dl>
              <iframe
                src={pdf}
                title={`Ofício ${numero}`}
                className="bg-muted hidden h-[70vh] w-full rounded-md border md:block"
              />
            </CardContent>
          </Card>
        )}

        {a.situacao === "pendente" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldCheck className="size-4" />
                Assinar
              </CardTitle>
              <CardDescription>
                Para confirmar que é você, enviamos um código de uso único
                {a.canal === "telegram" ? " no seu " : " ao e-mail "}
                {destinoDaAssinatura(a)}.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5">
              <AssinarForm token={token} email={destinoDaAssinatura(a)} />
              <Separator />
              <RecusarForm token={token} />
            </CardContent>
          </Card>
        )}

        {a.situacao === "assinado" && a.certificado && (
          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 text-sm">
              <div>
                <p className="text-muted-foreground text-xs">Certificado da assinatura</p>
                <p className="font-mono text-base font-semibold tracking-wider">{a.certificado}</p>
              </div>
              <Button variant="outline" size="sm" asChild>
                <a href={`/verificar/${a.certificado}`}>
                  <ShieldCheck />
                  Ver verificação
                </a>
              </Button>
            </CardContent>
          </Card>
        )}

        <p className="text-muted-foreground text-center text-xs">
          Assinatura eletrônica nos termos da Lei nº 14.063/2020. Cada passo — envio, abertura, código
          e assinatura — fica registrado com data, hora e endereço IP.
        </p>
      </div>
    </main>
  )
}

function Campo({ rotulo, valor }: { rotulo: string; valor: string | null }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{rotulo}</dt>
      <dd className="mt-0.5">{valor ?? "—"}</dd>
    </div>
  )
}
