import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { Artigo } from "@/components/ajuda/artigo"
import { EmProducao } from "@/components/ajuda/em-producao"
import { requireSessaoHotel } from "@/lib/auth"
import { artigoAjudaHotel } from "@/lib/ajuda/manifesto-hotel"

type Params = { params: Promise<{ area: string; topico: string }> }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { area, topico } = await params
  const encontrado = artigoAjudaHotel(area, topico)
  return {
    title: encontrado
      ? `${encontrado.artigo.titulo} — Ajuda do Hotel`
      : "Ajuda — Área do Hotel",
  }
}

export default async function TopicoHotelPage({ params }: Params) {
  await requireSessaoHotel()

  const { area, topico } = await params
  if (topico === "index") notFound() // o overview mora em /hotel/ajuda/<area>

  const encontrado = artigoAjudaHotel(area, topico)
  if (!encontrado || !encontrado.area.disponivel) notFound()
  const { area: meta, artigo } = encontrado

  let Conteudo: React.ComponentType | null = null
  try {
    ;({ default: Conteudo } = await import(
      `@/conteudo/hotel/${area}/${topico}.mdx`
    ))
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
