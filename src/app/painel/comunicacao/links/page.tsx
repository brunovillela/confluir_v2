import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, ExternalLink, Link2, QrCode } from "lucide-react"

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
import { obterPaginaLinks } from "@/lib/db/comunicacao-links"
import { nomeEntidade } from "@/lib/db/organizacao"
import { origemAtual } from "@/lib/tenant-url"

import { ConfigLinksForm, LinhaLink, NovoLinkForm } from "./links-forms"
import { BotaoCopiarLink } from "../qrcodes/qr-forms"

export const metadata: Metadata = { title: "Página de links — Confluir" }

export default async function PaginaLinksAdminPage() {
  await requirePermissao("noticias")
  const [{ ativo, config, links }, nome, origem] = await Promise.all([
    obterPaginaLinks(),
    nomeEntidade(),
    origemAtual(),
  ])
  const urlPublica = `${origem}/links`
  const totalCliques = links.reduce((s, l) => s + l.cliques, 0)

  return (
    <>
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3">
          <Link href="/painel/comunicacao">
            <ArrowLeft />
            Comunicação
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            Página de links
          </h1>
          {ativo &&
            (config.publicada ? (
              <Badge variant="outline" className="border-success/40 text-success-fg">
                Publicada
              </Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground">
                Despublicada
              </Badge>
            ))}
        </div>
        <p className="text-muted-foreground mt-1 text-xs">
          O &quot;link na bio&quot; da entidade: uma página pública com os seus
          canais e conteúdos, para usar no Instagram e nas outras redes.{" "}
          {links.length} link{links.length === 1 ? "" : "s"} · {totalCliques}{" "}
          clique{totalCliques === 1 ? "" : "s"} no total.
        </p>
      </div>

      {!ativo && (
        <Alert variant="destructive">
          <AlertDescription>
            O schema desta área ainda não foi criado — rode{" "}
            <code>supabase/comunicacao-pagina-links.sql</code> no SQL Editor do
            Supabase para ativar.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Endereço público</CardTitle>
          <CardDescription>
            É este link que vai na bio do Instagram. Ele é fixo — o que muda é o
            conteúdo que você gerencia abaixo.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <code className="bg-muted min-w-0 flex-1 truncate rounded px-2 py-1.5 text-xs">
            {urlPublica}
          </code>
          <BotaoCopiarLink url={urlPublica} />
          <Button asChild variant="outline" size="sm">
            <a href="/links" target="_blank" rel="noreferrer">
              <ExternalLink className="size-3.5" />
              Ver página
            </a>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link
              href={`/painel/comunicacao/qrcodes?destino=${encodeURIComponent(urlPublica)}`}
            >
              <QrCode className="size-3.5" />
              Emitir QR desta página
            </Link>
          </Button>
        </CardContent>
      </Card>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Aparência da página</CardTitle>
            <CardDescription>
              Título, bio e publicação. O logo vem do cadastro da organização
              (Institucional).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ConfigLinksForm
              config={{
                titulo: config.titulo,
                bio: config.bio,
                publicada: config.publicada,
              }}
              nomeEntidade={nome}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              <Link2 className="mr-1 inline size-4 align-[-3px]" />
              Links da página
            </CardTitle>
            <CardDescription>
              Na ordem em que aparecem. Ocultar (olho) tira da página sem
              perder o contador; excluir apaga de vez.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {links.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Nenhum link ainda — adicione o primeiro abaixo.
              </p>
            ) : (
              <ul className="divide-y rounded-lg border">
                {links.map((l, i) => (
                  <LinhaLink
                    key={l.id}
                    link={l}
                    primeiro={i === 0}
                    ultimo={i === links.length - 1}
                  />
                ))}
              </ul>
            )}
            <NovoLinkForm />
          </CardContent>
        </Card>
      </div>
    </>
  )
}
