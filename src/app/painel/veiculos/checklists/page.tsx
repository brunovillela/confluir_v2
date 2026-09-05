import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, ClipboardCheck, Settings } from "lucide-react"

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
import {
  listarChecklists,
  obterConfig,
  situacaoDaFrota,
} from "@/lib/db/veiculos-checklist"
import { formatarData, formatarDataHora } from "@/lib/formato"
import { podeAcessar } from "@/lib/permissoes"

import { SeloChecklist } from "./checklist-forms"

export const metadata: Metadata = { title: "Checklist da frota — Confluir" }

export default async function ChecklistsPage() {
  const sessao = await requirePermissao("veiculos", ["veiculos_gestao"])
  const gestor = podeAcessar(sessao.permissoes, "veiculos_gestao")
  // Só o funcionário dedicado (ou a gestão) registra a verificação.
  const podeRealizar = podeAcessar(sessao.permissoes, "veiculos_checklist", [
    "veiculos_gestao",
  ])

  const [{ ativo, linhas: frota }, historico, { config }] = await Promise.all([
    situacaoDaFrota(),
    listarChecklists({ limite: 30 }),
    obterConfig(),
  ])

  const vencidos = frota.filter((v) => v.situacao.vencido)
  const proximos = frota.filter((v) => v.situacao.proximoDoVencimento)

  return (
    <>
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3">
          <Link href="/painel/veiculos">
            <ArrowLeft />
            Veículos
          </Link>
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Checklist da frota
            </h1>
            <p className="text-muted-foreground mt-1 text-xs">
              Verificação periódica dos veículos.{" "}
              {config.ativo
                ? `Exigida a cada ${config.recorrencia_dias} dias, salvo prazo próprio do veículo.`
                : "A cobrança periódica está suspensa na configuração."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {podeRealizar && (
              <Button asChild size="sm">
                <Link href="/painel/veiculos/checklists/novo">
                  <ClipboardCheck />
                  Realizar checklist
                </Link>
              </Button>
            )}
            {gestor && (
              <Button asChild variant="outline" size="sm">
                <Link href="/painel/veiculos/checklists/config">
                  <Settings />
                  Configuração
                </Link>
              </Button>
            )}
          </div>
        </div>
      </div>

      {!ativo && (
        <Alert variant="destructive">
          <AlertDescription>
            As tabelas do checklist ainda não existem no banco. Rode
            <code className="mx-1">supabase/veiculos-checklist.sql</code>
            no SQL Editor do Supabase.
          </AlertDescription>
        </Alert>
      )}

      {ativo && config.ativo && vencidos.length > 0 && (
        <Alert variant="destructive">
          <AlertDescription>
            <strong>
              {vencidos.length}{" "}
              {vencidos.length === 1 ? "veículo está" : "veículos estão"} com o
              checklist vencido
            </strong>{" "}
            — {vencidos.map((v) => v.rotulo).join("; ")}.
          </AlertDescription>
        </Alert>
      )}

      {ativo && config.ativo && vencidos.length === 0 && proximos.length > 0 && (
        <Alert variant="warning">
          <AlertDescription>
            {proximos.length}{" "}
            {proximos.length === 1 ? "veículo vence" : "veículos vencem"} nos
            próximos dias — {proximos.map((v) => v.rotulo).join("; ")}.
          </AlertDescription>
        </Alert>
      )}

      {ativo && (
        <Card>
          <CardHeader>
            <CardTitle>Situação da frota</CardTitle>
            <CardDescription>
              {frota.length === 0
                ? "Nenhum veículo ativo."
                : "Vencidos primeiro, depois os que vencem antes."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {frota.length > 0 && (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Veículo</TableHead>
                      <TableHead>Situação</TableHead>
                      <TableHead>Último checklist</TableHead>
                      <TableHead>Vence em</TableHead>
                      <TableHead className="text-right">Pendências</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {frota.map((v) => (
                      <TableRow key={v.id}>
                        <TableCell>
                          <Link
                            href={`/painel/veiculos/${v.id}`}
                            className="font-medium hover:underline"
                          >
                            {v.rotulo}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <SeloChecklist
                            vencido={v.situacao.vencido}
                            proximo={v.situacao.proximoDoVencimento}
                            nunca={v.situacao.nunca}
                            dias={v.situacao.diasRestantes}
                          />
                        </TableCell>
                        <TableCell className="text-muted-foreground whitespace-nowrap">
                          {v.situacao.ultimoEm
                            ? formatarData(v.situacao.ultimoEm)
                            : "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground whitespace-nowrap">
                          {v.situacao.venceEm
                            ? formatarData(v.situacao.venceEm)
                            : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          {v.situacao.pendencias > 0 ? (
                            <Badge variant="warning">
                              {v.situacao.pendencias}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {ativo && (
        <Card>
          <CardHeader>
            <CardTitle>Checklists realizados</CardTitle>
            <CardDescription>
              {historico.linhas.length === 0
                ? "Nenhum checklist registrado ainda."
                : `Últimos ${historico.linhas.length}.`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {historico.linhas.length > 0 && (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Quando</TableHead>
                      <TableHead>Veículo</TableHead>
                      <TableHead>Quem verificou</TableHead>
                      <TableHead className="text-right">Hodômetro</TableHead>
                      <TableHead className="text-right">Pendências</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {historico.linhas.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="whitespace-nowrap">
                          <Link
                            href={`/painel/veiculos/checklists/${c.id}`}
                            className="font-medium hover:underline"
                          >
                            {formatarDataHora(c.realizado_em)}
                          </Link>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {c.veiculoRotulo ?? "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {c.inspetorNome ?? "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {c.hodometro?.toLocaleString("pt-BR") ?? "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          {c.pendencias > 0 ? (
                            <Badge variant="destructive">{c.pendencias}</Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </>
  )
}
