import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { Artigo } from "@/components/ajuda/artigo"
import { EmProducao } from "@/components/ajuda/em-producao"
import { requireSessaoHotel } from "@/lib/auth"
import { areaAjudaHotel } from "@/lib/ajuda/manifesto-hotel"

type Params = { params: Promise<{ area: string }> }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { area } = await params
  const meta = areaAjudaHotel(area)
  return {
    title: meta ? `${meta.titulo} — Ajuda do Hotel` : "Ajuda — Área do Hotel",
  }
}

export default async function AreaHotelPage({ params }: Params) {
  await requireSessaoHotel()

  const { area } = await params
  const meta = areaAjudaHotel(area)
  if (!meta || !meta.disponivel) notFound()
  const artigo = meta.artigos.find((a) => a.slug === "index") ?? meta.artigos[0]

  let Conteudo: React.ComponentType | null = null
  try {
    ;({ default: Conteudo } = await import(`@/conteudo/hotel/${area}/index.mdx`))
  } catch {
    Conteudo = null
  }

  return (
    <Artigo
      areaTitulo={meta.titulo}
      areaHref={`/hotel/ajuda/${meta.slug}`}
      titulo={artigo.titulo}
      resumo={artigo.resumo}
      manualHref="/hotel/ajuda"
    >
      {Conteudo ? <Conteudo /> : <EmProducao />}
    </Artigo>
  )
}
