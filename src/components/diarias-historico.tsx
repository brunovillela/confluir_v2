import Link from "next/link"
import { Paperclip } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { LancamentoDiaria, RemessaDiaria } from "@/lib/db/diarias-historico"
import { formatarData, formatarDataHora, formatarMoeda } from "@/lib/formato"

/** Situação da remessa antiga: rascunho → enviada → aprovada/reprovada → paga. */
export function SituacaoRemessaBadge({ remessa }: { remessa: RemessaDiaria }) {
  if (remessa.pagamentoPago || remessa.ordemSituacao === "Paga") {
    return (
      <Badge variant="outline" className="border-success/40 text-success-fg">
        Paga
      </Badge>
    )
  }
  if (remessa.avaliacaoAprovado === true) {
    return (
      <Badge variant="outline" className="border-success/40 text-success-fg">
        Aprovada
      </Badge>
    )
  }
  if (remessa.avaliacaoAprovado === false) {
    return (
      <Badge variant="outline" className="border-destructive/40 text-destructive">
        Reprovada
      </Badge>
    )
  }
  if (remessa.enviado) {
    return (
      <Badge variant="outline" className="border-warning/40 text-warning-fg">
        Enviada
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="text-muted-foreground">
      Não enviada
    </Badge>
  )
}

export function periodoRemessa(r: RemessaDiaria): string {
  if (!r.inicio) return [r.mes, r.ano].filter(Boolean).join("/") || "—"
  if (!r.termino || r.termino === r.inicio) return formatarData(r.inicio)
  return `${formatarData(r.inicio)} – ${formatarData(r.termino)}`
}

/** Cabeçalho da remessa: avaliação e pagamento. */
export function DadosRemessa({
  remessa,
  linkOrdem,
}: {
  remessa: RemessaDiaria
  /** Gestão abre a ordem no Financeiro; o beneficiário só vê a situação. */
  linkOrdem: boolean
}) {
  return (
    <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
      <Campo rotulo="Período" valor={periodoRemessa(remessa)} />
      <Campo rotulo="Competência" valor={[remessa.mes, remessa.ano].filter(Boolean).join(" de ") || null} />
      <Campo rotulo="Departamento" valor={remessa.departamentoNome} />
      <Campo rotulo="Valor total" valor={formatarMoeda(remessa.valorTotal)} />
      <Campo
        rotulo="Avaliação"
        valor={
          remessa.avaliacaoAprovado === null
            ? null
            : `${remessa.avaliacaoAprovado ? "Aprovada" : "Reprovada"}${remessa.avaliadorNome ? ` por ${remessa.avaliadorNome}` : ""}${remessa.avaliacaoData ? ` em ${formatarDataHora(remessa.avaliacaoData)}` : ""}`
        }
      />
      <Campo rotulo="Forma de pagamento" valor={remessa.formaPagamento} />
      <div>
        <dt className="text-muted-foreground text-xs">Ordem de pagamento</dt>
        <dd className="mt-0.5">
          {remessa.ordemId ? (
            linkOrdem ? (
              <Link href={`/painel/financeiro/ordens/${remessa.ordemId}`} className="text-primary underline-offset-4 hover:underline">
                {remessa.ordemCodigo ?? "Abrir ordem"}
              </Link>
            ) : (
              (remessa.ordemCodigo ?? "Gerada")
            )
          ) : (
            "—"
          )}
          {remessa.ordemSituacao && <span className="text-muted-foreground"> · {remessa.ordemSituacao}</span>}
        </dd>
      </div>
      {remessa.avaliacaoObservacao && (
        <div className="sm:col-span-2">
          <dt className="text-muted-foreground text-xs">Observação da avaliação</dt>
          <dd className="mt-0.5 whitespace-pre-wrap">{remessa.avaliacaoObservacao}</dd>
        </div>
      )}
    </dl>
  )
}

/** Lançamentos diários da remessa, com as despesas embaixo de cada dia. */
export function LancamentosRemessa({ lancamentos }: { lancamentos: LancamentoDiaria[] }) {
  if (lancamentos.length === 0) {
    return <p className="text-muted-foreground py-4 text-center text-sm">Nenhum lançamento nesta remessa.</p>
  }
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Data</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Atividade</TableHead>
            <TableHead className="hidden md:table-cell">Local</TableHead>
            <TableHead className="text-right">Diária</TableHead>
            <TableHead className="text-right">Despesas</TableHead>
            <TableHead className="text-right">Total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lancamentos.map((l) => (
            <TableRow key={l.id} className="align-top">
              <TableCell className="whitespace-nowrap tabular-nums">{formatarData(l.data)}</TableCell>
              <TableCell className="max-w-44">{l.tipoNome ?? "—"}</TableCell>
              <TableCell className="max-w-56">
                {l.atividade ?? "—"}
                {l.despesas.length > 0 && (
                  <ul className="text-muted-foreground mt-1 grid gap-0.5 text-xs">
                    {l.despesas.map((d) => (
                      <li key={d.id} className="flex flex-wrap items-center gap-1.5">
                        {d.tipo ?? "Despesa"} · {formatarMoeda(d.custo)}
                        {d.comprovanteUrl && (
                          <a href={d.comprovanteUrl} target="_blank" rel="noreferrer" className="text-primary inline-flex items-center gap-1 underline-offset-4 hover:underline">
                            <Paperclip className="size-3" />
                            comprovante
                          </a>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </TableCell>
              <TableCell className="text-muted-foreground hidden max-w-40 md:table-cell">{l.local ?? "—"}</TableCell>
              <TableCell className="text-right whitespace-nowrap tabular-nums">{formatarMoeda(l.valorDiaria)}</TableCell>
              <TableCell className="text-right whitespace-nowrap tabular-nums">{formatarMoeda(l.valorDespesas)}</TableCell>
              <TableCell className="text-right font-medium whitespace-nowrap tabular-nums">{formatarMoeda(l.valorTotal)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function Campo({ rotulo, valor }: { rotulo: string; valor: string | null }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{rotulo}</dt>
      <dd className="mt-0.5">{valor ?? "—"}</dd>
    </div>
  )
}
