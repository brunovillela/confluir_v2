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
import { listarItens, situacaoDaFrota } from "@/lib/db/veiculos-checklist"

import { ChecklistForm } from "../checklist-forms"

export const metadata: Metadata = { title: "Realizar checklist — Confluir" }

export default async function NovoChecklistPage({
  searchParams,
}: {
  searchParams: Promise<{ veiculo?: string }>
}) {
  // Quem realiza é o funcionário dedicado à verificação — não qualquer pessoa
  // com acesso a Veículos. A gestão da frota entra como retaguarda.
  await requirePermissao("veiculos_checklist", ["veiculos_gestao"])
  const { veiculo } = await searchParams

  const [{ ativo, linhas: frota }, itens] = await Promise.all([
    situacaoDaFrota(),
    listarItens(true),
  ])

  const fixo = veiculo ? frota.find((v) => v.id === veiculo) : undefined

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
          Realizar checklist
        </h1>
        <p className="text-muted-foreground mt-1 text-xs">
          {fixo
            ? fixo.rotulo
            : "Confira o veículo item a item antes de colocá-lo em rota."}
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
        <Card>
          <CardHeader>
            <CardTitle>Verificação</CardTitle>
            <CardDescription>
              Todo item precisa de resposta. Use &quot;não se aplica&quot; quando
              o veículo não tiver aquele sistema.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChecklistForm
              veiculos={frota.map((v) => ({
                id: v.id,
                rotulo: v.rotulo,
                vencido: v.situacao.vencido,
              }))}
              itens={itens.map((i) => ({
                id: i.id,
                categoria: i.categoria,
                itens_verificar: i.itens_verificar,
                proposito: i.proposito,
                ordem: i.ordem,
                ativo: i.ativo,
              }))}
              veiculoFixo={fixo?.id}
            />
          </CardContent>
        </Card>
      )}
    </>
  )
}
