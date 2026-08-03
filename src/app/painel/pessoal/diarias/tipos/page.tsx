import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
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
import { listarTiposDiaria } from "@/lib/db/diarias"
import { formatarMoeda } from "@/lib/formato"

import { ExcluirTipoDiariaBotao, TipoDiariaForm } from "./tipos-form"

export const metadata: Metadata = { title: "Tipos de diária — Confluir" }

function valorTexto(v: number | null): string {
  if (v === null) return ""
  return v.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export default async function TiposDiariaPage({
  searchParams,
}: {
  searchParams: Promise<{ salvo?: string; editar?: string }>
}) {
  await requirePermissao("pessoal_gestao", ["pessoal_diarias"])

  const { salvo, editar } = await searchParams
  const { disponivel, tipos } = await listarTiposDiaria()
  const emEdicao = editar ? (tipos.find((t) => t.id === editar) ?? null) : null

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/pessoal/diarias">
            <ArrowLeft />
            Diárias
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">
          Tipos de diária
        </h1>
        <p className="text-muted-foreground mt-1 text-xs">
          {tipos.length} tipo{tipos.length === 1 ? "" : "s"} — cada tipo define
          o valor pago por diária (ex.: viagem nacional com pernoite)
        </p>
      </div>

      {!disponivel && (
        <Alert>
          <AlertDescription>
            A tabela de tipos ainda não está preparada — rode{" "}
            <code>supabase/diarias.sql</code> no SQL Editor do Supabase.
          </AlertDescription>
        </Alert>
      )}

      {salvo === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Tipo salvo.</AlertDescription>
        </Alert>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tipos cadastrados</CardTitle>
            <CardDescription>
              Tipos usados em solicitações não podem ser excluídos — desative-os
              para tirar do formulário.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-hidden rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>Nome</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Situação</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tipos.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={4}
                        className="text-muted-foreground h-20 text-center text-sm"
                      >
                        Nenhum tipo de diária cadastrado.
                      </TableCell>
                    </TableRow>
                  )}
                  {tipos.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="max-w-56 truncate font-medium">
                        {t.nome}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap tabular-nums">
                        {formatarMoeda(t.valor_reembolso)}
                      </TableCell>
                      <TableCell>
                        {t.ativa ? (
                          <Badge
                            variant="outline"
                            className="border-success/40 text-success-fg"
                          >
                            Ativa
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="text-muted-foreground"
                          >
                            Inativa
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            asChild
                            className="h-7 px-2"
                          >
                            <Link
                              href={`/painel/pessoal/diarias/tipos?editar=${t.id}`}
                            >
                              Editar
                            </Link>
                          </Button>
                          <ExcluirTipoDiariaBotao id={t.id} />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* key força remontagem ao alternar criar/editar (defaultValue). */}
        <TipoDiariaForm
          key={emEdicao?.id ?? "novo"}
          tipo={
            emEdicao
              ? {
                  id: emEdicao.id,
                  nome: emEdicao.nome,
                  categoria: emEdicao.categoria ?? "",
                  valorTexto: valorTexto(emEdicao.valor_reembolso),
                  ativa: emEdicao.ativa,
                }
              : undefined
          }
        />
      </div>
    </>
  )
}
