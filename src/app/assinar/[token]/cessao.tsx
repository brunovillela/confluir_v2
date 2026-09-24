import { CheckCircle2, Clock, ShieldCheck } from "lucide-react"

import { Marca } from "@/components/marca"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { formatarMomentoAssinatura } from "@/lib/db/assinatura-comum"
import { ROTULO_PAPEL, type EnvelopeCessao } from "@/lib/db/cessao-assinatura"

import { AssinarCessaoForm, RecusarCessaoForm } from "./assinatura-forms-cessao"

const STATUS = {
  pendente: { rotulo: "Aguardando sua assinatura", classe: "border-warning/40 text-warning-fg" },
  assinado: { rotulo: "Assinado", classe: "border-success/40 text-success-fg" },
  recusado: { rotulo: "Recusado", classe: "border-destructive/40 text-destructive" },
  cancelado: { rotulo: "Envio cancelado", classe: "text-muted-foreground" },
} as const

/**
 * A página que o assinante do termo de cessão abre pelo link do e-mail, sem
 * login. Mostra o termo inteiro e, conforme o estado, o passo a passo para
 * assinar — ou por que ainda não é a vez dele.
 */
export function AssinarCessao({
  envelope,
  token,
}: {
  envelope: EnvelopeCessao
  token: string
}) {
  const a = envelope.assinatura
  const status = STATUS[a.situacao]

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <div className="mb-8 flex flex-col items-center text-center">
        <Marca variante="completa" />
        <h1 className="mt-6 text-2xl font-semibold tracking-tight">
          Termo de cessão — {envelope.espaco}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {envelope.entidade ? `${envelope.entidade} · ` : ""}
          {envelope.numero ? `pedido nº ${envelope.numero} · ` : ""}
          assinatura de {a.nome ?? "—"} ({ROTULO_PAPEL[a.papel]})
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
              Você assinou este termo em {formatarMomentoAssinatura(a.assinadoEm)}{" "}
              (horário de Brasília). Certificado{" "}
              <strong className="font-mono">{a.certificado}</strong>.
              {envelope.outra && envelope.outra.situacao !== "assinado" && (
                <> Falta a assinatura de {envelope.outra.nome ?? "a outra parte"}.</>
              )}
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
              A entidade cancelou este envio. Se ainda houver cessão, você
              receberá um link novo.
            </AlertDescription>
          </Alert>
        )}

        {a.situacao === "pendente" && envelope.aguardandoAnterior && (
          <Alert variant="info">
            <Clock />
            <AlertDescription>
              Ainda não é a sua vez: {envelope.outra?.nome ?? "a outra parte"} (
              {envelope.outra ? ROTULO_PAPEL[envelope.outra.papel] : "cedente"})
              assina primeiro. Você recebe um aviso por e-mail quando chegar a
              sua vez — pode fechar esta página.
            </AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">O termo</CardTitle>
            <CardDescription>
              Leia com atenção. O texto abaixo é exatamente o que será assinado.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="bg-muted/40 max-h-[34rem] overflow-auto rounded-md p-4 text-sm whitespace-pre-wrap">
              {envelope.termo}
            </pre>
          </CardContent>
        </Card>

        {a.situacao === "pendente" && !envelope.aguardandoAnterior && (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ShieldCheck className="size-4" />
                  Assinar
                </CardTitle>
                <CardDescription>
                  Peça o código de 6 dígitos, que chega no seu e-mail, e
                  confirme abaixo.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <AssinarCessaoForm token={token} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Não vou assinar</CardTitle>
                <CardDescription>
                  A entidade é avisada com o motivo que você escrever.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <RecusarCessaoForm token={token} />
              </CardContent>
            </Card>
          </>
        )}

        <p className="text-muted-foreground text-center text-xs">
          Assinatura eletrônica com confirmação por código enviado ao e-mail do
          assinante, registro de data, hora e IP, e verificação do conteúdo por
          resumo criptográfico (SHA-256).
        </p>
      </div>
    </main>
  )
}
