import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Download, Trash2 } from "lucide-react"

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
import { buscarQrCode } from "@/lib/db/comunicacao-qrcodes"
import { formatarData, formatarDataHora } from "@/lib/formato"
import { origemAtual } from "@/lib/tenant-url"

import {
  BotaoAlternarAtivo,
  BotaoCopiarLink,
  ExcluirQr,
  QrEditarForm,
} from "../qr-forms"

export const metadata: Metadata = { title: "QR Code — Confluir" }

const TAMANHOS_PNG = [256, 512, 1024, 2048]

/** Uso sugerido por tamanho, para orientar a escolha na peça. */
const USO_TAMANHO: Record<number, string> = {
  256: "e-mail, assinatura",
  512: "post de rede social",
  1024: "slide, cartaz A4",
  2048: "faixa, banner",
}

export default async function QrCodePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ salvo?: string }>
}) {
  await requirePermissao("noticias")
  const { id } = await params
  const { salvo } = await searchParams

  const qr = await buscarQrCode(id)
  if (!qr) notFound()

  const urlCurta = `${await origemAtual()}/q/${qr.slug}`
  const imagem = (extra: string) =>
    `/painel/comunicacao/qrcodes/${id}/imagem?${extra}`

  return (
    <>
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3">
          <Link href="/painel/comunicacao/qrcodes">
            <ArrowLeft />
            QR Codes
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            {qr.titulo ?? qr.slug}
          </h1>
          {qr.ativo ? (
            <Badge variant="outline" className="border-success/40 text-success-fg">
              Ativo
            </Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground">
              Inativo
            </Badge>
          )}
        </div>
        <p className="text-muted-foreground mt-1 text-xs">
          {qr.leituras} leitura{qr.leituras === 1 ? "" : "s"}
          {qr.ultima_leitura
            ? ` · última em ${formatarDataHora(qr.ultima_leitura)}`
            : ""}{" "}
          · criado por {qr.criadoPorNome ?? "—"} em {formatarData(qr.created_at)}
        </p>
      </div>

      {salvo === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>
            QR Code gerado. Baixe a imagem abaixo no tamanho da sua peça.
          </AlertDescription>
        </Alert>
      )}

      {!qr.ativo && (
        <Alert variant="destructive">
          <AlertDescription>
            Este QR Code está desativado — quem escanear verá a página de
            aviso, não o destino.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Imagem e downloads</CardTitle>
            <CardDescription>
              A imagem codifica o link curto — trocar o destino não a altera.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="flex justify-center rounded-lg border bg-white p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imagem("formato=png&tamanho=256")}
                alt={`QR Code ${qr.titulo ?? qr.slug}`}
                width={224}
                height={224}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <code className="bg-muted min-w-0 flex-1 truncate rounded px-2 py-1.5 text-xs">
                {urlCurta}
              </code>
              <BotaoCopiarLink url={urlCurta} />
            </div>
            <div className="grid gap-2">
              <p className="text-sm font-medium">Baixar PNG</p>
              <div className="flex flex-wrap gap-2">
                {TAMANHOS_PNG.map((t) => (
                  <Button key={t} asChild variant="outline" size="sm">
                    <a href={imagem(`formato=png&tamanho=${t}&download=1`)}>
                      <Download className="size-3.5" />
                      {t}px
                      <span className="text-muted-foreground hidden text-xs sm:inline">
                        · {USO_TAMANHO[t]}
                      </span>
                    </a>
                  </Button>
                ))}
              </div>
              <p className="text-sm font-medium">Baixar vetor</p>
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline" size="sm">
                  <a href={imagem("formato=svg&download=1")}>
                    <Download className="size-3.5" />
                    SVG
                    <span className="text-muted-foreground hidden text-xs sm:inline">
                      · impressão em qualquer tamanho (gráfica)
                    </span>
                  </a>
                </Button>
              </div>
              <p className="text-muted-foreground text-xs">
                Para impressão, prefira o SVG (vetor não perde qualidade). Nos
                PNGs, use o maior tamanho que a peça comportar e mantenha a
                margem branca ao redor do código.
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Dados do QR Code</CardTitle>
            </CardHeader>
            <CardContent>
              <QrEditarForm
                qr={{
                  id: qr.id,
                  titulo: qr.titulo,
                  finalidade: qr.finalidade,
                  destino_url: qr.destino_url,
                }}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Ativo / inativo</CardTitle>
              <CardDescription>
                Desativar derruba o redirecionamento na hora — vale também para
                peças já impressas. Dá para reativar quando quiser.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <BotaoAlternarAtivo id={qr.id} ativo={qr.ativo} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-destructive text-base">
                <Trash2 className="mr-1 inline size-4 align-[-3px]" />
                Excluir QR Code
              </CardTitle>
              <CardDescription>
                Exclusão é definitiva: o link curto some e peças impressas com
                este QR deixam de funcionar. Para tirar do ar temporariamente,
                use Desativar.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ExcluirQr id={qr.id} />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}
