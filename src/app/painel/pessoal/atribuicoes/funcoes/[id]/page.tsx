import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import {
  ArrowLeft,
  CheckCircle2,
  ListChecks,
  Scale,
  Trash2,
  TriangleAlert,
} from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { listarFuncionarios } from "@/lib/db/pessoal"
import {
  atribuicoesDaFuncao,
  buscarFuncao,
  comparativoFuncao,
  funcionariosDaFuncao,
  listarAtividades,
} from "@/lib/db/pessoal-sst"

import { ExcluirFuncao } from "./excluir-funcao"
import { FuncaoForm } from "../funcao-form"
import { FuncionariosFuncao, PlanoCargos } from "./plano-e-pessoas"

export const metadata: Metadata = { title: "Função — Confluir" }

export default async function FuncaoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ salvo?: string }>
}) {
  await requirePermissao("pessoal_gestao")
  const { id } = await params
  const { salvo } = await searchParams

  const funcao = await buscarFuncao(id)
  if (!funcao) notFound()

  const [atribuicoes, vinculados, funcionarios, atividades, comparativo] =
    await Promise.all([
      atribuicoesDaFuncao(id),
      funcionariosDaFuncao(id),
      listarFuncionarios({ situacao: "ativos" }),
      listarAtividades(),
      comparativoFuncao(id),
    ])

  const tarefasDaFuncao = atividades.filter((a) => a.funcao_id === id)
  const opcoes = funcionarios.linhas.map((l) => ({
    usuarioId: l.usuarioId,
    nome: l.nome,
  }))

  return (
    <>
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3">
          <Link href="/painel/pessoal/atribuicoes/funcoes">
            <ArrowLeft />
            Funções
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">
          {funcao.nome ?? "(sem nome)"}
        </h1>
        <p className="text-muted-foreground mt-1 text-xs">
          {funcao.funcionarios} funcionário{funcao.funcionarios === 1 ? "" : "s"}{" "}
          · {tarefasDaFuncao.length} tarefa
          {tarefasDaFuncao.length === 1 ? "" : "s"} · {atribuicoes.length} no
          plano de cargos
        </p>
      </div>

      {salvo === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Função criada.</AlertDescription>
        </Alert>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <FuncaoForm
          funcao={{
            id: funcao.id,
            nome: funcao.nome,
            descricao: funcao.descricao,
            ativo: funcao.ativo,
          }}
        />

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Funcionários na função</CardTitle>
            <CardDescription>
              Quem ocupa esta função — base do comparativo tarefas × plano.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FuncionariosFuncao
              funcaoId={id}
              vinculados={vinculados}
              opcoes={opcoes}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Plano de cargos — tarefas esperadas
          </CardTitle>
          <CardDescription>
            As atribuições que quem ocupa a função deve executar (equivale ao
            contrato de trabalho). Servem de referência para identificar desvio
            de função e mitigar passivos.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PlanoCargos
            funcaoId={id}
            funcaoNome={funcao.nome ?? ""}
            funcaoDescricao={funcao.descricao}
            atribuicoes={atribuicoes}
            tarefas={tarefasDaFuncao.map((t) => ({ id: t.id, nome: t.nome }))}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            <Scale className="mr-1 inline size-4 align-[-3px]" />
            Comparativo: tarefas × plano de cargos
          </CardTitle>
          <CardDescription>
            Por funcionário: tarefas que ele executa dentro da função (atende ao
            contrato) × tarefas de outra função (possível desvio), e quanto do
            plano de cargos está coberto.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {comparativo.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Vincule funcionários à função para ver o comparativo.
            </p>
          ) : (
            comparativo.map((c) => (
              <div key={c.funcionarioId} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium">
                    {c.nome ?? "(sem nome)"}
                  </span>
                  <span className="text-muted-foreground flex flex-wrap items-center gap-3 text-xs">
                    <span>
                      <CheckCircle2 className="mr-1 inline size-3.5 align-[-2px] text-emerald-600" />
                      {c.aderentes.length} na função
                    </span>
                    {c.foraDaFuncao.length > 0 && (
                      <span className="text-warning-fg">
                        <TriangleAlert className="mr-1 inline size-3.5 align-[-2px]" />
                        {c.foraDaFuncao.length} fora da função
                      </span>
                    )}
                    {c.planoTotal > 0 && (
                      <span>
                        plano: {c.planoCobertos}/{c.planoTotal} coberto
                      </span>
                    )}
                  </span>
                </div>
                {c.foraDaFuncao.length > 0 && (
                  <p className="text-muted-foreground mt-2 text-xs">
                    <span className="text-warning-fg font-medium">
                      Fora da função:
                    </span>{" "}
                    {c.foraDaFuncao
                      .map(
                        (f) =>
                          `${f.nome ?? "(tarefa)"}${f.funcaoNome ? ` (${f.funcaoNome})` : " (sem função)"}`
                      )
                      .join(", ")}
                  </p>
                )}
                {c.planoTotal > 0 && c.planoPendentes.length > 0 && (
                  <p className="text-muted-foreground mt-1 text-xs">
                    <span className="font-medium">Do plano, não executa:</span>{" "}
                    {c.planoPendentes.join(", ")}
                  </p>
                )}
                {c.planoLivres > 0 && (
                  <p className="text-muted-foreground mt-1 text-xs">
                    {c.planoLivres} item(ns) do plano sem tarefa vinculada (não
                    rastreável automaticamente).
                  </p>
                )}
              </div>
            ))
          )}
          <p className="text-muted-foreground text-xs">
            Para o plano entrar no comparativo automático, vincule cada atribuição
            do plano a uma tarefa (campo “tarefa” ao adicionar a atribuição).
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tarefas desta função</CardTitle>
          <CardDescription>
            Tarefas catalogadas com esta função. A análise SST completa fica em
            cada tarefa.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          {tarefasDaFuncao.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Nenhuma tarefa ligada a esta função ainda.{" "}
              <Link
                href="/painel/pessoal/atribuicoes/tarefas/nova"
                className="text-primary hover:underline"
              >
                Criar tarefa
              </Link>
              .
            </p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {tarefasDaFuncao.map((t) => (
                <li key={t.id}>
                  <Link
                    href={`/painel/pessoal/atribuicoes/tarefas/${t.id}`}
                    className="hover:bg-muted/50 flex items-center gap-2 px-3 py-2 text-sm hover:underline"
                  >
                    <ListChecks className="text-muted-foreground size-4" />
                    {t.nome ?? "(sem nome)"}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-destructive">
            <Trash2 className="mr-1 inline size-4 align-[-3px]" />
            Excluir função
          </CardTitle>
          <CardDescription>
            Remove a função, seu plano de cargos e os vínculos de funcionários.
            As tarefas ligadas ficam sem função (não são apagadas).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ExcluirFuncao id={id} />
        </CardContent>
      </Card>
    </>
  )
}
