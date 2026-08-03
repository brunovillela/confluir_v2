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
import { requirePermissao } from "@/lib/auth"
import { buscarServico, cuponsAguardando } from "@/lib/db/hospedagem"
import { formatarCpf } from "@/lib/cpf"
import { formatarData, formatarMoeda } from "@/lib/formato"
import { podeAcessar } from "@/lib/permissoes"

import {
  FinalizarBotao,
  HospedeAcoes,
  VincularCupomForm,
} from "./servico-acoes"

export const metadata: Metadata = { title: "Reserva de hospedagem — Confluir" }

export default async function ServicoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ salvo?: string }>
}) {
  const sessao = await requirePermissao("filiacao_hospedagens", [
    "filiacao_hospedagens_gestao",
    "filiacao_hospedagens_edicao",
  ])
  const podeEditar = podeAcessar(sessao.permissoes, "filiacao_hospedagens_edicao", [
    "filiacao_hospedagens_gestao",
  ])

  const { id } = await params
  const { salvo } = await searchParams
  const detalhe = await buscarServico(id)
  if (!detalhe) notFound()
  const { servico, hotel, cupons } = detalhe

  const disponiveis =
    podeEditar && servico.finalizado !== true && servico.hotel_id
      ? await cuponsAguardando(servico.hotel_id)
      : []

  const finalizado = servico.finalizado === true

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/hospedagem/servicos">
            <ArrowLeft />
            Reservas
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
            </div>
            <p className="text-muted-foreground mt-1 text-xs">
              Reserva em {hotel?.nome ?? "hotel não identificado"} ·{" "}
              {formatarData(servico.checkin_date)} →{" "}
              {formatarData(servico.checkout_date)}
            </p>
          </div>
          {podeEditar && (
            <FinalizarBotao servicoId={servico.id} finalizado={finalizado} />
          )}
        </div>
      </div>

      {salvo === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Reserva criada com sucesso.</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Hóspedes (cupons)</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {cupons.length.toLocaleString("pt-BR")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-xs">
              registrado{servico.quant_ocupantes === 1 ? "" : "s"} na reserva
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Compareceram</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {cupons.filter((c) => c.compareceu === true).length.toLocaleString("pt-BR")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-xs">dos cupons vinculados</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Quarto</CardDescription>
            <CardTitle className="text-2xl">
              {servico.coletivo === true ? "Coletivo" : "Individual"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-xs">
              {servico.sexo ?? "sexo não informado"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Tarifa aplicada</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {formatarMoeda(cupons[0]?.tarifa_hospede ?? null)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-xs">
              por hóspede · entidade {formatarMoeda(servico.custo_entidade)} — pela
              ocupação de {cupons.length || servico.quant_ocupantes || 0}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Criada em</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {formatarData(servico.created_at)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-xs">registro do serviço</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Hóspedes da reserva</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>Filiado</TableHead>
                  <TableHead className="hidden lg:table-cell">CPF</TableHead>
                  <TableHead className="hidden sm:table-cell">
                    Check-in do cupom
                  </TableHead>
                  <TableHead>Compareceu</TableHead>
                  {podeEditar && <TableHead className="text-right">Ações</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {cupons.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={podeEditar ? 5 : 4}
                      className="text-muted-foreground h-20 text-center text-sm"
                    >
                      Nenhum cupom vinculado a esta reserva.
                    </TableCell>
                  </TableRow>
                )}
                {cupons.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="max-w-56 font-medium">
                      {c.filiado_id ? (
                        <Link
                          href={`/painel/filiados/${c.filiado_id}`}
                          className="hover:underline"
                        >
                          <span className="block truncate">
                            {c.filiadoNome ?? "(sem nome)"}
                          </span>
                        </Link>
                      ) : (
                        <span className="block truncate">(sem filiado)</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden font-mono text-xs lg:table-cell">
                      {c.filiadoCpf ? formatarCpf(c.filiadoCpf) : "—"}
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
                    {podeEditar && (
                      <TableCell>
                        <HospedeAcoes
                          servicoId={servico.id}
                          cupomId={c.id}
                          compareceu={c.compareceu === true}
                          podeDesvincular={!finalizado}
                        />
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {podeEditar && !finalizado && (
            <div className="border-t pt-4">
              <p className="mb-2 text-sm font-medium">Vincular cupom</p>
              <VincularCupomForm
                servicoId={servico.id}
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
    </>
  )
}
