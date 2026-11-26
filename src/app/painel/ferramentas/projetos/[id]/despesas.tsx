import Link from "next/link"

import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ROTULOS_SITUACAO_CUSTEIO, type SituacaoCusteio } from "@/lib/custeio-constantes"
import type { CusteioDoProjeto, GastoProjeto, OrdemDoProjeto, SolicitacaoDoProjeto } from "@/lib/db/projetos"
import { formatarData, formatarMoeda } from "@/lib/formato"

import { TransferirDespesa } from "./transferir-despesa"

/**
 * DESPESAS DO PROJETO (26/11/2026): compras e custeios, cada um com as suas
 * ordens de pagamento embaixo; depois as ordens lançadas direto no projeto e,
 * só somados, os reembolsos a filiados. A compra e o custeio se transferem
 * com todas as ordens; a ordem de um deles não se transfere sozinha.
 */
export function DespesasDoProjeto({
  projetoId,
  solicitacoes,
  custeios,
  ordens,
  gasto,
  transfere,
  destinos,
}: {
  projetoId: string
  solicitacoes: SolicitacaoDoProjeto[]
  custeios: CusteioDoProjeto[]
  ordens: OrdemDoProjeto[]
  gasto: GastoProjeto
  transfere: boolean
  destinos: { id: string; titulo: string }[]
}) {
  const daCompra = new Map<string, OrdemDoProjeto[]>()
  const doCusteio = new Map<string, OrdemDoProjeto[]>()
  const avulsas: OrdemDoProjeto[] = []
  for (const o of ordens) {
    if (o.compraId) daCompra.set(o.compraId, [...(daCompra.get(o.compraId) ?? []), o])
    else if (o.custeioId) doCusteio.set(o.custeioId, [...(doCusteio.get(o.custeioId) ?? []), o])
    else avulsas.push(o)
  }
  const colunas = transfere ? 6 : 5
  const vazio = !solicitacoes.length && !custeios.length && !avulsas.length && gasto.reembolsos.quantidade === 0

  const botao = (tipo: "compra" | "custeio" | "ordem", id: string, rotulo: string, valor: number | null) =>
    transfere ? (
      <TableCell className="text-right">
        <TransferirDespesa origemId={projetoId} tipo={tipo} itemId={id} rotulo={rotulo} valor={valor} projetos={destinos} />
      </TableCell>
    ) : null

  const titulo = (texto: string) => (
    <TableRow className="bg-muted/40 hover:bg-muted/40">
      <TableCell colSpan={colunas} className="text-muted-foreground py-1.5 text-xs font-medium tracking-wide uppercase">
        {texto}
      </TableCell>
    </TableRow>
  )

  // A descrição da ordem de custeio traz o nome do beneficiário: no projeto, não aparece.
  const subOrdens = (lista: OrdemDoProjeto[], semOrdem: string | null, semDescricao = false) =>
    lista.length === 0 ? (
      semOrdem ? (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={colunas} className="text-muted-foreground py-1.5 pl-8 text-xs">
            {semOrdem}
          </TableCell>
        </TableRow>
      ) : null
    ) : (
      lista.map((o) => (
        <TableRow key={o.id} className="text-muted-foreground hover:bg-transparent">
          <TableCell className="py-1.5 pl-8 text-xs whitespace-nowrap">
            <Link href={`/painel/financeiro/ordens/${o.id}`} className="text-primary hover:underline">
              {o.codigo ?? "—"}
            </Link>
          </TableCell>
          <TableCell className="max-w-80 py-1.5 text-xs">
            <span className="line-clamp-1">{semDescricao ? "Parcela do custeio" : (o.descricao ?? "—")}</span>
          </TableCell>
          <TableCell className="py-1.5 text-xs whitespace-nowrap">{o.situacao ?? "—"}</TableCell>
          <TableCell className="py-1.5 text-xs whitespace-nowrap tabular-nums">{o.data ? formatarData(o.data) : "—"}</TableCell>
          <TableCell className="py-1.5 text-right text-xs whitespace-nowrap tabular-nums">{formatarMoeda(o.valor)}</TableCell>
          {transfere && <TableCell className="py-1.5" />}
        </TableRow>
      ))
    )

  return (
    <Card>
      <CardContent>
        <p className="text-sm font-medium">Despesas do projeto</p>
        <p className="text-muted-foreground mb-3 text-xs">
          Cada compra e cada custeio com as suas ordens de pagamento. Transferir uma compra ou um custeio para outro
          projeto leva todas as ordens dele.
        </p>
        {vazio ? (
          <p className="text-muted-foreground py-6 text-center text-sm">Nenhuma despesa ligada a este projeto.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead>Data</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                {transfere && (
                  <TableHead className="w-10">
                    <span className="sr-only">Transferir</span>
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {solicitacoes.length > 0 && titulo(`Compras (${solicitacoes.length})`)}
              {solicitacoes.map((s) => (
                <CompraOuCusteio key={`c-${s.id}`}>
                  <TableRow>
                    <TableCell className="font-medium whitespace-nowrap">
                      <Link href={`/painel/compras/${s.id}`} className="text-primary hover:underline">
                        {s.codigo ?? "—"}
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-80">
                      <span className="line-clamp-1">{s.descricao ?? "—"}</span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{s.situacao ?? "—"}</TableCell>
                    <TableCell />
                    <TableCell className="text-right font-medium whitespace-nowrap tabular-nums">
                      {s.valor != null ? formatarMoeda(s.valor) : "—"}
                    </TableCell>
                    {botao("compra", s.id, s.codigo ?? "", s.valor)}
                  </TableRow>
                  {subOrdens(daCompra.get(s.id) ?? [], "Sem ordem de pagamento ainda.")}
                </CompraOuCusteio>
              ))}

              {custeios.length > 0 && titulo(`Custeios (${custeios.length})`)}
              {custeios.map((c) => (
                <CompraOuCusteio key={`u-${c.id}`}>
                  <TableRow>
                    <TableCell className="font-medium whitespace-nowrap">
                      <Link href={`/painel/institucional/custeios/${c.id}`} className="text-primary hover:underline">
                        {c.codigo ?? "—"}
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-80">
                      <span className="line-clamp-1">
                        {c.finalidade ?? "Custeio"}
                        {c.parcelas > 1 ? ` · ${c.parcelas} parcelas` : ""}
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {ROTULOS_SITUACAO_CUSTEIO[c.situacao as SituacaoCusteio] ?? c.situacao}
                    </TableCell>
                    <TableCell />
                    <TableCell className="text-right font-medium whitespace-nowrap tabular-nums">{formatarMoeda(c.valor)}</TableCell>
                    {botao("custeio", c.id, c.codigo ?? "", c.valor)}
                  </TableRow>
                  {subOrdens(doCusteio.get(c.id) ?? [], "Sem ordem de pagamento ainda.", true)}
                </CompraOuCusteio>
              ))}

              {avulsas.length > 0 && titulo(`Ordens lançadas direto no projeto (${avulsas.length})`)}
              {avulsas.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="font-medium whitespace-nowrap">
                    <Link href={`/painel/financeiro/ordens/${o.id}`} className="text-primary hover:underline">
                      {o.codigo ?? "—"}
                    </Link>
                  </TableCell>
                  <TableCell className="max-w-80">
                    <span className="line-clamp-1">{o.descricao ?? "—"}</span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{o.situacao ?? "—"}</TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums">{o.data ? formatarData(o.data) : "—"}</TableCell>
                  <TableCell className="text-right font-medium whitespace-nowrap tabular-nums">{formatarMoeda(o.valor)}</TableCell>
                  {botao("ordem", o.id, o.codigo ?? "", o.valor)}
                </TableRow>
              ))}

              {gasto.reembolsos.quantidade > 0 && (
                <>
                  {titulo("Reembolsos a filiados")}
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={4} className="text-muted-foreground text-sm">
                      {gasto.reembolsos.quantidade.toLocaleString("pt-BR")} reembolso
                      {gasto.reembolsos.quantidade === 1 ? "" : "s"}, somados no gasto (o detalhe fica em Reembolsos)
                    </TableCell>
                    <TableCell className="text-right font-medium whitespace-nowrap tabular-nums">
                      {formatarMoeda(gasto.reembolsos.total)}
                    </TableCell>
                    {transfere && <TableCell />}
                  </TableRow>
                </>
              )}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

function CompraOuCusteio({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
