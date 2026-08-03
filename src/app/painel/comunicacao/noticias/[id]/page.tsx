import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Pencil } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { requireSessaoPainel } from "@/lib/auth"
import { buscarNoticia } from "@/lib/db/painel"
import { formatarData } from "@/lib/formato"
import { podeAcessar } from "@/lib/permissoes"

import { BotaoExcluirNoticia, EditarNoticiaForm } from "../noticias-forms"

export const metadata: Metadata = { title: "Notícia — Confluir" }

export default async function NoticiaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ editar?: string; salvo?: string }>
}) {
  const sessao = await requireSessaoPainel()
  const podeGerir = podeAcessar(sessao.permissoes, "noticias")

  const { id } = await params
  const { editar, salvo } = await searchParams
  const noticia = await buscarNoticia(id)
  if (!noticia) notFound()

  const aqui = `/painel/comunicacao/noticias/${id}`
  const editando = editar === "1" && podeGerir

  // Imagens migradas do Bubble vêm protocolo-relativas (//cdn.bubble.io/…)
  const imagem = noticia.imagem
    ? noticia.imagem.startsWith("//")
      ? `https:${noticia.imagem}`
      : noticia.imagem
    : null

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href={podeGerir ? "/painel/comunicacao/noticias" : "/painel"}>
            <ArrowLeft />
            {podeGerir ? "Notícias" : "Painel"}
          </Link>
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-balance">
              {noticia.manchete ?? "(sem manchete)"}
            </h1>
            <p className="text-muted-foreground mt-1 text-xs">
              {formatarData(noticia.created_at)}
            </p>
          </div>
          {podeGerir && !editando && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link href={`${aqui}?editar=1`}>
                  <Pencil />
                  Editar
                </Link>
              </Button>
              <BotaoExcluirNoticia id={id} />
            </div>
          )}
        </div>
      </div>

      {salvo === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Notícia salva.</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="grid gap-4 py-6">
          {editando ? (
            <EditarNoticiaForm noticia={noticia} aoCancelarHref={aqui} />
          ) : (
            <>
              {imagem && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={imagem}
                  alt={noticia.manchete ?? "Imagem da notícia"}
                  className="max-h-96 w-full rounded-lg object-cover"
                />
              )}
              <div className="max-w-prose text-sm leading-relaxed whitespace-pre-wrap">
                {noticia.noticia ?? "(sem conteúdo)"}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </>
  )
}
