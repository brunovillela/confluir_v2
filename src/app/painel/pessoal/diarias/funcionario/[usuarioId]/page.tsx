import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { SituacaoDiariaBadge } from "@/components/diarias"
import { SituacaoRemessaBadge } from "@/components/diarias-remessas"
import { TileIndicador } from "@/components/graficos/tile"
import { RotuloTrilha } from "@/components/layout/trilha-rotulos"
import { CabecalhoFuncionario } from "@/components/pessoal/cabecalho-funcionario"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { VoltarLista } from "@/components/voltar-lista"
import { requirePermissao } from "@/lib/auth"
import { listarSolicitacoesDiaria } from "@/lib/db/diarias"
import { listarRemessasNovas } from "@/lib/db/diarias-remessas"
import { funcionarioDaArea } from "@/lib/db/pessoal-area"
import { formatarData, formatarMoeda } from "@/lib/formato"

export const metadata: Metadata = { title: "Diárias do funcionário — Confluir" }

/** Nível 2 das Diárias: o funcionário — números do ano, remessas em curso e as solicitações. */
export default async function DiariasFuncionarioPage({
  params,
  searchParams,
}: {
  params: Promise<{ usuarioId: string }>
  searchParams: Promise<{ ano?: string }>
}) {
  const sessao = await requirePermissao("pessoal_gestao", ["pessoal_diarias"])
  const { usuarioId } = await params
  const sp = await searchParams
  const [funcionario, { solicitacoes }, { remessas }] = await Promise.all([
    funcionarioDaArea(usuarioId),
    listarSolicitacoesDiaria({ quadro: "funcionario", beneficiarioId: usuarioId }),
    listarRemessasNovas({ quadro: "funcionario", beneficiarioId: usuarioId }).catch(() => ({ disponivel: false, remessas: [] })),
  ])
  if (!funcionario) notFound()

  const anoDe = (d: string | null) => (d ?? "").slice(0, 4)
  const anos = [...new Set(solicitacoes.map((s) => anoDe(s.data_inicio ?? s.created_at)).filter(Boolean))].sort().reverse()
  const ano = sp.ano && anos.includes(sp.ano) ? sp.ano : anos[0]
  const doAno = solicitacoes
    .filter((s) => anoDe(s.data_inicio ?? s.created_at) === ano)
    .sort((a, b) => (b.data_inicio ?? b.created_at ?? "").localeCompare(a.data_inicio ?? a.created_at ?? ""))
  const aprovadas = doAno.filter((s) => s.situacao === "aprovada")
  const qtd = aprovadas.filter((s) => !s.complementoDe).reduce((s, x) => s + (x.quantidade ?? 1), 0)
  const valorDiarias = aprovadas.reduce((s, x) => s + (x.valor_total ?? 0), 0)
  const valorDespesas = aprovadas.reduce((s, x) => s + x.valorDespesas, 0)
  const emCurso = remessas.filter((r) => r.situacao !== "aprovada" && !r.enviada && r.valorTotal > 0)

  return (
    <>
      <RotuloTrilha valores={{ funcionario: "Funcionários", [usuarioId]: funcionario.nome }} />
      <VoltarLista chave="diarias-funcionarios" base="/painel/pessoal/diarias" rotulo="Diárias" />
      <CabecalhoFuncionario funcionario={funcionario} area="diarias" permissoes={sessao.permissoes} />

      {emCurso.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Remessas em curso</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            {emCurso.map((r) => (
              <Link
                key={r.id}
                href={`/painel/pessoal/diarias/remessas/${r.id}`}
                className="hover:bg-muted flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
              >
                <span className="font-medium">Remessa {r.codigo ?? ""}</span>
                <span className="flex items-center gap-2">
                  <SituacaoRemessaBadge remessa={r} />
                  <span className="tabular-nums">{formatarMoeda(r.valorTotal)}</span>
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      {solicitacoes.length === 0 ? (
        <p className="text-muted-foreground text-sm">Nenhuma diária deste funcionário.</p>
      ) : (
        <>
          <nav className="flex flex-wrap gap-2 text-sm" aria-label="Ano">
            {anos.map((a) => (
              <Link
                key={a}
                href={`/painel/pessoal/diarias/funcionario/${usuarioId}?ano=${a}`}
                className={`rounded-md border px-3 py-1 ${a === ano ? "border-primary bg-primary/10 font-medium" : "hover:bg-muted"}`}
              >
                {a}
              </Link>
            ))}
          </nav>

          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <TileIndicador rotulo={`Diárias recebidas em ${ano}`} valor={String(qtd)} nota={`${aprovadas.filter((s) => !s.complementoDe).length} solicitação(ões) aprovada(s)`} />
            <TileIndicador rotulo="Valor das diárias" valor={formatarMoeda(valorDiarias)} />
            <TileIndicador rotulo="Despesas reembolsadas" valor={formatarMoeda(valorDespesas)} />
            <TileIndicador
              rotulo="Aguardando avaliação"
              valor={String(doAno.filter((s) => s.situacao === "aguardando").length)}
            />
          </section>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Solicitações de {ano}</CardTitle>
              <CardDescription>Clique para abrir a solicitação.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Período</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead className="text-right">Qtd.</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead>Situação</TableHead>
                      <TableHead className="hidden md:table-cell">Remessa</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {doAno.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="font-medium whitespace-nowrap">
                          <Link href={`/painel/pessoal/diarias/${s.id}`} className="hover:underline">
                            {s.data_inicio ? formatarData(s.data_inicio) : formatarData(s.created_at)}
                            {s.data_termino && s.data_termino !== s.data_inicio && <> – {formatarData(s.data_termino)}</>}
                          </Link>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {s.complementoDe ? "Despesas depois da viagem" : (s.tipoNome ?? "—")}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{s.complementoDe ? "—" : (s.quantidade ?? "—")}</TableCell>
                        <TableCell className="text-right whitespace-nowrap tabular-nums">
                          {formatarMoeda((s.valor_total ?? 0) + s.valorDespesas)}
                        </TableCell>
                        <TableCell>
                          <SituacaoDiariaBadge situacao={s.situacao} />
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          {s.remessaId ? (
                            <Link href={`/painel/pessoal/diarias/remessas/${s.remessaId}`} className="text-muted-foreground hover:underline">
                              {s.remessaCodigo ?? "Remessa"}
                            </Link>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
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
