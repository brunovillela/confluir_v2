import Link from "next/link"
import { ChevronRight } from "lucide-react"

/**
 * Casco de um artigo do manual: breadcrumb + título (vindos do manifesto) e o
 * corpo (o conteúdo MDX). O .mdx começa direto no texto — o H1 é este aqui,
 * para não duplicar título.
 */
export function Artigo({
  areaTitulo,
  areaHref,
  titulo,
  resumo,
  manualHref = "/painel/ajuda",
  manualRotulo = "Manual",
  children,
}: {
  areaTitulo: string
  areaHref: string
  titulo: string
  resumo?: string
  /** Raiz da seção de ajuda (painel ou portal). */
  manualHref?: string
  /** Nome da raiz no breadcrumb (A170): "Manual" no painel e no hotel, "Ajuda" no portal. */
  manualRotulo?: string
  children: React.ReactNode
}) {
  return (
    <article>
      <nav
        aria-label="Trilha"
        className="text-muted-foreground mb-3 flex flex-wrap items-center gap-1 text-xs"
      >
        <Link href={manualHref} className="hover:text-foreground">
          {manualRotulo}
        </Link>
        <ChevronRight className="size-3" />
        <Link href={areaHref} className="hover:text-foreground">
          {areaTitulo}
        </Link>
        <ChevronRight className="size-3" />
        <span className="text-foreground">{titulo}</span>
      </nav>

      <header className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight">{titulo}</h1>
        {resumo && <p className="text-muted-foreground mt-1 text-sm">{resumo}</p>}
      </header>

      {children}
    </article>
  )
}
