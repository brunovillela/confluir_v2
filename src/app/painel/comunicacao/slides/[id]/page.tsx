import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, ExternalLink, MonitorPlay, QrCode } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import {
  descreverUltimoAcesso,
  situacaoDoSlide,
} from "@/lib/comunicacao-slides-constantes"
import { hojeSP } from "@/lib/db/comum"
import {
  buscarConjuntoSlides,
  exibicaoDoLink,
} from "@/lib/db/comunicacao-slides"
import { obterOrganizacao } from "@/lib/db/organizacao"
import { origemAtual } from "@/lib/tenant-url"

import { BotaoCopiarLink } from "../../qrcodes/qr-forms"
import {
  BotaoNovoLink,
  ConfigConjuntoForm,
  DuplicarConjuntoForm,
  ExcluirConjunto,
  LinhaSlide,
  SlideForm,
} from "../slides-forms"

export const metadata: Metadata = { title: "Conjunto de slides — Confluir" }

/** AAAA-MM-DD → DD/MM/AAAA, sem passar por fuso. */
function dataBR(iso: string): string {
  const [a, m, d] = iso.split("-")
  return `${d}/${m}/${a}`
}

function periodo(de: string | null, ate: string | null): string | null {
  if (de && ate) return `${dataBR(de)} a ${dataBR(ate)}`
  if (de) return `a partir de ${dataBR(de)}`
  if (ate) return `até ${dataBR(ate)}`
  return null
}

export default async function ConjuntoSlidesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ criado?: string; duplicado?: string }>
}) {
  await requirePermissao("noticias")
  const { id } = await params
  const { criado, duplicado } = await searchParams
  const achado = await buscarConjuntoSlides(id)
  if (!achado) notFound()
  const { conjunto, slides } = achado

  const [origem, organizacao, exibicao] = await Promise.all([
    origemAtual(),
    obterOrganizacao().catch(() => null),
    exibicaoDoLink(conjunto.slug, { registrarAcesso: false }),
  ])
  const urlPublica = `${origem}/tv/${conjunto.slug}`
  const tv = descreverUltimoAcesso(conjunto.ultimoAcesso, new Date())
  const hoje = hojeSP()
  const noAr = slides.filter((s) => situacaoDoSlide(s, hoje) === "no_ar").length
  const vertical = conjunto.orientacao === "vertical"

  return (
    <>
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3">
          <Link href="/painel/comunicacao/slides">
            <ArrowLeft />
            Slides para TV
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{conjunto.nome}</h1>
          {conjunto.publicado ? (
            <Badge variant="outline" className="border-success/40 text-success-fg">
              Publicado
            </Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground">
              Fora do ar
            </Badge>
          )}
          <Badge variant="secondary" className="capitalize">
            {conjunto.orientacao}
          </Badge>
        </div>
        <p className="text-muted-foreground mt-1 text-xs">
          {noAr} de {slides.length} slide{slides.length === 1 ? "" : "s"} no ar
          hoje · {tv.rotulo}.
        </p>
      </div>

      {criado === "1" && (
        <Alert variant="success">
          <AlertDescription>
            Conjunto criado. Adicione os slides e abra o link público na TV.
          </AlertDescription>
        </Alert>
      )}
      {duplicado === "1" && (
        <Alert variant="success">
          <AlertDescription>
            Cópia criada, com link próprio. Confira os slides: imagens pensadas
            para a outra orientação podem precisar de troca.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Link da TV</CardTitle>
          <CardDescription>
            Abra este endereço no navegador da TV e deixe a página aberta (um
            clique ou OK no controle coloca em tela cheia). A TV confere
            mudanças a cada minuto.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <code className="bg-muted min-w-0 flex-1 truncate rounded px-2 py-1.5 text-xs">
              {urlPublica}
            </code>
            <BotaoCopiarLink url={urlPublica} />
            <Button asChild variant="outline" size="sm">
              <a href={`/tv/${conjunto.slug}?previa=1`} target="_blank" rel="noreferrer">
                <ExternalLink className="size-3.5" />
                Abrir
              </a>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link
                href={`/painel/comunicacao/qrcodes?destino=${encodeURIComponent(urlPublica)}`}
              >
                <QrCode className="size-3.5" />
                Emitir QR
              </Link>
            </Button>
          </div>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <p className={`text-xs ${tv.noAr ? "text-success-fg font-medium" : "text-muted-foreground"}`}>
              <MonitorPlay className="mr-1 inline size-3.5 align-[-3px]" />
              {tv.rotulo}
            </p>
            <BotaoNovoLink id={conjunto.id} />
          </div>
        </CardContent>
      </Card>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <div className="grid gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Prévia</CardTitle>
              <CardDescription>
                O que a TV mostra agora, em tamanho reduzido. Slides agendados
                ou encerrados não entram.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div
                className={`mx-auto overflow-hidden rounded-lg border bg-black ${
                  vertical ? "aspect-[9/16] w-full max-w-72" : "aspect-video w-full"
                }`}
              >
                <iframe
                  key={exibicao.versao}
                  src={`/tv/${conjunto.slug}?previa=1`}
                  title={`Prévia de ${conjunto.nome}`}
                  className="size-full border-0"
                  loading="lazy"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Configuração</CardTitle>
              <CardDescription>
                Tempo dos slides, logo, faixa de notícias e publicação.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ConfigConjuntoForm
                conjunto={{
                  id: conjunto.id,
                  nome: conjunto.nome,
                  orientacao: conjunto.orientacao,
                  girar: conjunto.girar,
                  duracaoSegundos: conjunto.duracaoSegundos,
                  mostrarLogo: conjunto.mostrarLogo,
                  opacidadeLogo: conjunto.opacidadeLogo,
                  faixaAtiva: conjunto.faixaAtiva,
                  faixaNoticias: conjunto.faixaNoticias,
                  faixaQuantidade: conjunto.faixaQuantidade,
                  faixaTexto: conjunto.faixaTexto,
                  mostrarRelogio: conjunto.mostrarRelogio,
                  publicado: conjunto.publicado,
                }}
                temLogo={Boolean(organizacao?.logoUrl)}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Outras ações</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap items-start justify-between gap-3">
              <DuplicarConjuntoForm id={conjunto.id} orientacao={conjunto.orientacao} />
              <ExcluirConjunto id={conjunto.id} />
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Slides</CardTitle>
              <CardDescription>
                Na ordem em que passam. O olho tira o slide da TV sem apagar.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {slides.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  Nenhum slide ainda — adicione o primeiro abaixo.
                </p>
              ) : (
                <ul className="divide-y rounded-lg border">
                  {slides.map((s, i) => (
                    <LinhaSlide
                      key={s.id}
                      slide={s}
                      posicao={i + 1}
                      primeiro={i === 0}
                      ultimo={i === slides.length - 1}
                      situacao={situacaoDoSlide(s, hoje)}
                      periodo={periodo(s.exibirDe, s.exibirAte)}
                      conjuntoId={conjunto.id}
                      orientacao={conjunto.orientacao}
                      duracaoPadrao={conjunto.duracaoSegundos}
                    />
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Novo slide</CardTitle>
              <CardDescription>
                Imagem, título e descrição — ao menos a imagem ou o título.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SlideForm
                conjuntoId={conjunto.id}
                orientacao={conjunto.orientacao}
                duracaoPadrao={conjunto.duracaoSegundos}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}
