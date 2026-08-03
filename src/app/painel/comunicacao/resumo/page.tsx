import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, ExternalLink, Rss, Sparkles } from "lucide-react"

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
import { GrupoColapsavel } from "@/components/grupo-colapsavel"
import { requirePermissao } from "@/lib/auth"
import {
  listarFontes,
  listarResumos,
  obterConfig,
} from "@/lib/db/comunicacao"
import { formatarDataHora } from "@/lib/formato"

import {
  AdicionarFonteForm,
  ConfigForm,
  GerarAgoraBotao,
  RemoverFonteBotao,
} from "./resumo-forms"

export const metadata: Metadata = { title: "Resumo de notícias — Confluir" }

export default async function ResumoPage({
  searchParams,
}: {
  searchParams: Promise<{ salvo?: string }>
}) {
  await requirePermissao("noticias")
  const { salvo } = await searchParams
  const [config, fontes, resumos] = await Promise.all([
    obterConfig(),
    listarFontes(),
    listarResumos(20),
  ])

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/comunicacao">
            <ArrowLeft />
            Comunicação
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">
          Resumo de notícias
        </h1>
        <p className="text-muted-foreground mt-1 text-xs">
          A IA lê os sites indicados e gera um resumo com título chamativo,
          exibido no painel principal de todos os usuários.
        </p>
      </div>

      {salvo === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Configuração salva.</AlertDescription>
        </Alert>
      )}

      {/* Sites */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Sites de notícias</CardTitle>
            <Rss className="text-muted-foreground size-4" />
          </div>
          <CardDescription>
            {fontes.length} site{fontes.length === 1 ? "" : "s"} que a IA vai ler.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <AdicionarFonteForm />
          {fontes.length > 0 && (
            <ul className="divide-y">
              {fontes.map((f) => (
                <li
                  key={f.id}
                  className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0"
                >
                  <span className="min-w-0 text-sm">
                    <span className="font-medium">{f.nome ?? f.url}</span>
                    <a
                      href={f.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-muted-foreground ml-2 inline-flex items-center gap-1 text-xs underline-offset-4 hover:underline"
                    >
                      abrir <ExternalLink className="size-3" />
                    </a>
                  </span>
                  <RemoverFonteBotao id={f.id} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Configuração + gerar agora */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Configuração do resumo</CardTitle>
          <CardDescription>
            Defina a recorrência, o tamanho e o prompt que a IA usa. Você também
            pode gerar um resumo agora, sob demanda.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6">
          <ConfigForm config={config} />
          <div className="border-t pt-4">
            <GerarAgoraBotao />
          </div>
        </CardContent>
      </Card>

      {/* Histórico */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Histórico de resumos</CardTitle>
            <Sparkles className="text-muted-foreground size-4" />
          </div>
          <CardDescription>
            {resumos.length} resumo{resumos.length === 1 ? "" : "s"} gerado
            {resumos.length === 1 ? "" : "s"}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {resumos.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-sm">
              Nenhum resumo gerado ainda. Cadastre sites e clique em “Gerar
              agora”.
            </p>
          ) : (
            <div className="grid gap-3">
              {resumos.map((r) => (
                <GrupoColapsavel
                  key={r.id}
                  titulo={r.titulo ?? "(sem título)"}
                  descricao={`${formatarDataHora(r.created_at)} · ${
                    r.origem === "agendador" ? "automático" : "manual"
                  }${r.tamanho ? ` · ~${r.tamanho} caracteres` : ""}`}
                  resumo={
                    <Badge variant="outline" className="text-muted-foreground">
                      {r.fontes_url.length} fonte
                      {r.fontes_url.length === 1 ? "" : "s"}
                    </Badge>
                  }
                >
                  <p className="text-sm whitespace-pre-wrap">{r.resumo ?? "—"}</p>
                  {r.fontes_url.length > 0 && (
                    <p className="text-muted-foreground mt-3 text-xs">
                      Fontes: {r.fontes_url.join(" · ")}
                    </p>
                  )}
                </GrupoColapsavel>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  )
}
