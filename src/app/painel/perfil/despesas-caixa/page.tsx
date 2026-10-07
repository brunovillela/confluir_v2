import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, HandCoins, Wallet } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { requireSessaoPainel } from "@/lib/auth"
import { contasAbertasParaCompras } from "@/lib/db/caixa"
import { despesasLancadasEmAberto, despesasParaReconhecer, type DespesaCaixa } from "@/lib/db/caixa-reconhecimento"
import { formatarDataHora, formatarMoeda } from "@/lib/formato"

import { AvaliarDespesa, TransferirDespesa } from "./formularios"

export const metadata: Metadata = { title: "Despesas em caixas — Confluir" }

/**
 * Meu perfil → Despesas em caixas (06/10/2026): o responsável de uma conta
 * reconhece (ou não) o que outras pessoas lançaram nela; quem lançou vê o que
 * espera reconhecimento e transfere para a conta certa o que não foi
 * reconhecido. Ver lib/db/caixa-reconhecimento.ts.
 */
export default async function DespesasCaixaPage() {
  const sessao = await requireSessaoPainel()
  const uid = String(sessao.usuario.id)
  const [paraMim, minhas, contas] = await Promise.all([
    despesasParaReconhecer(uid),
    despesasLancadasEmAberto(uid),
    contasAbertasParaCompras().catch(() => []),
  ])
  const disponivel = paraMim.disponivel && minhas.disponivel

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/perfil">
            <ArrowLeft />
            Meu perfil
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <HandCoins className="text-muted-foreground size-5" />
          <h1 className="text-2xl font-semibold tracking-tight">Despesas em caixas</h1>
        </div>
        <p className="text-muted-foreground mt-1 text-xs">
          Compra em dinheiro lançada na conta de caixa de outra pessoa espera o reconhecimento do responsável. Até lá, a
          ordem fica com um alerta de auditoria.
        </p>
      </div>

      {!disponivel && (
        <Alert variant="destructive">
          <AlertDescription>
            Falta rodar <code>supabase/caixa-reconhecimento.sql</code> no Supabase.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lançadas na sua conta por outras pessoas</CardTitle>
          <CardDescription>
            Reconheça se o dinheiro saiu mesmo do seu caixa. Se não reconhecer, diga o motivo: quem lançou é avisado para
            transferir a despesa para a conta certa.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          {paraMim.lista.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nada esperando o seu reconhecimento.</p>
          ) : (
            paraMim.lista.map((d) => (
              <Linha key={d.id} d={d} quem={`lançada por ${d.lancadaPorNome ?? "—"}`}>
                <AvaliarDespesa id={d.id} resumo={`de ${formatarMoeda(d.valor)} (${d.descricao ?? "sem descrição"})`} />
              </Linha>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lançadas por você em caixas de outras pessoas</CardTitle>
          <CardDescription>
            Esperando o reconhecimento do responsável — ou não reconhecidas, para transferir para a conta certa.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          {minhas.lista.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nenhuma despesa sua em aberto.</p>
          ) : (
            minhas.lista.map((d) => (
              <Linha
                key={d.id}
                d={d}
                quem={`no caixa de ${d.responsavelNome ?? "—"}`}
                selo={
                  d.reconhecimento === "nao_reconhecida" ? (
                    <Badge variant="outline" className="border-destructive/40 text-destructive">
                      Não reconhecida
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-warning/40 text-warning-fg">
                      Aguardando reconhecimento
                    </Badge>
                  )
                }
                motivo={d.motivo}
              >
                <TransferirDespesa
                  id={d.id}
                  contas={contas
                    .filter((c) => c.id !== d.contaId)
                    .map((c) => ({ id: c.id, rotulo: `${c.nome}${c.responsavel ? ` — ${c.responsavel}` : ""} (${formatarMoeda(c.saldo)})` }))}
                />
              </Linha>
            ))
          )}
        </CardContent>
      </Card>
    </>
  )
}

function Linha({
  d,
  quem,
  selo,
  motivo,
  children,
}: {
  d: DespesaCaixa
  quem: string
  selo?: React.ReactNode
  motivo?: string | null
  children: React.ReactNode
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-md border p-3">
      <div className="min-w-0 flex-1 basis-64">
        <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
          <Wallet className="text-muted-foreground size-4" />
          <span className="tabular-nums">{formatarMoeda(d.valor)}</span>
          <span className="text-muted-foreground font-normal">
            · {d.contaNome ?? "caixa"} · {quem}
          </span>
          {selo}
        </p>
        <p className="text-muted-foreground mt-0.5 text-xs">
          {d.descricao ?? "—"}
          {d.ordemCodigo ? ` · ordem ${d.ordemCodigo}` : ""} · {formatarDataHora(d.criadaEm)}
        </p>
        {motivo && <p className="text-destructive mt-1 text-xs">Motivo: {motivo}</p>}
      </div>
      {children}
    </div>
  )
}
