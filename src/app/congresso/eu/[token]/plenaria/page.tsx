import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"

import { PlenariaNoLink } from "@/app/painel/representacao/congressos/ao-vivo-componentes"
import { obterCongresso } from "@/lib/db/congressos"
import { participanteDoLink, regrasAoVivo } from "@/lib/db/congressos-ao-vivo"
import { tenantAtual } from "@/lib/tenant"

export const metadata: Metadata = { title: "Plenária — Confluir", robots: { index: false }, referrer: "no-referrer" }

/** Plenária no celular, pelo link pessoal: votar, pedir a palavra e acompanhar quem fala. */
export default async function PlenariaPeloLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const tenantId = await tenantAtual()
  const p = await participanteDoLink(token, tenantId)
  if (!p) notFound()
  const c = await obterCongresso(p.congressoId)
  if (!c) notFound()
  return (
    <main className="mx-auto grid w-full max-w-xl gap-4 px-4 py-6">
      <Link href={`/congresso/eu/${token}`} className="text-muted-foreground inline-flex items-center gap-1 text-sm">
        <ArrowLeft className="size-4" />
        Minha participação
      </Link>
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Plenária</h1>
        <p className="text-muted-foreground text-xs">
          {c.edicao ? `${c.edicao}º ` : ""}
          {c.nome} · {p.nome}
        </p>
      </div>
      <PlenariaNoLink token={token} falaPeloLink={regrasAoVivo(c).falaPeloLink} />
    </main>
  )
}
