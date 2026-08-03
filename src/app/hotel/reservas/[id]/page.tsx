import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"

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
import { requireSessaoHotel } from "@/lib/auth"
import {
  buscarServico,
  cuponsAguardando,
  urlArquivoHospedagem,
} from "@/lib/db/hospedagem"
import { formatarData, formatarMoeda } from "@/lib/formato"

import {
  FinalizarBotao,
  HospedeAcoes,
  VincularCupomForm,
} from "@/app/painel/hospedagem/servicos/[id]/servico-acoes"

import { HotelShell } from "../../hotel-shell"
import {
  definirFinalizadoHotel,
  desvincularCupomHotel,
  marcarComparecimentoHotel,
  vincularCupomHotel,
} from "../actions"
import { RelatorioForm } from "./relatorio-form"

export const metadata: Metadata = { title: "Reserva — Confluir" }

export default async function ReservaHotelPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ salvo?: string }>
}) {
  const { hotel } = await requireSessaoHotel()

  const { id } = await params
  const { salvo } = await searchParams
  const detalhe = await buscarServico(id)
  // O hotel só enxerga as próprias reservas.
  if (!detalhe || detalhe.servico.hotel_id !== hotel.id) notFound()
  const { servico, cupons } = detalhe

  const finalizado = servico.finalizado === true
  const [disponiveis, urlRelatorio] = await Promise.all([
    finalizado ? Promise.resolve([]) : cuponsAguardando(hotel.id),
    urlArquivoHospedagem(servico.relatorio),
  ])

  return (
    <HotelShell nomeHotel={hotel.nome ?? "Hotel parceiro"}>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/hotel/inicio">
            <ArrowLeft />
            Início
          </Link>
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-mono text-2xl font-semibold tracking-tight">
                {servico.codigo ?? "(sem código)"}
              </h1>
              {finalizado ? (
                <Badge variant="outline" className="text-muted-foreground">
                  Finalizada
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="border-success/40 text-success-fg"
                >
                  Aberta
                </Badge>
              )}
              {servico.coletivo === true && (
                <Badge variant="outline">
                  Coletivo{servico.sexo ? ` · ${servico.sexo}` : ""}
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground mt-1 text-xs">
              {formatarData(servico.checkin_date)} →{" "}
              {formatarData(servico.checkout_date)}
            </p>
          </div>
          <FinalizarBotao
            servicoId={servico.id}
            finalizado={finalizado}
            action={definirFinalizadoHotel}
          />
        </div>
      </div>

      {salvo === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Reserva registrada com sucesso.</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Hóspedes</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {cupons.length.toLocaleString("pt-BR")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-xs">cupons vinculados</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Tarifa por hóspede</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {formatarMoeda(cupons[0]?.tarifa_hospede ?? null)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-xs">
              pela ocupação de {cupons.length || servico.quant_ocupantes || 0}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Custo da entidade</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {formatarMoeda(servico.custo_entidade)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-xs">por quarto, na tarifa</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Hóspedes da reserva</CardTitle>
          <CardDescription>
            Marque o comparecimento de quem se apresentou — é o que torna o
            serviço faturável. Os valores pagos pelos hóspedes na entrada e o
            valor faturado ao sindicato já contêm impostos inclusos.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>Hóspede</TableHead>
                  <TableHead className="hidden sm:table-cell">
                    Check-in do cupom
                  </TableHead>
                  <TableHead>Compareceu</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cupons.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="text-muted-foreground h-20 text-center text-sm"
                    >
                      Nenhum cupom vinculado a esta reserva.
                    </TableCell>
                  </TableRow>
                )}
                {cupons.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="max-w-56 truncate font-medium">
                      {c.filiadoNome ?? "(sem nome)"}
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden sm:table-cell">
                      {formatarData(c.check_in)}
                    </TableCell>
                    <TableCell>
                      {c.compareceu === true ? (
                        <Badge
                          variant="outline"
                          className="border-success/40 text-success-fg"
                        >
                          Sim
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">
                          Não
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <HospedeAcoes
                        servicoId={servico.id}
                        cupomId={c.id}
                        compareceu={c.compareceu === true}
                        podeDesvincular={!finalizado}
                        comparecimentoAction={marcarComparecimentoHotel}
                        desvincularAction={desvincularCupomHotel}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {!finalizado && (
            <div className="border-t pt-4">
              <p className="mb-2 text-sm font-medium">Vincular cupom</p>
              <VincularCupomForm
                servicoId={servico.id}
                action={vincularCupomHotel}
                disponiveis={disponiveis.map((c) => ({
                  id: c.id,
                  filiadoNome: c.filiadoNome,
                  check_in: c.check_in,
                }))}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Relatório / extrato da reserva</CardTitle>
          <CardDescription>
            Documento emitido pelo hotel e assinado pelos hóspedes que usaram o
            serviço. Não é obrigatório hoje, mas ajuda na conferência do
            faturamento — e pode passar a ser exigido pelo acordo.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {urlRelatorio ? (
            <p className="text-sm">
              <a
                href={urlRelatorio}
                target="_blank"
                rel="noreferrer"
                className="text-foreground font-medium underline-offset-4 hover:underline"
              >
                Abrir relatório enviado
              </a>
            </p>
          ) : (
            <p className="text-muted-foreground text-sm">
              Nenhum relatório enviado para esta reserva.
            </p>
          )}
          <RelatorioForm servicoId={servico.id} temRelatorio={!!servico.relatorio} />
        </CardContent>
      </Card>
    </HotelShell>
  )
}
