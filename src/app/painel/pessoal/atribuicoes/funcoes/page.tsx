import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, Users } from "lucide-react"

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
import { Badge } from "@/components/ui/badge"
import { requirePermissao } from "@/lib/auth"
import { listarFuncoes } from "@/lib/db/pessoal-sst"

import { FuncaoForm } from "./funcao-form"
import { ImportarCargos } from "./importar-cargos"

export const metadata: Metadata = { title: "Funções — Confluir" }

export default async function FuncoesPage({
  searchParams,
}: {
  searchParams: Promise<{ salvo?: string; excluido?: string }>
}) {
  await requirePermissao("pessoal_gestao")
  const { excluido } = await searchParams
  const funcoes = await listarFuncoes()

  return (
    <>
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3">
          <Link href="/painel/pessoal/atribuicoes">
            <ArrowLeft />
            Atribuições
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">
          Funções e plano de cargos
        </h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Cada função reúne o plano de cargos (tarefas esperadas) e os
          funcionários que a ocupam — base do comparativo com o contrato.
        </p>
      </div>

      {excluido === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Função excluída.</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Reaproveitar os cargos existentes
          </CardTitle>
          <CardDescription>
            Os funcionários já têm cargo nos vínculos. Gere as funções a partir
            deles em vez de cadastrar tudo à mão (pode rodar de novo ao admitir
            gente com cargo novo).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ImportarCargos />
        </CardContent>
      </Card>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base">Funções</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-hidden rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>Função</TableHead>
                    <TableHead className="text-right">Funcionários</TableHead>
                    <TableHead className="text-right">Tarefas</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {funcoes.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="h-28">
                        <div className="text-muted-foreground flex flex-col items-center justify-center gap-2 text-center">
                          <Users className="size-6" />
                          <p className="text-sm">Nenhuma função cadastrada.</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                  {funcoes.map((f) => (
                    <TableRow key={f.id}>
                      <TableCell className="font-medium">
                        <Link
                          href={`/painel/pessoal/atribuicoes/funcoes/${f.id}`}
                          className="hover:underline"
                        >
                          {f.nome ?? "(sem nome)"}
                        </Link>
                        {!f.ativo && (
                          <Badge variant="secondary" className="ml-2">
                            Inativa
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {f.funcionarios}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {f.tarefas}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <FuncaoForm />
      </div>
    </>
  )
}
