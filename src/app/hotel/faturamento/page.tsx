import type { Metadata } from "next"
import Link from "next/link"
import { ExternalLink, Plus, Receipt } from "lucide-react"

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
import { requireSessaoHotel } from "@/lib/auth"
import {
  listarFaturas,
  urlArquivoHospedagem,
  type FaturaLinha,
} from "@/lib/db/hospedagem"
import { formatarData, formatarMoeda } from "@/lib/formato"

import { HotelShell } from "../hotel-shell"

export const metadata: Metadata = { title: "Faturamento — Confluir" }

async function TabelaFaturas({ faturas }: { faturas: FaturaLinha[] }) {
  const urls = new Map<string, string | null>()
  for (const f of faturas) {
    urls.set(f.id, await urlArquivoHospedagem(f.nota_fiscal))
  }
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Código</TableHead>
            <TableHead className="hidden sm:table-cell">Emitida em</TableHead>
            <TableHead>Vencimento</TableHead>
            <TableHead className="text-right">Reservas</TableHead>
            <TableHead className="text-right">Valor</TableHead>
            <TableHead>Situação</TableHead>
            <TableHead>DANFE</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {faturas.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={7}
                className="text-muted-foreground h-20 text-center text-sm"
              >
                Nenhuma fatura aqui.
              </TableCell>
            </TableRow>
          )}
          {faturas.map((f) => (
            <TableRow key={f.id}>
              <TableCell className="font-mono text-xs font-medium">
                {f.codigo ?? "—"}
              </TableCell>
              <TableCell className="text-muted-foreground hidden sm:table-cell">
                {formatarData(f.created_at)}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {formatarData(f.ordemVencimento)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {f.servicos.toLocaleString("pt-BR")}
              </TableCell>
              <TableCell className="text-right font-medium tabular-nums">
                {formatarMoeda(f.valorTotal)}
              </TableCell>
              <TableCell>
                <Badge
                  variant="outline"
                  className={
                    f.ordemSituacao === "Paga"
                      ? "border-success/40 text-success-fg"
                      : f.ordemSituacao === "Cancelada"
                        ? "border-error/40 text-error-fg"
                        : "border-warning/40 text-warning-fg"
                  }
                >
                  {f.ordemSituacao ?? "Sem ordem"}
                </Badge>
              </TableCell>
              <TableCell>
                {urls.get(f.id) ? (
                  <a
                    href={urls.get(f.id)!}
                    target="_blank"
                    rel="noreferrer"
                    className="text-foreground inline-flex items-center gap-1 text-xs underline-offset-4 hover:underline"
                  >
                    Abrir <ExternalLink className="size-3" />
                  </a>
                ) : (
                  "—"
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

export default async function FaturamentoPage({
  searchParams,
}: {
  searchParams: Promise<{ salvo?: string }>
}) {
  const { hotel } = await requireSessaoHotel()
  const { salvo } = await searchParams

  const faturas = await listarFaturas(hotel.id)
  const abertas = faturas.filter((f) => f.aberta)
  const fechadas = faturas.filter((f) => !f.aberta)

  return (
    <HotelShell nomeHotel={hotel.nome ?? "Hotel parceiro"}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Faturamento</h1>
          <p className="text-muted-foreground mt-1 text-xs">
            Cobrança dos subsídios efetivados contra a entidade sindical. Todos
            os valores — a parte paga pelo hóspede na entrada e o valor faturado
            ao sindicato — já contêm os impostos inclusos, conforme o acordo.
          </p>
        </div>
        <Button asChild>
          <Link href="/hotel/faturamento/nova">
            <Plus />
            Nova fatura
          </Link>
        </Button>
      </div>

      {salvo === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>
            Fatura emitida — a ordem de pagamento foi gerada e está em
            autorização no sindicato.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Faturas em aberto</CardTitle>
            <Receipt className="text-muted-foreground size-4" />
          </div>
          <CardDescription>
            Aguardando autorização ou pagamento pelo sindicato.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TabelaFaturas faturas={abertas} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Faturas fechadas</CardTitle>
          <CardDescription>Faturas com a ordem de pagamento paga.</CardDescription>
        </CardHeader>
        <CardContent>
          <TabelaFaturas faturas={fechadas} />
        </CardContent>
      </Card>
    </HotelShell>
  )
}
