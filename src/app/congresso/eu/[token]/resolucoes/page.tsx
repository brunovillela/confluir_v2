import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"

import { obterCongresso } from "@/lib/db/congressos"
import { encerramento } from "@/lib/db/congressos-encerramento"
import { participantePeloLink } from "@/lib/db/congressos-mocoes"
import { tenantAtual } from "@/lib/tenant"

import { ListaResolucoesPublica } from "@/app/congresso/resolucoes-publicas"

export const metadata: Metadata = { title: "Resoluções — Confluir", robots: { index: false }, referrer: "no-referrer" }

/** Resoluções aprovadas, pelo link pessoal (sem as reservadas). */
export default async function ResolucoesPeloLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const tenantId = await tenantAtual()
  const p = await participantePeloLink(token, tenantId)
  if (!p) notFound()
  const c = await obterCongresso(p.congressoId)
  if (!c) notFound()
  const fim = await encerramento(c.id, tenantId)
  return (
    <main className="mx-auto grid w-full max-w-2xl gap-4 px-4 py-6">
      <Link href={`/congresso/eu/${token}`} className="text-muted-foreground inline-flex items-center gap-1 text-sm">
        <ArrowLeft className="size-4" />
        Minha participação
      </Link>
      {fim.encerradoEm ? <ListaResolucoesPublica c={c} tenantId={tenantId} /> : <p className="text-sm">As resoluções aparecem aqui depois do encerramento.</p>}
    </main>
  )
}
