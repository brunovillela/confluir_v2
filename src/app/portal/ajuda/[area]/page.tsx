import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { Artigo } from "@/components/ajuda/artigo"
import { EmProducao } from "@/components/ajuda/em-producao"
import { requireSessaoPortal } from "@/lib/auth"
import { areaAjudaPortal } from "@/lib/ajuda/manifesto-portal"

type Params = { params: Promise<{ area: string }> }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { area } = await params
  const meta = areaAjudaPortal(area)
  return {
    title: meta
      ? `${meta.titulo} — Ajuda do Portal`
      : "Ajuda — Portal do Associado",
  }
}

export default async function AreaPortalPage({ params }: Params) {
  await requireSessaoPortal()

  const { area } = await params
  const meta = areaAjudaPortal(area)
  if (!meta || !meta.disponivel) notFound()
  const artigo = meta.artigos.find((a) => a.slug === "index") ?? meta.artigos[0]

  let Conteudo: React.ComponentType | null = null
  try {
    ;({ default: Conteudo } = await import(`@/conteudo/portal/${area}/index.mdx`))
  } catch {
    Conteudo = null
  }

  return (
    <Artigo
      areaTitulo={meta.titulo}
      areaHref={`/portal/ajuda/${meta.slug}`}
      titulo={artigo.titulo}
      resumo={artigo.resumo}
      manualHref="/portal/ajuda"
    >
      {Conteudo ? <Conteudo /> : <EmProducao />}
    </Artigo>
  )
}
