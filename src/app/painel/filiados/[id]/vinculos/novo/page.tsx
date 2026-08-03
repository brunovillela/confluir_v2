import { tenantAtual } from "@/lib/tenant"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"

import { Button } from "@/components/ui/button"
import { requirePermissao } from "@/lib/auth"
import { listarFontesPagadoras } from "@/lib/db/fontes"
import { createAdminClient } from "@/lib/supabase/admin"

import { VinculoForm } from "../vinculo-form"

export const metadata: Metadata = { title: "Novo vínculo — Confluir" }

export default async function NovoVinculoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermissao("filiacao_gestao")

  const { id } = await params
  const admin = await createAdminClient()
  const [{ data: filiado }, fontes] = await Promise.all([
    admin
      .from("filiacoes")
      .select("id, nome_completo")
      .eq("id", id)
      .eq("emp_proprietaria_id", await tenantAtual())
      .maybeSingle(),
    listarFontesPagadoras(),
  ])
  if (!filiado) notFound()

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href={`/painel/filiados/${id}`}>
            <ArrowLeft />
            {filiado.nome_completo ?? "Filiado"}
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">
          Novo vínculo de filiação
        </h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Adiciona um vínculo ao histórico de {filiado.nome_completo ?? "—"}.
        </p>
      </div>
      <VinculoForm
        filiadoId={id}
        fontes={fontes.map((f) => ({
          id: f.id,
          nome: f.nome_fantasia ?? f.nome_razao ?? "(sem nome)",
        }))}
      />
    </>
  )
}
