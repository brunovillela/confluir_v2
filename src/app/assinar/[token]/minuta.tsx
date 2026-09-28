import { CheckCircle2, Clock, Download, ExternalLink, ShieldCheck } from "lucide-react"

import { Marca } from "@/components/marca"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { formatarMomentoAssinatura } from "@/lib/db/assinatura-comum"
import { ROTULO_PAPEL_MINUTA, type EnvelopeMinuta } from "@/lib/db/minuta-assinatura"

import { AssinarMinutaForm, RecusarMinutaForm } from "./assinatura-forms-minuta"

const STATUS = {
  pendente: { rotulo: "Aguardando sua assinatura", classe: "border-warning/40 text-warning-fg" },
  assinado: { rotulo: "Assinado", classe: "border-success/40 text-success-fg" },
  recusado: { rotulo: "Recusado", classe: "border-destructive/40 text-destructive" },
  cancelado: { rotulo: "Envio cancelado", classe: "text-muted-foreground" },
} as const

const SITUACAO_CURTA = {
  pendente: "aguardando",
  assinado: "assinou",
  recusado: "recusou",
  cancelado: "cancelado",
} as const

/**
 * Página do assinante do contrato (sem login, pelo link pessoal do e-mail).
 * Mostra o PDF na tela, quem assina e em que ordem, e o passo a passo.
 */
export function AssinarMinuta({ envelope, token }: { envelope: EnvelopeMinuta; token: string }) {
  const a = envelope.assinatura
  const status = STATUS[a.situacao]
  const pdf = `/assinar/${token}/pdf`
  const suaVez = a.situacao === "pendente" && !envelope.aguardandoAnterior

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10">
      <div className="mb-8 flex flex-col items-center text-center">
        <Marca variante="completa" />
        <h1 className="mt-6 text-2xl font-semibold tracking-tight">{envelope.titulo}</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {envelope.entidade ? `${envelope.entidade} · ` : ""}
          assinatura de {a.nome ?? "—"} ({ROTULO_PAPEL_MINUTA[a.papel]})
        </p>
        <Badge variant="outline" className={`mt-3 ${status.classe}`}>
          {status.rotulo}
        </Badge>
      </div>

      <div className="grid gap-4">
        {envelope.concluida && (
          <Alert className="border-success/40 text-success-fg">
            <CheckCircle2 />
            <AlertDescription>
              Contrato assinado por todas as partes. Baixe o PDF: ele traz o certificado com a trilha de
              cada assinatura.
            </AlertDescription>
          </Alert>
        )}
        {a.situacao === "assinado" && !envelope.concluida && (
          <Alert className="border-success/40 text-success-fg">
            <CheckCircle2 />
            <AlertDescription>
              Você assinou em {formatarMomentoAssinatura(a.assinadoEm)} (horário de Brasília).
              Certificado <strong className="font-mono">{a.certificado}</strong>. O contrato passa a
              valer quando todos assinarem — você recebe um e-mail.
            </AlertDescription>
          </Alert>
        )}
        {a.situacao === "recusado" && (
          <Alert variant="destructive">
            <AlertDescription>
              Você recusou assinar em {formatarMomentoAssinatura(a.recusadoEm)}.
              {a.motivoRecusa ? ` Motivo: ${a.motivoRecusa}` : ""}
            </AlertDescription>
          </Alert>
        )}
        {a.situacao === "cancelado" && (
          <Alert variant="warning">
            <AlertDescription>
              A entidade cancelou este envio — este link não vale mais. Se ainda houver contrato, você
              receberá um link novo.
            </AlertDescription>
          </Alert>
        )}
        {a.situacao === "pendente" && envelope.aguardandoAnterior && (
          <Alert variant="info">
            <Clock />
            <AlertDescription>
              Ainda não é a sua vez. Você recebe um e-mail quando as assinaturas anteriores estiverem
              feitas — pode fechar esta página.
            </AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Quem assina, nesta ordem</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="grid gap-1 text-sm">
              {envelope.assinantes.map((x) => (
                <li key={x.ordem} className="flex flex-wrap items-center gap-2">
                  <span className="text-muted-foreground w-5 tabular-nums">{x.ordem}.</span>
                  <span className="font-medium">{x.nome ?? "—"}</span>
                  <span className="text-muted-foreground">· {ROTULO_PAPEL_MINUTA[x.papel]}</span>
                  <Badge variant="outline" className="text-xs">
                    {SITUACAO_CURTA[x.situacao]}
                  </Badge>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>

        {a.situacao !== "cancelado" && (
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-base">O contrato</CardTitle>
                  <CardDescription>Leia por inteiro: este é exatamente o texto que será assinado.</CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" asChild>
                    <a href={pdf} target="_blank" rel="noreferrer">
                      <ExternalLink />
                      Abrir em tela cheia
                    </a>
                  </Button>
                  <Button variant={envelope.concluida ? "default" : "outline"} size="sm" asChild>
                    <a href={`${pdf}?baixar=1`}>
                      <Download />
                      {envelope.concluida ? "Baixar assinado" : "Baixar PDF"}
                    </a>
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="grid gap-3">
              <iframe src={pdf} title={envelope.titulo} className="bg-muted h-[75vh] w-full rounded-md border" />
              <details>
                <summary className="text-muted-foreground cursor-pointer text-xs">
                  O PDF não abriu? Ver o texto aqui
                </summary>
                <pre className="bg-muted/40 mt-2 max-h-[32rem] overflow-auto rounded-md p-4 text-sm whitespace-pre-wrap">
                  {envelope.texto}
                </pre>
              </details>
            </CardContent>
          </Card>
        )}

        {suaVez && (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ShieldCheck className="size-4" />
                  Assinar
                </CardTitle>
                <CardDescription>
                  Um código de uso único vai para o seu e-mail. Para concluir, digite o código, seu nome
                  completo e seu CPF — ele precisa ser o informado pela entidade.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <AssinarMinutaForm token={token} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Não vou assinar</CardTitle>
                <CardDescription>A entidade é avisada com o motivo que você escrever.</CardDescription>
              </CardHeader>
              <CardContent>
                <RecusarMinutaForm token={token} />
              </CardContent>
            </Card>
          </>
        )}

        <p className="text-muted-foreground text-center text-xs">
          Assinatura eletrônica com link pessoal, código de uso único no e-mail, conferência de CPF,
          aceite expresso e registro de data, hora, IP e navegador. O conteúdo é identificado por resumo
          criptográfico (SHA-256); qualquer alteração invalida a assinatura. Cada assinatura pode ser
          verificada pelo certificado impresso no PDF.
        </p>
      </div>
    </main>
  )
}
