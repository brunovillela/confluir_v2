import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight, MessageSquarePlus } from "lucide-react"

import { iconeAjuda } from "@/components/ajuda/icones"
import { CabecalhoPagina } from "@/components/portal/cabecalho-pagina"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { AREAS_AJUDA_PORTAL } from "@/lib/ajuda/manifesto-portal"

// O sufixo vem do modelo do layout do portal (A183).
export const metadata: Metadata = { title: "Ajuda" }

/**
 * Índice da Ajuda do portal. A busca mora no layout (em todas as páginas da
 * ajuda, A115); aqui ficam as áreas e, no fim, a saída para quem não achou a
 * resposta: o Atendimento.
 */
export default function PortalAjudaIndexPage() {
  const areas = AREAS_AJUDA_PORTAL

  return (
    <>
      <CabecalhoPagina
        secao="/portal/ajuda"
        titulo="Ajuda"
        subtitulo="Como usar cada área do seu portal do associado. A busca procura no texto de todos os artigos."
      />

      <section className="mt-6" aria-label="Áreas da ajuda">
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

      {/* A115: a ajuda não é beco sem saída — a dúvida que ela não cobre vai ao sindicato. */}
      <section
        aria-label="Não achou a resposta"
        className="mt-8 flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4"
      >
        <div className="min-w-0">
          <p className="text-sm font-medium">Não achou o que procurava?</p>
          <p className="text-muted-foreground text-sm">
            Pergunte ao sindicato: a resposta chega no Atendimento, com aviso no
            portal.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/portal/atendimento?nova=1">
            <MessageSquarePlus />
            Abrir uma solicitação
          </Link>
        </Button>
      </section>
    </>
  )
}
