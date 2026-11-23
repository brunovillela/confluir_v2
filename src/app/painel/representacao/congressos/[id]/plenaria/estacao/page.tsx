import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { obterCongresso } from "@/lib/db/congressos"

import { EstacaoDeVoto } from "../../../ao-vivo-componentes"

export const metadata: Metadata = { title: "Estação de voto — Confluir" }

/** Estação de voto na mesa: para quem não tem celular, identifica pelo crachá e vota na tela. */
export default async function EstacaoPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermissao("congressos_credenciamento", ["congressos_relatoria", "congressos_gestao"])
  const { id } = await params
  const c = await obterCongresso(id)
  if (!c) notFound()
  return (
    <div className="grid gap-4 py-4">
      <div>
        <div className="text-muted-foreground text-sm">
          {c.edicao ? `${c.edicao}º ` : ""}
          {c.nome}
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Estação de voto</h1>
      </div>
      <EstacaoDeVoto congressoId={id} />
    </div>
  )
}
