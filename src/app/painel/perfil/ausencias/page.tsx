import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, CalendarX2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { requireSessaoPainel } from "@/lib/auth"
import { meusAtestados, minhasAusencias } from "@/lib/db/pessoal-saude"
import { formatarData } from "@/lib/formato"

export const metadata: Metadata = { title: "Minhas ausências — Confluir" }

function dias(inicio: string | null, termino: string | null): string {
  if (!inicio) return "—"
  if (!termino) return formatarData(inicio)
  return `${formatarData(inicio)} – ${formatarData(termino)}`
}

export default async function MinhasAusenciasPage() {
  const { usuario } = await requireSessaoPainel()
  const [ausencias, atestados] = await Promise.all([
    minhasAusencias(usuario.id),
    meusAtestados(usuario.id),
  ])

  return (
    <>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/painel/perfil">
            <ArrowLeft />
            Meu perfil
          </Link>
        </Button>
      </div>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Minhas ausências e atestados
        </h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Seus afastamentos e atestados médicos registrados pelo departamento de
          pessoal
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ausências e afastamentos</CardTitle>
        </CardHeader>
        <CardContent>
          {ausencias.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-sm">
              <CalendarX2 className="mx-auto mb-2 size-5" />
              Nenhuma ausência registrada.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Período</TableHead>
                  <TableHead>Motivo</TableHead>
                  <TableHead>Atestado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ausencias.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="whitespace-nowrap text-sm">
                      {dias(a.inicio, a.termino)}
                    </TableCell>
                    <TableCell className="text-sm">{a.motivo ?? "—"}</TableCell>
                    <TableCell className="text-sm">
                      {a.atestado_id ? "Sim" : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Atestados médicos</CardTitle>
        </CardHeader>
        <CardContent>
          {atestados.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-sm">
              Nenhum atestado registrado.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Período</TableHead>
                  <TableHead className="text-right">Dias</TableHead>
                  <TableHead>CID-10</TableHead>
                  <TableHead>Observação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {atestados.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="whitespace-nowrap text-sm">
                      {dias(a.inicio, a.termino)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {a.quantidade_dias ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm">{a.cid10 ?? "—"}</TableCell>
                    <TableCell className="max-w-72 text-sm">
                      <span className="line-clamp-1">
                        {a.consideracao ??
                          (a.atestado_acompanhamento
                            ? `Acompanhamento${a.nome_acompanhado ? ` — ${a.nome_acompanhado}` : ""}`
                            : "—")}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  )
}
