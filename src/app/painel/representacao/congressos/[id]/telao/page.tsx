import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { obterCongresso } from "@/lib/db/congressos"

import { Telao } from "../../ao-vivo-componentes"

export const metadata: Metadata = { title: "Telão da plenária — Confluir" }

/** Telão da plenária: quem fala e o cronômetro, a fila, a votação em curso e o resultado. */
export default async function TelaoPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermissao("congressos", ["congressos_gestao", "congressos_relatoria", "congressos_credenciamento"])
  const { id } = await params
  const c = await obterCongresso(id)
  if (!c) notFound()
  return <Telao congressoId={id} titulo={`${c.edicao ? `${c.edicao}º ` : ""}${c.nome}`} />
}
