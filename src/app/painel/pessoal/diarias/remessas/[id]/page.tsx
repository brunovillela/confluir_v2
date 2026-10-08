import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"

import { DetalheRemessaDiarias } from "@/components/diarias-remessas"
import { RotuloTrilha } from "@/components/layout/trilha-rotulos"
import { requirePermissao } from "@/lib/auth"
import { contextoDaRemessa } from "@/lib/db/diarias-remessa-pagina"

export const metadata: Metadata = { title: "Remessa de diárias — Confluir" }

export default async function RemessaDiariasPage({ params }: { params: Promise<{ id: string }> }) {
  const sessao = await requirePermissao("pessoal_gestao", ["pessoal_diarias"])
  const { id } = await params
  const ctx = await contextoDaRemessa(id, sessao)
  if (!ctx) notFound()
  if (ctx.remessa.quadro === "diretor") redirect(`/painel/institucional/diretoria/diarias/remessas/${id}`)
  return (
    <>
      <RotuloTrilha valores={{ [id]: `Remessa ${ctx.remessa.codigo ?? ""}` }} />
      <DetalheRemessaDiarias
        {...ctx}
        voltar={{ href: "/painel/pessoal/diarias/remessas", rotulo: "Remessas de diárias" }}
        diariaBase="/painel/pessoal/diarias"
      />
    </>
  )
}
