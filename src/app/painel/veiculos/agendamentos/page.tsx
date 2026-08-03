import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, CalendarClock } from "lucide-react"

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
import { nomesDasSedes } from "@/lib/db/organizacao"
import {
  buscarCondutorDoUsuario,
  listarAgendamentos,
  listarCondutores,
  listarMovimentacoes,
  listarVeiculos,
} from "@/lib/db/veiculos"
import { formatarData } from "@/lib/formato"
import { podeAcessar } from "@/lib/permissoes"

import {
  CancelarAgendamentoForm,
  DevolucaoForm,
  RetiradaForm,
  SolicitarVeiculoForm,
  TriagemAgendamentoForm,
} from "./agendamento-forms"

export const metadata: Metadata = { title: "Agendamentos de veículos — Confluir" }

export default async function AgendamentosPage({
  searchParams,
}: {
  searchParams: Promise<{ salvo?: string }>
}) {
  const sessao = await requirePermissao("veiculos", ["veiculos_gestao"])
  const gestor = podeAcessar(sessao.permissoes, "veiculos_gestao")
  const { salvo } = await searchParams

  const [meus, condutor, fila, movimentacoesAbertas, frota, condutoresRes, sedes] =
    await Promise.all([
      listarAgendamentos({ condutorId: sessao.usuario.id, limite: 30 }),
      buscarCondutorDoUsuario(sessao.usuario.id),
      gestor
        ? listarAgendamentos({ situacoes: ["solicitada", "atendida", "retirada"] })
        : Promise.resolve({ disponivel: true, agendamentos: [] }),
      gestor
        ? listarMovimentacoes({ abertas: true, fluxoNovo: true })
        : Promise.resolve([]),
      gestor ? listarVeiculos({ situacao: "ativos" }) : Promise.resolve([]),
      gestor
        ? listarCondutores()
        : Promise.resolve({ disponivel: true, condutores: [] }),
      nomesDasSedes(),
    ])

  // Só movimentações do fluxo novo entram na lista de devolução pendente.
  const abertasNovas = movimentacoesAbertas.filter((m) => m.aberta)
  const veiculosDisponiveis = frota
    .filter((v) => !v.inativo && !v.manutencao && v.emUso === false)
    .map((v) => ({
      id: v.id,
      rotulo: `${v.placa ?? "s/ placa"} — ${v.marca_modelo ?? ""}${v.lotacao ? ` (${v.lotacao})` : ""}`,
    }))
  const condutoresAptos = condutoresRes.condutores
    .filter((c) => c.apto)
    .map((c) => ({ id: c.usuario_id, nome: c.usuarioNome ?? "(sem nome)" }))

  const solicitadas = fila.agendamentos.filter((a) => a.situacao === "solicitada")
  const atendidas = fila.agendamentos.filter((a) => a.situacao === "atendida")

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
          Solicitação de veículo, atendimento, retirada e devolução
        </p>
      </div>

      {salvo && (
        <Alert variant="success">
          <AlertDescription>Registro salvo.</AlertDescription>
        </Alert>
      )}
      {!meus.disponivel && (
        <Alert variant="warning">
          <AlertDescription>
            Agendamentos ainda não configurados — rode{" "}
            <code>supabase/veiculos.sql</code> no SQL Editor do Supabase.
          </AlertDescription>
        </Alert>
      )}

      {condutor?.apto ? (
        <GrupoColapsavel
          titulo="Solicitar veículo"
          descricao="Sua CNH está em dia — informe motivo, destino e datas"
        >
          <SolicitarVeiculoForm sedes={sedes} />
        </GrupoColapsavel>
      ) : (
        <Alert variant="info">
          <AlertDescription>
            {condutor === null
              ? "Você ainda não tem cadastro de condutor — procure a gestão da frota para se cadastrar e solicitar veículos."
              : condutor.cnhVencida
                ? "Sua CNH está vencida — atualize o cadastro com a gestão da frota para voltar a solicitar veículos."
                : "Seu cadastro de condutor ainda não está autorizado a dirigir os veículos do sindicato."}
          </AlertDescription>
        </Alert>
      )}

      <GrupoColapsavel
        titulo="Minhas solicitações"
        resumo={
          <span className="text-muted-foreground text-sm tabular-nums">
            {meus.agendamentos.length}
          </span>
        }
        aberto={!gestor}
      >
        {meus.agendamentos.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Você ainda não solicitou veículos.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Retirada</TableHead>
                <TableHead>Motivo</TableHead>
                <TableHead>Destino</TableHead>
                <TableHead>Veículo</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {meus.agendamentos.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="whitespace-nowrap">
                    {formatarData(a.data_retirada)}
                    {a.sede_retirada ? ` · ${a.sede_retirada}` : ""}
                  </TableCell>
                  <TableCell className="max-w-52">
                    <span className="line-clamp-1">{a.motivo ?? "—"}</span>
                  </TableCell>
                  <TableCell className="max-w-52">
                    <span className="line-clamp-1">{a.destino ?? "—"}</span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {a.veiculoPlaca ?? "—"}
                  </TableCell>
                  <TableCell>
                    <SituacaoAgendamentoBadge situacao={a.situacao} />
                    {a.situacao === "negada" && a.negado_motivo && (
                      <p className="text-muted-foreground mt-1 text-xs">
                        {a.negado_motivo}
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {(a.situacao === "solicitada" || a.situacao === "atendida") && (
                      <CancelarAgendamentoForm agendamentoId={a.id} />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </GrupoColapsavel>

      {gestor && (
        <>
          <GrupoColapsavel
            titulo="Fila de solicitações"
            descricao="Atenda vinculando um veículo disponível ou negue com motivo"
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
                          {a.data_retorno
                            ? ` a ${formatarData(a.data_retorno)}`
                            : ""}
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
                      <TriagemAgendamentoForm
                        agendamentoId={a.id}
                        veiculos={veiculosDisponiveis}
                      />
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </GrupoColapsavel>

          <GrupoColapsavel
            titulo="Aguardando retirada"
            descricao="Solicitações atendidas — registre o hodômetro na entrega das chaves"
            resumo={
              <span className="text-muted-foreground text-sm tabular-nums">
                {atendidas.length}
              </span>
            }
            aberto={atendidas.length > 0}
          >
            {atendidas.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Nenhuma retirada pendente.
              </p>
            ) : (
              <div className="grid gap-4">
                {atendidas.map((a) => (
                  <Card key={a.id}>
                    <CardContent className="grid gap-3">
                      <p className="text-sm font-medium">
                        {a.condutorNome ?? "(condutor)"} —{" "}
                        {a.veiculoPlaca ?? "?"} {a.veiculoModelo ?? ""} ·{" "}
                        {formatarData(a.data_retirada)}
                        {a.sede_retirada ? ` · ${a.sede_retirada}` : ""}
                      </p>
                      <RetiradaForm
                        agendamentoId={a.id}
                        veiculoFixoId={a.veiculo_id}
                        condutorFixoId={a.condutor_id}
                        sedePadrao={a.sede_retirada}
                        sedes={sedes}
                        veiculos={[]}
                        condutores={[]}
                      />
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </GrupoColapsavel>

          <GrupoColapsavel
            titulo="Veículos na rua"
            descricao="Movimentações em aberto — registre a devolução no retorno"
            resumo={
              <span className="text-muted-foreground text-sm tabular-nums">
                {abertasNovas.length}
              </span>
            }
            aberto={abertasNovas.length > 0}
          >
            {abertasNovas.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Nenhum veículo com devolução pendente no fluxo novo.
              </p>
            ) : (
              <div className="grid gap-4">
                {abertasNovas.map((m) => (
                  <Card key={m.id}>
                    <CardContent className="grid gap-3">
                      <p className="text-sm font-medium">
                        {m.veiculoPlaca ?? "?"} {m.veiculoModelo ?? ""} com{" "}
                        {m.condutorNome ?? "(condutor)"} desde{" "}
                        {formatarData(m.data_retirada)} (hodômetro{" "}
                        {m.hodometro_retirada?.toLocaleString("pt-BR") ?? "—"})
                        {m.destino ? ` · destino: ${m.destino}` : ""}
                      </p>
                      <DevolucaoForm
                        movimentacaoId={m.id}
                        sedePadrao={m.sede_retirada}
                        sedes={sedes}
                      />
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </GrupoColapsavel>

          <GrupoColapsavel
            titulo="Retirada avulsa"
            descricao="Saída sem solicitação prévia — escolha veículo e condutor"
          >
            <RetiradaForm
              sedes={sedes}
              veiculos={veiculosDisponiveis}
              condutores={condutoresAptos}
            />
          </GrupoColapsavel>
        </>
      )}
    </>
  )
}
