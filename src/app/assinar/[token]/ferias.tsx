import { CheckCircle2, Download, ExternalLink, ShieldCheck } from "lucide-react"

import { Marca } from "@/components/marca"
import { VisualizadorPdf } from "@/components/visualizador-pdf"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { formatarMomentoAssinatura } from "@/lib/db/assinatura-comum"
import type { EnvelopeAviso } from "@/lib/db/ferias-aviso"
import { formatarData } from "@/lib/formato"
import { textoDoAviso } from "@/lib/pdf/aviso-ferias"

import { AssinarAvisoForm, RecusarAvisoForm } from "./assinatura-forms-ferias"

const STATUS = {
  pendente: { rotulo: "Aguardando sua assinatura", classe: "border-warning/40 text-warning-fg" },
  assinado: { rotulo: "Assinado", classe: "border-success/40 text-success-fg" },
  recusado: { rotulo: "Não assinado", classe: "border-destructive/40 text-destructive" },
  cancelado: { rotulo: "Link cancelado", classe: "text-muted-foreground" },
} as const

/**
 * Página do funcionário para assinar o aviso de férias (sem login, pelo link
 * pessoal do e-mail). A assinatura comprova que ele foi avisado das datas.
 */
export function AssinarAvisoFerias({ envelope, token }: { envelope: EnvelopeAviso; token: string }) {
  const a = envelope.assinatura
  const { gozo } = envelope.aviso.dados
  const pdf = `/assinar/${token}/pdf`
  const entidade = envelope.entidade ?? "a entidade"
  const status = STATUS[a.situacao]
  const mostraDocumento = a.situacao === "pendente" || a.situacao === "assinado"

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10">
      <div className="mb-8 flex flex-col items-center text-center">
        <Marca variante="completa" />
        <h1 className="mt-6 text-2xl font-semibold tracking-tight">Aviso de férias</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {entidade} · {envelope.aviso.dados.funcionario.nome} · {formatarData(gozo.inicio)} a {formatarData(gozo.termino)}
        </p>
        <Badge variant="outline" className={`mt-3 ${status.classe}`}>
          {status.rotulo}
        </Badge>
      </div>

      <div className="grid gap-4">
        {a.situacao === "cancelado" && (
          <Alert variant="warning">
            <AlertDescription>
              Este link foi cancelado e não vale mais — as férias foram alteradas ou desmarcadas. Se as datas
              mudaram, um aviso novo chega ao seu e-mail. Em caso de dúvida, fale com o departamento de pessoal.
            </AlertDescription>
          </Alert>
        )}
        {a.situacao === "assinado" && (
          <Alert className="border-success/40 text-success-fg">
            <CheckCircle2 />
            <AlertDescription>
              Você assinou em {formatarMomentoAssinatura(a.assinadoEm)} (horário de Brasília). Certificado{" "}
              <strong className="font-mono">{a.certificado}</strong>. Baixe o PDF: ele traz o certificado com a
              trilha da assinatura.
            </AlertDescription>
          </Alert>
        )}
        {a.situacao === "recusado" && (
          <Alert variant="destructive">
            <AlertDescription>
              Você não assinou em {formatarMomentoAssinatura(a.recusadoEm)}.
              {a.motivoRecusa ? ` Motivo: ${a.motivoRecusa}` : ""} O departamento de pessoal foi avisado e vê o
              motivo no sistema.
            </AlertDescription>
          </Alert>
        )}

        {mostraDocumento && (
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-base">O aviso</CardTitle>
                  <CardDescription>
                    Férias de {formatarData(gozo.inicio)} a {formatarData(gozo.termino)} ({gozo.dias} dias), retorno em{" "}
                    {formatarData(gozo.retorno)}. Confira antes de assinar.
                  </CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" asChild>
                    <a href={pdf} target="_blank" rel="noreferrer">
                      <ExternalLink />
                      Abrir em tela cheia
                    </a>
                  </Button>
                  <Button variant={a.situacao === "assinado" ? "default" : "outline"} size="sm" asChild>
                    <a href={`${pdf}?baixar=1`}>
                      <Download />
                      {a.situacao === "assinado" ? "Baixar assinado" : "Baixar PDF"}
                    </a>
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <VisualizadorPdf
                src={pdf}
                titulo="Aviso de férias"
                texto={textoDoAviso(envelope.aviso.dados, entidade)}
              />
            </CardContent>
          </Card>
        )}

        {a.situacao === "pendente" && (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ShieldCheck className="size-4" />
                  Assinar (ciente)
                </CardTitle>
                <CardDescription>
                  Um código de uso único vai para o seu e-mail. Para concluir, digite o código, seu nome completo e
                  seu CPF — o mesmo do seu cadastro. Assinar confirma que você está ciente das datas das suas férias.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <AssinarAvisoForm token={token} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">As datas estão erradas</CardTitle>
                <CardDescription>Diga o que está errado — o departamento de pessoal recebe o motivo.</CardDescription>
              </CardHeader>
              <CardContent>
                <RecusarAvisoForm token={token} />
              </CardContent>
            </Card>
          </>
        )}

        <p className="text-muted-foreground text-center text-xs">
          Assinatura eletrônica com link pessoal, código de uso único no e-mail, conferência de CPF, aceite expresso e
          registro de data, hora, IP e navegador. O conteúdo do aviso é identificado por resumo criptográfico
          (SHA-256); a assinatura pode ser verificada pelo certificado impresso no PDF.
        </p>
      </div>
    </main>
  )
}
