import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, Plus } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ROTULO_SITUACAO_MENSAGEM } from "@/lib/comunicacao-mensagens-constantes"
import { requirePermissao } from "@/lib/auth"
import { AVISO_SQL_MENSAGENS, listarMalasDiretas } from "@/lib/db/comunicacao-mensagens"
import { formatarData, formatarDataHora } from "@/lib/formato"

import { novaMalaDiretaAction } from "./actions"
import { COR_SITUACAO_MENSAGEM } from "./cores"

export const metadata: Metadata = { title: "Mala direta — Confluir" }

/** Comunicação › Mala direta: as mensagens a um recorte de filiados. */
export default async function MalaDiretaListaPage() {
  await requirePermissao("comunicacao_mensagens")
  const { disponivel, mensagens } = await listarMalasDiretas()
  const n = (v: number) => v.toLocaleString("pt-BR")

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3">
            <Link href="/painel/comunicacao">
              <ArrowLeft />
              Comunicação
            </Link>
          </Button>
          <h1 className="text-2xl font-semibold tracking-tight">Mala direta</h1>
          <p className="text-muted-foreground mt-1 text-xs">
            Mensagens por e-mail a um recorte de filiados, com o texto para o WhatsApp. Quem se
            descadastrou não recebe.
          </p>
        </div>
        {disponivel && (
          <form action={novaMalaDiretaAction}>
            <Button type="submit">
              <Plus />
              Nova mensagem
            </Button>
          </form>
        )}
      </div>

      {!disponivel && (
        <Alert variant="warning">
          <AlertDescription>{AVISO_SQL_MENSAGENS}</AlertDescription>
        </Alert>
      )}

      {disponivel && (
        <Card>
          <CardContent>
            {mensagens.length === 0 ? (
              <p className="text-muted-foreground py-6 text-center text-sm">
                Nenhuma mensagem ainda. Comece por <strong>Nova mensagem</strong>.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Mensagem</TableHead>
                      <TableHead>Situação</TableHead>
                      <TableHead className="text-right">E-mails enviados</TableHead>
                      <TableHead>Criada por</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mensagens.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell className="whitespace-normal">
                          <Link href={`/painel/comunicacao/mensagens/${m.id}`} className="hover:text-primary font-medium">
                            {m.titulo ?? "Sem título"}
                          </Link>
                          {m.assunto && <p className="text-muted-foreground text-xs">{m.assunto}</p>}
                        </TableCell>
                        <TableCell className="whitespace-normal">
                          <Badge variant="outline" className={COR_SITUACAO_MENSAGEM[m.situacao]}>
                            {ROTULO_SITUACAO_MENSAGEM[m.situacao]}
                          </Badge>
                          <p className="text-muted-foreground mt-1 text-xs">
                            {m.situacao === "agendada" && m.agendadaPara
                              ? `para ${formatarData(m.agendadaPara)}`
                              : m.enviadaEm
                                ? formatarDataHora(m.enviadaEm)
                                : m.atualizadoEm
                                  ? `editada ${formatarDataHora(m.atualizadoEm)}`
                                  : null}
                          </p>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {m.situacao === "rascunho" ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <>
                              {n(m.enviados)} de {n(m.total)}
                              {m.falhas > 0 && <p className="text-destructive text-xs">{n(m.falhas)} falha(s)</p>}
                              {m.pendentes > 0 && m.situacao !== "agendada" && (
                                <p className="text-warning-fg text-xs">{n(m.pendentes)} na fila</p>
                              )}
                            </>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs whitespace-normal">
                          {m.criadoPorNome ?? "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </>
  )
}
