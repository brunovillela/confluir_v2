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
import { carregarBaseContracheques, resumirContracheques } from "@/lib/db/contracheques-area"
import { funcionarioDaArea } from "@/lib/db/pessoal-area"
import { formatarData, formatarMoeda } from "@/lib/formato"

export const metadata: Metadata = { title: "Contracheques do funcionário — Confluir" }

/** Nível 2 dos Contracheques: o funcionário — indicadores do ano e o histórico. */
export default async function ContrachequesFuncionarioPage({
  params,
  searchParams,
}: {
  params: Promise<{ usuarioId: string }>
  searchParams: Promise<{ ano?: string }>
}) {
  const sessao = await requirePermissao("pessoal_gestao", ["pessoal_contracheque"])
  const { usuarioId } = await params
  const sp = await searchParams
  const [funcionario, { contracheques }] = await Promise.all([funcionarioDaArea(usuarioId), carregarBaseContracheques()])
  if (!funcionario) notFound()

  const daPessoa = contracheques.filter((c) => c.funcionarioId === usuarioId)
  const anos = [...new Set(daPessoa.map((c) => c.ano))].sort().reverse()
  const ano = sp.ano && anos.includes(sp.ano) ? sp.ano : anos[0]
  const doAno = daPessoa.filter((c) => c.ano === ano)
  const r = resumirContracheques(doAno)
  const naturezas = [...new Set(doAno.map((c) => c.natureza))]

  return (
    <>
      <RotuloTrilha valores={{ funcionario: "Funcionários", [usuarioId]: funcionario.nome }} />
      <VoltarLista chave="contracheques-funcionarios" base="/painel/pessoal/contracheques" rotulo="Contracheques" />
      <CabecalhoFuncionario funcionario={funcionario} area="contracheques" permissoes={sessao.permissoes} />

      {daPessoa.length === 0 ? (
        <p className="text-muted-foreground text-sm">Nenhum contracheque deste funcionário.</p>
      ) : (
        <>
          <nav className="flex flex-wrap gap-2 text-sm" aria-label="Ano">
            {anos.map((a) => (
              <Link
                key={a}
                href={`/painel/pessoal/contracheques/funcionario/${usuarioId}?ano=${a}`}
                className={`rounded-md border px-3 py-1 ${a === ano ? "border-primary bg-primary/10 font-medium" : "hover:bg-muted"}`}
              >
                {a}
              </Link>
            ))}
          </nav>

          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <TileIndicador rotulo={`Contracheques em ${ano}`} valor={String(r.quantidade)} nota={naturezas.join(" · ")} />
            <TileIndicador rotulo="Bloqueados" valor={String(r.bloqueados)} nota="ainda não visíveis ao funcionário" />
            <TileIndicador
              rotulo="Líquido no ano"
              valor={r.comValor ? formatarMoeda(r.valor) : "—"}
              nota={r.comValor ? `${r.comValor} com valor informado` : "valores não informados"}
            />
            <TileIndicador rotulo="Desde" valor={String(anos[anos.length - 1])} nota={`${daPessoa.length} contracheque(s) no total`} />
          </section>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Contracheques de {ano}</CardTitle>
              <CardDescription>Do mais recente ao mais antigo. Clique para abrir o contracheque.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Remessa</TableHead>
                      <TableHead className="hidden sm:table-cell">Natureza</TableHead>
                      <TableHead className="text-right">Líquido</TableHead>
                      <TableHead>Situação</TableHead>
                      <TableHead className="hidden md:table-cell">Lançado em</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {doAno.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">
                          <Link href={`/painel/pessoal/contracheques/funcionario/${usuarioId}/${c.id}`} className="hover:underline">
                            {c.remessaNome}
                          </Link>
                        </TableCell>
                        <TableCell className="text-muted-foreground hidden sm:table-cell">{c.natureza}</TableCell>
                        <TableCell className="text-right tabular-nums">{c.valor !== null ? formatarMoeda(c.valor) : "—"}</TableCell>
                        <TableCell>
                          {c.liberado ? <Badge variant="success">Liberado</Badge> : <Badge variant="warning">Bloqueado</Badge>}
                        </TableCell>
                        <TableCell className="text-muted-foreground hidden md:table-cell">{formatarData(c.criadoEm)}</TableCell>
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
