"use client"

import { useActionState } from "react"
import Link from "next/link"
import { ExternalLink, FilePlus2, Loader2, Sparkles, X } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { confirmarEnvio } from "@/components/ui/confirmacao"
import { ROTULOS_ORIGEM_SUGESTAO } from "@/lib/anomalias-sugestoes-constantes"
import { type EstadoForm } from "@/lib/contas"
import type { SugestaoAnomalia } from "@/lib/db/anomalias-sugestoes"
import { formatarData } from "@/lib/formato"

import { abrirSugestaoAction, descartarSugestaoAction } from "./actions"

function Decisao({ sugestao }: { sugestao: SugestaoAnomalia }) {
  const [estadoAbrir, abrir, abrindo] = useActionState<EstadoForm, FormData>(abrirSugestaoAction, {})
  const [estadoDescartar, descartar, descartando] = useActionState<EstadoForm, FormData>(descartarSugestaoAction, {})
  const erro = estadoAbrir.erro ?? estadoDescartar.erro
  return (
    <div className="flex flex-wrap items-center gap-2">
      <form action={abrir}>
        <input type="hidden" name="sugestao_id" value={sugestao.id} />
        <Button type="submit" size="sm" disabled={abrindo || descartando}>
          {abrindo ? <Loader2 className="animate-spin" /> : <FilePlus2 />}
          Abrir anomalia
        </Button>
      </form>
      <form
        action={descartar}
        onSubmit={(e) =>
          confirmarEnvio(e, {
            titulo: "Descartar a sugestão?",
            descricao: `"${sugestao.fato}" sai da fila e não volta a ser sugerida.`,
            confirmar: "Descartar",
          })
        }
      >
        <input type="hidden" name="sugestao_id" value={sugestao.id} />
        <Button type="submit" size="sm" variant="ghost" disabled={abrindo || descartando}>
          {descartando ? <Loader2 className="animate-spin" /> : <X />}
          Descartar
        </Button>
      </form>
      {erro && <span className="text-destructive text-xs">{erro}</span>}
    </div>
  )
}

/**
 * A fila "Sugestões do sistema": ocorrências que o sistema achou e podem ser
 * anomalias. Abrir cria a anomalia já preenchida (com quem abre na apuração);
 * descartar tira da fila de vez.
 */
export function SugestoesAnomalia({ sugestoes }: { sugestoes: SugestaoAnomalia[] }) {
  if (sugestoes.length === 0) return null
  return (
    <Card id="sugestoes" className="border-warning/40">
      <CardContent className="grid gap-3">
        <div>
          <p className="flex items-center gap-2 text-sm font-medium">
            <Sparkles className="text-warning-fg size-4" />
            Sugestões do sistema{" "}
            <span className="text-muted-foreground font-normal">({sugestoes.length})</span>
          </p>
          <p className="text-muted-foreground mt-0.5 text-xs">
            Ocorrências que o sistema achou e podem ser anomalias. Confira a origem e abra a anomalia ou descarte.
          </p>
        </div>
        <ul className="grid divide-y">
          {sugestoes.map((s) => (
            <li key={s.id} className="grid gap-2 py-3 first:pt-0 last:pb-0 sm:grid-cols-[1fr_auto] sm:items-start">
              <div className="grid min-w-0 gap-1">
                <span className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="text-muted-foreground">
                    {ROTULOS_ORIGEM_SUGESTAO[s.origem]}
                  </Badge>
                  {s.dataOcorrencia && <span className="text-muted-foreground text-xs">{formatarData(s.dataOcorrencia)}</span>}
                </span>
                <span className="text-sm font-medium">{s.fato}</span>
                {s.descricao && <span className="text-muted-foreground line-clamp-3 text-xs whitespace-pre-line">{s.descricao}</span>}
                {s.link && (
                  <Link href={s.link} className="text-primary inline-flex w-fit items-center gap-1 text-xs hover:underline">
                    <ExternalLink className="size-3.5" />
                    Ver a origem
                  </Link>
                )}
              </div>
              <Decisao sugestao={s} />
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
