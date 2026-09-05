import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, CalendarClock, Wrench } from "lucide-react"

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
  listarManutencoes,
  situacaoDosPlanos,
} from "@/lib/db/veiculos-manutencoes"
import { formatarData, formatarMoeda } from "@/lib/formato"
import { podeAcessar } from "@/lib/permissoes"

import { SeloPreventiva } from "./manutencao-forms"

export const metadata: Metadata = { title: "Manutenções — Confluir" }

export default async function ManutencoesPage() {
  const sessao = await requirePermissao("veiculos", ["veiculos_gestao"])
  const gestor = podeAcessar(sessao.permissoes, "veiculos_gestao")
  const podeRegistrar = podeAcessar(sessao.permissoes, "veiculos_manutencao", [
    "veiculos_gestao",
  ])

  const [{ ativo, linhas: planos }, historico] = await Promise.all([
    situacaoDosPlanos(),
    listarManutencoes({ limite: 40 }),
  ])

  const vencidas = planos.filter((p) => p.vencido)
  const proximas = planos.filter((p) => p.proximo)

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
              Manutenções
            </h1>
            <p className="text-muted-foreground mt-1 text-xs">
              Prontuário da frota e as preventivas programadas, que vencem por
              data ou por quilometragem — o que ocorrer primeiro.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {podeRegistrar && (
              <Button asChild size="sm">
                <Link href="/painel/veiculos/manutencoes/nova">
                  <Wrench />
                  Registrar manutenção
                </Link>
              </Button>
            )}
            {gestor && (
              <Button asChild variant="outline" size="sm">
                <Link href="/painel/veiculos/manutencoes/planos">
                  <CalendarClock />
                  Preventivas programadas
                </Link>
              </Button>
            )}
          </div>
        </div>
      </div>

      {!ativo && (
        <Alert variant="destructive">
          <AlertDescription>
            As tabelas de manutenção ainda não existem no banco. Rode
            <code className="mx-1">supabase/veiculos-manutencoes.sql</code>
            no SQL Editor do Supabase.
          </AlertDescription>
        </Alert>
      )}

      {ativo && vencidas.length > 0 && (
        <Alert variant="destructive">
          <AlertDescription>
            <strong>
              {vencidas.length}{" "}
              {vencidas.length === 1
                ? "preventiva vencida"
                : "preventivas vencidas"}
            </strong>{" "}
            —{" "}
            {vencidas
              .map((p) => `${p.plano.descricao} (${p.veiculoRotulo})`)
              .join("; ")}
            .
          </AlertDescription>
        </Alert>
      )}

      {ativo && vencidas.length === 0 && proximas.length > 0 && (
        <Alert variant="warning">
          <AlertDescription>
            {proximas.length}{" "}
            {proximas.length === 1 ? "preventiva vence" : "preventivas vencem"}{" "}
            em breve —{" "}
            {proximas
              .map((p) => `${p.plano.descricao} (${p.veiculoRotulo})`)
              .join("; ")}
            .
          </AlertDescription>
        </Alert>
      )}

      {ativo && (
        <Card>
          <CardHeader>
            <CardTitle>Preventivas programadas</CardTitle>
            <CardDescription>
              {planos.length === 0
                ? "Nenhuma programação ativa. Sem elas não há alerta de manutenção."
                : "Vencidas primeiro, depois as mais próximas."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {planos.length > 0 && (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Manutenção</TableHead>
                      <TableHead>Veículo</TableHead>
                      <TableHead>Situação</TableHead>
                      <TableHead>Próxima em</TableHead>
                      <TableHead className="text-right">
                        Próximo hodômetro
                      </TableHead>
                      <TableHead>Última</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {planos.map((p) => (
                      <TableRow key={p.plano.id}>
                        <TableCell className="font-medium">
                          {p.plano.descricao}
                        </TableCell>
                        <TableCell>
                          <Link
                            href={`/painel/veiculos/${p.plano.veiculo_id}`}
                            className="hover:underline"
                          >
                            {p.veiculoRotulo}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <SeloPreventiva
                            vencido={p.vencido}
                            proximo={p.proximo}
                            dias={p.diasRestantes}
                            km={p.kmRestantes}
                            motivo={p.motivo}
                          />
                        </TableCell>
                        <TableCell className="text-muted-foreground whitespace-nowrap">
                          {p.proximaData ? formatarData(p.proximaData) : "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {p.proximoHodometro
                            ? p.proximoHodometro.toLocaleString("pt-BR")
                            : "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground whitespace-nowrap">
                          {p.ultimaEm ? formatarData(p.ultimaEm) : "nunca"}
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
            <CardTitle>Prontuário da frota</CardTitle>
            <CardDescription>
              {historico.linhas.length === 0
                ? "Nenhuma manutenção registrada ainda."
                : `Últimas ${historico.linhas.length}. Abra um veículo para ver o prontuário dele.`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {historico.linhas.length > 0 && (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Veículo</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Serviço</TableHead>
                      <TableHead>Local</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {historico.linhas.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell className="whitespace-nowrap">
                          <Link
                            href={`/painel/veiculos/manutencoes/${m.id}`}
                            className="font-medium hover:underline"
                          >
                            {formatarData(m.realizada_em)}
                          </Link>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {m.veiculoRotulo ?? "—"}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              m.tipo === "corretiva" ? "warning" : "secondary"
                            }
                          >
                            {m.tipo === "corretiva" ? "Corretiva" : "Preventiva"}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-72 truncate">
                          {m.descricao ?? "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {m.local_nome ?? "—"}
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
          </CardContent>
        </Card>
      )}
    </>
  )
}
