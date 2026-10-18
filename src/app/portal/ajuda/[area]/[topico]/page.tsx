import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"

import { Artigo } from "@/components/ajuda/artigo"
import { EmProducao } from "@/components/ajuda/em-producao"
import { artigoAjudaPortal } from "@/lib/ajuda/manifesto-portal"
import { artigoForaDaAjuda } from "@/lib/ajuda/mapa-portal"
import { partesDesabilitadas } from "@/lib/db/portal-partes"
import type { ChaveParte } from "@/lib/portal-partes-constantes"
import { requireVisualizacaoPortal } from "@/lib/visualizacao-filiado"

type Params = { params: Promise<{ area: string; topico: string }> }

// O sufixo vem do modelo do layout do portal (A183).
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { area, topico } = await params
  const encontrado = artigoAjudaPortal(area, topico)
  return { title: encontrado ? `Ajuda: ${encontrado.artigo.titulo}` : "Ajuda" }
}

export default async function TopicoPortalPage({ params }: Params) {
  await requireVisualizacaoPortal()

  const { area, topico } = await params
  if (topico === "index") notFound() // o overview mora em /portal/ajuda/<area>

  const encontrado = artigoAjudaPortal(area, topico)
  if (!encontrado || !encontrado.area.disponivel) notFound()
  const { area: meta, artigo } = encontrado

  // Artigo de parte desabilitada em Filiados › Área do associado (link
  // cruzado, favorito): o índice da ajuda. Na dúvida, o artigo abre.
  const desabilitadas = await partesDesabilitadas().catch(() => [] as ChaveParte[])
  if (artigoForaDaAjuda(area, topico, desabilitadas)) redirect("/portal/ajuda")

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
      manualRotulo="Ajuda"
    >
      {Conteudo ? <Conteudo /> : <EmProducao parteDe="da ajuda" />}
    </Artigo>
  )
}
