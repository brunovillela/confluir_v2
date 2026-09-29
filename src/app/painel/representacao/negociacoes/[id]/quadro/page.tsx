import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, FileSpreadsheet, Lock } from "lucide-react"

import { RotuloTrilha } from "@/components/layout/trilha-rotulos"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { ROTULO_TEMA, temaClausula } from "@/lib/acordos-constantes"
import { requirePermissao } from "@/lib/auth"
import { dadosDoQuadro, obterNegociacao, type ClausulaQuadro } from "@/lib/db/negociacoes"
import { formatarData } from "@/lib/formato"
import { ROTULO_PAPEL } from "@/lib/negociacoes-constantes"
import {
  montarQuadro,
  ROTULO_LEITURA_PAUTA,
  ROTULO_LEITURA_PROPOSTA,
  type LinhaQuadro,
} from "@/lib/negociacoes-quadro"

import { DiferencaQuadro } from "./diferenca"

export const metadata: Metadata = { title: "Quadro comparativo — Confluir" }

const SELECT =
  "border-input bg-background text-foreground h-9 max-w-full truncate rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

const FILTROS = {
  tudo: { rotulo: "Tudo", f: () => true },
  mudou: {
    rotulo: "O que a proposta muda",
    f: (l: LinhaQuadro) => ["alterada", "retirada", "nova"].includes(l.leituraProposta),
  },
  retirada: { rotulo: "Retiradas", f: (l: LinhaQuadro) => l.leituraProposta === "retirada" },
  nova: { rotulo: "Novas na proposta", f: (l: LinhaQuadro) => l.leituraProposta === "nova" },
  sem_resposta: { rotulo: "Pauta sem resposta", f: (l: LinhaQuadro) => l.leituraPauta === "sem_resposta" },
  atendida: { rotulo: "Pauta atendida", f: (l: LinhaQuadro) => l.leituraPauta === "atendida" },
} as const
type Filtro = keyof typeof FILTROS

const CLASSE_LEITURA: Record<string, string> = {
  retirada: "border-destructive/50 text-destructive",
  alterada: "border-warning/50 text-warning-fg",
  nova: "border-primary/50 text-primary",
  mantida: "text-muted-foreground",
  sem_resposta: "border-destructive/50 text-destructive",
  diferente: "border-warning/50 text-warning-fg",
  atendida: "border-success/50 text-success-fg",
}

function rotuloClausula(c: ClausulaQuadro): string {
  return [c.numero ? `Cláusula ${c.numero}` : null, c.titulo].filter(Boolean).join(" · ") || "(sem título)"
}

function Celula({ c, vazio }: { c: ClausulaQuadro | null; vazio: string }) {
  if (!c) return <p className="text-muted-foreground text-xs italic">{vazio}</p>
  return (
    <div className="min-w-0">
      <p className="text-sm font-medium">{rotuloClausula(c)}</p>
      <details>
        <summary className="text-muted-foreground cursor-pointer text-xs">Ver o texto</summary>
        <p className="bg-muted/30 mt-1.5 max-h-80 overflow-auto rounded-md border p-2 text-xs leading-relaxed whitespace-pre-wrap">
          {c.texto}
        </p>
      </details>
    </div>
  )
}

export default async function QuadroPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ proposta?: string; ver?: string }>
}) {
  await requirePermissao("negociacoes")
  const { id } = await params
  const sp = await searchParams
  const n = await obterNegociacao(id)
  if (!n) notFound()

  const q = await dadosDoQuadro(n, sp.proposta ?? null)
  const linhas = montarQuadro(q.vigente, q.pauta, q.proposta)
  const ver: Filtro = sp.ver && sp.ver in FILTROS ? (sp.ver as Filtro) : q.proposta ? "mudou" : "tudo"
  const visiveis = linhas.filter(FILTROS[ver].f)
  const conta = (f: Filtro) => linhas.filter(FILTROS[f].f).length

  const base = `/painel/representacao/negociacoes/${id}/quadro`
  const link = (mud: Record<string, string | null>) => {
    const p = new URLSearchParams()
    const atual: Record<string, string | null> = { proposta: q.propostaDoc?.id ?? null, ver, ...mud }
    for (const [k, v] of Object.entries(atual)) if (v) p.set(k, v)
    return `${base}?${p.toString()}`
  }
  const faltaExtracao = [
    n.acordoVigente && q.vigente.length === 0 ? "o acordo vigente" : null,
    q.pautaDoc && q.pauta.length === 0 ? "a pauta" : null,
    q.propostaDoc && q.proposta?.length === 0 ? "a proposta" : null,
  ].filter(Boolean)

  return (
    <>
      <RotuloTrilha valores={{ negociacoes: "Negociações", [id]: n.titulo, quadro: "Quadro comparativo" }} />
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href={`/painel/representacao/negociacoes/${id}`}>
            <ArrowLeft />
            {n.titulo}
          </Link>
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Quadro comparativo</h1>
            <p className="text-muted-foreground mt-1 flex items-center gap-1.5 text-xs">
              <Lock className="size-3.5" />
              Vigente × pauta × proposta, cláusula a cláusula. Pareamento automático por título e texto — confira no
              texto.
            </p>
          </div>
          <Button variant="outline" size="sm" asChild>
            <a href={`/painel/representacao/negociacoes/${id}/quadro/planilha${q.propostaDoc ? `?proposta=${q.propostaDoc.id}` : ""}`}>
              <FileSpreadsheet />
              Planilha
            </a>
          </Button>
        </div>
      </div>

      {q.candidatas.length > 1 && (
        <form className="flex flex-wrap items-center gap-2" action={base}>
          <label htmlFor="proposta" className="text-sm">
            Proposta:
          </label>
          <select id="proposta" name="proposta" defaultValue={q.propostaDoc?.id} className={SELECT}>
            {q.candidatas.map((d) => (
              <option key={d.id} value={d.id}>
                {ROTULO_PAPEL[d.papel]}
                {d.rodada ? ` — ${d.rodada}ª rodada` : ""}
                {d.data ? ` (${formatarData(d.data)})` : ""}
              </option>
            ))}
          </select>
          <input type="hidden" name="ver" value={ver} />
          <Button type="submit" variant="outline" size="sm">
            Trocar
          </Button>
        </form>
      )}

      {faltaExtracao.length > 0 && (
        <Alert variant="warning">
          <AlertDescription>
            Faltam as cláusulas de {faltaExtracao.join(", ")} — abra o documento e extraia do PDF para o quadro ficar
            completo.
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        {(Object.keys(FILTROS) as Filtro[])
          .filter((f) => f === "tudo" || q.proposta !== null)
          .map((f) => (
            <Button key={f} variant={ver === f ? "default" : "outline"} size="sm" asChild>
              <Link href={link({ ver: f })}>
                {FILTROS[f].rotulo} <span className="tabular-nums opacity-70">{conta(f)}</span>
              </Link>
            </Button>
          ))}
      </div>

      <div className="text-muted-foreground hidden gap-3 px-4 text-xs font-medium lg:grid lg:grid-cols-3">
        <p>Vigente{n.acordoVigente ? ` — ${n.acordoVigente.titulo}` : " (não informado)"}</p>
        <p>Pauta{q.pautaDoc ? ` — ${formatarData(q.pautaDoc.data)}` : " (não cadastrada)"}</p>
        <p>
          {q.propostaDoc
            ? `${ROTULO_PAPEL[q.propostaDoc.papel]}${q.propostaDoc.rodada ? ` — ${q.propostaDoc.rodada}ª rodada` : ""}`
            : "Proposta (não cadastrada)"}
        </p>
      </div>

      {visiveis.length === 0 ? (
        <p className="text-muted-foreground py-6 text-center text-sm">Nada neste filtro.</p>
      ) : (
        <div className="grid gap-2">
          {visiveis.map((l, i) => {
            const tema = temaClausula((l.vigente ?? l.pauta ?? l.proposta)?.tema)
            return (
              <Card key={i}>
                <CardContent className="grid gap-3 py-4">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {l.leituraProposta !== "sem_proposta" && (
                      <Badge variant="outline" className={CLASSE_LEITURA[l.leituraProposta]}>
                        {ROTULO_LEITURA_PROPOSTA[l.leituraProposta]}
                      </Badge>
                    )}
                    {l.leituraPauta && (
                      <Badge variant="outline" className={CLASSE_LEITURA[l.leituraPauta]}>
                        {ROTULO_LEITURA_PAUTA[l.leituraPauta]}
                      </Badge>
                    )}
                    {tema && (
                      <Badge variant="secondary" className="text-xs">
                        {ROTULO_TEMA[tema]}
                      </Badge>
                    )}
                  </div>
                  <div className="grid gap-3 lg:grid-cols-3">
                    <div>
                      <p className="text-muted-foreground mb-1 text-xs lg:hidden">Vigente</p>
                      <Celula c={l.vigente} vazio="Não existe no vigente" />
                    </div>
                    <div>
                      <p className="text-muted-foreground mb-1 text-xs lg:hidden">Pauta</p>
                      <Celula c={l.pauta} vazio={q.pautaDoc ? "Pauta não trata" : "—"} />
                    </div>
                    <div>
                      <p className="text-muted-foreground mb-1 text-xs lg:hidden">Proposta</p>
                      <Celula c={l.proposta} vazio={q.propostaDoc ? "Proposta não traz" : "—"} />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-x-4">
                    {l.vigente && l.proposta && l.leituraProposta === "alterada" && (
                      <DiferencaQuadro
                        negociacaoId={id}
                        antes={l.vigente.id}
                        depois={l.proposta.id}
                        rotulo="Diferença vigente → proposta"
                      />
                    )}
                    {l.pauta && l.proposta && l.leituraPauta === "diferente" && (
                      <DiferencaQuadro
                        negociacaoId={id}
                        antes={l.pauta.id}
                        depois={l.proposta.id}
                        rotulo="Diferença pauta → proposta"
                      />
                    )}
                    {l.vigente && l.pauta && (
                      <DiferencaQuadro
                        negociacaoId={id}
                        antes={l.vigente.id}
                        depois={l.pauta.id}
                        rotulo="O que a pauta pede mudar"
                      />
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </>
  )
}
