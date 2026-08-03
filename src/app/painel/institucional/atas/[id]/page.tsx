import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, FileText, Pencil } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { obterAta, opcoesMandatos } from "@/lib/db/atas"
import { formatarData } from "@/lib/formato"
import { ROTULO_TIPO_REUNIAO } from "@/lib/atas-constantes"

import { AtaForm, BotaoExcluirAta } from "../ata-form"

export const metadata: Metadata = { title: "Ata de reunião — Confluir" }

function Campo({ rotulo, valor }: { rotulo: string; valor: string | null }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{rotulo}</dt>
      <dd className="mt-0.5 text-sm whitespace-pre-wrap">{valor ?? "—"}</dd>
    </div>
  )
}

export default async function AtaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ editar?: string; salvo?: string }>
}) {
  await requirePermissao("diretoria_reunioes")
  const { id } = await params
  const { editar, salvo } = await searchParams
  const a = await obterAta(id)
  if (!a) notFound()

  const editando = editar === "1"
  const mandatos = editando ? await opcoesMandatos() : []
  const aqui = `/painel/institucional/atas/${id}`
  const voltarHref = a.mandatoId
    ? `/painel/institucional/diretoria/${a.mandatoId}`
    : "/painel/institucional/atas"

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href={voltarHref}>
            <ArrowLeft />
            {a.mandatoId ? "Mandato" : "Atas de reunião"}
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-balance">
            {a.titulo ?? "(sem título)"}
          </h1>
          <Badge variant="secondary">{ROTULO_TIPO_REUNIAO[a.tipo]}</Badge>
        </div>
        <p className="text-muted-foreground mt-1 text-xs">
          {a.data ? formatarData(a.data) : "sem data"}
          {a.mandatoNome && <> · {a.mandatoNome}</>}
          {a.orgao && <> · {a.orgao}</>}
        </p>
      </div>

      {salvo === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Ata salva.</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">Ata da reunião</CardTitle>
            {!editando && (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" asChild>
                  <Link href={`${aqui}?editar=1`}>
                    <Pencil />
                    Editar
                  </Link>
                </Button>
                <BotaoExcluirAta ataId={id} mandatoId={a.mandatoId} />
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {editando ? (
            <AtaForm ata={a} mandatos={mandatos} aoCancelarHref={aqui} />
          ) : (
            <dl className="grid gap-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Campo rotulo="Data" valor={a.data ? formatarData(a.data) : null} />
                <Campo rotulo="Hora" valor={a.hora} />
                <Campo rotulo="Local" valor={a.local} />
                <Campo rotulo="Tipo" valor={ROTULO_TIPO_REUNIAO[a.tipo]} />
              </div>
              <Campo rotulo="Pauta" valor={a.pauta} />
              <Campo rotulo="Deliberações / decisões" valor={a.deliberacoes} />
              <Campo rotulo="Presentes" valor={a.presentes} />
              {a.observacoes && (
                <Campo rotulo="Observações" valor={a.observacoes} />
              )}
              <div>
                <dt className="text-muted-foreground text-xs">Ata em PDF</dt>
                <dd className="mt-0.5 text-sm">
                  {a.documentoUrl ? (
                    <Button variant="ghost" size="sm" asChild className="-ml-2">
                      <a href={a.documentoUrl} target="_blank" rel="noreferrer">
                        <FileText />
                        Abrir PDF
                      </a>
                    </Button>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
            </dl>
          )}
        </CardContent>
      </Card>
    </>
  )
}
