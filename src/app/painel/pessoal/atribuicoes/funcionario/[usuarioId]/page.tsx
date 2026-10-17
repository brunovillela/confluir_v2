import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { FileText } from "lucide-react"

import { TileIndicador } from "@/components/graficos/tile"
import { RotuloTrilha } from "@/components/layout/trilha-rotulos"
import { CabecalhoFuncionario } from "@/components/pessoal/cabecalho-funcionario"
import { RiscoBadge } from "@/components/pessoal/risco-badge"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { VoltarLista } from "@/components/voltar-lista"
import { requirePermissao } from "@/lib/auth"
import { funcionarioDaArea } from "@/lib/db/pessoal-area"
import { jornadaDoUsuario, matrizTreinamento, relatorioDeFuncionarios } from "@/lib/db/pessoal-sst"

export const metadata: Metadata = { title: "SST do funcionário — Confluir" }

const DIAS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"]
const hm = (min: number) => `${Math.floor(min / 60)}h${String(Math.round(min % 60)).padStart(2, "0")}`

/**
 * Nível 2 de Atribuições e SST: a ficha SST do funcionário — função,
 * ocupação da jornada, atividades, riscos avaliados para ele, jornada,
 * treinamentos exigidos e a Ordem de Serviço (NR-01).
 */
export default async function SstFuncionarioPage({ params }: { params: Promise<{ usuarioId: string }> }) {
  const sessao = await requirePermissao("pessoal_gestao")
  const { usuarioId } = await params
  const [funcionario, relatorio, jornada, matriz] = await Promise.all([
    funcionarioDaArea(usuarioId),
    relatorioDeFuncionarios([usuarioId]).catch(() => []),
    jornadaDoUsuario(usuarioId).catch(() => []),
    matrizTreinamento().catch(() => []),
  ])
  if (!funcionario) notFound()
  const r = relatorio[0]
  const exigidos = matriz.find((m) => m.funcionarioId === usuarioId)
  const riscos = [...(r?.riscos ?? [])].sort((a, b) => ((b.piorResidual ?? b.pior)?.valor ?? 0) - ((a.piorResidual ?? a.pior)?.valor ?? 0))

  return (
    <>
      <RotuloTrilha valores={{ funcionario: "Funcionários", [usuarioId]: funcionario.nome }} />
      <VoltarLista chave="sst-funcionarios" base="/painel/pessoal/atribuicoes/funcionarios" rotulo="SST por funcionário" />
      <CabecalhoFuncionario funcionario={funcionario} area="sst" permissoes={sessao.permissoes} titulo={`SST — ${funcionario.nome}`} />

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" asChild>
          <a href={`/painel/pessoal/atribuicoes/documentos/os/${usuarioId}`} target="_blank" rel="noreferrer">
            <FileText />
            Ordem de Serviço (PDF)
          </a>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link href={`/painel/pessoal/atribuicoes/relatorios?escopo=funcionario&id=${usuarioId}`}>Relatório completo</Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link href={`/painel/pessoal/atribuicoes/jornadas?id=${usuarioId}`}>Editar jornada</Link>
        </Button>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <TileIndicador rotulo="Função" valor={r?.funcaoNome ?? "Sem função"} />
        <TileIndicador
          rotulo="Ocupação da jornada"
          valor={r?.ocupacaoPct == null ? "—" : `${Math.round(r.ocupacaoPct)}%`}
          nota={r ? `${hm(r.tempoTotalMin)} de atividades por mês${r.jornadaMinMes ? ` · jornada ${hm(r.jornadaMinMes)}` : " · sem jornada cadastrada"}` : undefined}
        />
        <TileIndicador
          rotulo="Presença física"
          valor={r?.presencaFisicaPct == null ? "—" : `${Math.round(r.presencaFisicaPct)}%`}
          nota={`${r?.atividades.length ?? 0} atividade(s) · ${r?.perigos ?? 0} perigo(s)`}
        />
        <TileIndicador
          rotulo="Treinamentos exigidos pendentes"
          valor={String(exigidos?.pendentes ?? 0)}
          href={`/painel/pessoal/treinamentos/funcionario/${usuarioId}`}
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Riscos avaliados para a pessoa</CardTitle>
            <CardDescription>Pior nível por categoria — antes e depois das medidas de controle.</CardDescription>
          </CardHeader>
          <CardContent>
            {riscos.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nenhum risco avaliado.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Pior</TableHead>
                    <TableHead>Residual</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {riscos.map((x) => (
                    <TableRow key={x.categoria}>
                      <TableCell className="font-medium">
                        {x.categoria} <span className="text-muted-foreground text-xs">({x.quantidade})</span>
                      </TableCell>
                      <TableCell>
                        <RiscoBadge nivel={x.pior} />
                      </TableCell>
                      <TableCell>
                        <RiscoBadge nivel={x.piorResidual} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Jornada contratada</CardTitle>
          </CardHeader>
          <CardContent>
            {jornada.length === 0 ? (
              <p className="text-muted-foreground text-sm">Sem jornada cadastrada.</p>
            ) : (
              <ul className="grid gap-1 text-sm">
                {[...jornada]
                  .sort((a, b) => a.dia_semana - b.dia_semana)
                  .map((d) => (
                    <li key={d.dia_semana} className="flex justify-between gap-2">
                      <span>{DIAS[d.dia_semana] ?? d.dia_semana}</span>
                      <span className="tabular-nums">
                        {(d.hora_inicio ?? "").slice(0, 5)} – {(d.hora_fim ?? "").slice(0, 5)}
                      </span>
                    </li>
                  ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Atividades que executa</CardTitle>
        </CardHeader>
        <CardContent>
          {!r || r.atividades.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nenhuma atividade atribuída.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Atividade</TableHead>
                    <TableHead>Recorrência</TableHead>
                    <TableHead className="hidden md:table-cell">Presença</TableHead>
                    <TableHead className="text-right">Tempo/mês</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {r.atividades.map((a) => (
                    <TableRow key={a.atividadeId}>
                      <TableCell className="font-medium">
                        <Link href={`/painel/pessoal/atribuicoes/atividades/${a.atividadeId}`} className="hover:underline">
                          {a.nome ?? "(sem nome)"}
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{a.recorrencia ?? "—"}</TableCell>
                      <TableCell className="hidden md:table-cell">
                        {a.presenca ? <Badge variant="outline">{a.presenca}</Badge> : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{a.tempoMinMes != null ? hm(a.tempoMinMes) : "—"}</TableCell>
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
