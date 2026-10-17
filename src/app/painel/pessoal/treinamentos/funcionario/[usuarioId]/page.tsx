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
import { urlArquivoPessoal } from "@/lib/db/pessoal"
import { funcionarioDaArea } from "@/lib/db/pessoal-area"
import { carregarBaseTreinamentos } from "@/lib/db/treinamentos-area"
import { formatarData } from "@/lib/formato"

export const metadata: Metadata = { title: "Treinamentos do funcionário — Confluir" }

const STATUS = {
  valido: { rotulo: "Em dia", variante: "success" },
  vencido: { rotulo: "Vencido", variante: "warning" },
  falta: { rotulo: "Falta fazer", variante: "destructive" },
  sem_vinculo: { rotulo: "Sem treinamento no catálogo", variante: "outline" },
} as const

/** Nível 2 dos Treinamentos: a trilha do funcionário — o que fez, o que venceu e o que a matriz de SST exige. */
export default async function TreinamentosFuncionarioPage({ params }: { params: Promise<{ usuarioId: string }> }) {
  const sessao = await requirePermissao("pessoal_gestao")
  const { usuarioId } = await params
  const [funcionario, { matriculas, matrizDe, usaMatriz }] = await Promise.all([
    funcionarioDaArea(usuarioId),
    carregarBaseTreinamentos(),
  ])
  if (!funcionario) notFound()

  const daPessoa = matriculas.filter((m) => m.alunoId === usuarioId)
  const exigidos = matrizDe.get(usuarioId)
  const cargaTotal = daPessoa.reduce((s, m) => s + (m.cargaHoraria ?? 0), 0)
  const urls = new Map(await Promise.all(daPessoa.map(async (m) => [m.id, await urlArquivoPessoal(m.certificado)] as const)))

  return (
    <>
      <RotuloTrilha valores={{ funcionario: "Funcionários", [usuarioId]: funcionario.nome }} />
      <VoltarLista chave="treinamentos-funcionarios" base="/painel/pessoal/treinamentos" rotulo="Treinamentos" />
      <CabecalhoFuncionario funcionario={funcionario} area="treinamentos" permissoes={sessao.permissoes} />

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <TileIndicador rotulo="Treinamentos feitos" valor={String(daPessoa.length)} />
        <TileIndicador rotulo="Carga horária" valor={`${cargaTotal.toLocaleString("pt-BR")} h`} nota="soma do catálogo" />
        <TileIndicador rotulo="Certificados vencidos" valor={String(daPessoa.filter((m) => m.vencido).length)} />
        <TileIndicador
          rotulo="Exigidos pendentes"
          valor={usaMatriz ? String(exigidos?.pendentes ?? 0) : "—"}
          nota={usaMatriz ? (exigidos?.funcaoNome ?? "pelas atividades que executa") : "sem exigências na matriz de SST"}
        />
      </section>

      {exigidos && exigidos.itens.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Exigidos pelas atividades (Atribuições e SST)</CardTitle>
            <CardDescription>O que as atividades que a pessoa executa pedem, cruzado com o que ela já fez.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Treinamento exigido</TableHead>
                    <TableHead>Situação</TableHead>
                    <TableHead className="hidden md:table-cell">Válido até</TableHead>
                    <TableHead className="hidden lg:table-cell">Por causa de</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {exigidos.itens.map((i) => (
                    <TableRow key={i.chave}>
                      <TableCell className="font-medium">
                        {i.treinamento_id ? (
                          <Link href={`/painel/pessoal/treinamentos/${i.treinamento_id}?pessoa=${usuarioId}`} className="hover:underline">
                            {i.descricao}
                          </Link>
                        ) : (
                          i.descricao
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS[i.status].variante}>{STATUS[i.status].rotulo}</Badge>
                      </TableCell>
                      <TableCell className="hidden whitespace-nowrap md:table-cell">{formatarData(i.validoAte)}</TableCell>
                      <TableCell className="text-muted-foreground hidden text-xs lg:table-cell">{i.atividades.join(", ")}</TableCell>
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
          <CardTitle className="text-base">Treinamentos feitos</CardTitle>
          <CardDescription>Do mais recente ao mais antigo. Clique no treinamento para abrir a turma.</CardDescription>
        </CardHeader>
        {daPessoa.length > 0 && (
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Treinamento</TableHead>
                    <TableHead>Período</TableHead>
                    <TableHead>Validade</TableHead>
                    <TableHead>Certificado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {daPessoa.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium">
                        <Link href={`/painel/pessoal/treinamentos/${m.treinamentoId}?pessoa=${usuarioId}`} className="hover:underline">
                          {m.treinamento}
                        </Link>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {formatarData(m.inicio)}
                        {m.termino && m.termino !== m.inicio && <> – {formatarData(m.termino)}</>}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {m.validoAte ? (
                          <>
                            {formatarData(m.validoAte)} {m.vencido && <Badge variant="warning">Vencido</Badge>}
                          </>
                        ) : (
                          <span className="text-muted-foreground">não expira</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {urls.get(m.id) ? (
                          <a href={urls.get(m.id)!} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                            Abrir
                          </a>
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
        )}
      </Card>
    </>
  )
}
