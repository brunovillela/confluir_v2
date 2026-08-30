import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, CheckCircle2, FileWarning } from "lucide-react"

import { Marca } from "@/components/marca"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { requireSessaoTrabalhador } from "@/lib/auth"
import { obterComprovante } from "@/lib/db/oposicao"
import { nomeEntidade } from "@/lib/db/organizacao"
import { formatarDataHora } from "@/lib/formato"
import { mascaraCpf } from "@/lib/mascaras"
import { ROTULO_SITUACAO_OPOSITOR } from "@/lib/oposicao-constantes"

import { BotaoImprimir, EnviarDocumento } from "./comprovante-forms"

export const metadata: Metadata = { title: "Comprovante — Confluir" }

export default async function ComprovantePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const sessao = await requireSessaoTrabalhador()
  const { id } = await params
  const c = await obterComprovante(id, sessao.cpf)
  if (!c) notFound()

  const aguardando = c.situacao === "aguardando_documento"
  const entidade = await nomeEntidade()

  return (
    <div className="mx-auto grid min-h-dvh max-w-2xl gap-6 px-4 py-8">
      <header className="flex items-center justify-between print:hidden">
        <Marca tenant={entidade} />
        <Button variant="ghost" size="sm" asChild>
          <Link href="/portal/oposicao">
            <ArrowLeft />
            Voltar
          </Link>
        </Button>
      </header>

      {aguardando ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileWarning className="text-warning-fg size-5" />
              Falta enviar o documento assinado
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <p className="text-sm">
              Sua oposição foi registrada (protocolo{" "}
              <strong className="tabular-nums">{c.protocolo ?? "—"}</strong>),
              mas ainda depende do documento assinado no gov.br.
            </p>
            <ol className="text-muted-foreground grid list-decimal gap-1 pl-5 text-sm">
              <li>Baixe a sua carta de oposição (já preenchida com seus dados).</li>
              <li>Assine no Assinador gov.br (assinatura digital).</li>
              <li>Envie o PDF assinado aqui.</li>
            </ol>
            <Button variant="outline" asChild className="w-fit">
              <a
                href={`/portal/oposicao/comprovante/${c.id}/carta`}
                target="_blank"
                rel="noreferrer"
              >
                Baixar carta (PDF)
              </a>
            </Button>
            <EnviarDocumento opositorId={c.id} campanhaId={c.campanhaId} />
          </CardContent>
        </Card>
      ) : (
        <>
          <Alert className="border-success/40 text-success-fg print:hidden">
            <AlertDescription className="flex items-center gap-2">
              <CheckCircle2 className="size-4" />
              Oposição registrada. Guarde este comprovante.
            </AlertDescription>
          </Alert>

          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-base">
                  Comprovante de oposição
                </CardTitle>
                <Badge variant="secondary">
                  {ROTULO_SITUACAO_OPOSITOR[c.situacao]}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="grid gap-4">
              <dl className="grid gap-4 sm:grid-cols-2">
                <Campo rotulo="Protocolo" valor={c.protocolo?.toString() ?? "—"} />
                <Campo
                  rotulo="Data/hora"
                  valor={formatarDataHora(c.confirmado_em)}
                />
                <Campo rotulo="Nome" valor={c.nome} />
                <Campo
                  rotulo="CPF"
                  valor={c.cpf ? mascaraCpf(c.cpf) : "—"}
                />
                <Campo rotulo="Fonte pagadora" valor={c.empregadorNome} />
                <Campo rotulo="Matrícula" valor={c.matricula} />
                <div className="sm:col-span-2">
                  <dt className="text-muted-foreground text-xs">Campanha</dt>
                  <dd className="mt-0.5 text-sm">
                    {c.campanhaNome ?? "—"}
                    {c.detalhe_desconto && (
                      <span className="text-muted-foreground">
                        {" "}
                        — {c.detalhe_desconto}
                      </span>
                    )}
                  </dd>
                </div>
              </dl>

              {c.texto_declaracao && (
                <div className="bg-muted/40 rounded-md border p-4 text-sm whitespace-pre-wrap">
                  {c.texto_declaracao}
                </div>
              )}

              <p className="text-muted-foreground text-xs">
                Oposição sujeita à avaliação da Filiação. Documento gerado
                eletronicamente e registrado para fins de auditoria.
              </p>

              <div className="print:hidden">
                <BotaoImprimir />
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

function Campo({ rotulo, valor }: { rotulo: string; valor: string | null }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{rotulo}</dt>
      <dd className="mt-0.5 text-sm">{valor ?? "—"}</dd>
    </div>
  )
}
