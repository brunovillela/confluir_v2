import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"

import { Button } from "@/components/ui/button"
import { buscarNoticia } from "@/lib/db/painel"
import { formatarData } from "@/lib/formato"
import { requireVisualizacaoPortal } from "@/lib/visualizacao-filiado"

export const metadata: Metadata = { title: "Notícia — Portal do Associado" }

export default async function PortalNoticiaPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  // Visualização, não sessão: o atendente em "Ver como filiado" também lê a
  // notícia (com requireSessaoPortal, ele caía na tela de login — A29).
  await requireVisualizacaoPortal()
  const { id } = await params
  const noticia = await buscarNoticia(id)
  if (!noticia) notFound()

  // Imagens migradas do Bubble vêm protocolo-relativas (//cdn…).
  const imagem = noticia.imagem?.startsWith("//")
    ? `https:${noticia.imagem}`
    : noticia.imagem

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/portal/noticias">
            <ArrowLeft />
            Notícias
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">
          {noticia.manchete ?? "(sem manchete)"}
        </h1>
        <p className="text-muted-foreground mt-1 text-xs">
          {formatarData(noticia.created_at)}
        </p>
      </div>

      {imagem && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imagem}
          alt=""
          className="max-h-96 w-full rounded-xl border object-cover"
        />
      )}

      <div className="max-w-3xl text-sm leading-relaxed whitespace-pre-wrap">
        {noticia.noticia ?? "Sem conteúdo."}
      </div>
    </>
  )
}
