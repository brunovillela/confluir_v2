import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, ShieldAlert, Trash2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { requirePermissao } from "@/lib/auth"
import { listarFuncionarios } from "@/lib/db/pessoal"
import { buscarGhe } from "@/lib/db/pessoal-sst"
import {
  COR_CATEGORIA,
  ROTULO_CATEGORIA,
  formatarTempoMes,
} from "@/lib/pessoal-sst-constantes"

import { ExcluirGhe, GheForm, MembrosGhe } from "../ghe-clientes"

export const metadata: Metadata = { title: "GHE — Confluir" }

export default async function GheDetalhePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ salvo?: string }>
}) {
  await requirePermissao("pessoal_gestao")
  const { id } = await params
  const { salvo } = await searchParams

  const ghe = await buscarGhe(id)
  if (!ghe) notFound()

  const funcionarios = await listarFuncionarios({ situacao: "ativos" })
  const opcoes = funcionarios.linhas.map((l) => ({
    usuarioId: l.usuarioId,
    nome: l.nome,
  }))

  // pior risco por categoria no GRUPO (entre todos os membros)
  const piorPorCategoria = new Map<
    string,
    { valor: number; rotulo: string; cor: string }
  >()
  for (const p of ghe.perfil) {
    for (const r of p.riscos) {
      if (!r.pior) continue
      const atual = piorPorCategoria.get(r.categoria)
      if (!atual || r.pior.valor > atual.valor) {
        piorPorCategoria.set(r.categoria, {
          valor: r.pior.valor,
          rotulo: r.pior.rotulo,
          cor: r.pior.cor,
        })
      }
    }
  }

  return (
    <>
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3">
          <Link href="/painel/pessoal/atribuicoes/ghe">
            <ArrowLeft />
            GHEs
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">
          {ghe.nome ?? "(sem nome)"}
        </h1>
        <p className="text-muted-foreground mt-1 text-xs">
          {ghe.membros} membro{ghe.membros === 1 ? "" : "s"} — grupo homogêneo
          de exposição.
        </p>
      </div>

      {salvo === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>GHE criado.</AlertDescription>
        </Alert>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Dados do GHE</CardTitle>
          </CardHeader>
          <CardContent>
            <GheForm ghe={{ id: ghe.id, nome: ghe.nome, descricao: ghe.descricao }} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Membros</CardTitle>
            <CardDescription>
              Funcionários com exposição semelhante — avaliados como grupo.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <MembrosGhe gheId={id} membros={ghe.membrosLista} opcoes={opcoes} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            <ShieldAlert className="mr-1 inline size-4 align-[-3px]" />
            Perfil de exposição do grupo
          </CardTitle>
          <CardDescription>
            Por membro: tempo nas atividades, % da jornada consumida e riscos
            avaliados (por executor). O pior risco de cada categoria no grupo
            aparece consolidado abaixo.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {piorPorCategoria.size > 0 && (
            <div className="flex flex-wrap gap-2">
              {[...piorPorCategoria.entries()]
                .sort((a, b) => b[1].valor - a[1].valor)
                .map(([cat, v]) => (
                  <span
                    key={cat}
                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-white"
                    style={{ backgroundColor: COR_CATEGORIA[cat] ?? "#64748b" }}
                  >
                    {ROTULO_CATEGORIA[cat] ?? cat}: {v.rotulo} ({v.valor})
                  </span>
                ))}
            </div>
          )}
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>Membro</TableHead>
                  <TableHead className="text-right">Atividades</TableHead>
                  <TableHead className="text-right">Tempo/mês</TableHead>
                  <TableHead className="text-right">Ocupação</TableHead>
                  <TableHead>Riscos</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ghe.perfil.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="text-muted-foreground h-16 text-center text-sm"
                    >
                      Adicione membros para ver o perfil.
                    </TableCell>
                  </TableRow>
                )}
                {ghe.perfil.map((p) => (
                  <TableRow key={p.funcionarioId}>
                    <TableCell className="font-medium">
                      {p.nome ?? "(sem nome)"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {p.atividades.length}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatarTempoMes(p.tempoTotalMin)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {p.ocupacaoPct === null ? "—" : `${p.ocupacaoPct}%`}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {p.riscos.slice(0, 4).map((r) => (
                          <span
                            key={r.categoria}
                            className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium text-white"
                            style={{
                              backgroundColor:
                                COR_CATEGORIA[r.categoria] ?? "#64748b",
                            }}
                            title={`${ROTULO_CATEGORIA[r.categoria] ?? r.categoria}: ${r.pior?.rotulo ?? "—"}`}
                          >
                            {(ROTULO_CATEGORIA[r.categoria] ?? r.categoria).split(" ")[0]}
                          </span>
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="text-muted-foreground text-xs">
            Um GHE saudável tem membros com tempos e riscos comparáveis — se um
            membro destoa muito, considere movê-lo para outro grupo.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-destructive text-base">
            <Trash2 className="mr-1 inline size-4 align-[-3px]" />
            Excluir GHE
          </CardTitle>
          <CardDescription>
            Remove o grupo e os vínculos de membros. Funcionários, atividades e
            riscos não são apagados.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ExcluirGhe id={id} />
        </CardContent>
      </Card>
    </>
  )
}
