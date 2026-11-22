import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"

import { valor } from "@/lib/congressos/config"
import { encerramento } from "@/lib/db/congressos-encerramento"
import { congressoPublico } from "@/lib/db/congressos-inscricao"
import { tenantAtual } from "@/lib/tenant"

import { ListaResolucoesPublica } from "../../resolucoes-publicas"

export const metadata: Metadata = { title: "Resoluções do congresso — Confluir" }

/** Caderno público de resoluções: só depois do encerramento, se a configuração publica, e sem as reservadas. */
export default async function ResolucoesPublicasPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const tenantId = await tenantAtual()
  const c = await congressoPublico(slug, tenantId)
  if (!c || valor(c.config, "divulgacao.resolucoes") === false) notFound()
  const fim = await encerramento(c.id, tenantId)
  if (!fim.encerradoEm) notFound()
  return (
    <main className="mx-auto grid w-full max-w-2xl gap-4 px-4 py-10">
      <Link href={`/congresso/${slug}`} className="text-muted-foreground inline-flex items-center gap-1 text-sm">
        <ArrowLeft className="size-4" />
        Página do congresso
      </Link>
      <ListaResolucoesPublica c={c} tenantId={tenantId} />
    </main>
  )
}
