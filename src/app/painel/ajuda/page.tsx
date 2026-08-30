import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight } from "lucide-react"

import { AjudaBusca, type ItemBusca } from "@/components/ajuda/ajuda-busca"
import { iconeAjuda } from "@/components/ajuda/icones"
import { Card, CardContent } from "@/components/ui/card"
import { requireSessaoPainel } from "@/lib/auth"
import { AREAS_AJUDA } from "@/lib/ajuda/manifesto"
import { podeAcessar } from "@/lib/permissoes"

import { PerguntaIA } from "./pergunta-ia"

export const metadata: Metadata = { title: "Manual — Confluir" }

export default async function AjudaIndexPage() {
  const sessao = await requireSessaoPainel()

  const areas = AREAS_AJUDA.filter((a) =>
    podeAcessar(sessao.permissoes, a.chave, a.chavesAlternativas)
  )

  // Base de busca: todos os artigos das áreas disponíveis.
  const itens: ItemBusca[] = areas
    .filter((a) => a.disponivel)
    .flatMap((a) =>
      a.artigos.map((art) => ({
        titulo: art.titulo,
        resumo: art.resumo,
        area: a.titulo,
        href:
          art.slug === "index"
            ? `/painel/ajuda/${a.slug}`
            : `/painel/ajuda/${a.slug}/${art.slug}`,
      }))
    )

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Manual do Confluir</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Guias passo a passo de cada módulo. Você vê aqui as áreas a que tem
          acesso.
        </p>
      </div>

      <div className="mt-5 max-w-xl">
        <AjudaBusca itens={itens} />
      </div>

      <div className="mt-6">
        <PerguntaIA />
      </div>

      <section className="mt-8" aria-label="Áreas do manual">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {areas.map((area) => {
            const Icone = iconeAjuda(area.icone)
            const conteudo = (
              <Card
                className={
                  area.disponivel
                    ? "group-hover:border-primary/40 h-full transition-colors"
                    : "h-full opacity-60"
                }
              >
                <CardContent className="flex h-full flex-col gap-1 py-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium">{area.titulo}</p>
                    <Icone className="text-muted-foreground size-4 shrink-0" />
                  </div>
                  <p className="text-muted-foreground text-xs">
                    {area.descricao}
                  </p>
                  <div className="mt-2">
                    {area.disponivel ? (
                      <span className="text-primary inline-flex items-center gap-1 text-xs font-medium">
                        {area.artigos.length} artigo
                        {area.artigos.length === 1 ? "" : "s"}
                        <ArrowRight className="size-3 opacity-0 transition-opacity group-hover:opacity-100" />
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-xs">
                        Em breve
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
            return area.disponivel ? (
              <Link
                key={area.slug}
                href={`/painel/ajuda/${area.slug}`}
                className="group block h-full"
              >
                {conteudo}
              </Link>
            ) : (
              <div key={area.slug} className="h-full">
                {conteudo}
              </div>
            )
          })}
        </div>
      </section>
    </>
  )
}
