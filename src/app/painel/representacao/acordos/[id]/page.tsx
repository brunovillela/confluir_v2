import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, FileText, Pencil } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { fonteIdsDoAcordo, obterAcordo, opcoesFontes } from "@/lib/db/acordos"
import { formatarData } from "@/lib/formato"
import {
  estadoVigencia,
  ROTULO_CATEGORIA,
  ROTULO_TIPO,
  SITUACOES_ACORDO,
} from "@/lib/acordos-constantes"

import {
  AcordoForm,
  AdicionarClausula,
  BotaoExcluirClausula,
} from "../acordos-forms"

export const metadata: Metadata = { title: "Acordo coletivo — Confluir" }

const ROTULO_SITUACAO = Object.fromEntries(
  SITUACOES_ACORDO.map((s) => [s.chave, s.rotulo])
)

function hojeSP(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date())
}

export default async function AcordoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ editar?: string; salvo?: string }>
}) {
  await requirePermissao("acordos_coletivos")
  const { id } = await params
  const { editar, salvo } = await searchParams
  const a = await obterAcordo(id)
  if (!a) notFound()

  const editando = editar === "1"
  const [fontes, fonteIds] = editando
    ? await Promise.all([opcoesFontes(), fonteIdsDoAcordo(id)])
    : [[], []]

  const aqui = `/painel/representacao/acordos/${id}`
  const estado =
    a.situacao === "vigente" ? estadoVigencia(a.vigencia_fim, hojeSP()) : null

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/representacao/acordos">
            <ArrowLeft />
            Acordos coletivos
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-balance">
            {a.titulo ?? "(sem título)"}
          </h1>
          <Badge variant="secondary">{ROTULO_TIPO[a.tipo]}</Badge>
          <Badge variant="outline">{ROTULO_SITUACAO[a.situacao]}</Badge>
          {estado === "vencido" && <Badge variant="destructive">Vencido</Badge>}
          {estado === "vencendo" && <Badge variant="warning">Vencendo</Badge>}
        </div>
        <p className="text-muted-foreground mt-1 text-xs">
          Vigência {formatarData(a.vigencia_inicio)} –{" "}
          {a.vigencia_fim ? formatarData(a.vigencia_fim) : "—"}
          {a.fontes.length > 0 && <> · {a.fontes.join(", ")}</>}
        </p>
      </div>

      {salvo === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Acordo salvo.</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">Dados do acordo</CardTitle>
            {!editando && (
              <Button variant="outline" size="sm" asChild>
                <Link href={`${aqui}?editar=1`}>
                  <Pencil />
                  Editar
                </Link>
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {editando ? (
            <AcordoForm
              acordo={a}
              fontes={fontes}
              fonteIds={fonteIds}
              aoCancelarHref={aqui}
            />
          ) : (
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Campo rotulo="Nº de registro (MTE)" valor={a.numero_registro} />
              <Campo rotulo="Data-base" valor={a.data_base} />
              <Campo
                rotulo="Fontes pagadoras"
                valor={a.fontes.join(", ") || null}
              />
              <div className="sm:col-span-2 lg:col-span-3">
                <dt className="text-muted-foreground text-xs">Abrangência</dt>
                <dd className="mt-0.5 text-sm whitespace-pre-wrap">
                  {a.abrangencia ?? "—"}
                </dd>
              </div>
              {a.observacoes && (
                <div className="sm:col-span-2 lg:col-span-3">
                  <dt className="text-muted-foreground text-xs">Observações</dt>
                  <dd className="mt-0.5 text-sm whitespace-pre-wrap">
                    {a.observacoes}
                  </dd>
                </div>
              )}
              <div>
                <dt className="text-muted-foreground text-xs">Documento</dt>
                <dd className="mt-0.5 text-sm">
                  {a.documentoUrl ? (
                    <Button variant="ghost" size="sm" asChild className="-ml-2">
                      <a
                        href={a.documentoUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cláusulas</CardTitle>
          <CardDescription>{a.clausulas.length} cláusula(s)</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {a.clausulas.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Nenhuma cláusula cadastrada.
            </p>
          ) : (
            <ul className="grid gap-2">
              {a.clausulas.map((c) => (
                <li
                  key={c.id}
                  className="border-border flex items-start justify-between gap-2 rounded-md border p-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {c.numero && (
                        <span className="text-muted-foreground mr-1 tabular-nums">
                          {c.numero}
                        </span>
                      )}
                      {c.titulo ?? "(sem título)"}{" "}
                      <Badge variant="secondary" className="ml-1 align-middle">
                        {ROTULO_CATEGORIA[c.categoria]}
                      </Badge>
                    </p>
                    {c.texto && (
                      <p className="text-muted-foreground mt-0.5 text-xs whitespace-pre-wrap">
                        {c.texto}
                      </p>
                    )}
                  </div>
                  <BotaoExcluirClausula clausulaId={c.id} acordoId={id} />
                </li>
              ))}
            </ul>
          )}
          <AdicionarClausula acordoId={id} />
        </CardContent>
      </Card>
    </>
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
