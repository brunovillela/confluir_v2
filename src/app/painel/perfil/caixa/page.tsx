import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, Wallet } from "lucide-react"

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
import { requireSessaoPainel } from "@/lib/auth"
import { contaDoUsuario } from "@/lib/db/caixa"
import { formatarDataHora, formatarMoeda } from "@/lib/formato"

import {
  ConfirmarAporte,
  PrestarContas,
  RegistrarCompra,
  RelatarPerda,
} from "./meu-caixa-acoes"

export const metadata: Metadata = { title: "Meu caixa — Confluir" }

export default async function MeuCaixaPage({
  searchParams,
}: {
  searchParams: Promise<{ salvo?: string }>
}) {
  const sessao = await requireSessaoPainel()
  const { salvo } = await searchParams
  const { disponivel, detalhe } = await contaDoUsuario(sessao.usuario.id)

  if (!disponivel) {
    return (
      <>
        <h1 className="text-2xl font-semibold tracking-tight">Meu caixa</h1>
        <Alert variant="destructive">
          <AlertDescription>
            As tabelas do caixa ainda não existem — peça ao Financeiro para
            rodar <code>supabase/caixa.sql</code> no SQL Editor do Supabase.
          </AlertDescription>
        </Alert>
      </>
    )
  }

  if (!detalhe) {
    return (
      <>
        <div>
          <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
            <Link href="/painel">
              <ArrowLeft />
              Painel
            </Link>
          </Button>
          <h1 className="text-2xl font-semibold tracking-tight">Meu caixa</h1>
        </div>
        <Card>
          <CardContent className="text-muted-foreground flex flex-col items-center gap-2 py-10 text-center text-sm">
            <Wallet className="size-6" />
            <p>
              Você não tem uma conta de caixa. Quem autoriza contas é o
              Financeiro.
            </p>
          </CardContent>
        </Card>
      </>
    )
  }

  const { conta, extrato, prestacoes, ocorrencias } = detalhe
  const aportesPendentes = extrato.filter(
    (m) => m.tipo === "aporte" && m.situacao === "pendente"
  )
  const prestacaoAguardando = prestacoes.find(
    (p) => p.situacao === "aguardando"
  )
  const ultimaRejeitada = prestacoes.find((p) => p.situacao === "rejeitada")

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel">
            <ArrowLeft />
            Painel
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            Meu caixa — {conta.nome}
          </h1>
          <SituacaoContaBadge situacao={conta.situacao} ativa={conta.ativa} />
        </div>
      </div>

      {salvo === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Registro salvo.</AlertDescription>
        </Alert>
      )}

      {/* Saldo em destaque (padrão app de banco) */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardDescription>Saldo disponível</CardDescription>
            <Wallet className="text-muted-foreground size-4" />
          </div>
          <CardTitle className="text-4xl tabular-nums">
            {formatarMoeda(conta.saldo)}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-xs">
            {conta.situacao === "aberta"
              ? "Verba liberada para compras em dinheiro."
              : conta.situacao === "prestacao_pendente"
                ? "Conta travada — prestação de contas aguardando o Financeiro."
                : "Conta fechada — aguarde um novo aporte do Financeiro."}
          </p>
        </CardContent>
      </Card>

      {aportesPendentes.map((m) => (
        <Card key={m.id} className="border-warning/40">
          <CardHeader>
            <CardTitle className="text-base">
              Aporte aguardando a sua confirmação
            </CardTitle>
            <CardDescription>
              Lançado em {formatarDataHora(m.created_at)}
              {m.descricao && <> · {m.descricao}</>} — confirme apenas depois
              de receber o dinheiro em mãos.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ConfirmarAporte
              movimentacaoId={m.id}
              valor={formatarMoeda(m.valor)}
            />
          </CardContent>
        </Card>
      ))}

      {prestacaoAguardando && (
        <Alert className="border-info/40 text-info-fg">
          <AlertDescription>
            Sua prestação de contas de{" "}
            {formatarDataHora(prestacaoAguardando.created_at)} está com o
            Financeiro para conferência.
          </AlertDescription>
        </Alert>
      )}
      {!prestacaoAguardando && ultimaRejeitada?.observacao_financeiro && (
        <Alert variant="destructive">
          <AlertDescription>
            Última prestação rejeitada pelo Financeiro:{" "}
            {ultimaRejeitada.observacao_financeiro}
          </AlertDescription>
        </Alert>
      )}

      {conta.situacao === "aberta" && (
        <GrupoColapsavel
          titulo="Registrar compra"
          descricao="Compra do dia a dia paga em dinheiro com a verba do caixa"
        >
          <RegistrarCompra />
        </GrupoColapsavel>
      )}

      {conta.situacao === "aberta" && (
        <GrupoColapsavel
          titulo="Prestar contas"
          descricao="Fecha o ciclo: o Financeiro confere o dinheiro e as despesas"
        >
          <PrestarContas />
        </GrupoColapsavel>
      )}

      <GrupoColapsavel
        titulo="Relatar problema com dinheiro"
        descricao="Perda, extravio ou diferença — abre investigação do Financeiro"
        resumo={
          ocorrencias.filter((o) => o.situacao !== "resolvida").length > 0 ? (
            <Badge
              variant="outline"
              className="text-destructive border-destructive/40 tabular-nums"
            >
              {ocorrencias.filter((o) => o.situacao !== "resolvida").length} em
              aberto
            </Badge>
          ) : undefined
        }
      >
        <div className="grid gap-4">
          <RelatarPerda />
          {ocorrencias.length > 0 && (
            <ul className="grid gap-2 border-t pt-3">
              {ocorrencias.map((o) => (
                <li
                  key={o.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
                >
                  <span className="min-w-0">
                    <span className="block truncate">{o.descricao}</span>
                    <span className="text-muted-foreground block text-xs">
                      {formatarDataHora(o.created_at)}
                      {o.resolucao && <> · {o.resolucao}</>}
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
                </li>
              ))}
            </ul>
          )}
        </div>
      </GrupoColapsavel>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Extrato</CardTitle>
          <CardDescription>
            Aportes, compras e acertos com data e hora
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ExtratoCaixa extrato={extrato} />
        </CardContent>
      </Card>
    </>
  )
}
