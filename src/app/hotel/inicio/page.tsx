import type { Metadata } from "next"
import Link from "next/link"
import { BedDouble, Plus, Ticket, TriangleAlert } from "lucide-react"

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
import { Paginacao } from "@/components/paginacao"
import { requireSessaoHotel } from "@/lib/auth"
import {
  cuponsAguardando,
  listarServicos,
  listarTarifas,
  relatorioPendente,
} from "@/lib/db/hospedagem"
import { formatarData, formatarMoeda } from "@/lib/formato"
import { lerPaginacao, paginar } from "@/lib/paginacao"

import { HotelShell } from "../hotel-shell"

export const metadata: Metadata = { title: "Área do hotel — Confluir" }

export default async function HotelInicioPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const { hotel } = await requireSessaoHotel()
  const params = await searchParams

  const [cupons, todosServicos, tarifas] = await Promise.all([
    cuponsAguardando(hotel.id),
    listarServicos(),
    listarTarifas(hotel.id),
  ])
  const servicos = todosServicos.filter((s) => s.hotel_id === hotel.id)

  const hoje = new Date().toISOString().slice(0, 10)
  const abertas = servicos.filter(
    (s) => s.finalizado !== true && (s.checkout_date ?? "") >= hoje
  )
  // Página concorrida (tiles + várias tabelas): 10 por página em cada uma.
  const pagCupons = lerPaginacao(params, 10, "c")
  const cuponsPagina = paginar(cupons, pagCupons)
  const pagReservas = lerPaginacao(params, 10, "r")
  const reservasPagina = paginar(servicos, pagReservas)

  const hospedesHoje = servicos
    .filter(
      (s) =>
        s.finalizado !== true &&
        (s.checkin_date ?? "") <= hoje &&
        (s.checkout_date ?? "") > hoje
    )
    .reduce((acc, s) => acc + (s.cuponsVinculados || s.quant_ocupantes || 0), 0)

  const indicadores = [
    {
      titulo: "Cupons aguardando reserva",
      valor: cupons.length.toLocaleString("pt-BR"),
      detalhe: "autorizações emitidas pelo sindicato",
      icone: Ticket,
    },
    {
      titulo: "Reservas abertas",
      valor: abertas.length.toLocaleString("pt-BR"),
      detalhe: "com check-out de hoje em diante",
      icone: BedDouble,
    },
    {
      titulo: "Hóspedes hoje",
      valor: hospedesHoje.toLocaleString("pt-BR"),
      detalhe: "hospedados pelo convênio nesta data",
      icone: BedDouble,
    },
  ]

  return (
    <HotelShell nomeHotel={hotel.nome ?? "Hotel parceiro"}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {hotel.nome ?? "Hotel parceiro"}
          </h1>
          <p className="text-muted-foreground mt-1 text-xs">
            Cupons e reservas do convênio de hospedagem com o Sindipetro-NF.
          </p>
        </div>
        <Button asChild>
          <Link href="/hotel/reservas/nova">
            <Plus />
            Registrar reserva
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {indicadores.map((ind) => (
          <Card key={ind.titulo}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardDescription>{ind.titulo}</CardDescription>
                <ind.icone className="text-muted-foreground size-4" />
              </div>
              <CardTitle className="text-2xl tabular-nums">{ind.valor}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-xs">{ind.detalhe}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cupons aguardando reserva</CardTitle>
          <CardDescription>
            Hóspedes autorizados pelo sindicato que ainda não têm reserva — a
            retirada do cupom não garante a reserva.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Hóspede</TableHead>
                  <TableHead>Check-in previsto</TableHead>
                  <TableHead className="hidden sm:table-cell">Sexo</TableHead>
                  <TableHead>Quarto coletivo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cuponsPagina.total === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="text-muted-foreground h-20 text-center text-sm"
                    >
                      Nenhum cupom aguardando reserva no momento.
                    </TableCell>
                  </TableRow>
                )}
                {cuponsPagina.linhas.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="max-w-56 truncate font-medium">
                      {c.filiadoNome ?? "(sem nome)"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatarData(c.check_in)}
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden sm:table-cell">
                      {c.sexo ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {c.aceita_quarto_coletivo === true ? "Aceita" : "Não aceita"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="mt-4">
            <Paginacao
              total={cuponsPagina.total}
              pagina={cuponsPagina.pagina}
              totalPaginas={cuponsPagina.totalPaginas}
              porPagina={pagCupons.porPagina}
              padrao={10}
              prefixo="c"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Reservas</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Check-in</TableHead>
                  <TableHead className="hidden sm:table-cell">Check-out</TableHead>
                  <TableHead className="text-right">Hóspedes</TableHead>
                  <TableHead>Fatura</TableHead>
                  <TableHead>Situação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reservasPagina.total === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="text-muted-foreground h-20 text-center text-sm"
                    >
                      Nenhuma reserva registrada.
                    </TableCell>
                  </TableRow>
                )}
                {reservasPagina.linhas.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-mono text-xs font-medium">
                      <span className="inline-flex items-center gap-1.5">
                        <Link
                          href={`/hotel/reservas/${s.id}`}
                          className="hover:underline"
                        >
                          {s.codigo ?? "(sem código)"}
                        </Link>
                        {relatorioPendente(s, hoje) && (
                          <TriangleAlert
                            className="size-3.5 text-warning-fg"
                            aria-label="Reserva encerrada sem relatório/extrato assinado"
                          >
                            <title>
                              Reserva encerrada sem relatório/extrato assinado
                              pelos hóspedes
                            </title>
                          </TriangleAlert>
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatarData(s.checkin_date)}
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden sm:table-cell">
                      {formatarData(s.checkout_date)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {s.cuponsVinculados.toLocaleString("pt-BR")}
                    </TableCell>
                    <TableCell>
                      {s.faturaCodigo ? (
                        <span className="font-mono text-xs">{s.faturaCodigo}</span>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">
                          Não faturado
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {s.finalizado === true ? (
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
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="mt-4">
            <Paginacao
              total={reservasPagina.total}
              pagina={reservasPagina.pagina}
              totalPaginas={reservasPagina.totalPaginas}
              porPagina={pagReservas.porPagina}
              padrao={10}
              prefixo="r"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tarifas acordadas</CardTitle>
          <CardDescription>
            A tarifa de cada hóspede é a da quantidade efetiva de pessoas no
            quarto, conforme a reserva.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>Pessoas por quarto</TableHead>
                  <TableHead className="text-right">Custo por hóspede</TableHead>
                  <TableHead className="text-right">Custo da entidade</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tarifas.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={3}
                      className="text-muted-foreground h-20 text-center text-sm"
                    >
                      Nenhuma tarifa cadastrada — fale com o sindicato.
                    </TableCell>
                  </TableRow>
                )}
                {tarifas.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="tabular-nums">
                      {t.pessoas_por_quarto ?? "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatarMoeda(t.custo_por_filiado)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatarMoeda(t.custo_entidade)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </HotelShell>
  )
}
