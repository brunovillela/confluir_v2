import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { Artigo } from "@/components/ajuda/artigo"
import { EmProducao } from "@/components/ajuda/em-producao"
import { requirePermissao } from "@/lib/auth"
import { areaAjuda } from "@/lib/ajuda/manifesto"

type Params = { params: Promise<{ area: string }> }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { area } = await params
  const meta = areaAjuda(area)
  return {
    title: meta ? `${meta.titulo} — Manual Confluir` : "Manual — Confluir",
  }
}

export default async function AreaPage({ params }: Params) {
  const { area } = await params
  const meta = areaAjuda(area)
  if (!meta || !meta.disponivel) notFound()

  // Gate: mesma permissão do módulo no painel.
  await requirePermissao(meta.chave, meta.chavesAlternativas)

  const overview = meta.artigos.find((a) => a.slug === "index")

  let Conteudo: React.ComponentType | null = null
  try {
    ;({ default: Conteudo } = await import(
      `@/conteudo/ajuda/${area}/index.mdx`
    ))
  } catch {
    Conteudo = null // artigo mapeado, mas .mdx ainda não escrito
  }

  return (
    <Artigo
      areaTitulo={meta.titulo}
      areaHref={`/painel/ajuda/${meta.slug}`}
      titulo={overview?.titulo ?? meta.titulo}
      resumo={overview?.resumo}
    >
      {Conteudo ? <Conteudo /> : <EmProducao />}
    </Artigo>
  )
}
