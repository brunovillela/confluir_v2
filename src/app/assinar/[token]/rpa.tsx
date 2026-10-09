import { CheckCircle2, Download, ExternalLink, FileCheck2, ShieldCheck } from "lucide-react"

import { Marca } from "@/components/marca"
import { VisualizadorPdf } from "@/components/visualizador-pdf"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { formatarMomentoAssinatura } from "@/lib/db/assinatura-comum"
import type { EnvelopeRpa } from "@/lib/db/rpa-assinatura"
import { formatarMoeda } from "@/lib/formato"

import { AssinarRpaForm, RecusarRpaForm } from "./assinatura-forms-rpa"

const STATUS = {
  pendente: { rotulo: "Aguardando sua assinatura", classe: "border-warning/40 text-warning-fg" },
  assinado: { rotulo: "Assinado", classe: "border-success/40 text-success-fg" },
  recusado: { rotulo: "Recusado", classe: "border-destructive/40 text-destructive" },
  cancelado: { rotulo: "Link cancelado", classe: "text-muted-foreground" },
} as const

/**
 * Página do prestador para assinar o RPA (sem login, pelo link pessoal do
 * e-mail). Se o recibo chegou assinado por outro caminho (à mão ou gov.br,
 * anexado pela entidade), o link deixa de valer e a página diz isso.
 */
export function AssinarRpa({ envelope, token }: { envelope: EnvelopeRpa; token: string }) {
  const a = envelope.assinatura
  const rpa = envelope.rpa
  const pdf = `/assinar/${token}/pdf`
  const contratante = envelope.entidade ?? "a entidade contratante"
  const status = envelope.substituidoPorAnexo
    ? { rotulo: "Recibo já entregue", classe: "border-success/40 text-success-fg" }
    : STATUS[a.situacao]
  const mostraDocumento = a.situacao === "pendente" || a.situacao === "assinado"

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10">
      <div className="mb-8 flex flex-col items-center text-center">
        <Marca variante="completa" />
        <h1 className="mt-6 text-2xl font-semibold tracking-tight">
          Recibo de Pagamento a Autônomo nº {rpa.numero ?? "—"}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {contratante} · {rpa.fornecedorNome ?? a.nome ?? "—"} · {formatarMoeda(rpa.valor_liquido)} líquidos
        </p>
        <Badge variant="outline" className={`mt-3 ${status.classe}`}>
          {status.rotulo}
        </Badge>
      </div>

      <div className="grid gap-4">
        {envelope.substituidoPorAnexo && (
          <Alert className="border-success/40">
            <FileCheck2 />
            <AlertDescription>
              <strong>Não é preciso assinar por este link.</strong> {contratante} incluiu um documento como
              comprovante da assinatura deste recibo (assinado no papel ou pelo gov.br), e por isso este
              link foi desativado. Em caso de dúvida, procure o contratante.
            </AlertDescription>
          </Alert>
        )}
        {a.situacao === "cancelado" && !envelope.substituidoPorAnexo && (
          <Alert variant="warning">
            <AlertDescription>
              Este link foi cancelado e não vale mais. Em caso de dúvida, procure o contratante (
              {contratante}).
            </AlertDescription>
          </Alert>
        )}
        {a.situacao === "assinado" && (
          <Alert className="border-success/40 text-success-fg">
            <CheckCircle2 />
            <AlertDescription>
              Você assinou em {formatarMomentoAssinatura(a.assinadoEm)} (horário de Brasília). Certificado{" "}
              <strong className="font-mono">{a.certificado}</strong>. Baixe o PDF: ele traz o certificado
              com a trilha da assinatura.
            </AlertDescription>
          </Alert>
        )}
        {a.situacao === "recusado" && (
          <Alert variant="destructive">
            <AlertDescription>
              Você recusou assinar em {formatarMomentoAssinatura(a.recusadoEm)}.
              {a.motivoRecusa ? ` Motivo: ${a.motivoRecusa}` : ""} O contratante vê o motivo no sistema.
            </AlertDescription>
          </Alert>
        )}

        {mostraDocumento && (
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-base">O recibo</CardTitle>
                  <CardDescription>Confira o serviço, os valores e as retenções antes de assinar.</CardDescription>
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
                titulo={`RPA nº ${rpa.numero ?? "—"}`}
                texto={`${rpa.descricao_servico ?? ""} — valor líquido ${formatarMoeda(rpa.valor_liquido)}`}
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
                  Assinar
                </CardTitle>
                <CardDescription>
                  Um código de uso único vai para o seu e-mail. Para concluir, digite o código, seu nome
                  completo e seu CPF — o mesmo do cadastro na entidade. Se tiver dificuldade, você pode
                  assinar no papel ou pelo gov.br: fale com o contratante.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <AssinarRpaForm token={token} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Não vou assinar</CardTitle>
                <CardDescription>O contratante vê o motivo que você escrever.</CardDescription>
              </CardHeader>
              <CardContent>
                <RecusarRpaForm token={token} />
              </CardContent>
            </Card>
          </>
        )}

        <p className="text-muted-foreground text-center text-xs">
          Assinatura eletrônica com link pessoal, código de uso único no e-mail, conferência de CPF, aceite
          expresso e registro de data, hora, IP e navegador. O conteúdo do recibo é identificado por resumo
          criptográfico (SHA-256); a assinatura pode ser verificada pelo certificado impresso no PDF.
        </p>
      </div>
    </main>
  )
}
