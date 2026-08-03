import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, GraduationCap } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { requirePermissao } from "@/lib/auth"
import { listarTreinamentos } from "@/lib/db/treinamentos"

import { TreinamentoForm } from "./treinamento-form"

export const metadata: Metadata = { title: "Treinamentos — Confluir" }

function horas(v: number | null): string {
  if (v === null) return "—"
  return `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}h`
}

export default async function TreinamentosPage({
  searchParams,
}: {
  searchParams: Promise<{ salvo?: string; excluido?: string; editar?: string }>
}) {
  await requirePermissao("pessoal_gestao")

  const { salvo, excluido, editar } = await searchParams
  const treinamentos = await listarTreinamentos()
  const emEdicao = editar
    ? (treinamentos.find((t) => t.id === editar) ?? null)
    : null

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/pessoal">
            <ArrowLeft />
            Pessoal
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Treinamentos</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          {treinamentos.length} treinamento
          {treinamentos.length === 1 ? "" : "s"} — abra um treinamento para
          gerenciar os alunos e certificados
        </p>
      </div>

      {salvo === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Treinamento salvo.</AlertDescription>
        </Alert>
      )}
      {excluido === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Treinamento excluído.</AlertDescription>
        </Alert>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Catálogo</CardTitle>
            <CardDescription>
              Treinamentos com alunos não podem ser excluídos.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-hidden rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>Treinamento</TableHead>
                    <TableHead className="text-right">Carga</TableHead>
                    <TableHead className="hidden sm:table-cell">
                      Validade
                    </TableHead>
                    <TableHead className="text-right">Alunos</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {treinamentos.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="h-32">
                        <div className="text-muted-foreground flex flex-col items-center justify-center gap-2 text-center">
                          <GraduationCap className="size-6" />
                          <p className="text-sm">
                            Nenhum treinamento cadastrado.
                          </p>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                  {treinamentos.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="max-w-56 font-medium">
                        <Link
                          href={`/painel/pessoal/treinamentos/${t.id}`}
                          className="hover:underline"
                        >
                          <span className="block truncate">
                            {t.treinamento ?? "(sem nome)"}
                          </span>
                        </Link>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {horas(t.carga_horaria)}
                      </TableCell>
                      <TableCell className="text-muted-foreground hidden sm:table-cell">
                        {t.vencimento_meses
                          ? `${t.vencimento_meses} meses`
                          : "Não expira"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {t.alunos}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          asChild
                          className="h-7 px-2"
                        >
                          <Link
                            href={`/painel/pessoal/treinamentos?editar=${t.id}`}
                          >
                            Editar
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* key força remontagem ao alternar criar/editar (defaultValue). */}
        <TreinamentoForm
          key={emEdicao?.id ?? "novo"}
          treinamento={
            emEdicao
              ? {
                  id: emEdicao.id,
                  treinamento: emEdicao.treinamento,
                  carga_horaria: emEdicao.carga_horaria,
                  vencimento_meses: emEdicao.vencimento_meses,
                  alunos: emEdicao.alunos,
                }
              : undefined
          }
        />
      </div>
    </>
  )
}
