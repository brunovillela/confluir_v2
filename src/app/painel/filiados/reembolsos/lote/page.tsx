import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { Button } from "@/components/ui/button"
import { requirePermissao } from "@/lib/auth"
import { hojeSP } from "@/lib/db/comum"
import { listarProjetos } from "@/lib/db/projetos"

import { LoteForm } from "./lote-form"

export const metadata: Metadata = { title: "Reembolsos em lote — Confluir" }

/**
 * Lançamento em lote: a mesma justificativa, data, tipo e projeto para uma
 * lista de filiados (CPF e valor), colada ou em planilha. Primeiro confere —
 * nada é gravado —, depois lança em partes, com o progresso na tela. Cada
 * linha vira um reembolso completo (ordem de pagamento e prontuário).
 */
export default async function LoteReembolsosPage() {
  await requirePermissao("filiacao_reembolsos", ["filiacao_gestao"])
  const projetos = await listarProjetos({ situacao: "andamento" })

  return (
    <>
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3">
          <Link href="/painel/filiados/reembolsos">
            <ArrowLeft />
            Reembolsos
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Lançar reembolsos em lote</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Vários filiados de uma vez, com a mesma justificativa — por exemplo, a devolução do desconto de uma
          greve. Cada linha gera a sua ordem de pagamento em autorização.
        </p>
      </div>
      <LoteForm
        hoje={hojeSP()}
        projetos={projetos
          .map((p) => ({ id: p.id, titulo: p.titulo ?? "(sem título)" }))
          .sort((a, b) => a.titulo.localeCompare(b.titulo, "pt-BR"))}
      />
    </>
  )
}
