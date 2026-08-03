import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, CalendarCheck, Plus, TriangleAlert } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Paginacao } from "@/components/paginacao"
import { requirePermissao } from "@/lib/auth"
import { listarHoteis, listarServicos, relatorioPendente } from "@/lib/db/hospedagem"
import { formatarData } from "@/lib/formato"
import { lerPaginacao, paginar } from "@/lib/paginacao"
import { podeAcessar } from "@/lib/permissoes"

export const metadata: Metadata = { title: "Reservas de hospedagem — Confluir" }

const SELECT_FILTRO =
  "border-input bg-background text-foreground h-9 max-w-52 truncate rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

export default async function ServicosPage({
  searchParams,
}: {
  searchParams: Promise<{
    hotel?: string
    situacao?: string
    pagina?: string
    porPagina?: string
  }>
}) {
  const sessao = await requirePermissao("filiacao_hospedagens", [
    "filiacao_hospedagens_gestao",
    "filiacao_hospedagens_edicao",
  ])
  const podeEditar = podeAcessar(sessao.permissoes, "filiacao_hospedagens_edicao", [
    "filiacao_hospedagens_gestao",
  ])

  const params = await searchParams
  const situacao = ["abertas", "finalizadas"].includes(params.situacao ?? "")
    ? (params.situacao as string)
    : "todas"

  const [todosServicos, hoteis] = await Promise.all([
    listarServicos(),
    listarHoteis(),
  ])
  const hotel = hoteis.some((h) => h.id === params.hotel) ? params.hotel! : "todos"

  const servicos = todosServicos.filter((s) => {
    if (hotel !== "todos" && s.hotel_id !== hotel) return false
    if (situacao === "abertas" && s.finalizado === true) return false
    if (situacao === "finalizadas" && s.finalizado !== true) return false
    return true
  })
  const hoje = new Date().toISOString().slice(0, 10)

  // Página dedicada à lista: 30 por página.
  const paginacao = lerPaginacao(params, 30)
  const paginaAtual = paginar(servicos, paginacao)

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/hospedagem">
            <ArrowLeft />
            Hospedagem
          </Link>
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Reservas (serviços)
            </h1>
            <p className="text-muted-foreground mt-1 text-xs">
              {servicos.length} reserva{servicos.length === 1 ? "" : "s"} — a
              efetivação da hospedagem no hotel, agrupando os cupons dos hóspedes
            </p>
          </div>
          {podeEditar && (
            <Button asChild>
              <Link href="/painel/hospedagem/servicos/novo">
                <Plus />
                Nova reserva
              </Link>
            </Button>
          )}
        </div>
      </div>

      <form method="GET" className="flex flex-wrap items-center gap-2">
        <select
          name="hotel"
          defaultValue={hotel}
          aria-label="Filtrar por hotel"
          className={SELECT_FILTRO}
        >
          <option value="todos">Todos os hotéis</option>
          {hoteis.map((h) => (
            <option key={h.id} value={h.id}>
              {h.nome ?? "(sem nome)"}
            </option>
          ))}
        </select>
        <select
          name="situacao"
          defaultValue={situacao}
          aria-label="Filtrar por situação"
          className={SELECT_FILTRO}
        >
          <option value="todas">Todas as situações</option>
          <option value="abertas">Abertas</option>
          <option value="finalizadas">Finalizadas</option>
        </select>
        <Button type="submit" variant="secondary" size="sm">
          Filtrar
        </Button>
      </form>

      <div className="overflow-hidden rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead>Código</TableHead>
              <TableHead className="hidden md:table-cell">Hotel</TableHead>
              <TableHead>Check-in</TableHead>
              <TableHead className="hidden sm:table-cell">Check-out</TableHead>
              <TableHead className="text-right">Hóspedes</TableHead>
              <TableHead className="hidden lg:table-cell">Fatura</TableHead>
              <TableHead>Situação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginaAtual.total === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="h-40">
                  <div className="text-muted-foreground flex flex-col items-center justify-center gap-2 text-center">
                    <CalendarCheck className="size-6" />
                    <p className="text-sm">Nenhuma reserva encontrada.</p>
                  </div>
                </TableCell>
              </TableRow>
            )}
            {paginaAtual.linhas.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-mono text-xs font-medium">
                  <span className="inline-flex items-center gap-1.5">
                    <Link
                      href={`/painel/hospedagem/servicos/${s.id}`}
                      className="hover:underline"
                    >
                      {s.codigo ?? "(sem código)"}
                    </Link>
                    {relatorioPendente(s, hoje) && (
                      <TriangleAlert
                        className="size-3.5 text-warning-fg"
                        aria-label="Reserva encerrada sem relatório/extrato do hotel"
                      >
                        <title>
                          Reserva encerrada sem relatório/extrato assinado pelos
                          hóspedes
                        </title>
                      </TriangleAlert>
                    )}
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground hidden max-w-48 truncate md:table-cell">
                  {s.hotelNome ?? "—"}
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
                <TableCell className="hidden lg:table-cell">
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

      <Paginacao
        total={paginaAtual.total}
        pagina={paginaAtual.pagina}
        totalPaginas={paginaAtual.totalPaginas}
        porPagina={paginacao.porPagina}
        padrao={30}
      />
    </>
  )
}
