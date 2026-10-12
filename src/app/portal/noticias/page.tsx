import type { Metadata } from "next"
import Link from "next/link"
import { ExternalLink, Newspaper, Search } from "lucide-react"

import { Paginacao } from "@/components/paginacao"
import { CabecalhoPagina } from "@/components/portal/cabecalho-pagina"
import { EstadoVazio } from "@/components/portal/estado-vazio"
import { LembrarListaPortal } from "@/components/portal/voltar-portal"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { dataDaNoticia, listarNoticiasPortal } from "@/lib/db/noticias"
import { nomeEntidade } from "@/lib/db/organizacao"
import { ultimasNoticias } from "@/lib/db/painel"
import { lerPaginacao } from "@/lib/paginacao"
import { requireVisualizacaoPortal } from "@/lib/visualizacao-filiado"

import { ContagemNovas, MarcaNova, NovasDesde } from "./novas-desde"

export const metadata: Metadata = { title: "Notícias" }

/** Página dedicada à lista: 30 por página (DESIGN.md, "Tabelas longas"). */
const POR_PAGINA = 30

/**
 * Notícias da entidade (A86): todas, paginadas, com busca na manchete, data
 * com ano e, quando houver, imagem e as primeiras linhas do texto. Com a
 * tabela vazia, continuam as manchetes do site da entidade (RSS), como antes.
 * As publicadas depois da última visita ganham o selo "Nova" (A123,
 * novas-desde.tsx).
 */
export default async function PortalNoticiasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const { preview } = await requireVisualizacaoPortal()
  const p = await searchParams
  const busca = (typeof p.busca === "string" ? p.busca : "").trim().slice(0, 100)
  const paginacao = lerPaginacao(p, POR_PAGINA)
  const [resultado, entidade] = await Promise.all([
    listarNoticiasPortal({ busca, paginacao }),
    nomeEntidade(),
  ])
  // Tabela vazia (e sem busca): o feed do site da entidade, se houver.
  const externas = resultado.total === 0 && !busca ? await ultimasNoticias(30) : []
  // A notícia aberta volta para a lista como estava: busca e página (A173).
  const recorte = new URLSearchParams()
  for (const chave of ["busca", "pagina", "porPagina"]) {
    const valor = p[chave]
    if (typeof valor === "string" && valor) recorte.set(chave, valor)
  }
  const urlDaLista = recorte.toString() ? `/portal/noticias?${recorte}` : "/portal/noticias"

  return (
    <NovasDesde maisRecente={resultado.maisRecente} ativo={!preview}>
      <LembrarListaPortal base="/portal/noticias" url={urlDaLista} />
      <CabecalhoPagina
        secao="/portal/noticias"
        titulo="Notícias"
        subtitulo={
          <>
            Notícias publicadas por {entidade}.
            <ContagemNovas datas={resultado.noticias.map((n) => n.created_at)} />
          </>
        }
      />

      {(resultado.total > 0 || busca) && (
        <form action="/portal/noticias" role="search" className="flex flex-wrap items-center gap-2">
          <label htmlFor="busca-noticias" className="sr-only">
            Buscar nas manchetes
          </label>
          <Input
            id="busca-noticias"
            type="search"
            name="busca"
            defaultValue={busca}
            placeholder="Buscar nas manchetes"
            className="w-72 max-w-full"
          />
          <Button type="submit" variant="outline">
            <Search />
            Buscar
          </Button>
          {busca && (
            <Button asChild variant="ghost">
              <Link href="/portal/noticias">Limpar</Link>
            </Button>
          )}
        </form>
      )}

      <Card>
        <CardContent className="grid gap-4">
          {resultado.total > 0 ? (
            <>
              <ul className="divide-y">
                {resultado.noticias.map((n) => (
                  <li key={n.id}>
                    <Link
                      href={`/portal/noticias/${n.id}`}
                      className="group hover:bg-muted/40 -mx-2 flex items-start gap-3 rounded-lg px-2 py-3"
                    >
                      {n.imagem && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={n.imagem}
                          alt=""
                          loading="lazy"
                          className="bg-muted size-16 shrink-0 rounded-md border object-cover"
                        />
                      )}
                      <span className="grid min-w-0 gap-0.5">
                        <span className="font-medium underline-offset-4 group-hover:underline">
                          {n.manchete}
                        </span>
                        {n.resumo && (
                          <span className="text-muted-foreground line-clamp-2 text-sm">
                            {n.resumo}
                          </span>
                        )}
                        {dataDaNoticia(n.created_at) && (
                          <span className="flex flex-wrap items-center gap-2">
                            <time dateTime={n.created_at ?? undefined} className="text-muted-foreground text-xs">
                              {dataDaNoticia(n.created_at)}
                            </time>
                            <MarcaNova criadoEm={n.created_at} />
                          </span>
                        )}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              <Paginacao
                total={resultado.total}
                pagina={resultado.pagina}
                totalPaginas={resultado.totalPaginas}
                porPagina={paginacao.porPagina}
                padrao={POR_PAGINA}
              />
            </>
          ) : externas.length > 0 ? (
            <ul className="divide-y">
              {externas.map((n, i) => (
                <li key={n.url ?? i} className="py-3">
                  <a
                    href={n.url ?? "#"}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-medium underline-offset-4 hover:underline"
                  >
                    {n.titulo}
                    <ExternalLink className="size-3.5 shrink-0" />
                  </a>
                  {(dataDaNoticia(n.quando) ?? n.data) && (
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      {dataDaNoticia(n.quando) ?? n.data}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <EstadoVazio
              icone={Newspaper}
              titulo={busca ? "Nenhuma notícia com essa busca na manchete." : "Nenhuma notícia publicada no momento."}
            />
          )}
        </CardContent>
      </Card>
    </NovasDesde>
  )
}
