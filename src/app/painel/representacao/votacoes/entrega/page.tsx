import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { requirePermissao } from "@/lib/auth"
import { comparativoEntrega } from "@/lib/db/votacao-entrega"
import { formatarData } from "@/lib/formato"

export const metadata: Metadata = { title: "Entrega das votações — Confluir" }

const n = (v: number) => v.toLocaleString("pt-BR")
const pct = (v: number, total: number) => (total > 0 ? `${Math.round((v / total) * 100)}%` : "—")

/**
 * Comparativo de entrega das votações pela internet (fase 4 do plano de
 * 16/10/2026): o que a análise SLB × Baker mediu à mão, para todas as
 * assembleias desta versão — base para decidir a fase 5 (voto sem código, SMS).
 */
export default async function EntregaPage() {
  await requirePermissao("assembleias")
  const linhas = await comparativoEntrega(12)

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/painel/representacao/votacoes" aria-label="Voltar para Votações">
            <ArrowLeft />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Entrega das votações</h1>
          <p className="text-muted-foreground mt-1 text-xs">
            As últimas assembleias com voto pela internet, lado a lado
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Link pessoal, canal e códigos</CardTitle>
          <CardDescription>
            O link pessoal entra sem código; o código por e-mail é o que o firewall da empresa barra. Quanto mais gente
            com o link antes da abertura e votando sem código, menos reclamação. O canal de quem votou é gravado desde
            17/10/2026 — antes disso aparece como não registrado.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {linhas.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">Nenhuma votação pela internet aberta ou encerrada ainda.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Assembleia</TableHead>
                  <TableHead className="text-right">Aptos</TableHead>
                  <TableHead className="text-right">Com link</TableHead>
                  <TableHead className="text-right">Link antes da abertura</TableHead>
                  <TableHead className="text-right">Votaram</TableHead>
                  <TableHead className="text-right">Sem código</TableHead>
                  <TableHead className="text-right">Códigos pedidos</TableHead>
                  <TableHead className="text-right">Pediram e não votaram</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {linhas.map((l) => {
                  const registrados = l.votaram - l.semRegistro
                  return (
                    <TableRow key={l.assembleiaId}>
                      <TableCell className="max-w-80 min-w-56">
                        <Link
                          href={`/painel/representacao/votacoes/apuracao/${l.assembleiaId}`}
                          className="text-primary line-clamp-1 font-medium hover:underline"
                        >
                          {l.nome ?? "(sem nome)"}
                        </Link>
                        <p className="text-muted-foreground line-clamp-1 text-xs">
                          {l.inicio ? formatarData(new Date(l.inicio).toISOString()) : "—"}
                          {l.campanha ? ` · ${l.campanha}` : ""}
                          {l.situacao === "aberta" && (
                            <Badge variant="outline" className="ml-1.5">
                              em votação
                            </Badge>
                          )}
                        </p>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{n(l.aptos)}</TableCell>
                      <TableCell className="text-right tabular-nums">{pct(l.link.enviados, l.aptos)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {l.link.antesDaAbertura === null ? "—" : pct(l.link.antesDaAbertura, l.aptos)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {n(l.votaram)} <span className="text-muted-foreground text-xs">{pct(l.votaram, l.aptos)}</span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {registrados > 0 ? pct(l.semCodigo, registrados) : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{n(l.codigos.enviados)}</TableCell>
                      <TableCell className="text-right tabular-nums">{n(l.codigos.pediramENaoVotaram)}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  )
}
