import { tenantAtual } from "@/lib/tenant"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"

import { Button } from "@/components/ui/button"
import { requirePermissao } from "@/lib/auth"
import { listarFontesPagadoras } from "@/lib/db/fontes"
import { createAdminClient } from "@/lib/supabase/admin"

import { VinculoForm, type VinculoFormDados } from "../vinculo-form"

export const metadata: Metadata = { title: "Vínculo de filiação — Confluir" }

export default async function EditarVinculoPage({
  params,
}: {
  params: Promise<{ id: string; vinculoId: string }>
}) {
  await requirePermissao("filiacao_gestao")

  const { id, vinculoId } = await params
  const admin = await createAdminClient()
  const [{ data: filiado }, { data: vinculo }, fontes] = await Promise.all([
    admin
      .from("filiacoes")
      .select("id, nome_completo")
      .eq("id", id)
      .eq("emp_proprietaria_id", await tenantAtual())
      .maybeSingle(),
    admin
      .from("filiacao_vinculos")
      .select(
        "id, filiado_id, fonte_pagadora_id, cargo, lotacao, matricula, data_entrada_admissao, data_filiacao, data_desfiliacao, filiacao_condicao"
      )
      .eq("id", vinculoId)
      .eq("emp_proprietaria_id", await tenantAtual())
      .maybeSingle(),
    listarFontesPagadoras(),
  ])
  if (!filiado || !vinculo || vinculo.filiado_id !== id) notFound()

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
          Editar vínculo de filiação
        </h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Histórico de {filiado.nome_completo ?? "—"}.
        </p>
      </div>
      <VinculoForm
        filiadoId={id}
        fontes={fontes.map((f) => ({
          id: f.id,
          nome: f.nome_fantasia ?? f.nome_razao ?? "(sem nome)",
        }))}
        vinculo={vinculo as VinculoFormDados}
      />
    </>
  )
}
