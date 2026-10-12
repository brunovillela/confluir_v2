"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { ChevronDown, LayoutGrid } from "lucide-react"

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

/** O nome da seção em cada interface (A170): "Manual" no painel e no hotel, "Ajuda" no portal. */
const ROTULOS = {
  manual: { nav: "Manual", inicio: "Início do manual", todas: "Todas as áreas do manual" },
  ajuda: { nav: "Ajuda", inicio: "Início da ajuda", todas: "Todas as áreas da ajuda" },
} as const
export type RotuloAjuda = keyof typeof ROTULOS

function hrefArtigo(base: string, areaSlug: string, artigoSlug: string) {
  return artigoSlug === "index"
    ? `${base}/${areaSlug}`
    : `${base}/${areaSlug}/${artigoSlug}`
}

/** Linha clicável da navegação: 44 px no toque (DESIGN.md), compacta no mouse. */
const LINHA = "flex items-center gap-2 rounded-md px-2 py-1 pointer-coarse:min-h-11"
const LINHA_ATIVA = "bg-primary/10 text-primary font-medium"
const LINHA_INATIVA = "text-muted-foreground hover:bg-muted/60 hover:text-foreground"

/**
 * Navegação lateral do manual. `base` é a raiz da seção de ajuda
 * (`/painel/ajuda` no painel, `/portal/ajuda` no portal do associado).
 *
 * Área com um artigo só (o de abertura) vira UMA linha com o ícone e o nome
 * da área, que leva a ele (A112) — antes eram um cabeçalho que não levava a
 * lugar nenhum e, embaixo, o mesmo destino com outro nome. Área com vários
 * artigos mantém o cabeçalho e a lista (ou, com `areaComoLink`, o nome da
 * área leva ao artigo de abertura e a lista traz só os outros).
 */
export function AjudaNav({
  areas,
  base = "/painel/ajuda",
  rotulo = "manual",
  mostrarInterfaces = true,
  areaComoLink = false,
}: {
  areas: NavArea[]
  base?: string
  rotulo?: RotuloAjuda
  /**
   * "Todas as interfaces" leva ao /manual, que lista painel, hotel e fluxos
   * públicos — atrás de logins que o associado não tem (A113). O portal o
   * desliga.
   */
  mostrarInterfaces?: boolean
  /**
   * Área com vários artigos e um de abertura: o nome da área vira o link
   * para ele e a lista embaixo traz só os demais — um rótulo por página e o
   * título clicável (A112). O portal liga; o painel mantém o cabeçalho e a
   * lista completa.
   */
  areaComoLink?: boolean
}) {
  const pathname = usePathname()
  const r = ROTULOS[rotulo]

  return (
    <nav aria-label={r.nav} className="text-sm">
      {mostrarInterfaces && (
        <Link
          href="/manual"
          className="text-muted-foreground hover:text-foreground mb-3 flex items-center gap-1.5 px-2 text-xs pointer-coarse:min-h-11"
        >
          <LayoutGrid className="size-3.5" />
          Todas as interfaces
        </Link>
      )}

      <Link
        href={base}
        aria-current={pathname === base ? "page" : undefined}
        className={cn(
          "mb-2 flex items-center rounded-md px-2 py-1.5 font-medium pointer-coarse:min-h-11",
          pathname === base
            ? "bg-muted"
            : "hover:bg-muted/60 text-muted-foreground"
        )}
      >
        {r.inicio}
      </Link>

      <ul className="space-y-1">
        {areas.map((area) => {
          const Icone = iconeAjuda(area.icone)
          const areaAtiva = pathname === `${base}/${area.slug}` || pathname.startsWith(`${base}/${area.slug}/`)
          const unica = area.artigos.length === 1 && area.artigos[0].slug === "index"

          if (!area.disponivel) {
            return (
              <li key={area.slug} className="text-muted-foreground flex items-center gap-2 px-2 py-1">
                <Icone className="size-3.5 shrink-0" />
                <span className="min-w-0">{area.titulo}</span>
                <span className="text-muted-foreground/70 ml-auto text-xs">Em breve</span>
              </li>
            )
          }

          const temAbertura = area.artigos.some((art) => art.slug === "index")
          if (unica || (areaComoLink && temAbertura)) {
            const href = hrefArtigo(base, area.slug, "index")
            const ativo = pathname === href
            const outros = area.artigos.filter((art) => art.slug !== "index")
            return (
              <li key={area.slug}>
                <Link
                  href={href}
                  aria-current={ativo ? "page" : undefined}
                  className={cn(LINHA, ativo ? LINHA_ATIVA : LINHA_INATIVA)}
                >
                  <Icone className="size-3.5 shrink-0" />
                  <span className="min-w-0">{area.titulo}</span>
                </Link>
                {outros.length > 0 && (
                  <ul className="border-muted mt-0.5 ml-3.5 space-y-0.5 border-l pl-2">
                    {outros.map((art) => {
                      const hrefArt = hrefArtigo(base, area.slug, art.slug)
                      const artAtivo = pathname === hrefArt
                      return (
                        <li key={art.slug}>
                          <Link
                            href={hrefArt}
                            aria-current={artAtivo ? "page" : undefined}
                            className={cn(LINHA, artAtivo ? LINHA_ATIVA : LINHA_INATIVA)}
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
          }

          return (
            <li key={area.slug} className="pt-3 first:pt-0">
              <div
                className={cn(
                  "flex items-center gap-2 px-2 text-xs font-medium tracking-wide uppercase",
                  areaAtiva ? "text-foreground" : "text-muted-foreground"
                )}
              >
                <Icone className="size-3.5 shrink-0" />
                {area.titulo}
              </div>
              {area.artigos.length > 0 && (
                <ul className="border-muted mt-1 ml-3.5 space-y-0.5 border-l pl-2">
                  {area.artigos.map((art) => {
                    const href = hrefArtigo(base, area.slug, art.slug)
                    const ativo = pathname === href
                    return (
                      <li key={art.slug}>
                        <Link
                          href={href}
                          aria-current={ativo ? "page" : undefined}
                          className={cn(LINHA, ativo ? LINHA_ATIVA : LINHA_INATIVA)}
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

/**
 * A mesma navegação para telas abaixo de lg (A110): recolhida, no FIM do
 * artigo — antes a árvore inteira empilhava antes do texto e o associado
 * rolava mais de uma tela para começar a ler. O breadcrumb do artigo já dá a
 * volta para a área e para o início. Some no índice, que já é a lista de
 * áreas em cartões.
 */
export function AjudaNavRecolhida({
  className,
  ...props
}: React.ComponentProps<typeof AjudaNav> & { className?: string }) {
  const pathname = usePathname()
  const base = props.base ?? "/painel/ajuda"
  if (pathname === base) return null
  return (
    <details className={cn("group rounded-lg border", className)}>
      <summary className="hover:bg-muted/40 flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-lg px-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
        {ROTULOS[props.rotulo ?? "manual"].todas}
        <ChevronDown className="text-muted-foreground size-4 transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="border-t px-1 py-3">
        <AjudaNav {...props} />
      </div>
    </details>
  )
}
