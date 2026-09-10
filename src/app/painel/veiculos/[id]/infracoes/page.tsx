import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { FileWarning } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { requirePermissao } from "@/lib/auth"
import { buscarVeiculo, listarInfracoes } from "@/lib/db/veiculos"
import { formatarData, formatarMoeda } from "@/lib/formato"
import { podeAcessar } from "@/lib/permissoes"

import { CabecalhoVeiculo } from "../cabecalho-veiculo"

export const metadata: Metadata = { title: "Infrações do veículo — Confluir" }

export default async function InfracoesVeiculoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const sessao = await requirePermissao("veiculos", [
    "veiculos_gestao",
    "veiculos_recepcao",
  ])
  const podeRegistrar = podeAcessar(sessao.permissoes, "veiculos_infracoes", [
    "veiculos_gestao",
  ])
  const { id } = await params
  const veiculo = await buscarVeiculo(id)
  if (!veiculo) notFound()

  const infracoes = await listarInfracoes({ veiculoId: id, limite: 200 })

  return (
    <>
      <CabecalhoVeiculo
        veiculo={veiculo}
        titulo="Infrações"
        descricao="Multas registradas neste veículo e a cobrança dos infratores"
        acoes={
          podeRegistrar && (
            <Button asChild>
              <Link href="/painel/veiculos/infracoes">
                <FileWarning />
                Registrar infração
              </Link>
            </Button>
          )
        }
      />

      {infracoes.length === 0 ? (
        <p className="text-muted-foreground text-sm">Nenhuma infração.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Gravidade</TableHead>
              <TableHead>Condutor</TableHead>
              <TableHead className="text-right">Valor</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {infracoes.map((i) => (
              <TableRow key={i.id}>
                <TableCell>
                  <Link
                    href={`/painel/veiculos/infracoes/${i.id}`}
                    className="text-primary whitespace-nowrap hover:underline"
                  >
                    {formatarData(i.infracao_data)}
                  </Link>
                </TableCell>
                <TableCell>{i.infracao_tipo ?? "—"}</TableCell>
                <TableCell>{i.condutorNome ?? "—"}</TableCell>
                <TableCell className="text-right whitespace-nowrap tabular-nums">
                  {formatarMoeda(i.custo)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </>
  )
}
