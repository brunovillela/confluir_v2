import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { TileIndicador } from "@/components/graficos/tile"
import { RotuloTrilha } from "@/components/layout/trilha-rotulos"
import { CabecalhoFuncionario } from "@/components/pessoal/cabecalho-funcionario"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { VoltarLista } from "@/components/voltar-lista"
import { requirePermissao } from "@/lib/auth"
import { hojeSP } from "@/lib/db/comum"
import { lerConfigFaltas, listarFaltas } from "@/lib/db/faltas"
import { funcionarioDaArea } from "@/lib/db/pessoal-area"
import { formatarData } from "@/lib/formato"

import { BadgeFalta, LinkComprovacao } from "../../faltas-ui"

export const metadata: Metadata = { title: "Faltas do funcionário — Confluir" }

/** Nível 2 das Faltas justificadas: o funcionário — uso e saldo do limite no ano e as faltas. */
export default async function FaltasFuncionarioPage({
  params,
  searchParams,
}: {
  params: Promise<{ usuarioId: string }>
  searchParams: Promise<{ ano?: string }>
}) {
  const sessao = await requirePermissao("pessoal_gestao", ["pessoal_faltas_justificadas"])
  const { usuarioId } = await params
  const sp = await searchParams
  const [funcionario, { faltas }, { config }] = await Promise.all([
    funcionarioDaArea(usuarioId),
    listarFaltas({ funcionarioId: usuarioId }),
    lerConfigFaltas(),
  ])
  if (!funcionario) notFound()

  const hoje = hojeSP()
  const anos = [...new Set([hoje.slice(0, 4), ...faltas.map((f) => (f.data ?? "").slice(0, 4)).filter(Boolean)])].sort().reverse()
  const ano = sp.ano && anos.includes(sp.ano) ? sp.ano : hoje.slice(0, 4)
  const doAno = faltas.filter((f) => (f.data ?? "").startsWith(ano))
  const contam = doAno.filter((f) => f.situacao !== "recusada").length
  const mes = hoje.slice(0, 7)
  const noMes = faltas.filter((f) => f.situacao !== "recusada" && (f.data ?? "").startsWith(mes)).length

  return (
    <>
      <RotuloTrilha valores={{ funcionario: "Funcionários", [usuarioId]: funcionario.nome }} />
      <VoltarLista chave="faltas-funcionarios" base="/painel/pessoal/faltas" rotulo="Faltas justificadas" />
      <CabecalhoFuncionario funcionario={funcionario} area="faltas" permissoes={sessao.permissoes} />

      <nav className="flex flex-wrap gap-2 text-sm" aria-label="Ano">
        {anos.map((a) => (
          <Link
            key={a}
            href={`/painel/pessoal/faltas/funcionario/${usuarioId}?ano=${a}`}
            className={`rounded-md border px-3 py-1 ${a === ano ? "border-primary bg-primary/10 font-medium" : "hover:bg-muted"}`}
          >
            {a}
          </Link>
        ))}
      </nav>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <TileIndicador
          rotulo={`Faltas em ${ano}`}
          valor={String(contam)}
          nota={config.limiteAno !== null ? `limite de ${config.limiteAno} por ano` : "sem limite anual"}
        />
        <TileIndicador
          rotulo="Saldo no ano"
          valor={config.limiteAno !== null ? String(config.limiteAno - contam) : "—"}
        />
        <TileIndicador
          rotulo="Neste mês"
          valor={String(noMes)}
          nota={config.limiteMes !== null ? `limite de ${config.limiteMes} por mês` : "sem limite mensal"}
        />
        <TileIndicador rotulo="Recusadas no ano" valor={String(doAno.filter((f) => f.situacao === "recusada").length)} />
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Faltas de {ano}</CardTitle>
          <CardDescription>{doAno.length} registro(s). Clique na data para abrir.</CardDescription>
        </CardHeader>
        {doAno.length > 0 && (
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Justificativa</TableHead>
                    <TableHead>Situação</TableHead>
                    <TableHead className="hidden md:table-cell">Comprovação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {doAno.map((f) => (
                    <TableRow key={f.id}>
                      <TableCell className="font-medium whitespace-nowrap">
                        <Link href={`/painel/pessoal/faltas/${f.id}`} className="hover:underline">
                          {formatarData(f.data)}
                        </Link>
                      </TableCell>
                      <TableCell className="max-w-72">
                        <span className="line-clamp-2 text-sm">{f.tipo ?? "—"}</span>
                        {f.situacao === "recusada" && f.motivoRecusa && (
                          <span className="text-destructive line-clamp-2 text-xs">Recusa: {f.motivoRecusa}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <BadgeFalta situacao={f.situacao} />
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <LinkComprovacao caminho={f.comprovacao} />
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
