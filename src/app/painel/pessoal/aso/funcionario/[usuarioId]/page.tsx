import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { TileIndicador } from "@/components/graficos/tile"
import { RotuloTrilha } from "@/components/layout/trilha-rotulos"
import { CabecalhoFuncionario } from "@/components/pessoal/cabecalho-funcionario"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { VoltarLista } from "@/components/voltar-lista"
import { requirePermissao } from "@/lib/auth"
import { ROTULO_SITUACAO_ASO, situacaoAso, VARIANTE_SITUACAO_ASO } from "@/lib/aso-situacao"
import { hojeSP } from "@/lib/db/comum"
import { funcionarioDaArea } from "@/lib/db/pessoal-area"
import { listarAsos } from "@/lib/db/pessoal-saude"
import { formatarData } from "@/lib/formato"

export const metadata: Metadata = { title: "ASOs do funcionário — Confluir" }

/** Nível 2 dos ASOs: o funcionário — a vigência atual e o histórico de exames. */
export default async function AsoFuncionarioPage({ params }: { params: Promise<{ usuarioId: string }> }) {
  const sessao = await requirePermissao("pessoal_gestao", ["pessoal_aso"])
  const { usuarioId } = await params
  const [funcionario, todos] = await Promise.all([funcionarioDaArea(usuarioId), listarAsos()])
  if (!funcionario) notFound()

  const hoje = hojeSP()
  const asos = todos.filter((a) => a.funcionario_id === usuarioId).sort((a, b) => (b.data ?? "").localeCompare(a.data ?? ""))
  const ultimo = asos.find((a) => a.realizado !== false)
  const sit = situacaoAso(ultimo, hoje)

  return (
    <>
      <RotuloTrilha valores={{ funcionario: "Funcionários", [usuarioId]: funcionario.nome }} />
      <VoltarLista chave="aso-funcionarios" base="/painel/pessoal/aso" rotulo="ASOs" />
      <CabecalhoFuncionario funcionario={funcionario} area="aso" permissoes={sessao.permissoes} />

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <TileIndicador rotulo="Situação" valor={ROTULO_SITUACAO_ASO[sit]} />
        <TileIndicador rotulo="Último exame" valor={ultimo ? formatarData(ultimo.data) : "—"} nota={ultimo?.tipo ?? undefined} />
        <TileIndicador rotulo="Vencimento" valor={ultimo?.vencimento ? formatarData(ultimo.vencimento) : "—"} />
        <TileIndicador rotulo="Exames registrados" valor={String(asos.length)} />
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Histórico de ASOs</CardTitle>
          <CardDescription>
            Do mais recente ao mais antigo.{" "}
            <Link href="/painel/pessoal/aso?aba=registros" className="text-primary hover:underline">
              Lançar ASO
            </Link>
          </CardDescription>
        </CardHeader>
        {asos.length > 0 && (
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Vencimento</TableHead>
                    <TableHead>Situação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {asos.map((a) => {
                    const s = a === ultimo ? sit : null
                    return (
                      <TableRow key={a.id}>
                        <TableCell className="font-medium whitespace-nowrap">
                          <Link href={`/painel/pessoal/aso/${a.id}`} className="hover:underline">
                            {formatarData(a.data)}
                          </Link>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{a.tipo ?? "—"}</TableCell>
                        <TableCell className="whitespace-nowrap">{formatarData(a.vencimento)}</TableCell>
                        <TableCell>
                          {a.realizado === false ? (
                            <Badge variant="warning">Pendente</Badge>
                          ) : s ? (
                            <Badge variant={VARIANTE_SITUACAO_ASO[s]}>{ROTULO_SITUACAO_ASO[s]}</Badge>
                          ) : (
                            <span className="text-muted-foreground text-xs">Substituído</span>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        )}
      </Card>
    </>
  )
}
