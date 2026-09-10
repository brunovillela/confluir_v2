import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Wrench } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
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
import { AlertaManutencao } from "@/components/veiculos-manutencao"
import { requirePermissao } from "@/lib/auth"
import { buscarVeiculo } from "@/lib/db/veiculos"
import {
  listarManutencoes,
  situacaoDosPlanos,
} from "@/lib/db/veiculos-manutencoes"
import { formatarData, formatarMoeda } from "@/lib/formato"
import { podeAcessar } from "@/lib/permissoes"

import { CabecalhoVeiculo } from "../cabecalho-veiculo"
import { ManutencaoVeiculoBotao } from "../veiculo-acoes"

export const metadata: Metadata = { title: "Manutenções do veículo — Confluir" }

/** Prontuário do veículo: tudo que já foi feito nele, e as preventivas. */
export default async function ManutencoesVeiculoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ salvo?: string }>
}) {
  const sessao = await requirePermissao("veiculos", [
    "veiculos_gestao",
    "veiculos_recepcao",
  ])
  const gestor = podeAcessar(sessao.permissoes, "veiculos_gestao")
  const podeManutencao = podeAcessar(sessao.permissoes, "veiculos_manutencao", [
    "veiculos_gestao",
  ])
  const { id } = await params
  const { salvo } = await searchParams
  const veiculo = await buscarVeiculo(id)
  if (!veiculo) notFound()

  const [preventivas, manutencoes] = await Promise.all([
    situacaoDosPlanos(id),
    listarManutencoes({ veiculoId: id, limite: 200 }),
  ])

  return (
    <>
      <CabecalhoVeiculo
        veiculo={veiculo}
        titulo="Prontuário de manutenções"
        descricao="Tudo que já foi feito neste veículo, com local, garantia e nota"
        acoes={
          <>
            {podeManutencao && (
              <Button asChild>
                <Link href={`/painel/veiculos/manutencoes/nova?veiculo=${veiculo.id}`}>
                  <Wrench />
                  Registrar manutenção
                </Link>
              </Button>
            )}
            {gestor && !veiculo.inativo && (
              <ManutencaoVeiculoBotao
                veiculoId={veiculo.id}
                manutencao={veiculo.manutencao}
                voltar={`/painel/veiculos/${veiculo.id}/manutencoes`}
              />
            )}
          </>
        }
      />

      {salvo && (
        <Alert variant="success">
          <AlertDescription>Alterações salvas.</AlertDescription>
        </Alert>
      )}
      {veiculo.manutencao && (
        <Alert variant="warning">
          <AlertDescription>
            Veículo <strong>em manutenção</strong>: não sai da garagem até
            a gestão concluir a manutenção.
          </AlertDescription>
        </Alert>
      )}

      {preventivas.ativo && !veiculo.inativo && (
        <AlertaManutencao
          veiculoId={veiculo.id}
          planos={preventivas.linhas}
          podeRegistrar={podeManutencao}
        />
      )}

      {preventivas.ativo && preventivas.linhas.length > 0 && (
        <Card>
          <CardContent className="grid gap-2 text-sm">
            <p className="font-medium">Preventivas programadas</p>
            <ul className="grid gap-1">
              {preventivas.linhas.map((p) => (
                <li
                  key={p.plano.id}
                  className="flex flex-wrap items-baseline justify-between gap-2"
                >
                  <span>{p.plano.descricao}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {p.proximaData ? `próxima em ${formatarData(p.proximaData)}` : ""}
                    {p.proximaData && p.proximoHodometro !== null ? " · " : ""}
                    {p.proximoHodometro !== null
                      ? `aos ${p.proximoHodometro.toLocaleString("pt-BR")} km`
                      : ""}
                    {p.vencido ? " · vencida" : p.proximo ? " · próxima" : ""}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {!manutencoes.ativo ? (
        <p className="text-muted-foreground text-sm">
          Manutenções ainda não configuradas — rode{" "}
          <code>supabase/veiculos-manutencoes.sql</code>.
        </p>
      ) : manutencoes.linhas.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Nenhuma manutenção registrada.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Serviço</TableHead>
                <TableHead>Local</TableHead>
                <TableHead className="text-right">Hodômetro</TableHead>
                <TableHead className="text-right">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {manutencoes.linhas.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="whitespace-nowrap">
                    <Link
                      href={`/painel/veiculos/manutencoes/${m.id}`}
                      className="font-medium hover:underline"
                    >
                      {formatarData(m.realizada_em)}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant={m.tipo === "corretiva" ? "warning" : "secondary"}>
                      {m.tipo === "corretiva" ? "Corretiva" : "Preventiva"}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-64 truncate">{m.descricao ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {m.local_nome ?? "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {m.hodometro?.toLocaleString("pt-BR") ?? "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {m.valor !== null ? formatarMoeda(m.valor) : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  )
}
