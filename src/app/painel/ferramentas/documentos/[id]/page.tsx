import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Download, FileText, Pencil } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { GrupoColapsavel } from "@/components/grupo-colapsavel"
import { requirePermissao } from "@/lib/auth"
import {
  listarCategoriasDocumentos,
  obterDocumento,
  type VersaoDocumento,
} from "@/lib/db/documentos"
import { formatarData } from "@/lib/formato"

import {
  BotaoExcluirDocumento,
  BotaoExcluirVersao,
  DocumentoForm,
  NovaVersaoForm,
} from "../documento-forms"

export const metadata: Metadata = { title: "Documento — Confluir" }

function rotuloVigencia(v: VersaoDocumento): string | null {
  if (v.semVigencia) return "Vigência indeterminada"
  if (!v.vigenciaInicio && !v.vigenciaTermino) return null
  const ini = v.vigenciaInicio ? formatarData(v.vigenciaInicio) : "—"
  const fim = v.vigenciaTermino ? formatarData(v.vigenciaTermino) : "—"
  return `Vigência ${ini} – ${fim}`
}

export default async function DocumentoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ editar?: string; salvo?: string; erroArquivo?: string }>
}) {
  await requirePermissao("ferramentas_documentos")
  const { id } = await params
  const brutos = await searchParams

  const doc = await obterDocumento(id)
  if (!doc) notFound()

  const editando = brutos.editar === "1"
  const aqui = `/painel/ferramentas/documentos/${id}`
  const categorias = editando ? await listarCategoriasDocumentos() : []

  if (editando) {
    return (
      <>
        <div>
          <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
            <Link href={aqui}>
              <ArrowLeft />
              Documento
            </Link>
          </Button>
          <h1 className="text-2xl font-semibold tracking-tight">
            Editar documento
          </h1>
        </div>
        <Card>
          <CardContent className="pt-6">
            <DocumentoForm
              documento={{
                id: doc.id,
                documento: doc.documento,
                categoriaIds: doc.categoriaIds,
              }}
              categorias={categorias}
              aoCancelarHref={aqui}
            />
          </CardContent>
        </Card>
      </>
    )
  }

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
            <Link href="/painel/ferramentas/documentos">
              <ArrowLeft />
              Documentos
            </Link>
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <FileText className="text-muted-foreground size-5" />
            <h1 className="text-2xl font-semibold tracking-tight">
              {doc.documento ?? "(sem nome)"}
            </h1>
          </div>
          {doc.categorias.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {doc.categorias.map((c) => (
                <Badge key={c} variant="secondary">
                  {c}
                </Badge>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href={`${aqui}?editar=1`}>
              <Pencil />
              Editar
            </Link>
          </Button>
          <BotaoExcluirDocumento documentoId={doc.id} />
        </div>
      </div>

      {brutos.salvo === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Alteração salva.</AlertDescription>
        </Alert>
      )}
      {brutos.erroArquivo === "1" && (
        <Alert variant="warning">
          <AlertDescription>
            O documento foi criado, mas o arquivo não pôde ser enviado. Tente
            adicionar a versão abaixo.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent>
          <p className="mb-3 text-sm font-medium">
            Versões{" "}
            <span className="text-muted-foreground font-normal">
              ({doc.versoes.length})
            </span>
          </p>
          {doc.versoes.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-sm">
              Nenhuma versão com arquivo. Adicione a primeira abaixo.
            </p>
          ) : (
            <ul className="divide-y">
              {doc.versoes.map((v) => {
                const vig = rotuloVigencia(v)
                return (
                  <li
                    key={v.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <p className="font-medium">{v.nome ?? "(sem título)"}</p>
                      <p className="text-muted-foreground text-xs">
                        {v.criadoEm && <>Adicionada em {formatarData(v.criadoEm)}</>}
                        {vig && <> · {vig}</>}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      {v.arquivoUrl ? (
                        <Button variant="outline" size="sm" asChild>
                          <a
                            href={v.arquivoUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <Download />
                            Abrir PDF
                          </a>
                        </Button>
                      ) : (
                        <span className="text-muted-foreground text-xs">
                          arquivo indisponível
                        </span>
                      )}
                      <BotaoExcluirVersao versaoId={v.id} documentoId={doc.id} />
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <GrupoColapsavel
        titulo="Adicionar nova versão"
        descricao="Sobe um novo PDF como versão deste documento"
        aberto={doc.versoes.length === 0}
      >
        <NovaVersaoForm documentoId={doc.id} />
      </GrupoColapsavel>
    </>
  )
}
