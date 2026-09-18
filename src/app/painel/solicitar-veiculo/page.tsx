import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { requireSessaoPainel } from "@/lib/auth"
import { nomesDasSedes } from "@/lib/db/organizacao"
import { buscarCondutorDoUsuario, listarAgendamentos } from "@/lib/db/veiculos"
import { formatarData } from "@/lib/formato"

import {
  EditarAgendamentoForm,
  SolicitarVeiculoForm,
} from "../veiculos/agendamentos/agendamento-forms"

export const metadata: Metadata = { title: "Solicitar veículo — Confluir" }

/**
 * Página do condutor para solicitar veículo (botão do topo do painel) e editar
 * uma solicitação em aberto (?editar=<id>). Fora de /painel/veiculos de
 * propósito: qualquer funcionário logado com cadastro de condutor solicita,
 * sem permissão ao módulo Veículos. A aptidão é conferida de novo na action.
 */
export default async function SolicitarVeiculoPage({
  searchParams,
}: {
  searchParams: Promise<{ editar?: string }>
}) {
  const sessao = await requireSessaoPainel()
  const usuarioId = sessao.usuario.id as string
  const { editar } = await searchParams
  const [condutor, sedes] = await Promise.all([
    buscarCondutorDoUsuario(usuarioId),
    nomesDasSedes(),
  ])

  const emEdicao = editar
    ? (
        await listarAgendamentos({
          condutorId: usuarioId,
          situacoes: ["solicitada", "atendida"],
          limite: 30,
        })
      ).agendamentos.find((a) => a.id === editar)
    : undefined

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel">
            <ArrowLeft />
            Painel
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">
          {emEdicao ? "Editar solicitação de veículo" : "Solicitar veículo"}
        </h1>
        <p className="text-muted-foreground mt-1 text-xs">
          A recepção atende a solicitação e escolhe o veículo; a saída e a devolução são registradas
          na portaria. Suas solicitações em aberto ficam no painel inicial.
        </p>
      </div>

      {!condutor ? (
        <Alert variant="info">
          <AlertDescription>
            Você não tem cadastro de condutor. Para dirigir os veículos do sindicato, procure a
            gestão da frota com a sua CNH.
          </AlertDescription>
        </Alert>
      ) : editar && !emEdicao ? (
        <Alert variant="warning">
          <AlertDescription>
            Esta solicitação não pode mais ser editada — ela já foi retirada, concluída ou
            cancelada.{" "}
            <Link href="/painel/solicitar-veiculo" className="underline underline-offset-4">
              Fazer uma nova solicitação
            </Link>
          </AlertDescription>
        </Alert>
      ) : !condutor.apto ? (
        <Alert variant="info">
          <AlertDescription>
            {condutor.cnhVencida
              ? "Sua CNH está vencida — atualize o cadastro com a gestão da frota para voltar a solicitar veículos."
              : "Seu cadastro de condutor ainda não está autorizado a dirigir os veículos do sindicato."}
          </AlertDescription>
        </Alert>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {emEdicao
                ? `Solicitação para ${formatarData(emEdicao.data_retirada)}`
                : "Nova solicitação"}
            </CardTitle>
            <CardDescription>Motivo, destino, datas e sede de retirada</CardDescription>
          </CardHeader>
          <CardContent>
            {emEdicao ? (
              <EditarAgendamentoForm
                agendamentoId={emEdicao.id}
                sedes={sedes}
                abertoInicial
                valores={{
                  motivo: emEdicao.motivo,
                  destino: emEdicao.destino,
                  data_retirada: emEdicao.data_retirada,
                  data_retorno: emEdicao.data_retorno,
                  sede_retirada: emEdicao.sede_retirada,
                }}
              />
            ) : (
              <SolicitarVeiculoForm sedes={sedes} voltar="/painel" />
            )}
          </CardContent>
        </Card>
      )}
    </>
  )
}
