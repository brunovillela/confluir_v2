import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { Ticket } from "lucide-react"

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
import { cuponsAguardando } from "@/lib/db/hospedagem"
import { ehGarantida } from "@/lib/db/hospedagem-garantida"
import { formatarData } from "@/lib/formato"
import { lerPaginacao, paginar } from "@/lib/paginacao"
import { semAcento } from "@/lib/texto"
import { requireVisualizacaoHotel } from "@/lib/visualizacao-hotel"

import { HotelShell } from "../hotel-shell"

export const metadata: Metadata = { title: "Cupons — Confluir" }

type Params = Record<string, string | undefined>

const ORDENS = ["hospede", "check_in", "emissao"] as const

export default async function CuponsHotelPage({
  searchParams,
}: {
  searchParams: Promise<Params>
}) {
  const { hotel, preview, gestorNome } = await requireVisualizacaoHotel()
  // Em demanda garantida o cupom já nasce reservado — não há fila de espera.
  if (ehGarantida(hotel)) redirect("/hotel/inicio")

  const params = await searchParams
  const busca = (params.busca ?? "").trim()
  const de = (params.de ?? "").trim()
  const ate = (params.ate ?? "").trim()
  const ordem = (ORDENS as readonly string[]).includes(params.ordem ?? "")
    ? params.ordem!
    : "check_in"
  const dir: "asc" | "desc" = params.dir === "desc" ? "desc" : "asc"

  const todos = await cuponsAguardando(hotel.id)
  const filtrados = todos.filter((c) => {
    if (busca && !semAcento(c.filiadoNome ?? "").includes(semAcento(busca))) return false
    if (de && (c.check_in ?? "") < de) return false
    if (ate && (c.check_in ?? "") > ate) return false
    return true
  })

  const sinal = dir === "asc" ? 1 : -1
  const ordenados = [...filtrados].sort((a, b) => {
    let cmp = 0
    if (ordem === "hospede") {
      cmp = (a.filiadoNome ?? "").localeCompare(b.filiadoNome ?? "", "pt-BR")
    } else if (ordem === "emissao") {
      cmp = (a.created_at ?? "").localeCompare(b.created_at ?? "")
    } else {
      cmp = (a.check_in ?? "").localeCompare(b.check_in ?? "")
    }
    // Desempate estável: check-in e depois nome.
    if (cmp === 0) {
      cmp =
        (a.check_in ?? "").localeCompare(b.check_in ?? "") ||
        (a.filiadoNome ?? "").localeCompare(b.filiadoNome ?? "", "pt-BR")
    }
    return cmp * sinal
  })

  const paginacao = lerPaginacao(params, 30)
  const pagina = paginar(ordenados, paginacao)
  const href = linkDeOrdem("/hotel/cupons", params, ordem, dir, ["pagina"])

  return (
    <HotelShell
      nomeHotel={hotel.nome ?? "Hotel parceiro"}
      garantida={ehGarantida(hotel)}
      preview={preview ? { gestorNome } : undefined}
    >
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Cupons aguardando reserva</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Hóspedes autorizados pelo sindicato que ainda não têm reserva — a retirada do cupom
          não garante a reserva. São {todos.length.toLocaleString("pt-BR")} no total.
        </p>
      </div>

      <Card>
        <CardContent>
          <form method="GET" className="grid gap-3 sm:grid-cols-4 sm:items-end">
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="busca">Hóspede</Label>
              <Input
                id="busca"
                name="busca"
                defaultValue={busca}
                placeholder="Nome do hóspede"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="de">Check-in de</Label>
              <Input id="de" name="de" type="date" defaultValue={de} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ate">até</Label>
              <Input id="ate" name="ate" type="date" defaultValue={ate} />
            </div>
            <input type="hidden" name="ordem" value={ordem} />
            <input type="hidden" name="dir" value={dir} />
            <div className="flex gap-2 sm:col-span-4">
              <Button type="submit" variant="secondary" size="sm">
                Filtrar
              </Button>
              {(busca || de || ate) && (
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/hotel/cupons">Limpar</Link>
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
                <ColunaOrdenavel chave="hospede" rotulo="Hóspede" ordem={ordem} dir={dir} href={href} />
                <ColunaOrdenavel
                  chave="check_in"
                  rotulo="Check-in previsto"
                  ordem={ordem}
                  dir={dir}
                  href={href}
                />
                <TableHead className="hidden sm:table-cell">Sexo</TableHead>
                <TableHead>Quarto coletivo</TableHead>
                <ColunaOrdenavel
                  chave="emissao"
                  rotulo="Emitido em"
                  ordem={ordem}
                  dir={dir}
                  href={href}
                  className="hidden md:table-cell"
                />
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagina.total === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="h-32">
                    <div className="text-muted-foreground flex flex-col items-center justify-center gap-2 text-center">
                      <Ticket className="size-6" />
                      <p className="text-sm">
                        {todos.length === 0
                          ? "Nenhum cupom aguardando reserva no momento."
                          : "Nenhum cupom com esses filtros."}
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
              {pagina.linhas.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="max-w-64 truncate font-medium">
                    {c.filiadoNome ?? "(sem nome)"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{formatarData(c.check_in)}</TableCell>
                  <TableCell className="text-muted-foreground hidden sm:table-cell">
                    {c.sexo ?? "—"}
                  </TableCell>
                  <TableCell>
                    {c.aceita_quarto_coletivo === true ? (
                      <Badge variant="outline" className="border-success/40 text-success-fg">
                        Aceita
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground">
                        Não aceita
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden md:table-cell">
                    {formatarData(c.created_at)}
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
