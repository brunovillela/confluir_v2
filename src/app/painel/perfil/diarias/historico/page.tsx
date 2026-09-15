import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, History } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  DadosRemessa,
  LancamentosRemessa,
  periodoRemessa,
  SituacaoRemessaBadge,
} from "@/components/diarias-historico"
import { requireSessaoPainel } from "@/lib/auth"
import { lancamentosDasRemessas, listarRemessasDiaria } from "@/lib/db/diarias-historico"
import { formatarMoeda } from "@/lib/formato"

export const metadata: Metadata = { title: "Diárias anteriores — Confluir" }

/**
 * Autosserviço: as PRÓPRIAS remessas do sistema anterior. Aberto a qualquer
 * usuário do painel — no Bubble quem lançava diária eram sobretudo diretores,
 * que não passam pelo `exigirFuncionario` de Minhas diárias.
 */
export default async function DiariasAnterioresPage() {
  const { usuario } = await requireSessaoPainel()
  const { remessas } = await listarRemessasDiaria({ beneficiarioId: usuario.id as string })
  const lancamentos = await lancamentosDasRemessas(remessas.map((r) => r.id))
  const total = remessas.reduce((s, r) => s + (r.valorTotal ?? 0), 0)

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/perfil">
            <ArrowLeft />
            Meu perfil
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Diárias anteriores</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Remessas lançadas no sistema anterior — {remessas.length} remessa{remessas.length === 1 ? "" : "s"} ·{" "}
          {formatarMoeda(total)}
        </p>
      </div>

      {remessas.length === 0 && (
        <Card>
          <CardContent className="text-muted-foreground flex flex-col items-center gap-2 py-10 text-center text-sm">
            <History className="size-6" />
            Nenhuma diária sua no sistema anterior.
          </CardContent>
        </Card>
      )}

      {remessas.map((r) => {
        const dias = lancamentos.get(r.id) ?? []
        return (
          <Card key={r.id}>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-base">{periodoRemessa(r)}</CardTitle>
                <SituacaoRemessaBadge remessa={r} />
              </div>
              <CardDescription>
                {dias.length} lançamento{dias.length === 1 ? "" : "s"} · {formatarMoeda(r.valorTotal)}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <DadosRemessa remessa={r} linkOrdem={false} />
              <details>
                <summary className="text-primary cursor-pointer text-sm font-medium">Ver lançamentos</summary>
                <div className="mt-3">
                  <LancamentosRemessa lancamentos={dias} />
                </div>
              </details>
            </CardContent>
          </Card>
        )
      })}
    </>
  )
}
