import { tenantAtual } from "@/lib/tenant"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"

import { Button } from "@/components/ui/button"
import { requirePermissao } from "@/lib/auth"
import { formatarCpf } from "@/lib/cpf"
import { createAdminClient } from "@/lib/supabase/admin"

import { EditarForm } from "./editar-form"

export const metadata: Metadata = { title: "Editar filiado — Confluir" }

export default async function EditarFiliadoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermissao("filiacao_gestao")

  const { id } = await params
  const admin = await createAdminClient()
  const { data: filiacao } = await admin
    .from("filiacoes")
    .select("*")
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (!filiacao) notFound()

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href={`/painel/filiados/${id}`}>
            <ArrowLeft />
            Voltar ao perfil
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">
          Editar cadastro
        </h1>
        <p className="text-muted-foreground mt-1 text-xs">
          {String(filiacao.nome_completo ?? "")} ·{" "}
          <span className="font-mono">
            {filiacao.cpf ? formatarCpf(String(filiacao.cpf)) : "sem CPF"}
          </span>{" "}
          — CPF e matrícula não são editáveis.
        </p>
      </div>

      <div className="max-w-3xl">
        <EditarForm filiacao={filiacao} />
      </div>
    </>
  )
}
