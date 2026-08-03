import type { Metadata } from "next"
import Link from "next/link"
import { Newspaper } from "lucide-react"

import { GrupoColapsavel } from "@/components/grupo-colapsavel"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { listarNoticias } from "@/lib/db/noticias"
import { formatarData } from "@/lib/formato"

import { NovaNoticiaForm } from "./noticias-forms"

export const metadata: Metadata = { title: "Notícias — Confluir" }

const SELECT_FILTRO =
  "border-input bg-background text-foreground h-9 max-w-52 truncate rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

/** Imagens migradas do Bubble vêm protocolo-relativas (//cdn…). */
function normalizarImagem(url: string | null): string | null {
  if (!url) return null
  return url.startsWith("//") ? `https:${url}` : url
}

export default async function NoticiasPage({
  searchParams,
}: {
  searchParams: Promise<{ busca?: string; excluido?: string }>
}) {
  await requirePermissao("noticias")

  const { busca = "", excluido } = await searchParams
  const termo = busca.trim()
  const noticias = await listarNoticias(termo)

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Notícias</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Notícias exibidas no painel e no portal do filiado.
        </p>
      </div>

      {excluido === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Notícia excluída.</AlertDescription>
        </Alert>
      )}

      <GrupoColapsavel
        titulo="Nova notícia"
        descricao="Publique uma notícia com manchete, texto e imagem"
      >
        <NovaNoticiaForm />
      </GrupoColapsavel>

      <form
        className="flex flex-wrap items-center gap-2"
        action="/painel/comunicacao/noticias"
      >
        <input
          type="search"
          name="busca"
          defaultValue={termo}
          placeholder="Manchete"
          className={`${SELECT_FILTRO} w-64 max-w-full`}
        />
        <Button type="submit" variant="outline" size="sm">
          Filtrar
        </Button>
      </form>

      {noticias.length === 0 ? (
        <Card>
          <CardContent>
            <p className="text-muted-foreground py-8 text-center text-sm">
              <Newspaper className="mx-auto mb-2 size-5" />
              {termo
                ? "Nenhuma notícia encontrada com esse filtro."
                : "Nenhuma notícia publicada ainda."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {noticias.map((n) => {
            const img = normalizarImagem(n.imagem)
            return (
              <Link key={n.id} href={`/painel/comunicacao/noticias/${n.id}`} className="group">
                <Card className="transition-colors group-hover:border-primary/40">
                  <CardContent className="flex items-center gap-4">
                    {img ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={img}
                        alt=""
                        className="size-16 shrink-0 rounded-md object-cover"
                      />
                    ) : (
                      <div className="bg-muted text-muted-foreground flex size-16 shrink-0 items-center justify-center rounded-md">
                        <Newspaper className="size-5" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="group-hover:text-primary font-medium text-balance">
                        {n.manchete ?? "(sem manchete)"}
                      </p>
                      <p className="text-muted-foreground mt-0.5 text-xs">
                        {formatarData(n.created_at)}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      )}
    </>
  )
}
