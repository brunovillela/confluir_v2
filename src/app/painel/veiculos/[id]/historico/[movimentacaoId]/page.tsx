import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Card, CardContent } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { nomesDasSedes } from "@/lib/db/organizacao"
import {
  buscarVeiculo,
  listarCondutores,
  listarMovimentacoes,
} from "@/lib/db/veiculos"
import { formatarData } from "@/lib/formato"

import { CabecalhoVeiculo } from "../../cabecalho-veiculo"
import { MovimentacaoEditarForm } from "./movimentacao-editar-form"

export const metadata: Metadata = { title: "Corrigir movimentação — Confluir" }

/** Gestão da frota corrige um lançamento de saída/entrada. */
export default async function EditarMovimentacaoPage({
  params,
}: {
  params: Promise<{ id: string; movimentacaoId: string }>
}) {
  await requirePermissao("veiculos_gestao")
  const { id, movimentacaoId } = await params
  const veiculo = await buscarVeiculo(id)
  if (!veiculo) notFound()

  const [movimentacoes, condutoresRes, sedes] = await Promise.all([
    listarMovimentacoes({ veiculoId: id, ids: [movimentacaoId], limite: 1 }),
    listarCondutores(),
    nomesDasSedes(),
  ])
  const m = movimentacoes[0]
  if (!m) notFound()

  return (
    <>
      <CabecalhoVeiculo
        veiculo={veiculo}
        titulo="Corrigir movimentação"
        descricao={`Saída em ${formatarData(m.data_retirada)}${m.condutorNome ? ` com ${m.condutorNome}` : ""}${m.aberta ? " · em aberto" : ` · entrada em ${formatarData(m.data_devolucao)}`}`}
      />

      <Alert variant="info">
        <AlertDescription>
          A correção recalcula a quilometragem rodada e a situação do veículo.
          Use para consertar erro de lançamento — o registro original não é
          guardado.
        </AlertDescription>
      </Alert>

      <Card>
        <CardContent>
          <MovimentacaoEditarForm
            movimentacaoId={m.id}
            veiculoId={veiculo.id}
            valores={{
              condutor_id: m.condutor_id,
              data_retirada: m.data_retirada,
              hodometro_retirada: m.hodometro_retirada,
              sede_retirada: m.sede_retirada,
              destino: m.destino,
              previsao_retorno: m.previsao_retorno,
              data_devolucao: m.data_devolucao,
              hodometro_devolucao: m.hodometro_devolucao,
              sede_devolucao: m.sede_devolucao,
              observacao_retorno: m.observacao_retorno,
            }}
            condutores={condutoresRes.condutores.map((c) => ({
              id: c.usuario_id,
              nome: c.usuarioNome ?? "(sem nome)",
            }))}
            sedes={sedes}
          />
        </CardContent>
      </Card>
    </>
  )
}
