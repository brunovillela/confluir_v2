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
import { requirePermissao } from "@/lib/auth"
import { listarFornecedores } from "@/lib/db/compras"
import { listarFuncionarios } from "@/lib/db/pessoal"
import { buscarAtividade, obterLimiarRotina } from "@/lib/db/pessoal-sst"
import { listarTreinamentos } from "@/lib/db/treinamentos"

import { ExcluirTarefa } from "./excluir-tarefa"
import {
  BotaoAnalisarIA,
  BotaoAvaliarTarefa,
  SecaoExecutores,
  SecaoFerramentas,
  SecaoMedidas,
  SecaoPerigos,
  SecaoRiscos,
} from "./secoes"
import { TarefaForm } from "../tarefa-form"

export const metadata: Metadata = { title: "Tarefa — Confluir" }

export default async function TarefaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ salvo?: string }>
}) {
  await requirePermissao("pessoal_gestao")
  const { id } = await params
  const { salvo } = await searchParams

  const tarefa = await buscarAtividade(id)
  if (!tarefa) notFound()

  const [funcionarios, treinamentos, limiar, fornecedores] = await Promise.all([
    listarFuncionarios({ situacao: "ativos" }),
    listarTreinamentos(),
    obterLimiarRotina(),
    listarFornecedores(),
  ])

  const opcoes = funcionarios.linhas.map((l) => ({
    usuarioId: l.usuarioId,
    nome: l.nome,
  }))
  const opcoesFornecedores = fornecedores
    .filter((f) => !f.bloqueado)
    .map((f) => ({ id: f.id, nome: f.nome }))

  return (
    <>
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3">
          <Link href="/painel/pessoal/atribuicoes/tarefas">
            <ArrowLeft />
            Tarefas
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">
          {tarefa.nome ?? "(sem nome)"}
        </h1>
        <p className="text-muted-foreground mt-1 text-xs">
          {tarefa.executores} executor{tarefa.executores === 1 ? "" : "es"} ·{" "}
          {tarefa.perigos} perigo{tarefa.perigos === 1 ? "" : "s"} ·{" "}
          {tarefa.riscos} risco{tarefa.riscos === 1 ? "" : "s"} avaliado
          {tarefa.riscos === 1 ? "" : "s"} por executor
        </p>
      </div>

      {salvo === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Tarefa criada.</AlertDescription>
        </Alert>
      )}

      {/* Dados básicos da tarefa (catálogo) */}
      <TarefaForm
        tarefa={{
          id: tarefa.id,
          nome: tarefa.nome,
          descricao: tarefa.descricao,
          presenca: tarefa.presenca,
          observacoes: tarefa.observacoes,
        }}
      />

      {/* Executores: tempo médio/mês, recorrência e frequência POR PESSOA */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Executores — tempo e recorrência por pessoa
          </CardTitle>
          <CardDescription>
            Quem executa a tarefa — funcionário OU prestador de serviço
            (fornecedor) — com o tempo médio/mês e a recorrência de cada um.
            Funcionários entram na Ordem de Serviço (NR-01); prestadores, no
            Comunicado de SST.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SecaoExecutores
            atividadeId={id}
            executores={tarefa.executoresLista}
            opcoes={opcoes}
            fornecedores={opcoesFornecedores}
            limiar={limiar}
          />
        </CardContent>
      </Card>

      {/* Nível 6 — ferramentas e equipamentos */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Ferramentas e equipamentos
          </CardTitle>
          <CardDescription>
            O que é necessário para executar a tarefa (computador, sistema,
            ferramenta manual, etc).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SecaoFerramentas
            atividadeId={id}
            ferramentas={tarefa.ferramentas}
          />
        </CardContent>
      </Card>

      {/* Níveis 7, 8 e 10 — perigos, riscos e residual (juntos) */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base">
                <ShieldAlert className="mr-1 inline size-4 align-[-3px]" />
                Perigos e riscos ocupacionais
              </CardTitle>
              <CardDescription>
                Perigos (NRs) são inerentes à TAREFA. O risco (probabilidade ×
                severidade, bruto e residual) é avaliado POR EXECUTOR — quem tem
                mais tempo de exposição tem mais probabilidade.
              </CardDescription>
            </div>
            <BotaoAnalisarIA atividadeId={id} />
          </div>
        </CardHeader>
        <CardContent className="grid gap-6">
          <div>
            <p className="mb-2 text-sm font-medium">Perigos associados</p>
            <SecaoPerigos atividadeId={id} perigos={tarefa.perigosLista} />
          </div>
          <div>
            <p className="mb-2 text-sm font-medium">
              Riscos ocupacionais por executor (bruto e residual)
            </p>
            <SecaoRiscos
              atividadeId={id}
              riscos={tarefa.riscosLista}
              perigos={tarefa.perigosLista}
              executores={tarefa.executoresLista}
            />
          </div>
        </CardContent>
      </Card>

      {/* Nível 9 — treinamentos e EPI */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Treinamentos e EPI (medidas)
          </CardTitle>
          <CardDescription>
            Mitigadores da tarefa: treinamentos necessários (com recorrência) e
            EPIs. Ambos reduzem o risco ao patamar residual.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SecaoMedidas
            atividadeId={id}
            medidas={tarefa.medidas}
            treinamentos={treinamentos.map((t) => ({
              id: t.id,
              nome: t.treinamento,
            }))}
          />
        </CardContent>
      </Card>

      {/* Revalidação anual da avaliação SST da tarefa */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Avaliação SST da tarefa</CardTitle>
          <CardDescription>
            Carimba a data da avaliação. O sistema alerta quando passar de 12
            meses (revalidação anual).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BotaoAvaliarTarefa atividadeId={id} avaliadaEm={tarefa.avaliada_em} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-destructive text-base">
            <Trash2 className="mr-1 inline size-4 align-[-3px]" />
            Excluir tarefa
          </CardTitle>
          <CardDescription>
            Remove a tarefa e toda a árvore SST (ferramentas, perigos, riscos,
            medidas e executores).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ExcluirTarefa id={id} />
        </CardContent>
      </Card>
    </>
  )
}
