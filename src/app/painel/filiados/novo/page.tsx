import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { Button } from "@/components/ui/button"
import { requirePermissao } from "@/lib/auth"
import { listarFontesPagadoras } from "@/lib/db/fontes"

import { NovaFiliacaoForm } from "./nova-filiacao-form"

export const metadata: Metadata = { title: "Nova filiação — Confluir" }

export default async function NovaFiliacaoPage() {
  await requirePermissao("filiacao_gestao")

  const fontes = await listarFontesPagadoras()

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/filiados">
            <ArrowLeft />
            Filiados
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">
          Nova filiação
        </h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Registra um novo filiado — CPF é a identidade e não pode repetir.
        </p>
      </div>
      <NovaFiliacaoForm
        fontes={fontes
          .filter((f) => f.inativa !== true)
          .map((f) => ({
            id: f.id,
            nome: f.nome_fantasia ?? f.nome_razao ?? "(sem nome)",
          }))}
      />
    </>
  )
}
