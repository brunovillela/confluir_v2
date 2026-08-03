import type { Metadata } from "next"
import { HandCoins } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
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
import { SituacaoDiariaBadge } from "@/components/diarias"
import { requireSessaoPainel } from "@/lib/auth"
import {
  listarTiposDiaria,
  minhasSolicitacoesDiaria,
} from "@/lib/db/diarias"
import { formatarData, formatarMoeda } from "@/lib/formato"

import { CancelarDiariaBotao, SolicitarDiariaForm } from "./solicitacao-form"

export const metadata: Metadata = { title: "Minhas diárias — Confluir" }

/** Autosserviço: cada funcionário solicita e acompanha as PRÓPRIAS diárias. */
export default async function MinhasDiariasPage({
  searchParams,
}: {
  searchParams: Promise<{ salvo?: string }>
}) {
  const sessao = await requireSessaoPainel()
  const { salvo } = await searchParams
  const [{ disponivel, solicitacoes }, { tipos }] = await Promise.all([
    minhasSolicitacoesDiaria(sessao.usuario.id as string),
    listarTiposDiaria(),
  ])

  const ativos = tipos.filter((t) => t.ativa && t.valor_reembolso !== null)

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Minhas diárias
        </h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Solicite diárias por atividades específicas (viagens, representações)
          e acompanhe a avaliação e o pagamento.
        </p>
      </div>

      {!disponivel && (
        <Alert>
          <AlertDescription>
            As diárias ainda não estão configuradas no sistema — procure o
            departamento de pessoal.
          </AlertDescription>
        </Alert>
      )}

      {salvo === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>
            Solicitação enviada — você será avisado quando for avaliada.
          </AlertDescription>
        </Alert>
      )}

      {disponivel && (
        <SolicitarDiariaForm
          tipos={ativos.map((t) => ({
            id: t.id,
            rotulo: `${t.nome} — ${formatarMoeda(t.valor_reembolso)}`,
          }))}
        />
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Minhas solicitações</CardTitle>
            <HandCoins className="text-muted-foreground size-4" />
          </div>
          <CardDescription>
            {solicitacoes.length} solicitaç
            {solicitacoes.length === 1 ? "ão" : "ões"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {solicitacoes.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-sm">
              Você ainda não solicitou nenhuma diária.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="text-right">Qtd.</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead className="hidden sm:table-cell">
                      Período
                    </TableHead>
                    <TableHead>Situação</TableHead>
                    <TableHead className="hidden md:table-cell">
                      Pagamento
                    </TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {solicitacoes.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="max-w-44 truncate font-medium">
                        {s.tipoNome ?? "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {s.quantidade ?? "—"}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap tabular-nums">
                        {formatarMoeda(s.valor_total)}
                      </TableCell>
                      <TableCell className="text-muted-foreground hidden whitespace-nowrap sm:table-cell">
                        {s.data_inicio ? (
                          <>
                            {formatarData(s.data_inicio)}
                            {s.data_termino &&
                              s.data_termino !== s.data_inicio && (
                                <> – {formatarData(s.data_termino)}</>
                              )}
                          </>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell>
                        <SituacaoDiariaBadge situacao={s.situacao} />
                      </TableCell>
                      <TableCell className="text-muted-foreground hidden md:table-cell">
                        {s.situacao === "aprovada"
                          ? (s.ordemSituacao ?? "Em processamento")
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {s.situacao === "aguardando" ? (
                          <CancelarDiariaBotao id={s.id} />
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
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
