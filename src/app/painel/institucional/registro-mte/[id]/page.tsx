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
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { obterRegistro } from "@/lib/db/registro-mte"
import { formatarData } from "@/lib/formato"
import {
  ROTULO_SITUACAO_REGISTRO,
  ROTULO_TIPO_REGISTRO,
} from "@/lib/registro-mte-constantes"

import { BotaoExcluirRegistro, RegistroForm } from "../registro-form"

export const metadata: Metadata = { title: "Registro sindical (MTE) — Confluir" }

function Campo({ rotulo, valor }: { rotulo: string; valor: string | null }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{rotulo}</dt>
      <dd className="mt-0.5 text-sm">{valor ?? "—"}</dd>
    </div>
  )
}

export default async function RegistroPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ editar?: string; salvo?: string }>
}) {
  await requirePermissao("registro_mte")
  const { id } = await params
  const { editar, salvo } = await searchParams
  const r = await obterRegistro(id)
  if (!r) notFound()

  const editando = editar === "1"
  const aqui = `/painel/institucional/registro-mte/${id}`

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/institucional/registro-mte">
            <ArrowLeft />
            Registro sindical (MTE)
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            {r.numero ?? "(sem número)"}
          </h1>
          <Badge variant="secondary">{ROTULO_TIPO_REGISTRO[r.tipo]}</Badge>
          <Badge variant="outline">{ROTULO_SITUACAO_REGISTRO[r.situacao]}</Badge>
        </div>
        <p className="text-muted-foreground mt-1 text-xs">
          {r.categoria ?? "Categoria não informada"}
          {r.data_registro && <> · registrado em {formatarData(r.data_registro)}</>}
        </p>
      </div>

      {salvo === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Registro salvo.</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">Dados do registro</CardTitle>
            {!editando && (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" asChild>
                  <Link href={`${aqui}?editar=1`}>
                    <Pencil />
                    Editar
                  </Link>
                </Button>
                <BotaoExcluirRegistro registroId={id} />
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {editando ? (
            <RegistroForm registro={r} aoCancelarHref={aqui} />
          ) : (
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Campo rotulo="Nº do processo / registro" valor={r.numero} />
              <Campo rotulo="Categoria representada" valor={r.categoria} />
              <Campo rotulo="Situação" valor={ROTULO_SITUACAO_REGISTRO[r.situacao]} />
              <Campo
                rotulo="Data do registro"
                valor={r.data_registro ? formatarData(r.data_registro) : null}
              />
              <Campo
                rotulo="Publicação (DOU)"
                valor={r.data_publicacao ? formatarData(r.data_publicacao) : null}
              />
              <div className="sm:col-span-2 lg:col-span-3">
                <dt className="text-muted-foreground text-xs">
                  Base territorial / abrangência
                </dt>
                <dd className="mt-0.5 text-sm whitespace-pre-wrap">
                  {r.abrangencia ?? "—"}
                </dd>
              </div>
              {r.observacoes && (
                <div className="sm:col-span-2 lg:col-span-3">
                  <dt className="text-muted-foreground text-xs">Observações</dt>
                  <dd className="mt-0.5 text-sm whitespace-pre-wrap">
                    {r.observacoes}
                  </dd>
                </div>
              )}
              <div>
                <dt className="text-muted-foreground text-xs">Documento</dt>
                <dd className="mt-0.5 text-sm">
                  {r.documentoUrl ? (
                    <Button variant="ghost" size="sm" asChild className="-ml-2">
                      <a href={r.documentoUrl} target="_blank" rel="noreferrer">
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
