import type { Metadata } from "next"
import Link from "next/link"
import {
  ArrowLeft,
  BadgeDollarSign,
  CircleAlert,
  HandCoins,
  Hourglass,
  Plus,
  Wallet,
} from "lucide-react"

import { SituacaoContaBadge } from "@/components/caixa"
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
import { listarContasCaixa, listarOcorrencias } from "@/lib/db/caixa"
import { formatarDataHora, formatarMoeda } from "@/lib/formato"
import { podeAcessar } from "@/lib/permissoes"

export const metadata: Metadata = { title: "Contas de caixa — Confluir" }

export default async function CaixasPage() {
  const sessao = await requirePermissao("financeiro_caixa", [
    "financeiro_caixa_admin",
    "financeiro_leitura",
  ])
  const podeEditar = podeAcessar(sessao.permissoes, "financeiro_caixa", [
    "financeiro_caixa_admin",
  ])

  const [{ disponivel, contas }, ocorrenciasGeral] = await Promise.all([
    listarContasCaixa(),
    listarOcorrencias(),
  ])

  const ativas = contas.filter((c) => c.ativa)
  const abertas = ativas.filter((c) => c.situacao === "aberta")
  const totalAberto = abertas.reduce((s, c) => s + c.saldo, 0)
  const aportesPendentes = ativas.reduce((s, c) => s + c.aportePendente, 0)
  const prestacoesAguardando = ativas.filter(
    (c) => c.prestacaoAguardando
  ).length
  const ocorrenciasAbertas = ocorrenciasGeral.ocorrencias.filter(
    (o) => o.situacao !== "resolvida"
  )

  const indicadores = [
    {
      titulo: "Contas abertas",
      valor: abertas.length.toLocaleString("pt-BR"),
      detalhe: `${ativas.length.toLocaleString("pt-BR")} conta${ativas.length === 1 ? "" : "s"} ativa${ativas.length === 1 ? "" : "s"} no total`,
      icone: Wallet,
    },
    {
      titulo: "Total em caixas abertas",
      valor: formatarMoeda(totalAberto),
      detalhe: "dinheiro em espécie liberado",
      icone: BadgeDollarSign,
    },
    {
      titulo: "Aportes aguardando confirmação",
      valor: formatarMoeda(aportesPendentes),
      detalhe: "lançados e ainda não confirmados",
      icone: HandCoins,
    },
    {
      titulo: "Prestações a aprovar",
      valor: prestacoesAguardando.toLocaleString("pt-BR"),
      detalhe: "aguardando conferência do financeiro",
      icone: Hourglass,
    },
    {
      titulo: "Ocorrências abertas",
      valor: ocorrenciasAbertas.length.toLocaleString("pt-BR"),
      detalhe: "relatos de problema com dinheiro",
      icone: CircleAlert,
    },
  ]

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/financeiro">
            <ArrowLeft />
            Financeiro
          </Link>
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Contas de caixa
            </h1>
            <p className="text-muted-foreground mt-1 text-xs">
              Dinheiro em espécie com pessoas autorizadas — aportes,
              extratos e prestação de contas
            </p>
          </div>
          {podeEditar && (
            <Button asChild>
              <Link href="/painel/financeiro/caixas/nova">
                <Plus />
                Nova conta
              </Link>
            </Button>
          )}
        </div>
      </div>

      {!disponivel && (
        <Alert variant="destructive">
          <AlertDescription>
            As tabelas do caixa ainda não existem — rode{" "}
            <code>supabase/caixa.sql</code> no SQL Editor do Supabase (uma
            vez) para habilitar o módulo.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {indicadores.map((ind) => (
          <Card key={ind.titulo}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardDescription>{ind.titulo}</CardDescription>
                <ind.icone className="text-muted-foreground size-4" />
              </div>
              <CardTitle className="text-xl tabular-nums">
                {ind.valor}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-xs">{ind.detalhe}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Contas</CardTitle>
          <CardDescription>
            Clique numa conta para ver o extrato e as ações
          </CardDescription>
        </CardHeader>
        <CardContent>
          {contas.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-sm">
              Nenhuma conta de caixa ainda — autorize a primeira pessoa em
              “Nova conta”.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Conta</TableHead>
                  <TableHead>Responsável</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                  <TableHead className="hidden lg:table-cell">
                    Pendências
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contas.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="max-w-52 font-medium">
                      <Link
                        href={`/painel/financeiro/caixas/${c.id}`}
                        className="hover:underline"
                      >
                        <span className="block truncate">{c.nome}</span>
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground max-w-48 truncate">
                      {c.responsavel ?? "—"}
                    </TableCell>
                    <TableCell>
                      <SituacaoContaBadge
                        situacao={c.situacao}
                        ativa={c.ativa}
                      />
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap tabular-nums">
                      {formatarMoeda(c.saldo)}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <span className="flex flex-wrap gap-1.5">
                        {c.aportePendente > 0 && (
                          <Badge
                            variant="outline"
                            className="border-warning/40 text-warning-fg"
                          >
                            Aporte {formatarMoeda(c.aportePendente)} a
                            confirmar
                          </Badge>
                        )}
                        {c.prestacaoAguardando && (
                          <Badge
                            variant="outline"
                            className="border-info/40 text-info-fg"
                          >
                            Prestação a aprovar
                          </Badge>
                        )}
                        {c.ocorrenciasAbertas > 0 && (
                          <Badge
                            variant="outline"
                            className="text-destructive border-destructive/40"
                          >
                            {c.ocorrenciasAbertas} ocorrência
                            {c.ocorrenciasAbertas === 1 ? "" : "s"}
                          </Badge>
                        )}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">
                Relatos de problemas com dinheiro
              </CardTitle>
              <CardDescription>
                Ocorrências abertas ou em investigação
              </CardDescription>
            </div>
            <CircleAlert className="text-muted-foreground size-4" />
          </div>
        </CardHeader>
        <CardContent>
          {ocorrenciasAbertas.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Nenhuma ocorrência em aberto.
            </p>
          ) : (
            <ul className="grid gap-2">
              {ocorrenciasAbertas.map((o) => (
                <li key={o.id}>
                  <Link
                    href={`/painel/financeiro/caixas/${o.contaId}`}
                    className="hover:bg-muted/60 flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm transition-colors"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">
                        {o.descricao}
                      </span>
                      <span className="text-muted-foreground block text-xs">
                        {[o.contaNome, o.responsavel, formatarDataHora(o.created_at)]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      {o.valor !== null && (
                        <span className="text-destructive text-sm tabular-nums">
                          {formatarMoeda(o.valor)}
                        </span>
                      )}
                      <Badge
                        variant="outline"
                        className={
                          o.situacao === "em_investigacao"
                            ? "border-warning/40 text-warning-fg"
                            : "text-destructive border-destructive/40"
                        }
                      >
                        {o.situacao === "em_investigacao"
                          ? "Em investigação"
                          : "Aberta"}
                      </Badge>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  )
}
