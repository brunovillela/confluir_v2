import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { RotuloTrilha } from "@/components/layout/trilha-rotulos"
import { CabecalhoFuncionario } from "@/components/pessoal/cabecalho-funcionario"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { VoltarLista } from "@/components/voltar-lista"
import { requirePermissao } from "@/lib/auth"
import { carregarBaseInformes } from "@/lib/db/informes-area"
import { funcionarioDaArea } from "@/lib/db/pessoal-area"
import { formatarData } from "@/lib/formato"

export const metadata: Metadata = { title: "Informes do funcionário — Confluir" }

/** Nível 2 dos Informes: os informes do funcionário, um por ano-base. */
export default async function InformesFuncionarioPage({ params }: { params: Promise<{ usuarioId: string }> }) {
  const sessao = await requirePermissao("pessoal_gestao", ["pessoal_informes_rendimentos"])
  const { usuarioId } = await params
  const [funcionario, { informes, remessas }] = await Promise.all([funcionarioDaArea(usuarioId), carregarBaseInformes()])
  if (!funcionario) notFound()
  const daPessoa = informes.filter((i) => i.funcionarioId === usuarioId)
  const anosComInforme = new Set(daPessoa.map((i) => i.ano))
  // Anos-base em que a pessoa estava na casa e não tem informe.
  const admissao = funcionario.admissao?.slice(0, 4) ?? "0000"
  const demissao = funcionario.demissao?.slice(0, 4) ?? "9999"
  const faltando = remessas
    .map((r) => r.ano_referencia_os ?? "")
    .filter((a) => a && a >= admissao && a <= demissao && !anosComInforme.has(a))
    .sort()
    .reverse()

  return (
    <>
      <RotuloTrilha valores={{ funcionario: "Funcionários", [usuarioId]: funcionario.nome }} />
      <VoltarLista chave="informes-funcionarios" base="/painel/pessoal/informes" rotulo="Informes de rendimentos" />
      <CabecalhoFuncionario funcionario={funcionario} area="informes" permissoes={sessao.permissoes} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Informes de rendimentos</CardTitle>
          <CardDescription>
            {daPessoa.length} informe(s)
            {faltando.length > 0 && ` · sem informe em ${faltando.join(", ")}`}
          </CardDescription>
        </CardHeader>
        {daPessoa.length > 0 && (
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ano-base</TableHead>
                    <TableHead>Situação</TableHead>
                    <TableHead className="hidden md:table-cell">Lançado em</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {daPessoa.map((i) => (
                    <TableRow key={i.id}>
                      <TableCell className="font-medium">
                        <Link href={`/painel/pessoal/informes/funcionario/${usuarioId}/${i.id}`} className="hover:underline">
                          {i.ano}
                        </Link>
                      </TableCell>
                      <TableCell>
                        {i.liberado ? <Badge variant="success">Liberado</Badge> : <Badge variant="warning">Bloqueado</Badge>}
                      </TableCell>
                      <TableCell className="text-muted-foreground hidden md:table-cell">{formatarData(i.criadoEm)}</TableCell>
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
