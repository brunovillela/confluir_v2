import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { cache } from "react"

import { AvisoDoLinkLido } from "@/app/portal/avisos/aviso-do-link-lido"
import { CabecalhoPagina } from "@/components/portal/cabecalho-pagina"
import { dataDaNoticia, linkDaNoticia, resumir } from "@/lib/db/noticias"
import { buscarNoticia } from "@/lib/db/painel"
import { getVisualizacaoPortal, requireVisualizacaoPortal } from "@/lib/visualizacao-filiado"

import { CompartilharNoticia } from "./compartilhar"

type Props = { params: Promise<{ id: string }> }

/** Uma leitura para o título da aba e a página. */
const lerNoticia = cache((id: string) => buscarNoticia(id))

/**
 * A manchete no título da aba (A87): o link copiado e o histórico do
 * navegador chegam com o assunto, não com "Notícia". Sem sessão, título
 * genérico — a página manda para o login de qualquer jeito.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [{ id }, vis] = await Promise.all([params, getVisualizacaoPortal()])
  const noticia = vis ? await lerNoticia(id) : null
  // O sufixo vem do modelo do layout do portal (A183).
  return { title: noticia?.manchete ?? "Notícia" }
}

export default async function PortalNoticiaPage({ params }: Props) {
  // Visualização, não sessão: o atendente em "Ver como filiado" também lê a
  // notícia (com requireSessaoPortal, ele caía na tela de login — A29).
  const { preview } = await requireVisualizacaoPortal()
  const { id } = await params
  const noticia = await lerNoticia(id)
  if (!noticia) notFound()

  // Imagens migradas do Bubble vêm protocolo-relativas (//cdn…).
  const imagem = noticia.imagem?.startsWith("//")
    ? `https:${noticia.imagem}`
    : noticia.imagem
  const manchete = noticia.manchete ?? "(sem manchete)"

  return (
    <>
      {/* Leu a notícia: o aviso dela no sino (A123) conta como lido. */}
      {!preview && <AvisoDoLinkLido link={linkDaNoticia(noticia.id)} />}
      <CabecalhoPagina
        secao="/portal/noticias"
        voltar={{ base: "/portal/noticias", rotulo: "Notícias" }}
        titulo={manchete}
        subtitulo={
          noticia.created_at && dataDaNoticia(noticia.created_at) ? (
            <time dateTime={noticia.created_at}>{dataDaNoticia(noticia.created_at)}</time>
          ) : undefined
        }
      />

      <CompartilharNoticia
        id={noticia.id}
        manchete={manchete}
        resumo={resumir(noticia.noticia, 240)}
      />

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
