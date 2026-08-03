import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import {
  ArrowLeft,
  BadgeCheck,
  BadgeDollarSign,
  Banknote,
  ChevronRight,
  CircleAlert,
  ListChecks,
  Pencil,
  TrendingDown,
  TrendingUp,
} from "lucide-react"

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
import { RotuloTrilha } from "@/components/layout/trilha-rotulos"
import { requirePermissao } from "@/lib/auth"
import { detalheRemessa } from "@/lib/db/receitas"
import { formatarData, formatarMoeda } from "@/lib/formato"

export const metadata: Metadata = { title: "Remessa — Confluir" }

export default async function RemessaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ criada?: string; salva?: string }>
}) {
  await requirePermissao("filiacao_receitas", ["filiacao_gestao"])

  const { id } = await params
  const sp = await searchParams
  const detalhe = await detalheRemessa(id)
  if (!detalhe) notFound()
  const { remessa, totais, fontes, fontesSemInformacao, erroCarga } = detalhe

  const indicadores = [
    {
      titulo: "Valores informados",
      valor: formatarMoeda(totais.valorInformado),
      detalhe: "soma dos descontos relatados",
      icone: BadgeDollarSign,
    },
    {
      titulo: "Filiados pagantes",
      valor: totais.pagantes.toLocaleString("pt-BR"),
      detalhe: "lançamentos na remessa",
      icone: ListChecks,
    },
    {
      titulo: "Média de contribuição",
      valor: formatarMoeda(totais.media),
      detalhe: "por filiado pagante",
      icone: Banknote,
    },
    {
      titulo: "Maior contribuição",
      valor: formatarMoeda(totais.maior),
      detalhe: "maior lançamento",
      icone: TrendingUp,
    },
    {
      titulo: "Menor contribuição",
      valor: formatarMoeda(totais.menor),
      detalhe: "menor lançamento",
      icone: TrendingDown,
    },
  ]

  return (
    <>
      <RotuloTrilha
        valores={{
          [id]: `Remessa ${remessa.tipo ?? ""} ${remessa.rotulo}`.trim(),
        }}
      />
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/filiados/receitas">
            <ArrowLeft />
            Receitas
          </Link>
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight">
                Remessa {remessa.tipo ?? ""} {remessa.rotulo}
              </h1>
              {remessa.aberto === true ? (
                <Badge
                  variant="outline"
                  className="border-warning/40 text-warning-fg"
                >
                  Aberta
                </Badge>
              ) : (
                <Badge variant="outline" className="text-muted-foreground">
                  Fechada
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground mt-1 text-xs">
              {fontes.length} fonte{fontes.length === 1 ? "" : "s"} com
              pagamentos informados · {fontesSemInformacao.length} sem
              informação
            </p>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href={`/painel/filiados/receitas/${id}/editar`}>
              <Pencil />
              Editar remessa
            </Link>
          </Button>
        </div>
      </div>

      {(sp.criada === "1" || sp.salva === "1") && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>
            {sp.criada === "1" ? "Remessa criada." : "Remessa atualizada."}
          </AlertDescription>
        </Alert>
      )}

      {erroCarga && (
        <Alert variant="destructive">
          <AlertDescription>{erroCarga}</AlertDescription>
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
          <CardTitle className="text-base">
            Fontes pagadoras com pagamentos informados
          </CardTitle>
          <CardDescription>
            Relatório = trabalhadores descontados · Recebimento = depósito
            bancário registrado
          </CardDescription>
        </CardHeader>
        <CardContent>
          {fontes.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-sm">
              Nenhum pagamento informado nesta remessa.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fonte pagadora</TableHead>
                    <TableHead className="text-right">Pagantes</TableHead>
                    <TableHead className="text-right">
                      Valor informado
                    </TableHead>
                    <TableHead className="hidden text-right md:table-cell">
                      Média
                    </TableHead>
                    <TableHead>Recebimento</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fontes.map((f) => (
                    <TableRow key={f.id}>
                      <TableCell className="max-w-56 font-medium">
                        {f.id === "sem_fonte" ? (
                          <span className="text-muted-foreground">
                            {f.nome}
                          </span>
                        ) : (
                          <Link
                            href={`/painel/filiados/receitas/${remessa.id}/${f.id}`}
                            className="hover:underline"
                          >
                            <span className="block truncate">{f.nome}</span>
                          </Link>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {f.pagantes.toLocaleString("pt-BR")}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap tabular-nums">
                        {formatarMoeda(f.total)}
                      </TableCell>
                      <TableCell className="hidden text-right whitespace-nowrap tabular-nums md:table-cell">
                        {formatarMoeda(f.media)}
                      </TableCell>
                      <TableCell>
                        {f.recebimento?.data || f.recebimento?.valor ? (
                          <span className="inline-flex items-center gap-1.5 text-sm whitespace-nowrap">
                            <BadgeCheck className="size-3.5 text-success-fg" />
                            {formatarData(f.recebimento.data)}
                            {f.recebimento.valor !== null && (
                              <span className="text-muted-foreground">
                                · {formatarMoeda(f.recebimento.valor)}
                              </span>
                            )}
                          </span>
                        ) : (
                          <Badge
                            variant="outline"
                            className="text-muted-foreground"
                          >
                            Sem registro
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {f.id !== "sem_fonte" && (
                          <Link
                            href={`/painel/filiados/receitas/${remessa.id}/${f.id}`}
                            aria-label={`Abrir relatório de ${f.nome}`}
                          >
                            <ChevronRight className="text-muted-foreground size-4" />
                          </Link>
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

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">
                Fontes sem pagamentos informados
              </CardTitle>
              <CardDescription>
                Fontes pagadoras ativas que não aparecem nesta remessa
              </CardDescription>
            </div>
            <CircleAlert className="text-muted-foreground size-4" />
          </div>
        </CardHeader>
        <CardContent>
          {fontesSemInformacao.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Todas as fontes ativas informaram pagamentos nesta remessa.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {fontesSemInformacao.map((f) => (
                <Link
                  key={f.id}
                  href={`/painel/filiados/receitas/${remessa.id}/${f.id}`}
                  className="hover:bg-muted rounded-full border px-3 py-1 text-sm transition-colors"
                >
                  {f.nome}
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  )
}
