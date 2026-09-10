import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ClipboardCheck } from "lucide-react"

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
import { AlertaChecklist } from "@/components/veiculos-checklist"
import { requirePermissao } from "@/lib/auth"
import { buscarVeiculo } from "@/lib/db/veiculos"
import {
  listarChecklists,
  obterConfig,
  situacaoDoVeiculo,
} from "@/lib/db/veiculos-checklist"
import { formatarData } from "@/lib/formato"
import { podeAcessar } from "@/lib/permissoes"

import { RecorrenciaVeiculoForm } from "../../checklists/checklist-forms"
import { CabecalhoVeiculo } from "../cabecalho-veiculo"

export const metadata: Metadata = { title: "Checklist do veículo — Confluir" }

/** Checklist deste veículo: prazo próprio, alerta e as verificações feitas. */
export default async function ChecklistVeiculoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const sessao = await requirePermissao("veiculos", [
    "veiculos_gestao",
    "veiculos_recepcao",
  ])
  const gestor = podeAcessar(sessao.permissoes, "veiculos_gestao")
  const podeChecklist = podeAcessar(sessao.permissoes, "veiculos_checklist", [
    "veiculos_gestao",
  ])
  const { id } = await params
  const veiculo = await buscarVeiculo(id)
  if (!veiculo) notFound()

  const [situacao, { config }, historico] = await Promise.all([
    situacaoDoVeiculo(id),
    obterConfig(),
    listarChecklists({ veiculoId: id, limite: 100 }),
  ])

  return (
    <>
      <CabecalhoVeiculo
        veiculo={veiculo}
        titulo="Checklist deste veículo"
        descricao={
          situacao.recorrenciaPropria
            ? `Prazo próprio de ${situacao.recorrenciaPropria} dias`
            : `Segue o padrão da frota (${config.recorrencia_dias} dias)`
        }
        acoes={
          podeChecklist &&
          !veiculo.inativo && (
            <Button asChild>
              <Link href={`/painel/veiculos/checklists/novo?veiculo=${veiculo.id}`}>
                <ClipboardCheck />
                Realizar checklist
              </Link>
            </Button>
          )
        }
      />

      {situacao.ativo && config.ativo && !veiculo.inativo && (
        <AlertaChecklist
          veiculoId={veiculo.id}
          situacao={situacao}
          podeRealizar={podeChecklist}
        />
      )}

      {gestor && situacao.ativo && (
        <Card>
          <CardContent className="grid gap-2">
            <p className="text-sm font-medium">Prazo deste veículo</p>
            <RecorrenciaVeiculoForm
              veiculoId={veiculo.id}
              atual={situacao.recorrenciaPropria}
              padrao={config.recorrencia_dias}
            />
          </CardContent>
        </Card>
      )}

      {!historico.ativo ? (
        <p className="text-muted-foreground text-sm">
          Checklist ainda não configurado — rode{" "}
          <code>supabase/veiculos-checklist.sql</code>.
        </p>
      ) : historico.linhas.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Nenhum checklist realizado neste veículo.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Quem conferiu</TableHead>
              <TableHead className="text-right">Hodômetro</TableHead>
              <TableHead>Pendências</TableHead>
              <TableHead>Observações</TableHead>
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
                    {formatarData(c.realizado_em)}
                  </Link>
                </TableCell>
                <TableCell>{c.inspetorNome ?? "—"}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {c.hodometro?.toLocaleString("pt-BR") ?? "—"}
                </TableCell>
                <TableCell>
                  {c.pendencias > 0 ? (
                    <Badge variant="warning">
                      {c.pendencias} não conforme{c.pendencias === 1 ? "" : "s"}
                    </Badge>
                  ) : (
                    <Badge variant="secondary">Tudo conforme</Badge>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground max-w-64 truncate">
                  {c.observacoes ?? "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </>
  )
}
