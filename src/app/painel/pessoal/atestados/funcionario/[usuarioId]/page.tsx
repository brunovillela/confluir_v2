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
import { funcionarioDaArea } from "@/lib/db/pessoal-area"
import { listarAtestados, listarAusencias } from "@/lib/db/pessoal-saude"
import { formatarData } from "@/lib/formato"

export const metadata: Metadata = { title: "Atestados e ausências do funcionário — Confluir" }

/** Nível 2 de Atestados e ausências: o funcionário — números do ano, atestados e ausências. */
export default async function AtestadosFuncionarioPage({
  params,
  searchParams,
}: {
  params: Promise<{ usuarioId: string }>
  searchParams: Promise<{ ano?: string }>
}) {
  const sessao = await requirePermissao("pessoal_gestao")
  const { usuarioId } = await params
  const sp = await searchParams
  const [funcionario, todosAtestados, todasAusencias] = await Promise.all([
    funcionarioDaArea(usuarioId),
    listarAtestados(),
    listarAusencias(),
  ])
  if (!funcionario) notFound()

  const anoDo = (d: string | null) => (d ?? "").slice(0, 4)
  const atestados = todosAtestados.filter((a) => a.funcionario_id === usuarioId)
  const ausencias = todasAusencias.filter((a) => a.funcionario_id === usuarioId)
  const anoAtual = new Date().getFullYear().toString()
  const anos = [...new Set([anoAtual, ...[...atestados, ...ausencias].map((i) => anoDo(i.inicio)).filter(Boolean)])].sort().reverse()
  const ano = sp.ano && anos.includes(sp.ano) ? sp.ano : anoAtual
  const atAno = atestados.filter((a) => anoDo(a.inicio) === ano)
  const auAno = ausencias.filter((a) => anoDo(a.inicio) === ano)
  const dias = atAno.reduce((s, a) => s + (a.quantidade_dias ?? 0), 0)
  const maior = Math.max(0, ...atAno.map((a) => a.quantidade_dias ?? 0))

  return (
    <>
      <RotuloTrilha valores={{ funcionario: "Funcionários", [usuarioId]: funcionario.nome }} />
      <VoltarLista chave="atestados-funcionarios" base="/painel/pessoal/atestados" rotulo="Atestados e ausências" />
      <CabecalhoFuncionario funcionario={funcionario} area="atestados" permissoes={sessao.permissoes} />

      <nav className="flex flex-wrap gap-2 text-sm" aria-label="Ano">
        {anos.map((a) => (
          <Link
            key={a}
            href={`/painel/pessoal/atestados/funcionario/${usuarioId}?ano=${a}`}
            className={`rounded-md border px-3 py-1 ${a === ano ? "border-primary bg-primary/10 font-medium" : "hover:bg-muted"}`}
          >
            {a}
          </Link>
        ))}
      </nav>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <TileIndicador rotulo={`Atestados em ${ano}`} valor={String(atAno.length)} />
        <TileIndicador rotulo="Dias de afastamento" valor={String(dias)} />
        <TileIndicador rotulo="Maior afastamento" valor={maior ? `${maior} dia(s)` : "—"} nota={maior > 15 ? "passou de 15 dias (INSS)" : undefined} />
        <TileIndicador rotulo={`Ausências em ${ano}`} valor={String(auAno.length)} />
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Atestados médicos de {ano}</CardTitle>
          <CardDescription>
            Clique no período para abrir o atestado.{" "}
            <Link href="/painel/pessoal/atestados?aba=atestados" className="text-primary hover:underline">
              Lançar atestado
            </Link>
          </CardDescription>
        </CardHeader>
        {atAno.length > 0 && (
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Período</TableHead>
                    <TableHead className="text-right">Dias</TableHead>
                    <TableHead className="hidden sm:table-cell">CID-10</TableHead>
                    <TableHead className="hidden md:table-cell">Acompanhamento</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {atAno.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium whitespace-nowrap">
                        <Link href={`/painel/pessoal/atestados/${a.id}`} className="hover:underline">
                          {formatarData(a.inicio)}
                          {a.termino && a.termino !== a.inicio && <> – {formatarData(a.termino)}</>}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{a.quantidade_dias ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground hidden sm:table-cell">{a.cid10 ?? "—"}</TableCell>
                      <TableCell className="hidden md:table-cell">
                        {a.atestado_acompanhamento === true ? (
                          <Badge variant="info">{a.nome_acompanhado ? `Acomp. ${a.nome_acompanhado}` : "Acompanhamento"}</Badge>
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ausências de {ano}</CardTitle>
          <CardDescription>
            Afastamentos sem atestado (falta justificada, licença, trabalho externo…).{" "}
            <Link href="/painel/pessoal/atestados?aba=ausencias" className="text-primary hover:underline">
              Lançar ausência
            </Link>
          </CardDescription>
        </CardHeader>
        {auAno.length > 0 && (
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Período</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {auAno.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="whitespace-nowrap">
                        {formatarData(a.inicio)}
                        {a.termino && a.termino !== a.inicio && <> – {formatarData(a.termino)}</>}
                      </TableCell>
                      <TableCell className="max-w-72">
                        <span className="block truncate">{a.motivo ?? "—"}</span>
                        {a.observacao && <span className="text-muted-foreground block truncate text-xs">{a.observacao}</span>}
                      </TableCell>
                      <TableCell className="text-right">
                        <Link href={`/painel/pessoal/atestados?aba=ausencias&editar=${a.id}`} className="text-primary text-xs hover:underline">
                          Editar
                        </Link>
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
