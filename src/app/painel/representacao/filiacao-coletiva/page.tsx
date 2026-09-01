import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, UsersRound } from "lucide-react"

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
import { listarAcordos } from "@/lib/db/acordos"
import {
  listarProcessos,
  rodadasDisponiveis,
} from "@/lib/db/filiacao-coletiva"
import { formatarData } from "@/lib/formato"

import { NovoProcessoForm } from "./coletiva-forms"

export const metadata: Metadata = { title: "Filiação coletiva — Confluir" }

export function SituacaoBadge({ situacao }: { situacao: string }) {
  if (situacao === "processado") {
    return (
      <Badge variant="outline" className="border-success/40 text-success-fg">
        Aplicado
      </Badge>
    )
  }
  if (situacao === "revertido") {
    return (
      <Badge variant="outline" className="text-destructive border-destructive/40">
        Revertido
      </Badge>
    )
  }
  return <Badge variant="secondary">Rascunho</Badge>
}

export default async function FiliacaoColetivaPage({
  searchParams,
}: {
  searchParams: Promise<{ excluido?: string }>
}) {
  await requirePermissao("assembleias")
  const { excluido } = await searchParams
  const [{ ativo, linhas }, rodadas, acordosRes] = await Promise.all([
    listarProcessos(),
    rodadasDisponiveis(),
    listarAcordos().catch(() => []),
  ])

  const acordos = acordosRes.map((a) => ({ id: a.id, titulo: a.titulo }))

  return (
    <>
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3">
          <Link href="/painel/representacao">
            <ArrowLeft />
            Representação Sindical
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">
          Filiação coletiva
        </h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Quando a assembleia aprova um ACT com cláusula de filiação coletiva,
          todos os aptos a votar tornam-se filiados. Aqui se cadastra o
          processo; o acompanhamento fica em Filiados → Filiações coletivas.
        </p>
      </div>

      {!ativo && (
        <Alert variant="destructive">
          <AlertDescription>
            O schema desta área ainda não foi criado — rode{" "}
            <code>supabase/filiacao-coletiva.sql</code> no SQL Editor do
            Supabase para ativar.
          </AlertDescription>
        </Alert>
      )}

      {excluido === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Rascunho excluído.</AlertDescription>
        </Alert>
      )}

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead>Processo</TableHead>
              <TableHead className="hidden md:table-cell">Rodada</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead className="text-right">Aptos</TableHead>
              <TableHead className="hidden lg:table-cell">Prazo até</TableHead>
              <TableHead className="hidden sm:table-cell">Criado por</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {linhas.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="h-28">
                  <div className="text-muted-foreground flex flex-col items-center justify-center gap-2 text-center">
                    <UsersRound className="size-6" />
                    <p className="text-sm">
                      Nenhum processo de filiação coletiva ainda.
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            )}
            {linhas.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="max-w-64 font-medium">
                  <Link
                    href={`/painel/representacao/filiacao-coletiva/${p.id}`}
                    className="hover:underline"
                  >
                    <span className="block truncate">
                      {p.titulo ?? "(sem título)"}
                    </span>
                  </Link>
                  {p.acordoTitulo && (
                    <span className="text-muted-foreground block truncate text-xs">
                      {p.acordoTitulo}
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground hidden max-w-48 truncate md:table-cell">
                  {p.rodadaNome ?? "—"}
                </TableCell>
                <TableCell>
                  <SituacaoBadge situacao={p.situacao} />
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {p.totais.total || "—"}
                </TableCell>
                <TableCell className="text-muted-foreground hidden whitespace-nowrap lg:table-cell">
                  {p.prazo_ate ? formatarData(p.prazo_ate) : "—"}
                </TableCell>
                <TableCell className="text-muted-foreground hidden max-w-36 truncate sm:table-cell">
                  {p.criadoPorNome ?? "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle className="text-base">Novo processo</CardTitle>
          <CardDescription>
            Só aparecem rodadas marcadas com a cláusula de filiação coletiva no
            cadastro da rodada e ainda sem processo vinculado.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <NovoProcessoForm rodadas={rodadas} acordos={acordos} />
        </CardContent>
      </Card>
    </>
  )
}
