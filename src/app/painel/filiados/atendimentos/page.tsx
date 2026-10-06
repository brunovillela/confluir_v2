import type { Metadata } from "next"
import Link from "next/link"
import { Info, MessagesSquare } from "lucide-react"

import { SituacaoAtendimentoBadge } from "@/components/atendimento/conversa"
import { Paginacao } from "@/components/paginacao"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ASSUNTOS_ATENDIMENTO, ROTULO_SITUACAO_ATENDIMENTO, SITUACOES_ATENDIMENTO } from "@/lib/atendimento-constantes"
import { requirePermissao } from "@/lib/auth"
import { indicadoresAtendimento, listarAtendimentos } from "@/lib/db/portal-atendimentos"
import { formatarData, formatarDataHora } from "@/lib/formato"
import { lerPaginacao, paginar } from "@/lib/paginacao"

export const metadata: Metadata = { title: "Atendimentos — Confluir" }

const SELECT =
  "border-input bg-background text-foreground h-9 rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

/**
 * Solicitações abertas pelos filiados no portal (onda 4, F2), com o tempo de
 * resposta. Cada uma também é uma Demanda em Ferramentas; responder por
 * qualquer uma das duas telas dá no mesmo.
 */
export default async function AtendimentosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  await requirePermissao("ferramentas_demandas", ["ferramentas_tarefas", "filiacao_filiados"])
  const p = await searchParams
  const situacao = p.situacao ?? "abertas"
  const [{ lista, disponivel }, ind] = await Promise.all([
    listarAtendimentos({ situacao, assunto: p.assunto, busca: p.busca }),
    indicadoresAtendimento(),
  ])
  const pag = lerPaginacao(p, 25)
  const { linhas, ...info } = paginar(lista, pag)

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Atendimentos</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Solicitações abertas pelos filiados no portal. Cada uma vira uma Demanda com prazo pelo assunto.
        </p>
      </div>

      {!disponivel ? (
        <Alert>
          <Info />
          <AlertDescription>Falta rodar o SQL supabase/portal-atendimentos.sql para ligar o atendimento pelo portal.</AlertDescription>
        </Alert>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Indicador rotulo="Abertas" valor={String(ind.abertas)} nota={ind.porAssunto.map((a) => `${a.rotulo} ${a.abertas}`).join(" · ") || "nenhuma"} />
            <Indicador rotulo="Com prazo vencido" valor={String(ind.atrasadas)} nota="sem primeira resposta" destaque={ind.atrasadas > 0} />
            <Indicador
              rotulo="Tempo até a 1ª resposta"
              valor={ind.tempoMedioDias === null ? "—" : `${ind.tempoMedioDias.toLocaleString("pt-BR")} d`}
              nota={`média de ${ind.respondidas90d} respondida${ind.respondidas90d === 1 ? "" : "s"} em 90 dias`}
            />
            <Indicador rotulo="Respondidas no prazo" valor={ind.noPrazoPct === null ? "—" : `${ind.noPrazoPct}%`} nota="últimos 90 dias" />
          </div>

          <form className="flex flex-wrap items-end gap-2">
            <label className="grid gap-1 text-xs">
              Situação
              <select name="situacao" defaultValue={situacao} className={SELECT}>
                <option value="abertas">Abertas (todas)</option>
                <option value="aguardando">Esperando a equipe</option>
                {SITUACOES_ATENDIMENTO.map((s) => (
                  <option key={s} value={s}>
                    {ROTULO_SITUACAO_ATENDIMENTO[s]}
                  </option>
                ))}
                <option value="todas">Todas</option>
              </select>
            </label>
            <label className="grid gap-1 text-xs">
              Assunto
              <select name="assunto" defaultValue={p.assunto ?? ""} className={SELECT}>
                <option value="">Todos</option>
                {ASSUNTOS_ATENDIMENTO.map((a) => (
                  <option key={a.chave} value={a.chave}>
                    {a.rotulo}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-xs">
              Buscar
              <Input name="busca" defaultValue={p.busca ?? ""} placeholder="Título ou nome" className="h-9 w-56" />
            </label>
            <Button type="submit" variant="outline" size="lg">
              Filtrar
            </Button>
          </form>

          <Card>
            <CardContent>
              {linhas.length === 0 ? (
                <p className="text-muted-foreground flex items-center gap-2 py-8 text-sm">
                  <MessagesSquare className="size-4" />
                  Nenhuma solicitação com esses filtros.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Solicitação</TableHead>
                      <TableHead>Filiado</TableHead>
                      <TableHead>Assunto</TableHead>
                      <TableHead>Aberta em</TableHead>
                      <TableHead>Prazo</TableHead>
                      <TableHead>Situação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {linhas.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell className="max-w-md">
                          <Link href={`/painel/filiados/atendimentos/${a.id}`} className="font-medium underline-offset-4 hover:underline">
                            {a.titulo}
                          </Link>
                        </TableCell>
                        <TableCell>{a.nome ?? "—"}</TableCell>
                        <TableCell>{a.assuntoRotulo}</TableCell>
                        <TableCell className="text-muted-foreground">{formatarDataHora(a.criadoEm)}</TableCell>
                        <TableCell className={a.atrasada ? "text-destructive font-medium" : "text-muted-foreground"}>
                          {a.prazo ? formatarData(a.prazo) : "—"}
                        </TableCell>
                        <TableCell>
                          <SituacaoAtendimentoBadge situacao={a.situacao} atrasada={a.atrasada} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              <Paginacao {...info} porPagina={pag.porPagina} padrao={25} />
            </CardContent>
          </Card>
        </>
      )}
    </>
  )
}

function Indicador({ rotulo, valor, nota, destaque }: { rotulo: string; valor: string; nota: string; destaque?: boolean }) {
  return (
    <Card>
      <CardContent>
        <p className="text-muted-foreground text-xs">{rotulo}</p>
        <p className={`mt-1 text-2xl font-semibold tabular-nums ${destaque ? "text-destructive" : ""}`}>{valor}</p>
        <p className="text-muted-foreground mt-1 text-xs">{nota}</p>
      </CardContent>
    </Card>
  )
}
