import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, ExternalLink, Handshake } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { requirePermissao } from "@/lib/auth"
import { listarConvenios } from "@/lib/db/filiacao-convenios"
import { formatarData, formatarTelefone } from "@/lib/formato"

export const metadata: Metadata = { title: "Convênios — Confluir" }

/**
 * A carteira de convênios da entidade, como a secretaria a vê: todos, vigentes
 * ou não, com as unidades de atendimento. O portal mostra só os vigentes.
 */
export default async function ConveniosPage() {
  await requirePermissao("filiacao_convenios", ["filiacao_consulta_convenios", "filiacao_gestao"])
  const convenios = await listarConvenios()
  const vigentes = convenios.filter((c) => c.vigente).length

  return (
    <>
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3">
          <Link href="/painel/filiados">
            <ArrowLeft />
            Filiados
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Convênios</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {convenios.length} convênio(s), {vigentes} vigente(s). O filiado vê os vigentes no portal.
        </p>
      </div>

      {convenios.length === 0 ? (
        <Card>
          <CardContent>
            <div className="text-muted-foreground flex flex-col items-center gap-2 py-10 text-center">
              <Handshake className="size-6" />
              <p className="text-sm">Nenhum convênio cadastrado.</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Carteira</CardTitle>
            <CardDescription>Por categoria; a coluna de unidades mostra onde o filiado é atendido.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Conveniador</TableHead>
                    <TableHead>Situação</TableHead>
                    <TableHead className="hidden md:table-cell">Término</TableHead>
                    <TableHead>Unidades</TableHead>
                    <TableHead className="w-24" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {convenios.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="text-muted-foreground whitespace-nowrap">{c.categoria ?? "—"}</TableCell>
                      <TableCell className="font-medium">
                        {c.conveniador ?? "—"}
                        {c.infoSumarias && (
                          <span className="text-muted-foreground block max-w-72 truncate text-xs" title={c.infoSumarias}>
                            {c.infoSumarias}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {c.vigente ? (
                          <Badge variant="success">vigente</Badge>
                        ) : c.ativo ? (
                          <Badge variant="warning">vencido</Badge>
                        ) : (
                          <Badge variant="outline">inativo</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground hidden whitespace-nowrap md:table-cell">
                        {formatarData(c.dataTermino)}
                      </TableCell>
                      <TableCell className="max-w-md whitespace-normal">
                        {c.unidades.length === 0 ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <ul className="grid gap-1 text-xs">
                            {c.unidades.map((u) => (
                              <li key={u.id}>
                                <span className="font-medium">{u.nome ?? "Unidade"}</span>
                                {u.endereco && <span className="text-muted-foreground"> · {u.endereco}</span>}
                                {u.telefones.length > 0 && (
                                  <span className="text-muted-foreground tabular-nums"> · {u.telefones.map((t) => formatarTelefone(t)).join(", ")}</span>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                      </TableCell>
                      <TableCell>
                        {c.arquivoUrl && (
                          <a href={c.arquivoUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs underline">
                            <ExternalLink className="size-3" /> contrato
                          </a>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  )
}
