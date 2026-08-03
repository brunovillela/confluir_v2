import type { Metadata } from "next"
import { ExternalLink, FileBadge } from "lucide-react"

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
import { meusInformes } from "@/lib/db/informes"
import { urlArquivoPessoal } from "@/lib/db/pessoal"

export const metadata: Metadata = {
  title: "Meus informes de rendimentos — Confluir",
}

/** Autosserviço: informes de rendimentos liberados para o funcionário. */
export default async function MeusInformesPage() {
  const sessao = await requireSessaoPainel()
  const informes = await meusInformes(sessao.usuario.id)
  const urls = new Map<string, string | null>()
  for (const i of informes) {
    urls.set(i.id, await urlArquivoPessoal(i.arquivo_url))
  }

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Meus informes de rendimentos
        </h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Documentos para a sua declaração de imposto de renda.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Informes disponíveis</CardTitle>
            <FileBadge className="text-muted-foreground size-4" />
          </div>
          <CardDescription>
            {informes.length} liberado{informes.length === 1 ? "" : "s"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {informes.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-sm">
              Nenhum informe de rendimentos liberado para você ainda.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ano-base</TableHead>
                  <TableHead className="w-28">Arquivo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {informes.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell className="font-medium">
                      {i.ano ?? "(sem ano)"}
                    </TableCell>
                    <TableCell>
                      {urls.get(i.id) ? (
                        <a
                          href={urls.get(i.id)!}
                          target="_blank"
                          rel="noreferrer"
                          className="text-foreground inline-flex items-center gap-1 text-xs underline-offset-4 hover:underline"
                        >
                          Abrir <ExternalLink className="size-3" />
                        </a>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
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
