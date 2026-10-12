import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"

import { Artigo } from "@/components/ajuda/artigo"
import { EmProducao } from "@/components/ajuda/em-producao"
import { areaAjudaPortal } from "@/lib/ajuda/manifesto-portal"
import { requireVisualizacaoPortal } from "@/lib/visualizacao-filiado"

type Params = { params: Promise<{ area: string }> }

/**
 * Áreas que saíram do manifesto → onde o conteúdo foi parar. Links antigos
 * (e-mails, avisos, favoritos) continuam chegando ao lugar certo.
 */
const MUDOU_DE_LUGAR = new Map<string, string>([
  // A169: agenda e eventos são uma página só no portal.
  ["agenda", "/portal/ajuda/eventos#agenda"],
])

// O sufixo vem do modelo do layout do portal (A183).
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { area } = await params
  const meta = areaAjudaPortal(area)
  return { title: meta ? `Ajuda: ${meta.titulo}` : "Ajuda" }
}

export default async function AreaPortalPage({ params }: Params) {
  await requireVisualizacaoPortal()

  const { area } = await params
  const destino = MUDOU_DE_LUGAR.get(area)
  if (destino) redirect(destino)
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
      manualRotulo="Ajuda"
    >
      {Conteudo ? <Conteudo /> : <EmProducao parteDe="da ajuda" />}
    </Artigo>
  )
}
