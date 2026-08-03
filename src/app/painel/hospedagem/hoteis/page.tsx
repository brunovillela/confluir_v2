import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, Hotel, Plus } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
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
import { requirePermissao } from "@/lib/auth"
import { listarHoteis, listarTarifas } from "@/lib/db/hospedagem"
import { formatarMoeda } from "@/lib/formato"

export const metadata: Metadata = { title: "Hotéis parceiros — Confluir" }

export default async function HoteisPage({
  searchParams,
}: {
  searchParams: Promise<{ salvo?: string }>
}) {
  await requirePermissao("filiacao_hospedagens_gestao")

  const { salvo } = await searchParams
  const [hoteis, tarifas] = await Promise.all([listarHoteis(), listarTarifas()])

  const tarifasPorHotel = new Map<string, typeof tarifas>()
  for (const t of tarifas) {
    if (!t.hotel_id) continue
    if (!tarifasPorHotel.has(t.hotel_id)) tarifasPorHotel.set(t.hotel_id, [])
    tarifasPorHotel.get(t.hotel_id)!.push(t)
  }

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
              Hotéis parceiros
            </h1>
            <p className="text-muted-foreground mt-1 text-xs">
              {hoteis.length} hotel{hoteis.length === 1 ? "" : "s"} conveniado
              {hoteis.length === 1 ? "" : "s"} — disponíveis para os associados
            </p>
          </div>
          <Button asChild>
            <Link href="/painel/hospedagem/hoteis/novo">
              <Plus />
              Novo hotel
            </Link>
          </Button>
        </div>
      </div>

      {salvo === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Hotel salvo com sucesso.</AlertDescription>
        </Alert>
      )}

      <div className="overflow-hidden rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead>Nome</TableHead>
              <TableHead className="hidden text-right md:table-cell">
                Tarifas
              </TableHead>
              <TableHead className="hidden text-right sm:table-cell">
                Menor tarifa (filiado)
              </TableHead>
              <TableHead>Demanda garantida</TableHead>
              <TableHead>Situação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {hoteis.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="h-40">
                  <div className="text-muted-foreground flex flex-col items-center justify-center gap-2 text-center">
                    <Hotel className="size-6" />
                    <p className="text-sm">Nenhum hotel parceiro cadastrado.</p>
                  </div>
                </TableCell>
              </TableRow>
            )}
            {hoteis.map((h) => {
              const doHotel = tarifasPorHotel.get(h.id) ?? []
              const menor = doHotel.reduce<number | null>((min, t) => {
                const v = t.custo_por_filiado
                if (v === null) return min
                return min === null ? v : Math.min(min, v)
              }, null)
              return (
                <TableRow key={h.id}>
                  <TableCell className="max-w-64 font-medium">
                    <Link
                      href={`/painel/hospedagem/hoteis/${h.id}`}
                      className="hover:underline"
                    >
                      <span className="block truncate">{h.nome ?? "(sem nome)"}</span>
                    </Link>
                  </TableCell>
                  <TableCell className="hidden text-right tabular-nums md:table-cell">
                    {doHotel.length.toLocaleString("pt-BR")}
                  </TableCell>
                  <TableCell className="hidden text-right tabular-nums sm:table-cell">
                    {menor === null ? "—" : formatarMoeda(menor)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {h.demanda_garantida === true ? "Sim" : "Não"}
                  </TableCell>
                  <TableCell>
                    {h.ativo === false ? (
                      <Badge variant="outline" className="text-muted-foreground">
                        Inativo
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="border-success/40 text-success-fg"
                      >
                        Ativo
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </>
  )
}
