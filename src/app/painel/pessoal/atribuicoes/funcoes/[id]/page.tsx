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

  // atividades da função = as vinculadas ao plano de cargos (a atividade em si é
  // um catálogo neutro — não pertence mais a uma função)
  const idsDoPlano = new Set(
    atribuicoes.map((a) => a.atividade_id).filter((v): v is string => !!v)
  )
  const atividadesDaFuncao = atividades.filter((a) => idsDoPlano.has(a.id))
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
          · {atividadesDaFuncao.length} atividade
          {atividadesDaFuncao.length === 1 ? "" : "s"} · {atribuicoes.length} no
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
              Quem ocupa esta função — base do comparativo atividades × plano.
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
            Plano de cargos — atividades esperadas
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
            atividades={atividades.map((t) => ({ id: t.id, nome: t.nome }))}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            <Scale className="mr-1 inline size-4 align-[-3px]" />
            Comparativo: atividades × plano de cargos
          </CardTitle>
          <CardDescription>
            Análise de desvio POR EXECUTOR: atividades que cada funcionário executa
            previstas no plano desta função (atende ao contrato) × atividades fora
            do plano (possível desvio de função), e quanto do plano está
            coberto.
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
                      Fora do plano da função:
                    </span>{" "}
                    {c.foraDaFuncao
                      .map(
                        (f) =>
                          `${f.nome ?? "(atividade)"}${f.funcaoNome ? ` (prevista em: ${f.funcaoNome})` : ""}`
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
                    {c.planoLivres} item(ns) do plano sem atividade vinculada (não
                    rastreável automaticamente).
                  </p>
                )}
              </div>
            ))
          )}
          <p className="text-muted-foreground text-xs">
            Para o plano entrar no comparativo automático, vincule cada atribuição
            do plano a uma atividade (campo “atividade” ao adicionar a atribuição).
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Atividades desta função</CardTitle>
          <CardDescription>
            Atividades vinculadas ao plano de cargos desta função. A análise SST
            completa fica em cada atividade.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          {atividadesDaFuncao.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Nenhuma atividade vinculada ao plano desta função ainda — vincule ao
              adicionar atribuições no plano de cargos, ou{" "}
              <Link
                href="/painel/pessoal/atribuicoes/atividades/nova"
                className="text-primary hover:underline"
              >
                crie uma atividade
              </Link>
              .
            </p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {atividadesDaFuncao.map((t) => (
                <li key={t.id}>
                  <Link
                    href={`/painel/pessoal/atribuicoes/atividades/${t.id}`}
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
            As atividades do catálogo não são apagadas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ExcluirFuncao id={id} />
        </CardContent>
      </Card>
    </>
  )
}
