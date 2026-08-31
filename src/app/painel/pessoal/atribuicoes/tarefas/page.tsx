import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, ListChecks, Plus } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { requirePermissao } from "@/lib/auth"
import { listarAtividades } from "@/lib/db/pessoal-sst"
import {
  ROTULO_PRESENCA,
  ROTULO_RECORRENCIA,
} from "@/lib/pessoal-sst-constantes"

export const metadata: Metadata = { title: "Tarefas — Confluir" }

export default async function TarefasPage({
  searchParams,
}: {
  searchParams: Promise<{ excluido?: string }>
}) {
  await requirePermissao("pessoal_gestao")
  const { excluido } = await searchParams
  const tarefas = await listarAtividades()

  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3">
            <Link href="/painel/pessoal/atribuicoes">
              <ArrowLeft />
              Atribuições
            </Link>
          </Button>
          <h1 className="text-2xl font-semibold tracking-tight">Tarefas</h1>
          <p className="text-muted-foreground mt-1 text-xs">
            {tarefas.length} tarefa{tarefas.length === 1 ? "" : "s"} — abra uma
            para a análise SST completa e os executores.
          </p>
        </div>
        <Button asChild>
          <Link href="/painel/pessoal/atribuicoes/tarefas/nova">
            <Plus />
            Nova tarefa
          </Link>
        </Button>
      </div>

      {excluido === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Tarefa excluída.</AlertDescription>
        </Alert>
      )}

      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead>Tarefa</TableHead>
              <TableHead className="hidden sm:table-cell">Função</TableHead>
              <TableHead className="hidden md:table-cell">Recorrência</TableHead>
              <TableHead className="hidden md:table-cell">Presença</TableHead>
              <TableHead className="text-right">Executores</TableHead>
              <TableHead className="text-right">Perigos/Riscos</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tarefas.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="h-32">
                  <div className="text-muted-foreground flex flex-col items-center justify-center gap-2 text-center">
                    <ListChecks className="size-6" />
                    <p className="text-sm">Nenhuma tarefa cadastrada.</p>
                    <Button asChild size="sm" variant="outline">
                      <Link href="/painel/pessoal/atribuicoes/tarefas/nova">
                        <Plus />
                        Criar a primeira
                      </Link>
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            )}
            {tarefas.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="font-medium">
                  <Link
                    href={`/painel/pessoal/atribuicoes/tarefas/${t.id}`}
                    className="hover:underline"
                  >
                    {t.nome ?? "(sem nome)"}
                  </Link>
                  {!t.avaliada_em && (
                    <Badge variant="secondary" className="ml-2">
                      Sem avaliação
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground hidden sm:table-cell">
                  {t.funcaoNome ?? "—"}
                </TableCell>
                <TableCell className="text-muted-foreground hidden md:table-cell">
                  {t.recorrencia ? ROTULO_RECORRENCIA[t.recorrencia] : "—"}
                </TableCell>
                <TableCell className="text-muted-foreground hidden md:table-cell">
                  {t.presenca ? ROTULO_PRESENCA[t.presenca] : "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {t.executores}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {t.perigos}/{t.riscos}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  )
}
