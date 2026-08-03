import type { Metadata } from "next"
import { ExternalLink, GraduationCap } from "lucide-react"

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
import { meusTreinamentos } from "@/lib/db/treinamentos"
import { formatarData } from "@/lib/formato"

export const metadata: Metadata = { title: "Meus treinamentos — Confluir" }

/** Autosserviço: treinamentos e certificados do próprio funcionário. */
export default async function MeusTreinamentosPage() {
  const sessao = await requireSessaoPainel()
  const treinamentos = await meusTreinamentos(sessao.usuario.id)
  const urls = new Map<string, string | null>()
  for (const t of treinamentos) {
    urls.set(t.id, await urlArquivoPessoal(t.certificado_url))
  }

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Meus treinamentos
        </h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Seus treinamentos realizados e os certificados, com as datas de
          validade.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Treinamentos</CardTitle>
            <GraduationCap className="text-muted-foreground size-4" />
          </div>
          <CardDescription>
            {treinamentos.length} treinamento
            {treinamentos.length === 1 ? "" : "s"} com certificado
          </CardDescription>
        </CardHeader>
        <CardContent>
          {treinamentos.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-sm">
              Nenhum treinamento registrado para você ainda.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Treinamento</TableHead>
                    <TableHead>Período</TableHead>
                    <TableHead className="hidden sm:table-cell">
                      Válido até
                    </TableHead>
                    <TableHead className="w-24">Certificado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {treinamentos.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="max-w-56 truncate font-medium">
                        {t.treinamentoNome ?? "(sem nome)"}
                        {t.carga_horaria !== null && (
                          <span className="text-muted-foreground ml-1.5 text-xs">
                            ({t.carga_horaria.toLocaleString("pt-BR", {
                              maximumFractionDigits: 1,
                            })}
                            h)
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground whitespace-nowrap">
                        {formatarData(t.data_inicio)}
                        {t.data_termino &&
                          t.data_termino !== t.data_inicio && (
                            <> – {formatarData(t.data_termino)}</>
                          )}
                      </TableCell>
                      <TableCell className="hidden whitespace-nowrap sm:table-cell">
                        {t.valido_ate ? (
                          t.vencido ? (
                            <Badge
                              variant="outline"
                              className="border-warning/40 text-warning-fg"
                            >
                              Venceu {formatarData(t.valido_ate)}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">
                              {formatarData(t.valido_ate)}
                            </span>
                          )
                        ) : (
                          <span className="text-muted-foreground text-xs">
                            Não expira
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {urls.get(t.id) ? (
                          <a
                            href={urls.get(t.id)!}
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
