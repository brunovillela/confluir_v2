import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { nomesDasSedes } from "@/lib/db/organizacao"
import {
  buscarVeiculo,
  listarAgendamentos,
  listarCondutores,
  listarMovimentacoes,
} from "@/lib/db/veiculos"
import { formatarData } from "@/lib/formato"

import { CabecalhoVeiculo } from "../cabecalho-veiculo"
import { EntradaVeiculoForm, SaidaVeiculoForm } from "../movimentacao-forms"

export const metadata: Metadata = { title: "Entrada e saída do veículo — Confluir" }

/**
 * Recepção (controle de acesso): fora → registrar ENTRADA; na garagem →
 * registrar SAÍDA, com destino e previsão de retorno facultativos.
 */
export default async function MovimentacaoVeiculoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ salvo?: string }>
}) {
  await requirePermissao("veiculos_recepcao", ["veiculos_gestao"])
  const { id } = await params
  const { salvo } = await searchParams

  const veiculo = await buscarVeiculo(id)
  if (!veiculo) notFound()

  const podeSair = !veiculo.inativo && !veiculo.manutencao && !veiculo.emUso
  const [movimentacoes, sedes, condutoresRes, reservadas, solicitadas] =
    await Promise.all([
      veiculo.movimentacaoAbertaId
        ? listarMovimentacoes({ veiculoId: id, abertas: true, limite: 5 })
        : Promise.resolve([]),
      nomesDasSedes(),
      podeSair
        ? listarCondutores()
        : Promise.resolve({ disponivel: true, condutores: [] }),
      podeSair
        ? listarAgendamentos({ situacoes: ["atendida"], veiculoId: id })
        : Promise.resolve({ disponivel: true, agendamentos: [] }),
      podeSair
        ? listarAgendamentos({ situacoes: ["solicitada"] })
        : Promise.resolve({ disponivel: true, agendamentos: [] }),
    ])

  const movimentacaoAberta =
    movimentacoes.find((m) => m.id === veiculo.movimentacaoAbertaId) ?? null
  const condutoresAptos = condutoresRes.condutores
    .filter((c) => c.apto)
    .map((c) => ({ id: c.usuario_id, nome: c.usuarioNome ?? "(sem nome)" }))
  const periodo = (a: { data_retirada: string | null; data_retorno: string | null }) =>
    `${formatarData(a.data_retirada)}${a.data_retorno ? ` a ${formatarData(a.data_retorno)}` : ""}`
  const reservas = [
    ...reservadas.agendamentos.map((a) => ({
      id: a.id,
      condutorId: a.condutor_id,
      rotulo: `Reservado para ${a.condutorNome ?? "(condutor)"} — ${periodo(a)}${a.destino ? ` · ${a.destino}` : ""}`,
      destino: a.destino,
      data_retorno: a.data_retorno,
      atendida: true,
    })),
    ...solicitadas.agendamentos.map((a) => ({
      id: a.id,
      condutorId: a.condutor_id,
      rotulo: `Solicitado (sem veículo) por ${a.condutorNome ?? "(condutor)"} — ${periodo(a)}${a.destino ? ` · ${a.destino}` : ""}`,
      destino: a.destino,
      data_retorno: a.data_retorno,
      atendida: false,
    })),
  ]

  return (
    <>
      <CabecalhoVeiculo
        veiculo={veiculo}
        titulo={veiculo.emUso ? "Registrar entrada" : "Registrar saída"}
        descricao="Controle de acesso: o registro é feito na hora em que o veículo passa pela portaria"
        acoes={
          <Badge
            variant="outline"
            className={
              veiculo.emUso
                ? "border-warning/40 text-warning-fg"
                : "border-success/40 text-success-fg"
            }
          >
            {veiculo.emUso ? "Veículo fora" : "Na garagem"}
          </Badge>
        }
      />

      {salvo && (
        <Alert variant="success">
          <AlertDescription>Registro salvo.</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="grid gap-4">
          {veiculo.inativo ? (
            <p className="text-muted-foreground text-sm">
              Veículo inativo — não sai da garagem.
            </p>
          ) : veiculo.emUso ? (
            movimentacaoAberta ? (
              <>
                <p className="text-sm">
                  Fora desde {formatarData(movimentacaoAberta.data_retirada)}
                  {movimentacaoAberta.sede_retirada
                    ? ` (${movimentacaoAberta.sede_retirada})`
                    : ""}{" "}
                  com{" "}
                  <strong>
                    {movimentacaoAberta.condutorNome ?? "condutor não informado"}
                  </strong>
                  {movimentacaoAberta.destino
                    ? ` · destino: ${movimentacaoAberta.destino}`
                    : ""}
                  {movimentacaoAberta.previsao_retorno
                    ? ` · previsão de retorno: ${formatarData(movimentacaoAberta.previsao_retorno)}`
                    : ""}
                  {movimentacaoAberta.hodometro_retirada !== null
                    ? ` · saiu com ${movimentacaoAberta.hodometro_retirada.toLocaleString("pt-BR")} km`
                    : ""}
                </p>
                <EntradaVeiculoForm
                  veiculoId={veiculo.id}
                  movimentacaoId={movimentacaoAberta.id}
                  sedes={sedes}
                  sedePadrao={movimentacaoAberta.sede_retirada}
                />
              </>
            ) : (
              <p className="text-muted-foreground text-sm">
                Veículo em uso com{" "}
                {veiculo.condutorEmUsoNome ?? "condutor não informado"} — a
                movimentação aberta não foi encontrada.
              </p>
            )
          ) : veiculo.manutencao ? (
            <p className="text-muted-foreground text-sm">
              Veículo em manutenção — não sai da garagem até a gestão liberar.
            </p>
          ) : (
            <SaidaVeiculoForm
              veiculoId={veiculo.id}
              sedes={sedes}
              sedePadrao={veiculo.lotacao}
              condutores={condutoresAptos}
              reservas={reservas}
            />
          )}
        </CardContent>
      </Card>
    </>
  )
}
