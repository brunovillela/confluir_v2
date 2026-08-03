import type { Metadata } from "next"
import Link from "next/link"
import { FileText, Plus, Tags } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { requirePermissao } from "@/lib/auth"
import {
  listarCategoriasDocumentos,
  listarDocumentos,
} from "@/lib/db/documentos"
import { formatarData } from "@/lib/formato"

export const metadata: Metadata = { title: "Documentos — Confluir" }

const SELECT_FILTRO =
  "border-input bg-background text-foreground h-9 max-w-52 truncate rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

type Params = { busca?: string; categoria?: string; excluido?: string }

export default async function DocumentosPage({
  searchParams,
}: {
  searchParams: Promise<Params>
}) {
  await requirePermissao("ferramentas_documentos")

  const brutos = await searchParams
  const busca = (brutos.busca ?? "").trim()

  const categorias = await listarCategoriasDocumentos()
  const categoriaId = categorias.some((c) => c.id === brutos.categoria)
    ? brutos.categoria
    : ""
  const documentos = await listarDocumentos({ busca, categoriaId })

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Documentos</h1>
          <p className="text-muted-foreground mt-1 text-xs">
            Documentos institucionais com versionamento
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link href="/painel/ferramentas/documentos/categorias">
              <Tags />
              Categorias
            </Link>
          </Button>
          <Button asChild>
            <Link href="/painel/ferramentas/documentos/novo">
              <Plus />
              Novo documento
            </Link>
          </Button>
        </div>
      </div>

      {brutos.excluido === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Documento excluído.</AlertDescription>
        </Alert>
      )}

      <form
        className="flex flex-wrap items-center gap-2"
        action="/painel/ferramentas/documentos"
      >
        <input
          type="search"
          name="busca"
          defaultValue={busca}
          placeholder="Nome do documento"
          className={`${SELECT_FILTRO} w-64 max-w-full`}
        />
        <select
          name="categoria"
          defaultValue={categoriaId}
          className={SELECT_FILTRO}
        >
          <option value="">Todas as categorias</option>
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
        <Button type="submit" variant="outline" size="sm">
          Filtrar
        </Button>
      </form>

      <Card>
        <CardContent>
          {documentos.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              <FileText className="mx-auto mb-2 size-5" />
              Nenhum documento encontrado com estes filtros.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Documento</TableHead>
                  <TableHead>Categorias</TableHead>
                  <TableHead className="text-right">Versões</TableHead>
                  <TableHead>Atualizado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documentos.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="max-w-96">
                      <Link
                        href={`/painel/ferramentas/documentos/${d.id}`}
                        className="text-primary font-medium hover:underline"
                      >
                        <span className="line-clamp-2">
                          {d.documento ?? "(sem nome)"}
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {d.categorias.length === 0 ? (
                          <span className="text-muted-foreground text-sm">
                            —
                          </span>
                        ) : (
                          d.categorias.map((c) => (
                            <Badge key={c} variant="secondary" className="whitespace-nowrap">
                              {c}
                            </Badge>
                          ))
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {d.versoes}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      {d.atualizadoEm ? formatarData(d.atualizadoEm) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  )
}
