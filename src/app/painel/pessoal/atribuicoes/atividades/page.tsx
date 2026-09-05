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
import { ROTULO_PRESENCA } from "@/lib/pessoal-sst-constantes"

export const metadata: Metadata = { title: "Atividades — Confluir" }

export default async function AtividadesPage({
  searchParams,
}: {
  searchParams: Promise<{ excluido?: string }>
}) {
  await requirePermissao("pessoal_gestao")
  const { excluido } = await searchParams
  const atividades = await listarAtividades()

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
          <h1 className="text-2xl font-semibold tracking-tight">Atividades</h1>
          <p className="text-muted-foreground mt-1 text-xs">
            {atividades.length} atividade{atividades.length === 1 ? "" : "s"} — abra uma
            para a análise SST completa e os executores.
          </p>
        </div>
        <Button asChild>
          <Link href="/painel/pessoal/atribuicoes/atividades/nova">
            <Plus />
            Nova atividade
          </Link>
        </Button>
      </div>

      {excluido === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Atividade excluída.</AlertDescription>
        </Alert>
      )}

      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead>Atividade</TableHead>
              <TableHead className="hidden md:table-cell">Presença</TableHead>
              <TableHead className="text-right">Executores</TableHead>
              <TableHead className="text-right">Perigos/Riscos</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {atividades.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="h-32">
                  <div className="text-muted-foreground flex flex-col items-center justify-center gap-2 text-center">
                    <ListChecks className="size-6" />
                    <p className="text-sm">Nenhuma atividade cadastrada.</p>
                    <Button asChild size="sm" variant="outline">
                      <Link href="/painel/pessoal/atribuicoes/atividades/nova">
                        <Plus />
                        Criar a primeira
                      </Link>
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            )}
            {atividades.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="font-medium">
                  <Link
                    href={`/painel/pessoal/atribuicoes/atividades/${t.id}`}
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
