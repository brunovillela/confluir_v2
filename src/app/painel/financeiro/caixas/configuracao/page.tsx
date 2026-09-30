import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

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
import { listarCentrosCusto } from "@/lib/db/financeiro"
import { obterConfigFinanceiro } from "@/lib/db/ordens-ciclo"

import { ConfigCaixaForm } from "../config-caixa-form"

export const metadata: Metadata = { title: "Configuração do caixa — Confluir" }

/** Edição do centro de custo do caixa (débito das compras pagas em dinheiro). */
export default async function ConfiguracaoCaixaPage() {
  await requirePermissao("financeiro_caixa_admin", ["financeiro_pagamento"])
  const [config, centros] = await Promise.all([obterConfigFinanceiro(), listarCentrosCusto()])

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/financeiro/caixas">
            <ArrowLeft />
            Contas de caixa
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Configuração do caixa</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Como as compras pagas em dinheiro entram na contabilidade
        </p>
      </div>

      {!config.disponivel ? (
        <Alert variant="destructive">
          <AlertDescription>
            Rode <code>supabase/ordens-auditoria.sql</code> no Supabase para habilitar
            esta configuração.
          </AlertDescription>
        </Alert>
      ) : (
        <Card className="max-w-3xl">
          <CardHeader>
            <CardTitle className="text-base">Compras pagas em dinheiro</CardTitle>
            <CardDescription>
              Em que conta contábil cai o débito do dinheiro que sai do caixa
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ConfigCaixaForm
              atual={config.centroCustoCaixaId}
              centros={centros
                .filter((c) => c.usavel !== false)
                .map((c) => ({
                  id: c.id,
                  rotulo: [c.acesso, c.nome_da_conta ?? "(sem nome)"].filter(Boolean).join(" — "),
                }))}
            />
          </CardContent>
        </Card>
      )}
    </>
  )
}
