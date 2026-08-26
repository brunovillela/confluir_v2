import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { Artigo } from "@/components/ajuda/artigo"
import { EmProducao } from "@/components/ajuda/em-producao"
import { requireSessaoPortal } from "@/lib/auth"
import { artigoAjudaPortal } from "@/lib/ajuda/manifesto-portal"

type Params = { params: Promise<{ area: string; topico: string }> }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { area, topico } = await params
  const encontrado = artigoAjudaPortal(area, topico)
  return {
    title: encontrado
      ? `${encontrado.artigo.titulo} — Ajuda do Portal`
      : "Ajuda — Portal do Associado",
  }
}

export default async function TopicoPortalPage({ params }: Params) {
  await requireSessaoPortal()

  const { area, topico } = await params
  if (topico === "index") notFound() // o overview mora em /portal/ajuda/<area>

  const encontrado = artigoAjudaPortal(area, topico)
  if (!encontrado || !encontrado.area.disponivel) notFound()
  const { area: meta, artigo } = encontrado

  let Conteudo: React.ComponentType | null = null
  try {
    ;({ default: Conteudo } = await import(
      `@/conteudo/portal/${area}/${topico}.mdx`
    ))
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
