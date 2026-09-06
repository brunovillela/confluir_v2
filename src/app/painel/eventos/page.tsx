import type { Metadata } from "next"
import Link from "next/link"
import { CalendarDays, Plus, Settings, ShieldCheck } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
import { requirePermissao } from "@/lib/auth"
import { listarEventos, SITUACOES_EVENTO } from "@/lib/db/eventos"
import { formatarDataHora } from "@/lib/formato"
import { podeAcessar } from "@/lib/permissoes"

export const metadata: Metadata = { title: "Eventos — Confluir" }

const ROTULO = new Map(SITUACOES_EVENTO.map((s) => [s.valor, s.rotulo]))

function corDaSituacao(s: string) {
  if (s === "publicado") return "success" as const
  if (s === "cancelado") return "destructive" as const
  if (s === "adiado") return "warning" as const
  return "secondary" as const
}

export default async function EventosPage() {
  const sessao = await requirePermissao("eventos", ["eventos_gestao"])
  const gestor = podeAcessar(sessao.permissoes, "eventos_gestao")
  const { ativo, eventos } = await listarEventos()

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Eventos</h1>
          <p className="text-muted-foreground mt-1 text-xs">
            Inscrição, lista de convidados e confirmação de presença.
          </p>
        </div>
        {gestor && (
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/painel/eventos/lgpd">
                <ShieldCheck />
                Pedidos de LGPD
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/painel/eventos/configuracao">
                <Settings />
                Configuração
              </Link>
            </Button>
            <Button asChild>
              <Link href="/painel/eventos/novo">
                <Plus />
                Novo evento
              </Link>
            </Button>
          </div>
        )}
      </div>

      {!ativo && (
        <Alert variant="destructive">
          <AlertDescription>
            As tabelas do módulo ainda não existem no banco. Rode
            <code className="mx-1">supabase/eventos.sql</code>
            no SQL Editor do Supabase.
          </AlertDescription>
        </Alert>
      )}

      {ativo && (
        <Card>
          <CardHeader>
            <CardTitle>Todos os eventos</CardTitle>
            <CardDescription>
              {eventos.length === 0
                ? "Nenhum evento criado ainda."
                : `${eventos.length} evento(s), do mais recente ao mais antigo.`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {eventos.length > 0 && (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Evento</TableHead>
                      <TableHead>Situação</TableHead>
                      <TableHead>Início</TableHead>
                      <TableHead>Local</TableHead>
                      <TableHead className="text-right">Lotação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {eventos.map((e) => (
                      <TableRow key={e.id}>
                        <TableCell>
                          <Link
                            href={`/painel/eventos/${e.id}`}
                            className="font-medium hover:underline"
                          >
                            {e.titulo ?? "(sem título)"}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Badge variant={corDaSituacao(e.situacao)}>
                            {ROTULO.get(e.situacao) ?? e.situacao}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground whitespace-nowrap">
                          {formatarDataHora(e.inicio)}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {e.local ?? "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {e.lotacao_maxima ?? "—"}
                          {e.overbooking_percentual > 0
                            ? ` +${e.overbooking_percentual}%`
                            : ""}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            {eventos.length === 0 && ativo && gestor && (
              <div className="text-muted-foreground flex flex-col items-start gap-3 text-sm">
                <CalendarDays className="size-6" />
                <p>
                  Comece criando um evento. Ele nasce como rascunho — o link
                  público só vai ao ar quando você publicar.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </>
  )
}
