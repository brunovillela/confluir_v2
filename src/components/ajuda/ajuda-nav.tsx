"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

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

function hrefArtigo(areaSlug: string, artigoSlug: string) {
  return artigoSlug === "index"
    ? `/painel/ajuda/${areaSlug}`
    : `/painel/ajuda/${areaSlug}/${artigoSlug}`
}

export function AjudaNav({ areas }: { areas: NavArea[] }) {
  const pathname = usePathname()

  return (
    <nav aria-label="Manual" className="text-sm">
      <Link
        href="/painel/ajuda"
        className={cn(
          "mb-2 block rounded-md px-2 py-1.5 font-medium",
          pathname === "/painel/ajuda"
            ? "bg-muted"
            : "hover:bg-muted/60 text-muted-foreground"
        )}
      >
        Início do manual
      </Link>

      <ul className="space-y-4">
        {areas.map((area) => {
          const Icone = iconeAjuda(area.icone)
          const areaAtiva = pathname.startsWith(`/painel/ajuda/${area.slug}`)
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
                    const href = hrefArtigo(area.slug, art.slug)
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
