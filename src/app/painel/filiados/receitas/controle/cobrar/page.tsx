import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, Contact } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { empresasACobrar } from "@/lib/db/repasse-cobranca"

import { CobrarLote } from "./cobrar-lote"

export const metadata: Metadata = { title: "Cobrar atrasadas — Confluir" }

export default async function CobrarAtrasadasPage() {
  await requirePermissao("filiacao_receitas", ["filiacao_gestao"])
  const { ativo, empresas } = await empresasACobrar()
  const semContato = empresas.filter((e) => !e.contatos.some((c) => c.email)).length
  const tipos = new Set(empresas.flatMap((e) => e.itens.map((i) => i.tipo)))

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/filiados/receitas/controle">
            <ArrowLeft />
            Controle de envio
          </Link>
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Cobrar atrasadas</h1>
            <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
              Empresas com relação ou depósito atrasado nos últimos 12 meses. Um e-mail por empresa, com tudo o que falta.
            </p>
          </div>
          {semContato > 0 && (
            <Button variant="outline" asChild>
              <Link href="/painel/filiados/receitas/controle/contatos">
                <Contact />
                Contatos da folha
              </Link>
            </Button>
          )}
        </div>
      </div>

      {!ativo ? (
        <Alert>
          <AlertDescription>
            O controle não está ativado: defina o mês de início em{" "}
            <Link href="/painel/filiados/receitas/controle/prazos" className="font-medium underline">
              Prazos e tipos
            </Link>
            .
          </AlertDescription>
        </Alert>
      ) : empresas.length === 0 ? (
        <Alert className="border-success/40">
          <AlertDescription>Nenhuma empresa com relação ou depósito atrasado.</AlertDescription>
        </Alert>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{empresas.length} empresa(s) com atraso</CardTitle>
            <CardDescription>
              {semContato > 0
                ? `${semContato} sem contato da folha com e-mail: cadastre o contato para incluí-las.`
                : "Todas têm contato da folha com e-mail."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CobrarLote empresas={empresas} mostrarTipo={tipos.size > 1} />
          </CardContent>
        </Card>
      )}
    </>
  )
}
