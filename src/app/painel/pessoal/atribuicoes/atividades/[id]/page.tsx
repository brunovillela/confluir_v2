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

import { ExcluirAtividade } from "./excluir-atividade"
import {
  BotaoAnalisarIA,
  BotaoAvaliarAtividade,
  SecaoExecutores,
  SecaoFerramentas,
  SecaoMedidas,
  SecaoPerigos,
  SecaoRiscos,
} from "./secoes"
import { AtividadeForm } from "../atividade-form"

export const metadata: Metadata = { title: "Atividade — Confluir" }

export default async function AtividadePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ salvo?: string }>
}) {
  await requirePermissao("pessoal_gestao")
  const { id } = await params
  const { salvo } = await searchParams

  const atividade = await buscarAtividade(id)
  if (!atividade) notFound()

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
          <Link href="/painel/pessoal/atribuicoes/atividades">
            <ArrowLeft />
            Atividades
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">
          {atividade.nome ?? "(sem nome)"}
        </h1>
        <p className="text-muted-foreground mt-1 text-xs">
          {atividade.executores} executor{atividade.executores === 1 ? "" : "es"} ·{" "}
          {atividade.perigos} perigo{atividade.perigos === 1 ? "" : "s"} ·{" "}
          {atividade.riscos} risco{atividade.riscos === 1 ? "" : "s"} avaliado
          {atividade.riscos === 1 ? "" : "s"} por executor
        </p>
      </div>

      {salvo === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Atividade criada.</AlertDescription>
        </Alert>
      )}

      {/* Dados básicos da atividade (catálogo) */}
      <AtividadeForm
        atividade={{
          id: atividade.id,
          nome: atividade.nome,
          descricao: atividade.descricao,
          presenca: atividade.presenca,
          observacoes: atividade.observacoes,
        }}
      />

      {/* Executores: tempo médio/mês, recorrência e frequência POR PESSOA */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Executores — tempo e recorrência por pessoa
          </CardTitle>
          <CardDescription>
            Quem executa a atividade — funcionário OU prestador de serviço
            (fornecedor) — com o tempo médio/mês e a recorrência de cada um.
            Funcionários entram na Ordem de Serviço (NR-01); prestadores, no
            Comunicado de SST.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SecaoExecutores
            atividadeId={id}
            executores={atividade.executoresLista}
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
            O que é necessário para executar a atividade (computador, sistema,
            ferramenta manual, etc).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SecaoFerramentas
            atividadeId={id}
            ferramentas={atividade.ferramentas}
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
                Perigos (NRs) são inerentes à ATIVIDADE. O risco (probabilidade ×
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
            <SecaoPerigos atividadeId={id} perigos={atividade.perigosLista} />
          </div>
          <div>
            <p className="mb-2 text-sm font-medium">
              Riscos ocupacionais por executor (bruto e residual)
            </p>
            <SecaoRiscos
              atividadeId={id}
              riscos={atividade.riscosLista}
              perigos={atividade.perigosLista}
              executores={atividade.executoresLista}
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
            Mitigadores da atividade: treinamentos necessários (com recorrência) e
            EPIs. Ambos reduzem o risco ao patamar residual.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SecaoMedidas
            atividadeId={id}
            medidas={atividade.medidas}
            treinamentos={treinamentos.map((t) => ({
              id: t.id,
              nome: t.treinamento,
            }))}
          />
        </CardContent>
      </Card>

      {/* Revalidação anual da avaliação SST da atividade */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Avaliação SST da atividade</CardTitle>
          <CardDescription>
            Carimba a data da avaliação. O sistema alerta quando passar de 12
            meses (revalidação anual).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BotaoAvaliarAtividade atividadeId={id} avaliadaEm={atividade.avaliada_em} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-destructive text-base">
            <Trash2 className="mr-1 inline size-4 align-[-3px]" />
            Excluir atividade
          </CardTitle>
          <CardDescription>
            Remove a atividade e toda a árvore SST (ferramentas, perigos, riscos,
            medidas e executores).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ExcluirAtividade id={id} />
        </CardContent>
      </Card>
    </>
  )
}
