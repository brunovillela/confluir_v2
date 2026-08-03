import type { Metadata } from "next"
import { BedDouble, CalendarCheck, Hotel, Percent, Ticket } from "lucide-react"

import { CartaoArea } from "@/components/cartao-area"
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
import { listarCupons, resumoHospedagem } from "@/lib/db/hospedagem"
import { formatarData } from "@/lib/formato"
import { podeAcessar } from "@/lib/permissoes"

import { SituacaoCupomBadge } from "./situacao-cupom-badge"

export const metadata: Metadata = { title: "Hospedagem — Confluir" }

export default async function HospedagemPage() {
  const sessao = await requirePermissao("filiacao_hospedagens", [
    "filiacao_hospedagens_gestao",
    "filiacao_hospedagens_edicao",
  ])
  const podeGerir = podeAcessar(sessao.permissoes, "filiacao_hospedagens_gestao")

  const [resumo, cupons] = await Promise.all([resumoHospedagem(), listarCupons()])

  const indicadores = [
    {
      titulo: "Hotéis parceiros ativos",
      valor: resumo.hoteisAtivos.toLocaleString("pt-BR"),
      detalhe: "disponíveis para os associados",
      icone: Hotel,
    },
    {
      titulo: "Cupons aguardando reserva",
      valor: resumo.cuponsAguardando.toLocaleString("pt-BR"),
      detalhe: "emitidos e ainda sem serviço vinculado",
      icone: Ticket,
    },
    {
      titulo: "Reservas abertas",
      valor: resumo.reservasAbertas.toLocaleString("pt-BR"),
      detalhe: "serviços com check-out de hoje em diante",
      icone: BedDouble,
    },
    {
      titulo: "Comparecimento",
      valor: resumo.comparecimento === null ? "—" : `${resumo.comparecimento}%`,
      detalhe: "cupons reservados com check-in já passado",
      icone: Percent,
    },
  ]

  const atalhos = [
    {
      titulo: "Cupons",
      descricao:
        "Autorizações de subsídio emitidas aos filiados — a retirada não garante a reserva",
      href: "/painel/hospedagem/cupons",
      icone: Ticket,
    },
    {
      titulo: "Reservas (serviços)",
      descricao: "Reservas efetivadas nos hotéis, agrupando os cupons dos hóspedes",
      href: "/painel/hospedagem/servicos",
      icone: CalendarCheck,
    },
    podeGerir && {
      titulo: "Hotéis parceiros",
      descricao: "Cadastro dos hotéis conveniados e tarifas por acomodação",
      href: "/painel/hospedagem/hoteis",
      icone: Hotel,
    },
  ].filter(Boolean) as {
    titulo: string
    descricao: string
    href: string
    icone: typeof Hotel
  }[]

  const ultimos = cupons.slice(0, 8)

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Hospedagem</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Hotéis parceiros, cupons de subsídio e reservas dos associados.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {atalhos.map((a) => (
          <CartaoArea
            key={a.href}
            titulo={a.titulo}
            descricao={a.descricao}
            href={a.href}
            icone={a.icone}
          />
        ))}
      </div>

      {ultimos.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Últimos cupons emitidos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Filiado</TableHead>
                    <TableHead className="hidden md:table-cell">Hotel</TableHead>
                    <TableHead>Check-in</TableHead>
                    <TableHead className="hidden sm:table-cell">Emitido em</TableHead>
                    <TableHead>Situação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ultimos.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="max-w-56 truncate font-medium">
                        {c.filiadoNome ?? "(sem filiado)"}
                      </TableCell>
                      <TableCell className="text-muted-foreground hidden max-w-48 truncate md:table-cell">
                        {c.hotelNome ?? "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatarData(c.check_in)}
                      </TableCell>
                      <TableCell className="text-muted-foreground hidden sm:table-cell">
                        {formatarData(c.created_at)}
                      </TableCell>
                      <TableCell>
                        <SituacaoCupomBadge
                          cancelado={c.cancelado}
                          servicoId={c.servico_id}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  )
}
