import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, CalendarRange } from "lucide-react"

import { ApuracaoBadge } from "@/components/assembleias"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { requirePermissao } from "@/lib/auth"
import {
  listarRodadasDaCampanha,
  obterCampanha,
} from "@/lib/db/assembleias"
import { listarFontesPagadoras } from "@/lib/db/fontes"
import { formatarData } from "@/lib/formato"

import { CampanhaForm, type FonteOpcao } from "../campanha-form"
import { NovaRodadaForm } from "./nova-rodada-form"

export const metadata: Metadata = { title: "Campanha — Confluir" }

export default async function CampanhaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ criada?: string }>
}) {
  await requirePermissao("assembleias")
  const { id } = await params
  const { criada } = await searchParams

  const [campanha, fontes] = await Promise.all([
    obterCampanha(id),
    listarFontesPagadoras(),
  ])
  if (!campanha) notFound()

  const rodadas = await listarRodadasDaCampanha(id)
  const opcoes: FonteOpcao[] = fontes.map((f) => ({
    id: f.id,
    nome: f.nome_fantasia?.trim() || f.nome_razao?.trim() || "(sem nome)",
    inativa: f.inativa === true,
  }))

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/painel/representacao/assembleias" aria-label="Voltar para assembleias">
            <ArrowLeft />
          </Link>
        </Button>
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight">
            {campanha.tema ?? "(sem tema)"}
          </h1>
          <p className="text-muted-foreground mt-1 text-xs">
            Campanha registrada em {formatarData(campanha.created_at)}
          </p>
        </div>
      </div>

      {criada === "1" && (
        <Alert variant="success">
          <AlertDescription>
            Campanha criada. Agora cadastre as rodadas de assembleias.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-base">
              Rodadas de assembleias
            </CardTitle>
            <NovaRodadaForm campanhaId={campanha.id} />
          </div>
        </CardHeader>
        <CardContent>
          {rodadas.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              <CalendarRange className="mx-auto mb-2 size-5" />
              Nenhuma rodada cadastrada nesta campanha ainda.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rodada</TableHead>
                  <TableHead>Período</TableHead>
                  <TableHead className="text-right">Perguntas</TableHead>
                  <TableHead className="text-right">Assembleias</TableHead>
                  <TableHead className="text-right">Aptos</TableHead>
                  <TableHead className="text-right">Votos online</TableHead>
                  <TableHead>Situação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rodadas.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="max-w-72">
                      <Link
                        href={`/painel/representacao/assembleias/rodadas/${r.id}`}
                        className="text-primary line-clamp-2 font-medium hover:underline"
                      >
                        {r.nome ?? "(sem nome)"}
                      </Link>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {r.inicio || r.termino
                        ? `${formatarData(r.inicio)} a ${formatarData(r.termino)}`
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.perguntas}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.assembleias}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.aptos.toLocaleString("pt-BR")}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.votosOnline.toLocaleString("pt-BR")}
                    </TableCell>
                    <TableCell>
                      <ApuracaoBadge encerrada={r.apuracao_encerrada} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="max-w-3xl">
        <CampanhaForm campanha={campanha} fontes={opcoes} />
      </div>
    </>
  )
}
