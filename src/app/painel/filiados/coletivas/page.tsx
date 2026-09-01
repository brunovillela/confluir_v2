import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, ExternalLink, UsersRound } from "lucide-react"

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
import { listarProcessos } from "@/lib/db/filiacao-coletiva"
import { CONDICAO_COLETIVA } from "@/lib/filiacao"
import { createAdminClient } from "@/lib/supabase/admin"
import { formatarData } from "@/lib/formato"
import { hojeSP } from "@/lib/db/comum"
import { tenantAtual } from "@/lib/tenant"

import { BotaoMaturarAgora } from "@/app/painel/representacao/filiacao-coletiva/coletiva-forms"

export const metadata: Metadata = { title: "Filiações coletivas — Confluir" }

/** Filiados atualmente no prazo de desistência (visão operacional). */
async function noPrazo(): Promise<{
  total: number
  vencemEm7: number
  linhas: {
    id: string
    nome: string | null
    prazo: string | null
    coletivaId: string | null
  }[]
}> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("filiacoes")
    .select("id, nome_completo, filiacao_coletiva_prazo, filiacao_coletiva_id")
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("filiacao_condicao", CONDICAO_COLETIVA)
    .order("filiacao_coletiva_prazo", { ascending: true, nullsFirst: false })
    .limit(100)
  if (error) return { total: 0, vencemEm7: 0, linhas: [] }
  const hoje = hojeSP()
  const limite = new Date(`${hoje}T12:00:00`)
  limite.setDate(limite.getDate() + 7)
  const limiteIso = limite.toISOString().slice(0, 10)
  const linhas = (data ?? []).map((f) => ({
    id: f.id as string,
    nome: f.nome_completo as string | null,
    prazo: f.filiacao_coletiva_prazo as string | null,
    coletivaId: f.filiacao_coletiva_id as string | null,
  }))
  return {
    total: linhas.length,
    vencemEm7: linhas.filter((l) => l.prazo && l.prazo <= limiteIso).length,
    linhas,
  }
}

export default async function FiliacoesColetivasPage() {
  await requirePermissao("filiacao_gestao", ["filiacao_filiados"])
  const [{ ativo, linhas }, prazo] = await Promise.all([
    listarProcessos(),
    noPrazo(),
  ])

  const aplicados = linhas.filter((p) => p.situacao === "processado")
  const totalCriados = aplicados.reduce((s, p) => s + p.totais.criados, 0)
  const totalDesistiram = aplicados.reduce((s, p) => s + p.totais.desistiram, 0)

  return (
    <>
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3">
          <Link href="/painel/filiados">
            <ArrowLeft />
            Filiados
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">
          Filiações coletivas
        </h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Acompanhamento dos processos deliberados em assembleia. O cadastro de
          novos processos fica em Representação Sindical → Filiação coletiva.
        </p>
      </div>

      {!ativo && (
        <Alert variant="destructive">
          <AlertDescription>
            O schema ainda não foi criado — rode{" "}
            <code>supabase/filiacao-coletiva.sql</code> no SQL Editor do
            Supabase.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Indicador titulo="Processos aplicados" valor={aplicados.length} />
        <Indicador titulo="Filiações criadas" valor={totalCriados} />
        <Indicador titulo="No prazo de desistência" valor={prazo.total} />
        <Indicador titulo="Desistiram" valor={totalDesistiram} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            <UsersRound className="mr-1 inline size-4 align-[-3px]" />
            Processos
          </CardTitle>
          <CardDescription>
            Cada processo nasce de uma rodada de assembleia com cláusula de
            filiação coletiva no ACT.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>Processo</TableHead>
                  <TableHead className="text-right">Criados</TableHead>
                  <TableHead className="text-right">Alterados</TableHead>
                  <TableHead className="text-right">Já ativos</TableHead>
                  <TableHead className="text-right">Desistiram</TableHead>
                  <TableHead className="hidden lg:table-cell">Prazo até</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {aplicados.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="text-muted-foreground h-20 text-center text-sm"
                    >
                      Nenhum processo aplicado ainda.
                    </TableCell>
                  </TableRow>
                )}
                {aplicados.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="max-w-64 font-medium">
                      <span className="block truncate">
                        {p.titulo ?? "(sem título)"}
                      </span>
                      <span className="text-muted-foreground block truncate text-xs">
                        {p.rodadaNome ?? "—"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {p.totais.criados}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {p.totais.recarimbados}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {p.totais.mantidos}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {p.totais.desistiram}
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden whitespace-nowrap lg:table-cell">
                      {p.prazo_ate ? formatarData(p.prazo_ate) : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild variant="ghost" size="sm">
                        <Link
                          href={`/painel/representacao/filiacao-coletiva/${p.id}`}
                        >
                          <ExternalLink className="size-3.5" />
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

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <CardTitle className="text-base">No prazo de desistência</CardTitle>
            <BotaoMaturarAgora />
          </div>
          <CardDescription>
            Filiados na condição &quot;{CONDICAO_COLETIVA}&quot;. Podem desistir
            pela área do filiado até a data do prazo; depois dela, a filiação é
            informada à fonte e vira ativa.
            {prazo.vencemEm7 > 0 && (
              <>
                {" "}
                <strong>{prazo.vencemEm7}</strong> vencem nos próximos 7 dias.
              </>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {prazo.linhas.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Ninguém no prazo de desistência no momento.
            </p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {prazo.linhas.map((l) => (
                <li key={l.id} className="flex items-center gap-2 px-3 py-2">
                  <Link
                    href={`/painel/filiados/${l.id}`}
                    className="min-w-0 flex-1 truncate text-sm hover:underline"
                  >
                    {l.nome ?? "(sem nome)"}
                  </Link>
                  <Badge variant="outline" className="whitespace-nowrap">
                    até {l.prazo ? formatarData(l.prazo) : "—"}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  )
}

function Indicador({ titulo, valor }: { titulo: string; valor: number }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-muted-foreground text-xs">{titulo}</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">{valor}</p>
      </CardContent>
    </Card>
  )
}
