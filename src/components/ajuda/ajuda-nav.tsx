"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { LayoutGrid } from "lucide-react"

import { iconeAjuda } from "@/components/ajuda/icones"
import { cn } from "@/lib/utils"

export type NavArtigo = { slug: string; titulo: string }
export type NavArea = {
  slug: string
  titulo: string
  icone: string
  disponivel: boolean
  artigos: NavArtigo[]
}

function hrefArtigo(base: string, areaSlug: string, artigoSlug: string) {
  return artigoSlug === "index"
    ? `${base}/${areaSlug}`
    : `${base}/${areaSlug}/${artigoSlug}`
}

/**
 * Navegação lateral do manual. `base` é a raiz da seção de ajuda
 * (`/painel/ajuda` no painel, `/portal/ajuda` no portal do associado).
 */
export function AjudaNav({
  areas,
  base = "/painel/ajuda",
}: {
  areas: NavArea[]
  base?: string
}) {
  const pathname = usePathname()

  return (
    <nav aria-label="Manual" className="text-sm">
      <Link
        href="/manual"
        className="text-muted-foreground hover:text-foreground mb-3 flex items-center gap-1.5 px-2 text-xs"
      >
        <LayoutGrid className="size-3.5" />
        Todas as interfaces
      </Link>

      <Link
        href={base}
        className={cn(
          "mb-2 block rounded-md px-2 py-1.5 font-medium",
          pathname === base
            ? "bg-muted"
            : "hover:bg-muted/60 text-muted-foreground"
        )}
      >
        Início do manual
      </Link>

      <ul className="space-y-4">
        {areas.map((area) => {
          const Icone = iconeAjuda(area.icone)
          const areaAtiva = pathname.startsWith(`${base}/${area.slug}`)
          return (
            <li key={area.slug}>
              <div
                className={cn(
                  "flex items-center gap-2 px-2 text-xs font-medium tracking-wide uppercase",
                  areaAtiva ? "text-foreground" : "text-muted-foreground"
                )}
              >
                <Icone className="size-3.5" />
                {area.titulo}
                {!area.disponivel && (
                  <span className="text-muted-foreground/70 ml-auto text-[10px] normal-case">
                    Em breve
                  </span>
                )}
              </div>
              {area.disponivel && area.artigos.length > 0 && (
                <ul className="border-muted mt-1 ml-3.5 space-y-0.5 border-l pl-2">
                  {area.artigos.map((art) => {
                    const href = hrefArtigo(base, area.slug, art.slug)
                    const ativo = pathname === href
                    return (
                      <li key={art.slug}>
                        <Link
                          href={href}
                          aria-current={ativo ? "page" : undefined}
                          className={cn(
                            "block rounded-md px-2 py-1",
                            ativo
                              ? "bg-primary/10 text-primary font-medium"
                              : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                          )}
                        >
                          {art.titulo}
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              )}
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
