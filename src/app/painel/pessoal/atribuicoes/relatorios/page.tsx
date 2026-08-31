import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

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
import {
  funcionariosDaFuncao,
  listarFuncoes,
  relatorioDeFuncionarios,
  type RelatorioPessoa,
} from "@/lib/db/pessoal-sst"
import {
  COR_CATEGORIA,
  ROTULO_CATEGORIA,
  ROTULO_PRESENCA,
  ROTULO_RECORRENCIA,
  formatarTempoMes,
} from "@/lib/pessoal-sst-constantes"

export const metadata: Metadata = { title: "Relatórios SST — Confluir" }

const SELECT_CLS =
  "border-input bg-background h-9 rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

function pctCor(pct: number | null): string {
  if (pct === null) return "#64748b"
  if (pct >= 67) return "#b91c1c"
  if (pct >= 34) return "#ca8a04"
  return "#15803d"
}

function TabelaConsolidada({ pessoas }: { pessoas: RelatorioPessoa[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead>Funcionário</TableHead>
            <TableHead className="hidden sm:table-cell">Função</TableHead>
            <TableHead className="text-right">Tarefas</TableHead>
            <TableHead className="text-right">Tempo/mês</TableHead>
            <TableHead className="hidden text-right lg:table-cell">
              Jornada/mês
            </TableHead>
            <TableHead className="text-right">Ocupação</TableHead>
            <TableHead className="text-right">Presença física</TableHead>
            <TableHead className="text-right">Perigos</TableHead>
            <TableHead>Riscos</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pessoas.length === 0 && (
            <TableRow>
              <TableCell colSpan={9} className="text-muted-foreground h-16 text-center text-sm">
                Sem dados para este escopo.
              </TableCell>
            </TableRow>
          )}
          {pessoas.map((p) => (
            <TableRow key={p.funcionarioId}>
              <TableCell className="font-medium">{p.nome ?? "(sem nome)"}</TableCell>
              <TableCell className="text-muted-foreground hidden sm:table-cell">
                {p.funcaoNome ?? "—"}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {p.tarefas.length}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatarTempoMes(p.tempoTotalMin)}
              </TableCell>
              <TableCell className="text-muted-foreground hidden text-right tabular-nums lg:table-cell">
                {p.jornadaMinMes > 0 ? formatarTempoMes(p.jornadaMinMes) : "—"}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {p.ocupacaoPct === null ? (
                  "—"
                ) : (
                  <span style={{ color: pctCor(p.ocupacaoPct) }}>
                    {p.ocupacaoPct}%
                  </span>
                )}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {p.presencaFisicaPct === null ? (
                  "—"
                ) : (
                  <span style={{ color: pctCor(p.presencaFisicaPct) }}>
                    {p.presencaFisicaPct}%
                  </span>
                )}
              </TableCell>
              <TableCell className="text-right tabular-nums">{p.perigos}</TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  {p.riscos.slice(0, 4).map((r) => (
                    <span
                      key={r.categoria}
                      className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium text-white"
                      style={{ backgroundColor: COR_CATEGORIA[r.categoria] ?? "#64748b" }}
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
  )
}

function DetalhePessoa({ p }: { p: RelatorioPessoa }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{p.nome ?? "(sem nome)"}</CardTitle>
        <CardDescription>
          {p.funcaoNome ? `${p.funcaoNome} · ` : ""}
          {formatarTempoMes(p.tempoTotalMin)}/mês
          {p.jornadaMinMes > 0
            ? ` de ${formatarTempoMes(p.jornadaMinMes)} contratados (${p.ocupacaoPct}% da jornada)`
            : " (sem jornada cadastrada)"}{" "}
          ·{" "}
          {p.presencaFisicaPct === null
            ? "presença não definida"
            : `${p.presencaFisicaPct}% presencial`}{" "}
          · {p.perigos} perigo(s)
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div>
          <p className="mb-2 text-sm font-medium">Tarefas e tempo</p>
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>Tarefa</TableHead>
                  <TableHead className="hidden sm:table-cell">Recorrência</TableHead>
                  <TableHead className="hidden sm:table-cell">Presença</TableHead>
                  <TableHead className="text-right">Tempo/mês</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {p.tarefas.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-muted-foreground h-14 text-center text-sm">
                      Sem tarefas atribuídas.
                    </TableCell>
                  </TableRow>
                )}
                {p.tarefas.map((t) => (
                  <TableRow key={t.atividadeId}>
                    <TableCell className="font-medium">{t.nome ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground hidden sm:table-cell">
                      {t.recorrencia ? ROTULO_RECORRENCIA[t.recorrencia] : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden sm:table-cell">
                      {t.presenca ? ROTULO_PRESENCA[t.presenca] : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatarTempoMes(t.tempoMinMes)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
        {p.riscos.length > 0 && (
          <div>
            <p className="mb-2 text-sm font-medium">Riscos por categoria</p>
            <div className="flex flex-wrap gap-2">
              {p.riscos.map((r) => (
                <span
                  key={r.categoria}
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-white"
                  style={{ backgroundColor: COR_CATEGORIA[r.categoria] ?? "#64748b" }}
                >
                  {ROTULO_CATEGORIA[r.categoria] ?? r.categoria}:{" "}
                  {r.pior?.rotulo ?? "—"}
                  {r.piorResidual ? ` → ${r.piorResidual.rotulo}` : ""}
                </span>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default async function RelatoriosPage({
  searchParams,
}: {
  searchParams: Promise<{ escopo?: string; id?: string }>
}) {
  await requirePermissao("pessoal_gestao")
  const { escopo = "conjunto", id } = await searchParams

  const [funcoes, funcionarios] = await Promise.all([
    listarFuncoes(),
    listarFuncionarios({ situacao: "ativos" }),
  ])

  let ids: string[] = []
  if (escopo === "funcionario" && id) {
    ids = [id]
  } else if (escopo === "funcao" && id) {
    const vinc = await funcionariosDaFuncao(id)
    ids = vinc.map((v) => v.funcionarioId)
  } else {
    ids = funcionarios.linhas.map((l) => l.usuarioId)
  }

  const pessoas = await relatorioDeFuncionarios(ids)

  return (
    <>
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3">
          <Link href="/painel/pessoal/atribuicoes">
            <ArrowLeft />
            Atribuições
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Relatórios SST</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Presença física, tempo por tarefa, perigos e riscos — por funcionário,
          por função ou pelo conjunto.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Escopo do relatório</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="flex flex-wrap gap-2">
            <Button
              asChild
              size="sm"
              variant={escopo === "conjunto" ? "default" : "outline"}
            >
              <Link href="/painel/pessoal/atribuicoes/relatorios?escopo=conjunto">
                Conjunto (todos)
              </Link>
            </Button>
            <Button
              asChild
              size="sm"
              variant={escopo === "funcionario" ? "default" : "outline"}
            >
              <Link href="/painel/pessoal/atribuicoes/relatorios?escopo=funcionario">
                Por funcionário
              </Link>
            </Button>
            <Button
              asChild
              size="sm"
              variant={escopo === "funcao" ? "default" : "outline"}
            >
              <Link href="/painel/pessoal/atribuicoes/relatorios?escopo=funcao">
                Por função
              </Link>
            </Button>
          </div>

          {escopo === "funcionario" && (
            <form method="get" className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="escopo" value="funcionario" />
              <select name="id" defaultValue={id ?? ""} className={`${SELECT_CLS} flex-1`}>
                <option value="">Escolha um funcionário…</option>
                {funcionarios.linhas.map((l) => (
                  <option key={l.usuarioId} value={l.usuarioId}>
                    {l.nome ?? "(sem nome)"}
                  </option>
                ))}
              </select>
              <Button type="submit" variant="secondary">
                Ver
              </Button>
            </form>
          )}
          {escopo === "funcao" && (
            <form method="get" className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="escopo" value="funcao" />
              <select name="id" defaultValue={id ?? ""} className={`${SELECT_CLS} flex-1`}>
                <option value="">Escolha uma função…</option>
                {funcoes.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nome ?? "(sem nome)"}
                  </option>
                ))}
              </select>
              <Button type="submit" variant="secondary">
                Ver
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      {escopo === "funcionario" && id && pessoas.length > 0 ? (
        <DetalhePessoa p={pessoas[0]} />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {escopo === "funcao" && id
                ? "Funcionários da função"
                : "Consolidado"}
            </CardTitle>
            <CardDescription>
              {pessoas.length} funcionário{pessoas.length === 1 ? "" : "s"} no
              escopo. A presença física é ponderada pelo tempo de cada tarefa.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TabelaConsolidada pessoas={pessoas} />
          </CardContent>
        </Card>
      )}
    </>
  )
}
