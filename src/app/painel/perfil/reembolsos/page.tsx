import type { Metadata } from "next"
import { ExternalLink, ReceiptText } from "lucide-react"

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
import { SituacaoReembolsoBadge } from "@/components/reembolsos"
import { requireSessaoPainel } from "@/lib/auth"
import { urlArquivoPessoal } from "@/lib/db/pessoal"
import {
  listarTiposReembolso,
  meusReembolsos,
} from "@/lib/db/reembolsos"
import { formatarMoeda } from "@/lib/formato"

import { CancelarReembolsoBotao, SolicitarReembolsoForm } from "./solicitacao-form"

export const metadata: Metadata = { title: "Meus reembolsos — Confluir" }

/** Autosserviço: cada funcionário solicita e acompanha os PRÓPRIOS reembolsos. */
export default async function MeusReembolsosPage({
  searchParams,
}: {
  searchParams: Promise<{ salvo?: string }>
}) {
  const sessao = await requireSessaoPainel()
  const { salvo } = await searchParams
  const [{ disponivel, reembolsos }, { tipos }] = await Promise.all([
    meusReembolsos(sessao.usuario.id as string),
    listarTiposReembolso(),
  ])

  const ativos = tipos.filter((t) => t.ativa)
  const urls = new Map<string, string | null>()
  for (const r of reembolsos) {
    urls.set(r.id, await urlArquivoPessoal(r.comprovante_url))
  }

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Meus reembolsos do ACT
        </h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Solicite os reembolsos previstos no acordo coletivo — aprovados, eles
          são pagos no seu contracheque.
        </p>
      </div>

      {!disponivel && (
        <Alert>
          <AlertDescription>
            Os reembolsos ainda não estão configurados no sistema — procure o
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
        <SolicitarReembolsoForm
          tipos={ativos.map((t) => ({
            id: t.id,
            rotulo: `${t.nome}${t.valor_limite !== null ? ` — teto ${formatarMoeda(t.valor_limite)}` : ""}`,
          }))}
        />
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Minhas solicitações</CardTitle>
            <ReceiptText className="text-muted-foreground size-4" />
          </div>
          <CardDescription>
            {reembolsos.length} solicitaç
            {reembolsos.length === 1 ? "ão" : "ões"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {reembolsos.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-sm">
              Você ainda não solicitou nenhum reembolso.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="text-right">Solicitado</TableHead>
                    <TableHead className="text-right">Aprovado</TableHead>
                    <TableHead className="hidden sm:table-cell">
                      Contracheque
                    </TableHead>
                    <TableHead>Situação</TableHead>
                    <TableHead className="hidden md:table-cell">
                      Comprovante
                    </TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reembolsos.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="max-w-44 truncate font-medium">
                        {r.tipoNome ?? "—"}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap tabular-nums">
                        {formatarMoeda(r.valor_solicitado)}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap tabular-nums">
                        {formatarMoeda(r.valor_aprovado)}
                      </TableCell>
                      <TableCell className="text-muted-foreground hidden whitespace-nowrap sm:table-cell">
                        {[r.pagamento_mes, r.pagamento_ano]
                          .filter(Boolean)
                          .join("/") || "—"}
                      </TableCell>
                      <TableCell>
                        <SituacaoReembolsoBadge situacao={r.situacao} />
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {urls.get(r.id) ? (
                          <a
                            href={urls.get(r.id)!}
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
                      <TableCell className="text-right">
                        {r.situacao === "aguardando" ? (
                          <CancelarReembolsoBotao id={r.id} />
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
