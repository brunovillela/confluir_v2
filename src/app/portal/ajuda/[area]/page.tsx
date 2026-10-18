import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"

import { Artigo } from "@/components/ajuda/artigo"
import { EmProducao } from "@/components/ajuda/em-producao"
import { areaAjudaPortal } from "@/lib/ajuda/manifesto-portal"
import { areasAjudaPortal } from "@/lib/ajuda/mapa-portal"
import { partesDesabilitadas } from "@/lib/db/portal-partes"
import type { ChaveParte } from "@/lib/portal-partes-constantes"
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

  // Parte desabilitada em Filiados › Área do associado: link cruzado de outro
  // artigo, favorito ou e-mail antigo cai no índice da ajuda, nunca num 404.
  // Na dúvida (leitura que falhou), a área abre.
  const desabilitadas = await partesDesabilitadas().catch(() => [] as ChaveParte[])
  const visivel = areasAjudaPortal(desabilitadas).find((a) => a.slug === area)
  if (!visivel) redirect("/portal/ajuda")
  const abertura = visivel.artigos.find((a) => a.slug === "index")
  // Só o artigo de abertura saiu (ex.: Contribuição desabilitada, a
  // Desfiliação fica): vai ao primeiro que restou.
  if (!abertura && meta.artigos.some((a) => a.slug === "index")) {
    redirect(`/portal/ajuda/${area}/${visivel.artigos[0].slug}`)
  }
  const artigo = abertura ?? visivel.artigos[0]

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
