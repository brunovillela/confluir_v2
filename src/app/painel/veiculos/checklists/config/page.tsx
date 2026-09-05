import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { GrupoColapsavel } from "@/components/grupo-colapsavel"
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
import { listarItens, obterConfig } from "@/lib/db/veiculos-checklist"

import { ConfigForm, ItemEditavel, NovoItemForm } from "../checklist-forms"

export const metadata: Metadata = {
  title: "Configuração do checklist — Confluir",
}

export default async function ConfigChecklistPage() {
  await requirePermissao("veiculos_gestao")
  const [{ ativo, config }, itens] = await Promise.all([
    obterConfig(),
    listarItens(),
  ])

  return (
    <>
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3">
          <Link href="/painel/veiculos/checklists">
            <ArrowLeft />
            Checklist da frota
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">
          Configuração do checklist
        </h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Com que frequência a verificação é exigida e o que deve ser
          verificado.
        </p>
      </div>

      {!ativo ? (
        <Alert variant="destructive">
          <AlertDescription>
            As tabelas do checklist ainda não existem no banco. Rode
            <code className="mx-1">supabase/veiculos-checklist.sql</code>
            no SQL Editor do Supabase.
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Recorrência</CardTitle>
              <CardDescription>
                O prazo padrão da frota. Um veículo que roda mais pode ter prazo
                próprio, definido na página dele.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ConfigForm inicial={config} />
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <GrupoColapsavel
                titulo="Novo item de verificação"
                descricao="Acrescente o que a sua frota exige — quinta roda, baú refrigerado, sirene."
              >
                <div className="pt-2">
                  <NovoItemForm />
                </div>
              </GrupoColapsavel>
            </CardContent>
          </Card>

          <div>
            <h2 className="mb-3 text-sm font-medium">
              Itens verificados ({itens.filter((i) => i.ativo).length} ativos de{" "}
              {itens.length})
            </h2>
            <div className="grid gap-3">
              {itens.map((i) => (
                <ItemEditavel
                  key={i.id}
                  item={{
                    id: i.id,
                    categoria: i.categoria,
                    itens_verificar: i.itens_verificar,
                    proposito: i.proposito,
                    ordem: i.ordem,
                    ativo: i.ativo,
                  }}
                />
              ))}
            </div>
          </div>
        </>
      )}
    </>
  )
}
