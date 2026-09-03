import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"

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
import { objetivoPorValor, obterTexto } from "@/lib/db/comunicacao-textos"
import { formatarDataHora } from "@/lib/formato"

import { BotaoCopiar, RegerarForm, ResultadoTexto } from "../textos-forms"

export const metadata: Metadata = { title: "Texto — Confluir" }

/** Rótulo + valor, escondido quando não houver valor. */
function Campo({ rotulo, valor }: { rotulo: string; valor: string | null }) {
  if (!valor?.trim()) return null
  return (
    <div className="grid gap-1">
      <span className="text-muted-foreground text-xs">{rotulo}</span>
      <span className="text-sm whitespace-pre-wrap">{valor}</span>
    </div>
  )
}

export default async function TextoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermissao("noticias")
  const { id } = await params
  const achado = await obterTexto(id)
  if (!achado) notFound()

  const { texto: t, versoes } = achado
  const outras = versoes.filter((v) => v.id !== t.id)

  return (
    <>
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3">
          <Link href="/painel/comunicacao/textos">
            <ArrowLeft />
            Assistente de redação
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            {t.assunto || t.titulo || "Texto"}
          </h1>
          {t.versao > 1 && <Badge variant="secondary">versão {t.versao}</Badge>}
        </div>
        <p className="text-muted-foreground mt-1 text-xs">
          {objetivoPorValor(t.objetivo)?.rotulo ?? "—"}
          {t.canal_nome ? ` · ${t.canal_nome}` : ""} · solicitado por{" "}
          {t.solicitadoPorNome ?? "—"} em {formatarDataHora(t.created_at)}
        </p>
      </div>

      {t.titulo && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Título sugerido</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium">{t.titulo}</span>
            <BotaoCopiar texto={t.titulo} rotulo="Copiar título" />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Texto</CardTitle>
          <CardDescription>
            Edite à vontade antes de publicar. O que você salvar aqui fica
            guardado como a versão final, ao lado do que a IA gerou.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResultadoTexto
            id={t.id}
            gerado={t.texto_gerado ?? ""}
            final={t.texto_final}
            alvo={t.tamanho}
          />
        </CardContent>
      </Card>

      {(t.hashtags || t.meta_descricao || t.slug_sugerido) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Otimização para busca</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            {t.hashtags && (
              <div className="grid gap-2">
                <span className="text-muted-foreground text-xs">Hashtags</span>
                <span className="text-sm">{t.hashtags}</span>
                <div>
                  <BotaoCopiar texto={t.hashtags} rotulo="Copiar hashtags" />
                </div>
              </div>
            )}
            {t.meta_descricao && (
              <div className="grid gap-2">
                <span className="text-muted-foreground text-xs">
                  Meta descrição ({t.meta_descricao.length} caracteres)
                </span>
                <span className="text-sm">{t.meta_descricao}</span>
                <div>
                  <BotaoCopiar
                    texto={t.meta_descricao}
                    rotulo="Copiar meta descrição"
                  />
                </div>
              </div>
            )}
            {t.slug_sugerido && (
              <div className="grid gap-2">
                <span className="text-muted-foreground text-xs">
                  Endereço sugerido da página
                </span>
                <code className="text-sm">{t.slug_sugerido}</code>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Não ficou bom?</CardTitle>
          <CardDescription>
            Diga o que mudar e a IA reescreve aproveitando a mesma solicitação.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RegerarForm id={t.id} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">A solicitação</CardTitle>
          <CardDescription>
            O que a IA recebeu para escrever este texto.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-4 sm:col-span-2">
            <Campo rotulo="Fatos" valor={t.fatos} />
          </div>
          <Campo rotulo="Público" valor={t.publico} />
          <Campo rotulo="Tom" valor={t.tom} />
          <Campo rotulo="Chamada para ação" valor={t.chamada_acao} />
          <Campo rotulo="Não mencionar" valor={t.restricoes} />
          <Campo rotulo="Palavras-chave" valor={t.palavras_chave} />
          <Campo
            rotulo="Tamanho pedido"
            valor={t.tamanho ? `${t.tamanho} caracteres` : null}
          />
          <Campo rotulo="Ajuste pedido nesta versão" valor={t.ajuste_pedido} />
        </CardContent>
      </Card>

      {outras.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Outras versões</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            {outras.map((v) => (
              <Link
                key={v.id}
                href={`/painel/comunicacao/textos/${v.id}`}
                className="hover:bg-muted/50 flex flex-wrap items-center gap-3 rounded-md border p-3 text-sm"
              >
                <Badge variant="secondary">versão {v.versao}</Badge>
                <span className="text-muted-foreground">
                  {formatarDataHora(v.created_at)}
                </span>
                {v.ajuste_pedido && (
                  <span className="text-muted-foreground truncate">
                    “{v.ajuste_pedido}”
                  </span>
                )}
              </Link>
            ))}
          </CardContent>
        </Card>
      )}
    </>
  )
}
