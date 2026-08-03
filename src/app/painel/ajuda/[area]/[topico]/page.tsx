import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { Artigo } from "@/components/ajuda/artigo"
import { EmProducao } from "@/components/ajuda/em-producao"
import { requirePermissao } from "@/lib/auth"
import { artigoAjuda } from "@/lib/ajuda/manifesto"

type Params = { params: Promise<{ area: string; topico: string }> }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { area, topico } = await params
  const encontrado = artigoAjuda(area, topico)
  return {
    title: encontrado
      ? `${encontrado.artigo.titulo} — Manual Confluir`
      : "Manual — Confluir",
  }
}

export default async function TopicoPage({ params }: Params) {
  const { area, topico } = await params
  if (topico === "index") notFound() // o overview mora em /ajuda/<area>

  const encontrado = artigoAjuda(area, topico)
  if (!encontrado || !encontrado.area.disponivel) notFound()
  const { area: meta, artigo } = encontrado

  // Gate: mesma permissão do módulo no painel (nível da área).
  await requirePermissao(meta.chave, meta.chavesAlternativas)

  let Conteudo: React.ComponentType | null = null
  try {
    ;({ default: Conteudo } = await import(
      `@/conteudo/ajuda/${area}/${topico}.mdx`
    ))
  } catch {
    Conteudo = null // artigo mapeado, mas .mdx ainda não escrito
  }

  return (
    <Artigo
      areaTitulo={meta.titulo}
      areaHref={`/painel/ajuda/${meta.slug}`}
      titulo={artigo.titulo}
      resumo={artigo.resumo}
    >
      {Conteudo ? <Conteudo /> : <EmProducao />}
    </Artigo>
  )
}
