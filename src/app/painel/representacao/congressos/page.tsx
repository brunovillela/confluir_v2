import type { Metadata } from "next"
import Link from "next/link"
import { Landmark, Plus } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { requirePermissao } from "@/lib/auth"
import { listarCongressos, SITUACOES_CONGRESSO } from "@/lib/db/congressos"
import { formatarData } from "@/lib/formato"
import { podeAcessar } from "@/lib/permissoes"

export const metadata: Metadata = { title: "Congressos — Confluir" }

const ROTULO = new Map(SITUACOES_CONGRESSO.map((s) => [s.valor, s.rotulo]))

function cor(s: string) {
  if (s === "inscricoes" || s === "em_andamento") return "success" as const
  if (s === "cancelado") return "destructive" as const
  return "secondary" as const
}

export default async function CongressosPage() {
  const sessao = await requirePermissao("congressos", ["congressos_gestao"])
  const gestor = podeAcessar(sessao.permissoes, "congressos_gestao")
  const { ativo, congressos } = await listarCongressos()

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Congressos e conferências</h1>
          <p className="text-muted-foreground mt-1 text-xs">
            Regimento, delegações, participantes, grupos e programa de cada edição.
          </p>
        </div>
        {gestor && ativo && (
          <Button asChild>
            <Link href="/painel/representacao/congressos/novo">
              <Plus />
              Novo congresso
            </Link>
          </Button>
        )}
      </div>

      {!ativo && (
        <Alert variant="destructive">
          <AlertDescription>
            As tabelas do módulo ainda não existem no banco: falta aplicar a migração
            <code className="mx-1">congressos_base</code>.
          </AlertDescription>
        </Alert>
      )}

      {ativo && (
        <Card>
          <CardHeader>
            <CardTitle>Edições</CardTitle>
            <CardDescription>
              {congressos.length === 0 ? "Nenhum congresso cadastrado." : `${congressos.length} congresso(s).`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {congressos.length === 0 ? (
              <div className="text-muted-foreground flex flex-col items-start gap-3 text-sm">
                <Landmark className="size-6" />
                <p>
                  Crie o congresso a partir de um modelo ou copiando a edição anterior. As regras do regimento ficam na
                  configuração e podem ser ajustadas a cada edição.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Congresso</TableHead>
                      <TableHead>Situação</TableHead>
                      <TableHead>Período</TableHead>
                      <TableHead className="text-right">Participantes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {congressos.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell>
                          <Link href={`/painel/representacao/congressos/${c.id}`} className="font-medium hover:underline">
                            {c.edicao ? `${c.edicao}º ` : ""}
                            {c.nome}
                          </Link>
                          {c.modo === "participa" && (
                            <Badge variant="outline" className="ml-2">
                              Participação
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={cor(c.situacao)}>{ROTULO.get(c.situacao) ?? c.situacao}</Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground whitespace-nowrap">
                          {c.inicio ? `${formatarData(c.inicio)}${c.termino ? ` a ${formatarData(c.termino)}` : ""}` : "Sem evento"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{c.participantes}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </>
  )
}
