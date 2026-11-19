import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"

import { RelatoriaGrupo } from "@/app/painel/representacao/congressos/relatoria-grupo"
import { obterCongresso } from "@/lib/db/congressos"
import { acessoDeRelatoria, dadosDoGrupoPorLink, ROTULO_FUNCAO } from "@/lib/db/congressos-relatoria"
import { tenantAtual } from "@/lib/tenant"

export const metadata: Metadata = {
  title: "Relatoria do grupo — Confluir",
  robots: { index: false },
  referrer: "no-referrer",
}

/** Relatoria do grupo pelo link pessoal: só para quem tem função (coordenação ou relatoria) neste grupo. */
export default async function RelatoriaPeloLinkPage({ params }: { params: Promise<{ token: string; grupoId: string }> }) {
  const { token, grupoId } = await params
  const tenantId = await tenantAtual()
  const acesso = await acessoDeRelatoria(token, tenantId, (id) => obterCongresso(id))
  if (!acesso) notFound()
  const d = await dadosDoGrupoPorLink(acesso, grupoId)
  if (!d) notFound()
  const funcao = acesso.grupos.find((g) => g.id === grupoId)?.funcao

  return (
    <main className="mx-auto grid w-full max-w-2xl gap-4 px-4 py-6">
      <Link href={`/congresso/eu/${token}`} className="text-muted-foreground inline-flex items-center gap-1 text-sm">
        <ArrowLeft className="size-4" />
        Minha participação
      </Link>
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{d.grupo.nome}</h1>
        <p className="text-muted-foreground text-xs">
          {d.eixo ? `Eixo: ${d.eixo.nome} · ` : ""}
          {acesso.nome}
          {funcao ? ` · ${ROTULO_FUNCAO[funcao]}` : ""}
        </p>
      </div>
      <RelatoriaGrupo acesso={{ token }} d={d} />
    </main>
  )
}
