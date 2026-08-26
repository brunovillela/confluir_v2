import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, BadgeDollarSign, CircleAlert, HandCoins } from "lucide-react"

import { ExtratoCaixa, SituacaoContaBadge } from "@/components/caixa"
import { GrupoColapsavel } from "@/components/grupo-colapsavel"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { detalheContaCaixa } from "@/lib/db/caixa"
import { formatarDataHora, formatarMoeda } from "@/lib/formato"
import { podeAcessar } from "@/lib/permissoes"

import {
  AlternarContaAtiva,
  AporteForm,
  DecisaoPrestacao,
  OcorrenciaAtualizar,
} from "../caixa-forms"

export const metadata: Metadata = { title: "Conta de caixa — Confluir" }

export default async function ContaCaixaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ salvo?: string; criada?: string }>
}) {
  const sessao = await requirePermissao("financeiro_caixa", [
    "financeiro_caixa_admin",
    "financeiro_leitura",
  ])
  const podeEditar = podeAcessar(sessao.permissoes, "financeiro_caixa", [
    "financeiro_caixa_admin",
  ])

  const { id } = await params
  const sp = await searchParams
  const detalhe = await detalheContaCaixa(id)
  if (!detalhe) notFound()
  const { conta, extrato, prestacoes, ocorrencias } = detalhe

  const prestacaoAguardando = prestacoes.find(
    (p) => p.situacao === "aguardando"
  )
  const ocorrenciasAbertas = ocorrencias.filter(
    (o) => o.situacao !== "resolvida"
  )

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/financeiro/caixas">
            <ArrowLeft />
            Contas de caixa
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            {conta.nome}
          </h1>
          <SituacaoContaBadge situacao={conta.situacao} ativa={conta.ativa} />
        </div>
        <p className="text-muted-foreground mt-1 text-xs">
          Responsável: {conta.responsavel ?? "—"} · conta criada em{" "}
          {formatarDataHora(conta.created_at)}
        </p>
      </div>

      {(sp.salvo === "1" || sp.criada === "1") && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>
            {sp.criada === "1"
              ? "Conta de caixa criada — lance o primeiro aporte abaixo."
              : "Registro salvo."}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardDescription>Saldo disponível</CardDescription>
              <BadgeDollarSign className="text-muted-foreground size-4" />
            </div>
            <CardTitle className="text-2xl tabular-nums">
              {formatarMoeda(conta.saldo)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-xs">
              aportes confirmados − compras, perdas e acertos
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardDescription>Aporte aguardando confirmação</CardDescription>
              <HandCoins className="text-muted-foreground size-4" />
            </div>
            <CardTitle className="text-2xl tabular-nums">
              {formatarMoeda(conta.aportePendente)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-xs">
              o responsável precisa confirmar o recebimento
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardDescription>Ocorrências abertas</CardDescription>
              <CircleAlert className="text-muted-foreground size-4" />
            </div>
            <CardTitle className="text-2xl tabular-nums">
              {ocorrenciasAbertas.length.toLocaleString("pt-BR")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-xs">
              relatos de problema com dinheiro
            </p>
          </CardContent>
        </Card>
      </div>

      {prestacaoAguardando && podeEditar && (
        <Card className="border-info/40">
          <CardHeader>
            <CardTitle className="text-base">
              Prestação de contas aguardando aprovação
            </CardTitle>
            <CardDescription>
              Pedida em {formatarDataHora(prestacaoAguardando.created_at)}
              {prestacaoAguardando.saldo_declarado !== null && (
                <>
                  {" "}
                  · saldo declarado pelo responsável:{" "}
                  {formatarMoeda(prestacaoAguardando.saldo_declarado)}
                </>
              )}
              {prestacaoAguardando.observacao && (
                <> · “{prestacaoAguardando.observacao}”</>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DecisaoPrestacao
              contaId={conta.id}
              prestacaoId={prestacaoAguardando.id}
            />
          </CardContent>
        </Card>
      )}

      {podeEditar && (
        <GrupoColapsavel
          titulo="Lançar aporte de verba"
          descricao="O valor fica pendente até o responsável confirmar o recebimento"
        >
          <AporteForm contaId={conta.id} />
        </GrupoColapsavel>
      )}

      {ocorrencias.length > 0 && (
        <GrupoColapsavel
          titulo="Ocorrências"
          descricao="Relatos de problema com dinheiro desta conta"
          resumo={
            ocorrenciasAbertas.length > 0 ? (
              <Badge
                variant="outline"
                className="text-destructive border-destructive/40 tabular-nums"
              >
                {ocorrenciasAbertas.length} aberta
                {ocorrenciasAbertas.length === 1 ? "" : "s"}
              </Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground">
                Todas resolvidas
              </Badge>
            )
          }
          aberto={ocorrenciasAbertas.length > 0}
        >
          <ul className="grid gap-3">
            {ocorrencias.map((o) => (
              <li key={o.id} className="rounded-lg border px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="min-w-0">
                    <span className="block font-medium">{o.descricao}</span>
                    <span className="text-muted-foreground block text-xs">
                      {[
                        o.responsavel && `relatado por ${o.responsavel}`,
                        formatarDataHora(o.created_at),
                        o.valor !== null && formatarMoeda(o.valor),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  <Badge
                    variant="outline"
                    className={
                      o.situacao === "resolvida"
                        ? "border-success/40 text-success-fg"
                        : o.situacao === "em_investigacao"
                          ? "border-warning/40 text-warning-fg"
                          : "text-destructive border-destructive/40"
                    }
                  >
                    {o.situacao === "resolvida"
                      ? "Resolvida"
                      : o.situacao === "em_investigacao"
                        ? "Em investigação"
                        : "Aberta"}
                  </Badge>
                </div>
                {o.resolucao && (
                  <p className="text-muted-foreground mt-1.5 text-sm">
                    Resolução: {o.resolucao}
                  </p>
                )}
                {o.situacao !== "resolvida" && podeEditar && (
                  <OcorrenciaAtualizar contaId={conta.id} ocorrenciaId={o.id} />
                )}
              </li>
            ))}
          </ul>
        </GrupoColapsavel>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Extrato</CardTitle>
          <CardDescription>
            Todas as movimentações com data e hora
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ExtratoCaixa extrato={extrato} />
        </CardContent>
      </Card>

      {prestacoes.length > 0 && (
        <GrupoColapsavel
          titulo="Histórico de prestações de contas"
          resumo={
            <Badge variant="outline" className="text-muted-foreground tabular-nums">
              {prestacoes.length}
            </Badge>
          }
        >
          <ul className="grid gap-2">
            {prestacoes.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
              >
                <span className="min-w-0">
                  <span className="block">
                    Pedida em {formatarDataHora(p.created_at)}
                    {p.decidida_em && (
                      <> · decidida em {formatarDataHora(p.decidida_em)}</>
                    )}
                  </span>
                  {(p.observacao || p.observacao_financeiro) && (
                    <span className="text-muted-foreground block text-xs">
                      {[p.observacao, p.observacao_financeiro]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  )}
                </span>
                <Badge
                  variant="outline"
                  className={
                    p.situacao === "aprovada"
                      ? "border-success/40 text-success-fg"
                      : p.situacao === "rejeitada"
                        ? "text-destructive border-destructive/40"
                        : "border-info/40 text-info-fg"
                  }
                >
                  {p.situacao === "aprovada"
                    ? "Aprovada"
                    : p.situacao === "rejeitada"
                      ? "Rejeitada"
                      : "Aguardando"}
                </Badge>
              </li>
            ))}
          </ul>
        </GrupoColapsavel>
      )}

      {podeEditar && (
        <div className="border-t pt-4">
          <AlternarContaAtiva contaId={conta.id} ativa={conta.ativa} />
        </div>
      )}
    </>
  )
}
