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
import { listarTiposReembolso } from "@/lib/db/reembolsos"
import { formatarMoeda } from "@/lib/formato"

import { ExcluirTipoReembolsoBotao, TipoReembolsoForm } from "./tipos-form"

export const metadata: Metadata = {
  title: "Tipos de reembolso do ACT — Confluir",
}

function limiteTexto(v: number | null): string {
  if (v === null) return ""
  return v.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export default async function TiposReembolsoPage({
  searchParams,
}: {
  searchParams: Promise<{ salvo?: string; editar?: string }>
}) {
  await requirePermissao("pessoal_gestao")

  const { salvo, editar } = await searchParams
  const { disponivel, tipos } = await listarTiposReembolso()
  const emEdicao = editar ? (tipos.find((t) => t.id === editar) ?? null) : null

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/pessoal/reembolsos">
            <ArrowLeft />
            Reembolsos do ACT
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">
          Tipos de reembolso do ACT
        </h1>
        <p className="text-muted-foreground mt-1 text-xs">
          {tipos.length} tipo{tipos.length === 1 ? "" : "s"} — os reembolsos
          aprovados no acordo coletivo, com teto opcional por solicitação
        </p>
      </div>

      {!disponivel && (
        <Alert>
          <AlertDescription>
            As tabelas ainda não foram criadas — rode{" "}
            <code>supabase/reembolsos-act.sql</code> no SQL Editor do Supabase.
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
                    <TableHead className="text-right">Teto</TableHead>
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
                        Nenhum tipo de reembolso cadastrado.
                      </TableCell>
                    </TableRow>
                  )}
                  {tipos.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="max-w-56 font-medium">
                        <span className="block truncate">{t.nome}</span>
                        {t.descricao && (
                          <span className="text-muted-foreground block truncate text-xs">
                            {t.descricao}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap tabular-nums">
                        {t.valor_limite !== null
                          ? formatarMoeda(t.valor_limite)
                          : "Sem teto"}
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
                              href={`/painel/pessoal/reembolsos/tipos?editar=${t.id}`}
                            >
                              Editar
                            </Link>
                          </Button>
                          <ExcluirTipoReembolsoBotao id={t.id} />
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
        <TipoReembolsoForm
          key={emEdicao?.id ?? "novo"}
          tipo={
            emEdicao
              ? {
                  id: emEdicao.id,
                  nome: emEdicao.nome,
                  descricao: emEdicao.descricao,
                  limiteTexto: limiteTexto(emEdicao.valor_limite),
                  ativa: emEdicao.ativa,
                }
              : undefined
          }
        />
      </div>
    </>
  )
}
