import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, FileDown, FileText, History, RotateCcw } from "lucide-react"

import { GrupoColapsavel } from "@/components/grupo-colapsavel"
import { RotuloTrilha } from "@/components/layout/trilha-rotulos"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { ORIGENS_VERSAO } from "@/lib/contratos-minutas-constantes"
import { opcoesContratos } from "@/lib/db/contratos"
import { obterMinuta } from "@/lib/db/contratos-minutas"
import { formatarDataHora } from "@/lib/formato"

import { restaurarVersaoAction } from "../actions"
import { DadosMinutaForm, EditorMinuta, ExcluirMinuta } from "./minuta-forms"

export const metadata: Metadata = { title: "Minuta — Confluir" }
// "Ajustar com IA" reescreve o contrato inteiro na server action.
export const maxDuration = 300

export default async function MinutaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{
    criada?: string
    truncado?: string
    ajustada?: string
    restaurada?: string
  }>
}) {
  await requirePermissao("aquisicoes_contratos_edicao")
  const { id } = await params
  const sp = await searchParams
  const [minuta, contratos] = await Promise.all([obterMinuta(id), opcoesContratos()])
  if (!minuta) notFound()

  const base = `/painel/compras/contratos/minutas/${id}`

  return (
    <>
      <RotuloTrilha valores={{ [id]: minuta.titulo ?? "Minuta" }} />
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/compras/contratos/minutas">
            <ArrowLeft />
            Minutas
          </Link>
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">{minuta.titulo ?? "Minuta"}</h1>
              {minuta.finalizada ? (
                <Badge variant="outline" className="border-success/40 text-success-fg">
                  Finalizada
                </Badge>
              ) : (
                <Badge variant="outline" className="text-muted-foreground">
                  Rascunho
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground mt-1 text-xs">
              {minuta.tipo ?? "Contrato"} · versão {minuta.versao}
              {minuta.contratoId && (
                <>
                  {" · "}
                  <Link href={`/painel/compras/contratos/${minuta.contratoId}`} className="hover:underline">
                    contrato {minuta.contratoCodigo ?? ""}
                  </Link>
                </>
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild>
              <a href={`${base}/pdf`} target="_blank" rel="noreferrer">
                <FileText />
                PDF
              </a>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a href={`${base}/word`}>
                <FileDown />
                Word
              </a>
            </Button>
          </div>
        </div>
      </div>

      {sp.criada === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>
            Minuta redigida. Revise o texto inteiro e preencha o que ficou marcado antes de enviar à outra
            parte — a IA não substitui a revisão jurídica.
          </AlertDescription>
        </Alert>
      )}
      {sp.truncado === "1" && (
        <Alert variant="warning">
          <AlertDescription>
            O texto ficou longo demais e veio cortado no fim. Confira a última cláusula e, se faltar algo,
            peça à IA: “complete a minuta a partir da cláusula …”.
          </AlertDescription>
        </Alert>
      )}
      {sp.ajustada && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Ajuste feito (versão {sp.ajustada}).</AlertDescription>
        </Alert>
      )}
      {sp.restaurada && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Versão {sp.restaurada} restaurada como a atual.</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="pt-6">
          {/* key: depois de ajuste/restauração o editor recomeça do texto novo. */}
          <EditorMinuta
            key={`${minuta.versao}`}
            id={id}
            texto={minuta.texto ?? ""}
            clausulasFixas={minuta.parametros.clausulasFixas ?? []}
          />
        </CardContent>
      </Card>

      <GrupoColapsavel titulo="Dados da minuta" descricao="Título, contrato vinculado e se está finalizada">
        <DadosMinutaForm
          id={id}
          titulo={minuta.titulo ?? ""}
          contratoId={minuta.contratoId}
          finalizada={minuta.finalizada}
          contratos={contratos.map((c) => ({
            id: c.id,
            rotulo: [c.codigo, c.objeto].filter(Boolean).join(" — ") || "(sem objeto)",
          }))}
        />
      </GrupoColapsavel>

      <GrupoColapsavel
        titulo="Versões"
        descricao="Cada redação, ajuste e edição fica guardada"
        resumo={
          <Badge variant="outline" className="text-muted-foreground tabular-nums">
            <History className="size-3" />
            {minuta.versoes.length}
          </Badge>
        }
      >
        <ul className="grid gap-2">
          {minuta.versoes.map((v) => (
            <li key={v.id} className="rounded-md border p-2.5 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <span className="font-medium">Versão {v.versao}</span>
                  <span className="text-muted-foreground">
                    {" "}
                    · {ORIGENS_VERSAO[v.origem] ?? v.origem} · {formatarDataHora(v.createdAt)}
                    {v.autor ? ` · ${v.autor}` : ""}
                  </span>
                </span>
                {v.versao !== minuta.versao && (
                  <form action={restaurarVersaoAction}>
                    <input type="hidden" name="id" value={id} />
                    <input type="hidden" name="versao_id" value={v.id} />
                    <Button type="submit" variant="ghost" size="sm">
                      <RotateCcw />
                      Restaurar
                    </Button>
                  </form>
                )}
              </div>
              {v.pedido && <p className="text-muted-foreground mt-1 text-xs">Pedido: {v.pedido}</p>}
              <details className="mt-1">
                <summary className="text-muted-foreground cursor-pointer text-xs">Ver texto</summary>
                <pre className="bg-muted/40 mt-2 max-h-80 overflow-auto rounded p-2 text-xs whitespace-pre-wrap">
                  {v.texto}
                </pre>
              </details>
            </li>
          ))}
        </ul>
      </GrupoColapsavel>

      <div className="flex justify-end">
        <ExcluirMinuta id={id} />
      </div>
    </>
  )
}
