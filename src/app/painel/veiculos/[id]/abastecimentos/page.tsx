import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Fuel } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
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
  buscarVeiculo,
  consumoDoVeiculo,
  listarAbastecimentos,
} from "@/lib/db/veiculos"
import { formatarDataHora, formatarMoeda } from "@/lib/formato"

import { CabecalhoVeiculo } from "../cabecalho-veiculo"

export const metadata: Metadata = { title: "Abastecimentos do veículo — Confluir" }

export default async function AbastecimentosVeiculoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ pagina?: string }>
}) {
  await requirePermissao("veiculos_gestao")
  const { id } = await params
  const { pagina } = await searchParams
  const veiculo = await buscarVeiculo(id)
  if (!veiculo) notFound()

  const [abastecimentos, consumo] = await Promise.all([
    listarAbastecimentos({ veiculoId: id, pagina: Number(pagina) || 1 }),
    consumoDoVeiculo(id),
  ])

  return (
    <>
      <CabecalhoVeiculo
        veiculo={veiculo}
        titulo="Abastecimentos"
        descricao="Lançamentos vinculados a este veículo — o legado do Bubble não tem veículo"
        acoes={
          <Button asChild>
            <Link href="/painel/veiculos/abastecimentos">
              <Fuel />
              Lançar abastecimento
            </Link>
          </Button>
        }
      />

      {consumo && (
        <Card>
          <CardContent className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
            <span>Gasto {formatarMoeda(consumo.totalGasto)}</span>
            <span>{consumo.totalLitros.toLocaleString("pt-BR")} litros</span>
            <span>
              Km na janela medida{" "}
              {consumo.kmRodados?.toLocaleString("pt-BR") ?? "—"}
            </span>
            <span>
              Média{" "}
              {consumo.kmPorLitro
                ? `${consumo.kmPorLitro.toLocaleString("pt-BR")} km/l`
                : "—"}
            </span>
          </CardContent>
        </Card>
      )}

      {abastecimentos.linhas.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Nenhum abastecimento vinculado a este veículo.
        </p>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Posto</TableHead>
                <TableHead>Combustível</TableHead>
                <TableHead className="text-right">Litros</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="text-right">Hodômetro</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {abastecimentos.linhas.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="whitespace-nowrap">
                    {formatarDataHora(a.data_hora)}
                  </TableCell>
                  <TableCell>{a.posto ?? "—"}</TableCell>
                  <TableCell>{a.combustivel ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {a.volume?.toLocaleString("pt-BR") ?? "—"}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap tabular-nums">
                    {formatarMoeda(a.valor)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {a.hodometro?.toLocaleString("pt-BR") ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {abastecimentos.totalPaginas > 1 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                Página {abastecimentos.pagina} de {abastecimentos.totalPaginas} ·{" "}
                {abastecimentos.total} lançamentos
              </span>
              <div className="flex gap-2">
                {abastecimentos.pagina > 1 && (
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`?pagina=${abastecimentos.pagina - 1}`}>Anterior</Link>
                  </Button>
                )}
                {abastecimentos.pagina < abastecimentos.totalPaginas && (
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`?pagina=${abastecimentos.pagina + 1}`}>Próxima</Link>
                  </Button>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </>
  )
}
