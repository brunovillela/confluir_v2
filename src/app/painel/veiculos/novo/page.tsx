import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { nomesDasSedes } from "@/lib/db/organizacao"
import { listarContratos } from "@/lib/db/veiculos"

import { criarVeiculoAction } from "../actions"
import { VeiculoForm } from "../veiculo-form"

export const metadata: Metadata = { title: "Novo veículo — Confluir" }

export default async function NovoVeiculoPage() {
  await requirePermissao("veiculos_gestao")
  const [{ contratos }, sedes] = await Promise.all([
    listarContratos({ situacao: "vigentes" }),
    nomesDasSedes(),
  ])

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2">
          <Link href="/painel/veiculos">
            <ArrowLeft />
            Veículos
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Novo veículo</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Cadastro na frota — vincule um contrato de aluguel se for alugado
        </p>
      </div>
      <Card>
        <CardContent>
          <VeiculoForm
            action={criarVeiculoAction}
            sedes={sedes}
            contratos={contratos.map((c) => ({
              id: c.id,
              rotulo: `${c.numero ?? "(sem número)"} — ${c.fornecedorNome ?? "locadora"}`,
            }))}
          />
        </CardContent>
      </Card>
    </>
  )
}
