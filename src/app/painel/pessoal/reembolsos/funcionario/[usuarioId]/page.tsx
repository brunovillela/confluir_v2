import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { TileIndicador } from "@/components/graficos/tile"
import { RotuloTrilha } from "@/components/layout/trilha-rotulos"
import { CabecalhoFuncionario } from "@/components/pessoal/cabecalho-funcionario"
import { SituacaoReembolsoBadge } from "@/components/reembolsos"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { VoltarLista } from "@/components/voltar-lista"
import { requirePermissao } from "@/lib/auth"
import { funcionarioDaArea } from "@/lib/db/pessoal-area"
import { listarReembolsos, listarTiposReembolso } from "@/lib/db/reembolsos"
import { formatarData, formatarMoeda } from "@/lib/formato"

export const metadata: Metadata = { title: "Reembolsos do funcionário — Confluir" }

/** Nível 2 dos Reembolsos do ACT: o funcionário — números do ano, uso por tipo e os pedidos. */
export default async function ReembolsosFuncionarioPage({
  params,
  searchParams,
}: {
  params: Promise<{ usuarioId: string }>
  searchParams: Promise<{ ano?: string }>
}) {
  const sessao = await requirePermissao("pessoal_gestao")
  const { usuarioId } = await params
  const sp = await searchParams
  const [funcionario, { reembolsos }, { tipos }] = await Promise.all([
    funcionarioDaArea(usuarioId),
    listarReembolsos(),
    listarTiposReembolso(),
  ])
  if (!funcionario) notFound()

  const daPessoa = reembolsos.filter((r) => r.funcionario_id === usuarioId)
  const anoDe = (d: string | null) => (d ?? "").slice(0, 4)
  const anos = [...new Set(daPessoa.map((r) => anoDe(r.created_at)).filter(Boolean))].sort().reverse()
  const ano = sp.ano && anos.includes(sp.ano) ? sp.ano : anos[0]
  const doAno = daPessoa.filter((r) => anoDe(r.created_at) === ano)
  const reembolsado = doAno.filter((r) => r.situacao === "aprovado" || r.situacao === "pago")
  const total = reembolsado.reduce((s, r) => s + (r.valor_aprovado ?? 0), 0)

  // Uso por tipo no ano (o teto do ACT é por pedido; aqui, quanto saiu em cada um).
  const porTipo = new Map<string, { nome: string; pedidos: number; valor: number; teto: number | null }>()
  for (const r of doAno) {
    const k = r.tipo_id ?? "?"
    const t = tipos.find((x) => x.id === r.tipo_id)
    const atual = porTipo.get(k) ?? { nome: r.tipoNome ?? "—", pedidos: 0, valor: 0, teto: t?.valor_limite ?? null }
    atual.pedidos++
    if (r.situacao === "aprovado" || r.situacao === "pago") atual.valor += r.valor_aprovado ?? 0
    porTipo.set(k, atual)
  }

  return (
    <>
      <RotuloTrilha valores={{ funcionario: "Funcionários", [usuarioId]: funcionario.nome }} />
      <VoltarLista chave="reembolsos-funcionarios" base="/painel/pessoal/reembolsos" rotulo="Reembolsos do ACT" />
      <CabecalhoFuncionario funcionario={funcionario} area="reembolsos" permissoes={sessao.permissoes} />

      {daPessoa.length === 0 ? (
        <p className="text-muted-foreground text-sm">Nenhum pedido de reembolso deste funcionário.</p>
      ) : (
        <>
          <nav className="flex flex-wrap gap-2 text-sm" aria-label="Ano">
            {anos.map((a) => (
              <Link
                key={a}
                href={`/painel/pessoal/reembolsos/funcionario/${usuarioId}?ano=${a}`}
                className={`rounded-md border px-3 py-1 ${a === ano ? "border-primary bg-primary/10 font-medium" : "hover:bg-muted"}`}
              >
                {a}
              </Link>
            ))}
          </nav>

          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <TileIndicador rotulo={`Pedidos em ${ano}`} valor={String(doAno.length)} />
            <TileIndicador rotulo="Reembolsado" valor={formatarMoeda(total)} nota={`${reembolsado.length} aprovado(s) ou pago(s)`} />
            <TileIndicador
              rotulo="A pagar no contracheque"
              valor={formatarMoeda(doAno.filter((r) => r.situacao === "aprovado").reduce((s, r) => s + (r.valor_aprovado ?? 0), 0))}
            />
            <TileIndicador rotulo="Aguardando avaliação" valor={String(doAno.filter((r) => r.situacao === "aguardando").length)} />
          </section>

          {porTipo.size > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Por tipo do ACT em {ano}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tipo</TableHead>
                        <TableHead className="text-right">Pedidos</TableHead>
                        <TableHead className="text-right">Reembolsado</TableHead>
                        <TableHead className="hidden text-right md:table-cell">Teto por pedido</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {[...porTipo.values()].map((t) => (
                        <TableRow key={t.nome}>
                          <TableCell className="font-medium">{t.nome}</TableCell>
                          <TableCell className="text-right tabular-nums">{t.pedidos}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatarMoeda(t.valor)}</TableCell>
                          <TableCell className="text-muted-foreground hidden text-right tabular-nums md:table-cell">
                            {t.teto != null ? formatarMoeda(t.teto) : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Pedidos de {ano}</CardTitle>
              <CardDescription>Clique para abrir o pedido.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Pedido em</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead className="text-right">Solicitado</TableHead>
                      <TableHead className="text-right">Aprovado</TableHead>
                      <TableHead>Situação</TableHead>
                      <TableHead className="hidden md:table-cell">Contracheque</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {doAno.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium whitespace-nowrap">
                          <Link href={`/painel/pessoal/reembolsos/${r.id}`} className="hover:underline">
                            {formatarData(r.created_at)}
                          </Link>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{r.tipoNome ?? "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatarMoeda(r.valor_solicitado)}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.valor_aprovado != null ? formatarMoeda(r.valor_aprovado) : "—"}</TableCell>
                        <TableCell>
                          <SituacaoReembolsoBadge situacao={r.situacao} />
                        </TableCell>
                        <TableCell className="text-muted-foreground hidden md:table-cell">
                          {[r.pagamento_mes, r.pagamento_ano].filter(Boolean).join("/") || "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </>
  )
}
