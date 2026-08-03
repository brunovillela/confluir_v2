import type { Metadata } from "next"
import { ExternalLink, HeartPulse } from "lucide-react"

import { Badge } from "@/components/ui/badge"
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
import { requireSessaoPainel } from "@/lib/auth"
import { urlArquivoPessoal } from "@/lib/db/pessoal"
import { meusAsos } from "@/lib/db/pessoal-saude"
import { formatarData } from "@/lib/formato"

export const metadata: Metadata = { title: "Meus ASOs — Confluir" }

/** Autosserviço: atestados de saúde ocupacional do próprio funcionário. */
export default async function MeusAsosPage() {
  const sessao = await requireSessaoPainel()
  const asos = await meusAsos(sessao.usuario.id)
  const urls = new Map<string, string | null>()
  for (const a of asos) {
    urls.set(a.id, await urlArquivoPessoal(a.arquivo))
  }

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Meus ASOs</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Seus atestados de saúde ocupacional e as datas de vencimento dos
          exames periódicos.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">
              Atestados de saúde ocupacional
            </CardTitle>
            <HeartPulse className="text-muted-foreground size-4" />
          </div>
          <CardDescription>
            {asos.length} atestado{asos.length === 1 ? "" : "s"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {asos.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-sm">
              Nenhum ASO registrado para você ainda.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead className="hidden sm:table-cell">
                      Vencimento
                    </TableHead>
                    <TableHead>Realizado</TableHead>
                    <TableHead className="w-24">Arquivo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {asos.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="max-w-44 truncate font-medium">
                        {a.tipo ?? "—"}
                        {a.ultimo === true && (
                          <span className="text-muted-foreground ml-1.5 text-xs">
                            (vigente)
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground whitespace-nowrap">
                        {formatarData(a.data)}
                      </TableCell>
                      <TableCell className="text-muted-foreground hidden whitespace-nowrap sm:table-cell">
                        {formatarData(a.vencimento)}
                      </TableCell>
                      <TableCell>
                        {a.realizado === true ? (
                          <Badge
                            variant="outline"
                            className="border-success/40 text-success-fg"
                          >
                            Sim
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="text-muted-foreground"
                          >
                            Não
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {urls.get(a.id) ? (
                          <a
                            href={urls.get(a.id)!}
                            target="_blank"
                            rel="noreferrer"
                            className="text-foreground inline-flex items-center gap-1 text-xs underline-offset-4 hover:underline"
                          >
                            Abrir <ExternalLink className="size-3" />
                          </a>
                        ) : (
                          <span className="text-muted-foreground text-xs">
                            —
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  )
}
