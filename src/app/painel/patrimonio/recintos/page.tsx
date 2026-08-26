import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, MapPin, Plus } from "lucide-react"

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
import { listarRecintos } from "@/lib/db/patrimonio"
import { podeAcessar } from "@/lib/permissoes"

export const metadata: Metadata = { title: "Recintos — Confluir" }

export default async function RecintosPage() {
  const sessao = await requirePermissao("patrimonio_geral", [
    "patrimonio_leitura",
  ])
  const podeEditar = podeAcessar(sessao.permissoes, "patrimonio_geral")
  const recintos = await listarRecintos()

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2">
          <Link href="/painel/patrimonio">
            <ArrowLeft />
            Patrimônio
          </Link>
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Recintos</h1>
            <p className="text-muted-foreground mt-1 text-xs">
              Locais onde os bens patrimoniais ficam alocados
            </p>
          </div>
          {podeEditar && (
            <Button asChild>
              <Link href="/painel/patrimonio/recintos/novo">
                <Plus />
                Novo recinto
              </Link>
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardContent>
          {recintos.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              <MapPin className="mx-auto mb-2 size-5" />
              Nenhum recinto cadastrado.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Recinto</TableHead>
                  <TableHead>Código</TableHead>
                  <TableHead>Sede</TableHead>
                  <TableHead className="text-right">Itens</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recintos.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="max-w-72">
                      <Link
                        href={`/painel/patrimonio/recintos/${r.id}`}
                        className="text-primary font-medium hover:underline"
                      >
                        <span className="line-clamp-1">
                          {r.nome ?? "(sem nome)"}
                        </span>
                      </Link>
                      {r.descricao_fisica && (
                        <span className="text-muted-foreground line-clamp-1 text-xs">
                          {r.descricao_fisica}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {r.codigo ?? "—"}
                    </TableCell>
                    <TableCell>
                      {r.sede ? (
                        <Badge variant="outline">{r.sede}</Badge>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.totalItens.toLocaleString("pt-BR")}
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
