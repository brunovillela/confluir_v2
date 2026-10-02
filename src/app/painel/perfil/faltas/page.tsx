import type { Metadata } from "next"
import { CalendarCheck } from "lucide-react"

import { GrupoColapsavel } from "@/components/grupo-colapsavel"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { requireSessaoPainel } from "@/lib/auth"
import { hojeSP } from "@/lib/db/comum"
import { AVISO_SQL_FALTAS, lerConfigFaltas, minhasFaltas } from "@/lib/db/faltas"
import { exigirFuncionario } from "@/lib/db/perfil"
import { urlArquivoPessoal } from "@/lib/db/pessoal"
import { ROTULO_SITUACAO_FALTA, type SituacaoFalta } from "@/lib/faltas-constantes"
import { formatarData } from "@/lib/formato"

import { CancelarFaltaBotao, SolicitarFaltaForm } from "./faltas-forms"

export const metadata: Metadata = { title: "Minhas faltas justificadas — Confluir" }

const CLASSE_SITUACAO: Record<SituacaoFalta, string> = {
  aguardando: "border-warning/40 text-warning-fg",
  autorizada: "border-success/40 text-success-fg",
  recusada: "border-destructive/40 text-destructive",
}

/** Uso × limite; sem limite configurado, só o uso. */
function Medidor({ rotulo, usado, limite }: { rotulo: string; usado: number; limite: number | null }) {
  const esgotado = limite !== null && usado >= limite
  return (
    <div className="bg-card rounded-xl border p-4 shadow-xs">
      <p className="text-muted-foreground text-xs">{rotulo}</p>
      <p className={`text-2xl font-semibold tabular-nums ${esgotado ? "text-destructive" : ""}`}>
        {usado}
        <span className="text-muted-foreground text-base font-normal">
          {limite === null ? "" : ` de ${limite}`}
        </span>
      </p>
      <p className="text-muted-foreground text-xs">
        {limite === null ? "sem limite" : esgotado ? "limite atingido" : `${limite - usado} disponível(is)`}
      </p>
    </div>
  )
}

export default async function MinhasFaltasPage() {
  const sessao = await requireSessaoPainel()
  await exigirFuncionario(sessao.usuario.id as string)
  const hoje = hojeSP()
  const [{ disponivel, faltas, uso, periodo }, { config }] = await Promise.all([
    minhasFaltas(sessao.usuario.id),
    lerConfigFaltas(),
  ])
  const urls = new Map<string, string | null>()
  for (const f of faltas) urls.set(f.id, await urlArquivoPessoal(f.comprovacao))

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Minhas faltas justificadas</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Peça a falta justificada pelas hipóteses do acordo coletivo e acompanhe a autorização do
          departamento de pessoal.
        </p>
      </div>

      {!disponivel && (
        <Alert>
          <AlertDescription>{AVISO_SQL_FALTAS}</AlertDescription>
        </Alert>
      )}

      {uso && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Medidor rotulo={`No período ${periodo ?? ""}`} usado={uso.ano} limite={config.limiteAno} />
          <Medidor rotulo="Neste mês" usado={uso.mes} limite={config.limiteMes} />
          <Medidor rotulo="Nesta semana" usado={uso.semana} limite={config.limiteSemana} />
        </div>
      )}

      <GrupoColapsavel titulo="Pedir falta justificada" descricao="Vai para a autorização do departamento de pessoal">
        <SolicitarFaltaForm tipos={config.tipos} hoje={hoje} />
      </GrupoColapsavel>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Histórico</CardTitle>
          <CardDescription>
            Contam para os limites as faltas aguardando e as autorizadas; a recusada não conta.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {faltas.length === 0 ? (
            <div className="text-muted-foreground flex flex-col items-center gap-2 py-8 text-sm">
              <CalendarCheck className="size-6" />
              Nenhuma falta justificada registrada.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>Data</TableHead>
                    <TableHead>Justificativa</TableHead>
                    <TableHead>Situação</TableHead>
                    <TableHead className="hidden sm:table-cell">Comprovação</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {faltas.map((f) => (
                    <TableRow key={f.id}>
                      <TableCell className="whitespace-nowrap">{formatarData(f.data)}</TableCell>
                      <TableCell className="max-w-80">
                        <span className="line-clamp-2 text-sm">{f.tipo ?? "—"}</span>
                        {f.situacao === "recusada" && f.motivoRecusa && (
                          <span className="text-destructive line-clamp-2 text-xs">Recusa: {f.motivoRecusa}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`whitespace-nowrap ${CLASSE_SITUACAO[f.situacao]}`}>
                          {ROTULO_SITUACAO_FALTA[f.situacao]}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        {urls.get(f.id) ? (
                          <a href={urls.get(f.id)!} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                            Abrir
                          </a>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {f.situacao === "aguardando" && <CancelarFaltaBotao id={f.id} />}
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
