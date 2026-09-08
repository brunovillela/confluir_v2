import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import type { SugestaoFiliado } from "@/components/filiado-picker"
import { Button } from "@/components/ui/button"
import { requirePermissao } from "@/lib/auth"
import { configReembolsoCompleta } from "@/lib/db/filiacao-reembolsos-edicao"
import { listarProjetos } from "@/lib/db/projetos"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

import { ReembolsoForm } from "../reembolso-form"

export const metadata: Metadata = { title: "Novo reembolso — Confluir" }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function NovoReembolsoPage({
  searchParams,
}: {
  searchParams: Promise<{ filiado?: string }>
}) {
  await requirePermissao("filiacao_reembolsos", ["filiacao_gestao"])
  const { filiado } = await searchParams

  const [config, projetos, inicial] = await Promise.all([
    configReembolsoCompleta(),
    listarProjetos({ situacao: "andamento" }),
    filiadoInicial(filiado),
  ])

  const voltar = inicial ? `/painel/filiados/${inicial.id}` : "/painel/filiados/reembolsos"

  return (
    <>
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3">
          <Link href={voltar}>
            <ArrowLeft />
            {inicial ? "Perfil do filiado" : "Reembolsos"}
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Lançar reembolso</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Reembolso por participação em reunião, ato ou assembleia. A ordem de pagamento nasce
          em autorização.
        </p>
      </div>
      <ReembolsoForm
        projetos={projetos.map((p) => ({ id: p.id, titulo: p.titulo ?? "(sem título)" }))}
        valorPadrao={config.valorReembolso}
        filiadoInicial={inicial}
        voltarPara={voltar}
      />
    </>
  )
}

async function filiadoInicial(id: string | undefined): Promise<SugestaoFiliado | null> {
  if (!id || !UUID.test(id)) return null
  const admin = await createAdminClient()
  const { data } = await admin
    .from("filiacoes")
    .select("id, nome_completo, cpf, matricula_sindical, filiacao_condicao")
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("id", id)
    .maybeSingle()
  return (data as SugestaoFiliado | null) ?? null
}
