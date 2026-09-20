import type { Metadata } from "next"
import Link from "next/link"
import { BedDouble, Plus, TriangleAlert } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ColunaOrdenavel, linkDeOrdem } from "@/components/coluna-ordenavel"
import { Paginacao } from "@/components/paginacao"
import { listarServicos, relatorioPendente } from "@/lib/db/hospedagem"
import { ehGarantida } from "@/lib/db/hospedagem-garantida"
import { formatarData } from "@/lib/formato"
import { lerPaginacao, paginar } from "@/lib/paginacao"
import { semAcento } from "@/lib/texto"
import { requireVisualizacaoHotel } from "@/lib/visualizacao-hotel"

import { HotelShell } from "../hotel-shell"

export const metadata: Metadata = { title: "Reservas — Confluir" }

type Params = Record<string, string | undefined>

const ORDENS = ["codigo", "checkin", "checkout", "hospedes"] as const
const SITUACOES: Record<string, string> = {
  todas: "Todas",
  abertas: "Abertas",
  finalizadas: "Finalizadas",
  sem_relatorio: "Sem relatório",
  nao_faturadas: "Não faturadas",
}

const SELECT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

export default async function ReservasHotelPage({
  searchParams,
}: {
  searchParams: Promise<Params>
}) {
  const { hotel, preview, gestorNome } = await requireVisualizacaoHotel()
  const params = await searchParams

  const busca = (params.busca ?? "").trim()
  const de = (params.de ?? "").trim()
  const ate = (params.ate ?? "").trim()
  const situacao = params.situacao && SITUACOES[params.situacao] ? params.situacao : "todas"
  const ordem = (ORDENS as readonly string[]).includes(params.ordem ?? "")
    ? params.ordem!
    : "checkin"
  const dir: "asc" | "desc" = params.dir === "asc" ? "asc" : "desc"

  const hoje = new Date().toISOString().slice(0, 10)
  const todas = (await listarServicos()).filter((s) => s.hotel_id === hotel.id)

  const filtradas = todas.filter((s) => {
    if (busca && !semAcento(s.codigo ?? "").includes(semAcento(busca))) return false
    if (de && (s.checkin_date ?? "") < de) return false
    if (ate && (s.checkin_date ?? "") > ate) return false
    if (situacao === "abertas" && s.finalizado === true) return false
    if (situacao === "finalizadas" && s.finalizado !== true) return false
    if (situacao === "sem_relatorio" && !relatorioPendente(s, hoje)) return false
    if (situacao === "nao_faturadas" && s.faturaCodigo) return false
    return true
  })

  const sinal = dir === "asc" ? 1 : -1
  const ordenadas = [...filtradas].sort((a, b) => {
    let cmp = 0
    if (ordem === "codigo") cmp = (a.codigo ?? "").localeCompare(b.codigo ?? "", "pt-BR")
    else if (ordem === "checkout") cmp = (a.checkout_date ?? "").localeCompare(b.checkout_date ?? "")
    else if (ordem === "hospedes") cmp = a.cuponsVinculados - b.cuponsVinculados
    else cmp = (a.checkin_date ?? "").localeCompare(b.checkin_date ?? "")
    if (cmp === 0) cmp = (a.codigo ?? "").localeCompare(b.codigo ?? "", "pt-BR")
    return cmp * sinal
  })

  const paginacao = lerPaginacao(params, 30)
  const pagina = paginar(ordenadas, paginacao)
  const href = linkDeOrdem("/hotel/reservas", params, ordem, dir, ["pagina"])
  const semRelatorio = todas.filter((s) => relatorioPendente(s, hoje)).length

  return (
    <HotelShell
      nomeHotel={hotel.nome ?? "Hotel parceiro"}
      garantida={ehGarantida(hotel)}
      preview={preview ? { gestorNome } : undefined}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Reservas</h1>
          <p className="text-muted-foreground mt-1 text-xs">
            {todas.length.toLocaleString("pt-BR")} no total
            {semRelatorio > 0 && (
              <> · {semRelatorio} encerrada(s) sem o relatório assinado</>
            )}
          </p>
        </div>
        <Button asChild>
          <Link href="/hotel/reservas/nova">
            <Plus />
            Registrar reserva
          </Link>
        </Button>
      </div>

      <Card>
        <CardContent>
          <form method="GET" className="grid gap-3 sm:grid-cols-4 sm:items-end">
            <div className="grid gap-1.5">
              <Label htmlFor="busca">Código</Label>
              <Input id="busca" name="busca" defaultValue={busca} placeholder="2026.0720…" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="de">Check-in de</Label>
              <Input id="de" name="de" type="date" defaultValue={de} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ate">até</Label>
              <Input id="ate" name="ate" type="date" defaultValue={ate} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="situacao">Situação</Label>
              <select id="situacao" name="situacao" defaultValue={situacao} className={SELECT}>
                {Object.entries(SITUACOES).map(([valor, rotulo]) => (
                  <option key={valor} value={valor}>
                    {rotulo}
                  </option>
                ))}
              </select>
            </div>
            <input type="hidden" name="ordem" value={ordem} />
            <input type="hidden" name="dir" value={dir} />
            <div className="flex gap-2 sm:col-span-4">
              <Button type="submit" variant="secondary" size="sm">
                Filtrar
              </Button>
              {(busca || de || ate || situacao !== "todas") && (
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/hotel/reservas">Limpar</Link>
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="overflow-hidden rounded-xl border">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <ColunaOrdenavel chave="codigo" rotulo="Código" ordem={ordem} dir={dir} href={href} />
                <ColunaOrdenavel chave="checkin" rotulo="Check-in" ordem={ordem} dir={dir} href={href} />
                <ColunaOrdenavel
                  chave="checkout"
                  rotulo="Check-out"
                  ordem={ordem}
                  dir={dir}
                  href={href}
                  className="hidden sm:table-cell"
                />
                <ColunaOrdenavel
                  chave="hospedes"
                  rotulo="Hóspedes"
                  ordem={ordem}
                  dir={dir}
                  href={href}
                />
                <TableHead>Fatura</TableHead>
                <TableHead>Situação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagina.total === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="h-32">
                    <div className="text-muted-foreground flex flex-col items-center justify-center gap-2 text-center">
                      <BedDouble className="size-6" />
                      <p className="text-sm">
                        {todas.length === 0
                          ? "Nenhuma reserva registrada."
                          : "Nenhuma reserva com esses filtros."}
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
              {pagina.linhas.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-mono text-xs font-medium">
                    <span className="inline-flex items-center gap-1.5">
                      <Link href={`/hotel/reservas/${s.id}`} className="hover:underline">
                        {s.codigo ?? "(sem código)"}
                      </Link>
                      {relatorioPendente(s, hoje) && (
                        <TriangleAlert
                          className="text-warning-fg size-3.5"
                          aria-label="Reserva encerrada sem relatório/extrato assinado"
                        >
                          <title>
                            Reserva encerrada sem relatório/extrato assinado pelos hóspedes
                          </title>
                        </TriangleAlert>
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {formatarData(s.checkin_date)}
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden whitespace-nowrap sm:table-cell">
                    {formatarData(s.checkout_date)}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {s.cuponsVinculados.toLocaleString("pt-BR")}
                    {s.comparecidos > 0 && (
                      <span className="text-muted-foreground text-xs">
                        {" "}
                        · {s.comparecidos} compareceu(ram)
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    {s.faturaCodigo ? (
                      <span className="font-mono text-xs">{s.faturaCodigo}</span>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground">
                        Não faturada
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {s.finalizado === true ? (
                      <Badge variant="outline" className="text-muted-foreground">
                        Finalizada
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="border-success/40 text-success-fg">
                        Aberta
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <Paginacao
        total={pagina.total}
        pagina={pagina.pagina}
        totalPaginas={pagina.totalPaginas}
        porPagina={paginacao.porPagina}
        padrao={30}
      />
    </HotelShell>
  )
}
