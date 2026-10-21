import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { GraficoColunas } from "@/components/graficos/colunas"
import { TileIndicador } from "@/components/graficos/tile"
import { RotuloTrilha } from "@/components/layout/trilha-rotulos"
import { CabecalhoFuncionario } from "@/components/pessoal/cabecalho-funcionario"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { VoltarLista } from "@/components/voltar-lista"
import { requirePermissao } from "@/lib/auth"
import { funcionarioDaArea } from "@/lib/db/pessoal-area"
import { carregarBasePonto, indicadoresDe, OCORRENCIAS, rotuloCompetenciaPonto } from "@/lib/db/ponto-analise"

import { horas } from "../../analise/componentes"

export const metadata: Metadata = { title: "Ponto do funcionário — Confluir" }

/** Nível 2 do Ponto: o funcionário — indicadores do ano, alertas e o histórico mês a mês. */
export default async function PontoFuncionarioPage({
  params,
  searchParams,
}: {
  params: Promise<{ usuarioId: string }>
  searchParams: Promise<{ ano?: string }>
}) {
  const sessao = await requirePermissao("pessoal_gestao")
  const { usuarioId } = await params
  const sp = await searchParams
  const [funcionario, base] = await Promise.all([funcionarioDaArea(usuarioId), carregarBasePonto()])
  if (!funcionario) notFound()

  const registros = base.registros
    .filter((r) => r.funcionarioId === usuarioId)
    .sort((a, b) => b.competencia.localeCompare(a.competencia))
  const anos = [...new Set(registros.map((r) => r.competencia.slice(0, 4)))].sort().reverse()
  const ano = sp.ano && anos.includes(sp.ano) ? sp.ano : anos[0]
  const doAno = registros.filter((r) => ano && r.competencia.startsWith(ano))
  const pessoa = ano ? indicadoresDe(base, { escopo: "ano", ano }).pessoas.find((p) => p.id === usuarioId) : undefined
  const serie = [...doAno].reverse()

  return (
    <>
      <RotuloTrilha valores={{ funcionario: "Funcionários", [usuarioId]: funcionario.nome }} />
      <VoltarLista chave="ponto-funcionarios" base="/painel/pessoal/ponto" rotulo="Controle de ponto" />
      <CabecalhoFuncionario funcionario={funcionario} area="ponto" permissoes={sessao.permissoes} />

      {registros.length === 0 ? (
        <p className="text-muted-foreground text-sm">Nenhum registro de ponto deste funcionário.</p>
      ) : (
        <>
          <nav className="flex flex-wrap gap-2 text-sm" aria-label="Ano">
            {anos.map((a) => (
              <Link
                key={a}
                href={`/painel/pessoal/ponto/funcionario/${usuarioId}?ano=${a}`}
                className={`rounded-md border px-3 py-1 ${a === ano ? "border-primary bg-primary/10 font-medium" : "hover:bg-muted"}`}
              >
                {a}
              </Link>
            ))}
          </nav>

          {pessoa && (
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <TileIndicador rotulo={`Horas extras em ${ano}`} valor={horas(pessoa.he)} nota={`${horas(pessoa.he100)} a 100%`} />
              <TileIndicador rotulo="Meses com horas extras" valor={`${pessoa.mesesComHE} de ${pessoa.meses}`} />
              <TileIndicador rotulo="Maior mês" valor={horas(pessoa.maiorHEMes)} />
              <TileIndicador rotulo="Banco de horas" valor={horas(pessoa.saldo)} nota="na última remessa do ano" />
              <TileIndicador
                rotulo="Atestados"
                valor={String(pessoa.atestados)}
                nota={`${pessoa.diasAtestado} dia(s) · ${pessoa.faltasInjustificadas} falta(s) injustificada(s)`}
              />
            </section>
          )}

          {pessoa && pessoa.alertas.length > 0 && (
            <Card className="border-warning/50">
              <CardHeader>
                <CardTitle className="text-base">Alertas de {ano}</CardTitle>
                <CardDescription>Regras fixas da CLT e do TST sobre as horas lançadas e as marcações lidas.</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="list-disc pl-5 text-sm">
                  {pessoa.alertas.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {serie.length > 1 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Horas extras por mês</CardTitle>
              </CardHeader>
              <CardContent>
                <GraficoColunas
                  titulo="Horas extras por mês"
                  categorias={serie.map((r) => rotuloCompetenciaPonto(r.competencia).replace(/^(\w{3})\w*\//, "$1/"))}
                  series={[
                    { nome: "70%", valores: serie.map((r) => r.he70) },
                    { nome: "100%", valores: serie.map((r) => r.he100) },
                  ]}
                  empilhado
                />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Registros de {ano}</CardTitle>
              <CardDescription>
                Horas extras realizadas e o saldo ao fim do mês, em horas e minutos. Clique no mês para ver as horas, o
                espelho e as marcações dia a dia.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Mês</TableHead>
                      <TableHead className="text-right">HE 70%</TableHead>
                      <TableHead className="text-right">HE 100%</TableHead>
                      <TableHead className="hidden text-right md:table-cell">Pagas</TableHead>
                      <TableHead className="text-right">Saldo HE 70%</TableHead>
                      <TableHead className="text-right">Saldo HE 100%</TableHead>
                      <TableHead>Marcações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {doAno.map((r) => {
                      const ocorr = r.jornada ? OCORRENCIAS.reduce((s, o) => s + r.jornada![o.id].length, 0) : 0
                      return (
                        <TableRow key={r.id}>
                          <TableCell className="font-medium">
                            <Link href={`/painel/pessoal/ponto/funcionario/${usuarioId}/${r.id}`} className="hover:underline">
                              {rotuloCompetenciaPonto(r.competencia)}
                            </Link>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{horas(r.he70)}</TableCell>
                          <TableCell className="text-right tabular-nums">{horas(r.he100)}</TableCell>
                          <TableCell className="hidden text-right tabular-nums md:table-cell">{horas(r.pagas)}</TableCell>
                          <TableCell className="text-right tabular-nums">{horas(r.saldo70)}</TableCell>
                          <TableCell className="text-right tabular-nums">{horas(r.saldo100)}</TableCell>
                          <TableCell>
                            {r.lido ? (
                              ocorr > 0 ? (
                                <Badge variant="warning">{ocorr} ocorrência(s)</Badge>
                              ) : (
                                <Badge variant="success">Sem ocorrências</Badge>
                              )
                            ) : (
                              <span className="text-muted-foreground text-xs">
                                {!r.temEspelho
                                  ? "Sem espelho"
                                  : r.espelhoErro
                                    ? /escaneado/i.test(r.espelhoErro)
                                      ? "Escaneado, não lido"
                                      : "Erro na leitura"
                                    : "Ainda não lidas"}
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })}
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
