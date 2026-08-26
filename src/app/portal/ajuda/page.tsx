import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight } from "lucide-react"

import { AjudaBusca, type ItemBusca } from "@/components/ajuda/ajuda-busca"
import { iconeAjuda } from "@/components/ajuda/icones"
import { Card, CardContent } from "@/components/ui/card"
import { AREAS_AJUDA_PORTAL } from "@/lib/ajuda/manifesto-portal"

export const metadata: Metadata = { title: "Ajuda — Portal do Associado" }

export default function PortalAjudaIndexPage() {
  const areas = AREAS_AJUDA_PORTAL

  const itens: ItemBusca[] = areas
    .filter((a) => a.disponivel)
    .flatMap((a) =>
      a.artigos.map((art) => ({
        titulo: art.titulo,
        resumo: art.resumo,
        area: a.titulo,
        href:
          art.slug === "index"
            ? `/portal/ajuda/${a.slug}`
            : `/portal/ajuda/${a.slug}/${art.slug}`,
      }))
    )

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Ajuda do portal
        </h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Como usar cada área do seu portal do associado.
        </p>
      </div>

      <div className="mt-5 max-w-xl">
        <AjudaBusca itens={itens} />
      </div>

      <section className="mt-8" aria-label="Áreas da ajuda">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {areas.map((area) => {
            const Icone = iconeAjuda(area.icone)
            return (
              <Link
                key={area.slug}
                href={`/portal/ajuda/${area.slug}`}
                className="group block h-full"
              >
                <Card className="group-hover:border-primary/40 h-full transition-colors">
                  <CardContent className="flex h-full flex-col gap-1 py-4">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium">
                        {area.titulo}
                      </p>
                      <Icone className="text-muted-foreground size-4 shrink-0" />
                    </div>
                    <p className="text-muted-foreground text-xs">
                      {area.descricao}
                    </p>
                    <div className="mt-2">
                      <span className="text-primary inline-flex items-center gap-1 text-xs font-medium">
                        Abrir
                        <ArrowRight className="size-3 opacity-0 transition-opacity group-hover:opacity-100" />
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      </section>
    </>
  )
}
