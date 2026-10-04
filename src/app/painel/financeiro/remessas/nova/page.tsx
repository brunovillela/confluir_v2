import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { listarContasBancarias, ordensParaRemessa } from "@/lib/db/remessas"

import { NovaRemessaForm } from "./nova-form"

export const metadata: Metadata = { title: "Nova remessa — Confluir" }

export default async function NovaRemessaPage() {
  await requirePermissao("financeiro_pagamento")
  const [{ disponivel, contas }, { ordens }] = await Promise.all([listarContasBancarias(), ordensParaRemessa().catch(() => ({ disponivel: false, ordens: [] }))])
  const ativas = contas.filter((c) => c.ativa)
  const prontas = ordens.filter((o) => o.item && !o.emRemessa).length

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/financeiro/remessas">
            <ArrowLeft />
            Remessas
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Nova remessa</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Ordens &quot;A pagar&quot; com favorecido, CPF/CNPJ e chave Pix, conta ou boleto. O que falta aparece em vermelho; resolva na ordem ou no cadastro do fornecedor e volte aqui.
        </p>
      </div>

      {!disponivel ? (
        <Alert>
          <AlertDescription>Falta rodar o SQL supabase/financeiro-remessas.sql.</AlertDescription>
        </Alert>
      ) : ativas.length === 0 ? (
        <Alert>
          <AlertDescription>
            Cadastre a conta bancária em <Link href="/painel/financeiro/remessas/contas?nova=1" className="underline underline-offset-4">Contas bancárias</Link> antes.
          </AlertDescription>
        </Alert>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ordens a pagar</CardTitle>
            <CardDescription className="text-xs">
              {ordens.length} ordem{ordens.length === 1 ? "" : "ns"} a pagar · {prontas} pronta{prontas === 1 ? "" : "s"} para a remessa. A data de pagamento é o vencimento (ou hoje, se já venceu).
            </CardDescription>
          </CardHeader>
          <CardContent>
            {ordens.length === 0 ? <p className="text-muted-foreground text-sm">Nenhuma ordem a pagar.</p> : <NovaRemessaForm contas={ativas} ordens={ordens} />}
          </CardContent>
        </Card>
      )}
    </>
  )
}
