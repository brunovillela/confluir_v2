import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { Button } from "@/components/ui/button"
import { requirePermissao } from "@/lib/auth"
import {
  listarDepartamentos,
  listarFornecedores,
  listarProjetosAbertos,
} from "@/lib/db/compras"
import { listarCentrosCusto } from "@/lib/db/financeiro"

import { NovaCompraForm } from "./nova-compra-form"

export const metadata: Metadata = { title: "Nova compra — Confluir" }

export default async function NovaCompraPage() {
  await requirePermissao("aquisicoes_compras", ["aquisicoes_compras_edicao"])

  const [departamentos, centros, projetos, fornecedores] = await Promise.all([
    listarDepartamentos(),
    listarCentrosCusto(),
    listarProjetosAbertos(),
    listarFornecedores(),
  ])

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/compras">
            <ArrowLeft />
            Compras
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Nova compra</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Solicitação via setor de compras ou registro de aquisição direta
        </p>
      </div>

      <NovaCompraForm
        departamentos={departamentos}
        centrosCusto={centros
          .filter((c) => c.usavel !== false)
          .map((c) => ({
            id: c.id,
            nome: [c.classificador, c.nome_da_conta].filter(Boolean).join(" - "),
          }))}
        projetos={projetos}
        fornecedores={fornecedores.map((f) => ({
          id: f.id,
          nome: f.nome,
          cnpj_cpf: f.cnpj_cpf,
          bloqueado: f.bloqueado,
        }))}
      />
    </>
  )
}
