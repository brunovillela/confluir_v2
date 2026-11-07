import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, Plus, Users } from "lucide-react"

import { RotuloTrilha } from "@/components/layout/trilha-rotulos"
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
  searchParams: Promise<{ salvo?: string; excluido?: string; nova?: string }>
}) {
  await requirePermissao("pessoal_gestao")
  const { excluido, nova } = await searchParams
  const funcoes = await listarFuncoes()

  return (
    <>
      <RotuloTrilha valores={{ funcoes: "Funções" }} />
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
          Cada função reúne o plano de cargos (atividades esperadas) e os
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

      <div className={`grid items-start gap-4 ${nova === "1" ? "lg:grid-cols-2" : ""}`}>
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base">Funções</CardTitle>
              {/* O formulário só aparece com o botão (padrão do Confluir). */}
              {nova !== "1" && (
                <Button size="sm" asChild>
                  <Link href="/painel/pessoal/atribuicoes/funcoes?nova=1">
                    <Plus />
                    Nova função
                  </Link>
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-hidden rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>Função</TableHead>
                    <TableHead className="text-right">Funcionários</TableHead>
                    <TableHead className="text-right">Atividades</TableHead>
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
                        {f.atividades}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {nova === "1" && <FuncaoForm aoCancelarHref="/painel/pessoal/atribuicoes/funcoes" />}
      </div>
    </>
  )
}
