import type { Metadata } from "next"
import Link from "next/link"
import { DoorOpen, Inbox, Plus } from "lucide-react"

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
import { listarEspacos } from "@/lib/db/espacos"
import { rotuloPublico, rotuloVisita } from "@/lib/espacos-constantes"

export const metadata: Metadata = { title: "Cessão de espaços — Confluir" }

export default async function EspacosPage() {
  const sessao = await requirePermissao("espacos", ["espacos_gestao"])
  const podeGerir = sessao.permissoes?.espacos_gestao === true
  const { linhas, esquemaPronto } = await listarEspacos()

  const ativos = linhas.filter((e) => e.ativo).length
  const comAgenda = linhas.filter((e) => e.janelas > 0).length
  const bloqueados = linhas.filter((e) => e.bloqueiosAtivos > 0).length

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Cessão de espaços
          </h1>
          <p className="text-muted-foreground mt-1 text-xs">
            Os espaços que a entidade pode ceder, com a agenda e os bloqueios
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {esquemaPronto && (
            <Button variant="outline" asChild>
              <Link href="/painel/espacos/pedidos">
                <Inbox />
                Pedidos de uso
              </Link>
            </Button>
          )}
          {podeGerir && esquemaPronto && (
            <Button asChild>
              <Link href="/painel/espacos/novo">
                <Plus />
                Novo espaço
              </Link>
            </Button>
          )}
        </div>
      </div>

      {!esquemaPronto && (
        <Alert variant="warning">
          <AlertDescription>
            Cessão de espaços ainda não configurada — rode{" "}
            <code>supabase/cessao-espacos.sql</code> no SQL Editor do Supabase
            para criar as tabelas do espaço, dos ambientes, das janelas de
            agenda e dos bloqueios.
          </AlertDescription>
        </Alert>
      )}

      {esquemaPronto && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <CardResumo rotulo="Espaços cadastrados" valor={linhas.length} />
          <CardResumo rotulo="Disponíveis" valor={ativos} />
          <CardResumo rotulo="Com agenda definida" valor={comAgenda} />
          <CardResumo rotulo="Com bloqueio ativo" valor={bloqueados} />
        </div>
      )}

      <Card>
        <CardContent>
          {linhas.length === 0 ? (
            <div className="text-muted-foreground py-10 text-center text-sm">
              <DoorOpen className="mx-auto mb-2 size-5" />
              <p>Nenhum espaço cadastrado ainda.</p>
              {podeGerir && esquemaPronto && (
                <p className="mt-1 text-xs">
                  Comece pelo auditório ou pelo salão — o espaço nasce com as
                  regras de cessão e ganha a agenda depois.
                </p>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Espaço</TableHead>
                  <TableHead>Sede</TableHead>
                  <TableHead className="text-right">Lotação</TableHead>
                  <TableHead>Ambientes</TableHead>
                  <TableHead>Agenda</TableHead>
                  <TableHead>Quem pode solicitar</TableHead>
                  <TableHead>Visita técnica</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {linhas.map((e) => (
                  <TableRow key={e.id} className={e.ativo ? undefined : "opacity-60"}>
                    <TableCell className="max-w-72">
                      <Link
                        href={`/painel/espacos/${e.id}`}
                        className="text-primary font-medium hover:underline"
                      >
                        {e.nome}
                      </Link>
                      {!e.ativo && (
                        <Badge variant="secondary" className="ml-2">
                          Indisponível
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>{e.sedeNome ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {e.capacidade?.toLocaleString("pt-BR") ?? "—"}
                    </TableCell>
                    <TableCell className="tabular-nums">{e.ambientes}</TableCell>
                    <TableCell>
                      {e.janelas === 0 ? (
                        <Badge
                          variant="outline"
                          className="border-warning/40 text-warning-fg"
                        >
                          Sem horários
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-sm">
                          {e.janelas} faixa{e.janelas === 1 ? "" : "s"}
                          {e.bloqueiosAtivos > 0 && (
                            <>
                              {" · "}
                              <span className="text-destructive">
                                {e.bloqueiosAtivos} bloqueio
                                {e.bloqueiosAtivos === 1 ? "" : "s"}
                              </span>
                            </>
                          )}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>{rotuloPublico(e.publico)}</TableCell>
                    <TableCell>{rotuloVisita(e.visita)}</TableCell>
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

function CardResumo({ rotulo, valor }: { rotulo: string; valor: number }) {
  return (
    <Card>
      <CardContent>
        <p className="text-muted-foreground text-xs">{rotulo}</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">
          {valor.toLocaleString("pt-BR")}
        </p>
      </CardContent>
    </Card>
  )
}
