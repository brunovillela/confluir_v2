import type { Metadata } from "next"
import Link from "next/link"
import { ExternalLink, Newspaper } from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"
import { requireVisualizacaoPortal } from "@/lib/visualizacao-filiado"
import { ultimasNoticias } from "@/lib/db/painel"
import { nomeEntidade } from "@/lib/db/organizacao"

export const metadata: Metadata = { title: "Notícias — Portal do Associado" }

export default async function PortalNoticiasPage() {
  await requireVisualizacaoPortal()
  const [noticias, entidade] = await Promise.all([ultimasNoticias(20), nomeEntidade()])

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Notícias</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Últimas notícias publicadas por {entidade}.
        </p>
      </div>

      <Card>
        <CardContent>
          {noticias.length === 0 ? (
            <div className="text-muted-foreground flex flex-col items-center gap-2 py-10 text-center">
              <Newspaper className="size-6" />
              <p className="text-sm">Nenhuma notícia publicada no momento.</p>
            </div>
          ) : (
            <ul className="divide-y">
              {noticias.map((n, i) => (
                <li key={n.id ?? n.url ?? i} className="py-3">
                  {n.id ? (
                    <Link
                      href={`/portal/noticias/${n.id}`}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {n.titulo}
                    </Link>
                  ) : (
                    <a
                      href={n.url ?? "#"}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 font-medium underline-offset-4 hover:underline"
                    >
                      {n.titulo}
                      <ExternalLink className="size-3.5" />
                    </a>
                  )}
                  {n.data && (
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      {n.data}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  )
}
