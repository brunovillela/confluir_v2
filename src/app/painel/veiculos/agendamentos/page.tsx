import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, CalendarClock, KeyRound, LogIn } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { GrupoColapsavel } from "@/components/grupo-colapsavel"
import { SituacaoAgendamentoBadge } from "@/components/veiculos"
import { requirePermissao } from "@/lib/auth"
import {
  listarAgendamentos,
  listarMovimentacoes,
  listarVeiculos,
} from "@/lib/db/veiculos"
import { formatarData } from "@/lib/formato"

import {
  CancelarAgendamentoForm,
  TransferirVeiculoForm,
  TriagemAgendamentoForm,
} from "./agendamento-forms"

export const metadata: Metadata = { title: "Agendamentos de veículos — Confluir" }

/**
 * Gestão dos agendamentos pela RECEPÇÃO (controle de acesso): atende ou
 * transfere o veículo, nega, cancela e acompanha quem está na rua. A saída
 * e a entrada se registram na PÁGINA DO VEÍCULO; o condutor solicita no
 * painel inicial.
 */
export default async function AgendamentosPage({
  searchParams,
}: {
  searchParams: Promise<{ salvo?: string }>
}) {
  await requirePermissao("veiculos_recepcao", ["veiculos_gestao"])
  const { salvo } = await searchParams

  const [fila, encerradas, movimentacoesAbertas, frota] = await Promise.all([
    listarAgendamentos({ situacoes: ["solicitada", "atendida", "retirada"] }),
    listarAgendamentos({
      situacoes: ["concluida", "cancelada", "negada"],
      limite: 20,
    }),
    listarMovimentacoes({ abertas: true, fluxoNovo: true }),
    listarVeiculos({ situacao: "ativos" }),
  ])

  const veiculosDisponiveis = frota
    .filter((v) => !v.inativo && !v.manutencao && v.emUso === false)
    .map((v) => ({
      id: v.id,
      rotulo: `${v.placa ?? "s/ placa"} — ${v.marca_modelo ?? ""}${v.lotacao ? ` (${v.lotacao})` : ""}`,
    }))

  const solicitadas = fila.agendamentos.filter((a) => a.situacao === "solicitada")
  const atendidas = fila.agendamentos.filter((a) => a.situacao === "atendida")
  const naRua = movimentacoesAbertas.filter((m) => m.aberta)
  const historico = [...encerradas.agendamentos].sort((a, b) =>
    (b.created_at ?? "").localeCompare(a.created_at ?? "")
  )

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2">
          <Link href="/painel/veiculos">
            <ArrowLeft />
            Veículos
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">
          Agendamentos de veículos
        </h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Recepção: atender, transferir e cancelar solicitações. A saída e a
          entrada do veículo se registram na página do veículo.
        </p>
      </div>

      {salvo && (
        <Alert variant="success">
          <AlertDescription>Registro salvo.</AlertDescription>
        </Alert>
      )}
      {!fila.disponivel && (
        <Alert variant="warning">
          <AlertDescription>
            Agendamentos ainda não configurados — rode{" "}
            <code>supabase/veiculos.sql</code> no SQL Editor do Supabase.
          </AlertDescription>
        </Alert>
      )}

      <GrupoColapsavel
        titulo="Fila de solicitações"
        descricao="Atenda vinculando um veículo disponível, negue com motivo ou cancele"
        resumo={
          <span className="text-muted-foreground text-sm tabular-nums">
            {solicitadas.length}
          </span>
        }
        aberto
      >
        {solicitadas.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            <CalendarClock className="mr-1 inline size-4" />
            Nenhuma solicitação aguardando.
          </p>
        ) : (
          <div className="grid gap-4">
            {solicitadas.map((a) => (
              <Card key={a.id}>
                <CardContent className="grid gap-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                    <span className="font-medium">
                      {a.condutorNome ?? "(condutor)"} —{" "}
                      {formatarData(a.data_retirada)}
                      {a.data_retorno ? ` a ${formatarData(a.data_retorno)}` : ""}
                      {a.sede_retirada ? ` · ${a.sede_retirada}` : ""}
                    </span>
                    <span className="text-muted-foreground">
                      Solicitado em {formatarData(a.created_at)}
                    </span>
                  </div>
                  <p className="text-sm">
                    <span className="text-muted-foreground">Motivo:</span>{" "}
                    {a.motivo ?? "—"}
                    {"  ·  "}
                    <span className="text-muted-foreground">Destino:</span>{" "}
                    {a.destino ?? "—"}
                  </p>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <TriagemAgendamentoForm
                      agendamentoId={a.id}
                      veiculos={veiculosDisponiveis}
                    />
                    <CancelarAgendamentoForm
                      agendamentoId={a.id}
                      recepcao
                      voltar="/painel/veiculos/agendamentos"
                    />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </GrupoColapsavel>

      <GrupoColapsavel
        titulo="Aguardando saída"
        descricao="Solicitações com veículo reservado — a saída se registra na página do veículo"
        resumo={
          <span className="text-muted-foreground text-sm tabular-nums">
            {atendidas.length}
          </span>
        }
        aberto={atendidas.length > 0}
      >
        {atendidas.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nenhuma saída pendente.</p>
        ) : (
          <div className="grid gap-4">
            {atendidas.map((a) => (
              <Card key={a.id}>
                <CardContent className="grid gap-3">
                  <p className="text-sm font-medium">
                    {a.condutorNome ?? "(condutor)"} —{" "}
                    {a.veiculoPlaca ?? "?"} {a.veiculoModelo ?? ""} ·{" "}
                    {formatarData(a.data_retirada)}
                    {a.data_retorno ? ` a ${formatarData(a.data_retorno)}` : ""}
                    {a.sede_retirada ? ` · ${a.sede_retirada}` : ""}
                  </p>
                  <p className="text-muted-foreground text-sm">
                    {a.motivo ?? "—"}
                    {a.destino ? ` · destino: ${a.destino}` : ""}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    {a.veiculo_id && (
                      <Button size="sm" asChild>
                        <Link href={`/painel/veiculos/${a.veiculo_id}/movimentacao`}>
                          <KeyRound />
                          Registrar saída
                        </Link>
                      </Button>
                    )}
                    <TransferirVeiculoForm
                      agendamentoId={a.id}
                      veiculos={veiculosDisponiveis}
                    />
                    <CancelarAgendamentoForm
                      agendamentoId={a.id}
                      recepcao
                      voltar="/painel/veiculos/agendamentos"
                    />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </GrupoColapsavel>

      <GrupoColapsavel
        titulo="Veículos na rua"
        descricao="Movimentações em aberto — a entrada se registra na página do veículo"
        resumo={
          <span className="text-muted-foreground text-sm tabular-nums">
            {naRua.length}
          </span>
        }
        aberto={naRua.length > 0}
      >
        {naRua.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Nenhum veículo fora da garagem.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Veículo</TableHead>
                <TableHead>Condutor</TableHead>
                <TableHead>Saída</TableHead>
                <TableHead>Destino</TableHead>
                <TableHead>Previsão de retorno</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {naRua.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="whitespace-nowrap">
                    {m.veiculoPlaca ?? "?"} {m.veiculoModelo ?? ""}
                  </TableCell>
                  <TableCell>{m.condutorNome ?? "—"}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {formatarData(m.data_retirada)}
                    {m.sede_retirada ? ` · ${m.sede_retirada}` : ""}
                  </TableCell>
                  <TableCell className="max-w-52">
                    <span className="line-clamp-1">{m.destino ?? "—"}</span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {m.previsao_retorno ? formatarData(m.previsao_retorno) : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    {m.veiculo_id && (
                      <Button size="sm" variant="outline" asChild>
                        <Link href={`/painel/veiculos/${m.veiculo_id}/movimentacao`}>
                          <LogIn />
                          Registrar entrada
                        </Link>
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </GrupoColapsavel>

      <GrupoColapsavel
        titulo="Encerradas recentes"
        descricao="Concluídas, canceladas e negadas — cancelar não apaga o registro"
        resumo={
          <span className="text-muted-foreground text-sm tabular-nums">
            {historico.length}
          </span>
        }
      >
        {historico.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nada encerrado ainda.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Retirada</TableHead>
                <TableHead>Condutor</TableHead>
                <TableHead>Veículo</TableHead>
                <TableHead>Destino</TableHead>
                <TableHead>Situação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {historico.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="whitespace-nowrap">
                    {formatarData(a.data_retirada)}
                  </TableCell>
                  <TableCell>{a.condutorNome ?? "—"}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {a.veiculoPlaca ?? "—"}
                  </TableCell>
                  <TableCell className="max-w-52">
                    <span className="line-clamp-1">{a.destino ?? "—"}</span>
                  </TableCell>
                  <TableCell>
                    <SituacaoAgendamentoBadge situacao={a.situacao} />
                    {a.situacao === "negada" && a.negado_motivo && (
                      <p className="text-muted-foreground mt-1 text-xs">
                        {a.negado_motivo}
                      </p>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </GrupoColapsavel>
    </>
  )
}
