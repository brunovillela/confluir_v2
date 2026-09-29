import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, FileSpreadsheet, FileText, Trash2 } from "lucide-react"

import { RotuloTrilha } from "@/components/layout/trilha-rotulos"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  CLASSE_AVALIACAO,
  ROTULO_AVALIACAO,
  ROTULO_SITUACAO,
  type Situacao,
} from "@/lib/acordos-comparar"
import { ROTULO_TEMA, temaClausula } from "@/lib/acordos-constantes"
import { requirePermissao } from "@/lib/auth"
import { obterComparacao, type Avaliacao, type ParComparacao } from "@/lib/db/acordos-comparacoes"

import { definirAvaliacaoAction, excluirComparacaoAction } from "../actions"
import { AnalisarPar, DesfazerPar, ParearManual, VerDiferenca } from "./par-acoes"

export const metadata: Metadata = { title: "Comparação de acordos — Confluir" }
// "Analisar com IA" e "Parear" chamam a IA na server action.
export const maxDuration = 120

const SITUACOES: Situacao[] = ["alterada", "nova", "suprimida", "igual"]
const AVALIACOES: Avaliacao[] = ["favoravel", "desfavoravel", "neutra"]

function Cartao({ rotulo, valor, href, classe }: { rotulo: string; valor: number; href: string; classe?: string }) {
  return (
    <Link href={href} className="hover:border-primary/40 rounded-lg border p-3 transition-colors">
      <p className="text-muted-foreground text-xs">{rotulo}</p>
      <p className={`text-2xl font-semibold tabular-nums ${classe ?? ""}`}>{valor}</p>
    </Link>
  )
}

function rotuloLado(l: ParComparacao["a"]): string {
  if (!l) return "—"
  return [l.numero ? `Cláusula ${l.numero}` : null, l.titulo].filter(Boolean).join(" · ") || "(sem título)"
}

export default async function ComparacaoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ situacao?: string; avaliacao?: string; tema?: string }>
}) {
  await requirePermissao("acordos_coletivos")
  const { id } = await params
  const sp = await searchParams
  const c = await obterComparacao(id)
  if (!c) notFound()

  const situacao = SITUACOES.includes(sp.situacao as Situacao) ? (sp.situacao as Situacao) : null
  const avaliacao = AVALIACOES.includes(sp.avaliacao as Avaliacao) ? (sp.avaliacao as Avaliacao) : null
  const tema = temaClausula(sp.tema)

  const conta = (f: (p: ParComparacao) => boolean) => c.pares.filter(f).length
  const resumo = {
    alterada: conta((p) => p.situacao === "alterada"),
    nova: conta((p) => p.situacao === "nova"),
    suprimida: conta((p) => p.situacao === "suprimida"),
    igual: conta((p) => p.situacao === "igual"),
    favoravel: conta((p) => p.avaliacao === "favoravel"),
    desfavoravel: conta((p) => p.avaliacao === "desfavoravel"),
    neutra: conta((p) => p.avaliacao === "neutra"),
  }
  // Por padrão esconde as iguais (o que interessa é o que mudou).
  const visiveis = c.pares.filter(
    (p) =>
      (situacao ? p.situacao === situacao : p.situacao !== "igual") &&
      (!avaliacao || p.avaliacao === avaliacao) &&
      (!tema || p.tema === tema)
  )
  const temas = [...new Set(c.pares.map((p) => p.tema).filter(Boolean))] as NonNullable<ParComparacao["tema"]>[]
  const novas = c.pares
    .filter((p) => p.situacao === "nova" && p.b)
    .map((p) => ({ parId: p.id, rotulo: rotuloLado(p.b) }))

  const base = `/painel/representacao/acordos/comparacoes/${id}`
  const filtro = (mud: Record<string, string | null>) => {
    const q = new URLSearchParams()
    const atual: Record<string, string | null> = { situacao, avaliacao, tema, ...mud }
    for (const [k, v] of Object.entries(atual)) if (v) q.set(k, v)
    const s = q.toString()
    return s ? `${base}?${s}` : base
  }

  return (
    <>
      <RotuloTrilha valores={{ [id]: "Comparação" }} />
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/representacao/acordos/comparacoes">
            <ArrowLeft />
            Comparações
          </Link>
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight">Comparação de acordos</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              <span className="font-medium">A:</span>{" "}
              <Link href={`/painel/representacao/acordos/${c.acordoA.id}`} className="hover:underline">
                {c.acordoA.titulo}
              </Link>
              <span className="mx-2">→</span>
              <span className="font-medium">B:</span>{" "}
              <Link href={`/painel/representacao/acordos/${c.acordoB.id}`} className="hover:underline">
                {c.acordoB.titulo}
              </Link>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild>
              <a href={`${base}/planilha`}>
                <FileSpreadsheet />
                Planilha
              </a>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a href={`${base}/pdf`} target="_blank" rel="noreferrer">
                <FileText />
                PDF
              </a>
            </Button>
          </div>
        </div>
      </div>

      {c.avisos.map((a, i) => (
        <Alert key={i} variant="warning">
          <AlertDescription>{a}</AlertDescription>
        </Alert>
      ))}

      <div className="grid gap-3 sm:grid-cols-4">
        <Cartao rotulo="Alteradas" valor={resumo.alterada} href={filtro({ situacao: "alterada", avaliacao: null })} />
        <Cartao rotulo="Novas (só em B)" valor={resumo.nova} href={filtro({ situacao: "nova", avaliacao: null })} />
        <Cartao rotulo="Suprimidas (só em A)" valor={resumo.suprimida} href={filtro({ situacao: "suprimida", avaliacao: null })} />
        <Cartao rotulo="Iguais" valor={resumo.igual} href={filtro({ situacao: "igual", avaliacao: null })} />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Cartao rotulo="Favoráveis ao trabalhador" valor={resumo.favoravel} href={filtro({ avaliacao: "favoravel", situacao: null })} classe="text-success-fg" />
        <Cartao rotulo="Desfavoráveis ao trabalhador" valor={resumo.desfavoravel} href={filtro({ avaliacao: "desfavoravel", situacao: null })} classe="text-destructive" />
        <Cartao rotulo="Neutras" valor={resumo.neutra} href={filtro({ avaliacao: "neutra", situacao: null })} />
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Button variant={!situacao && !avaliacao && !tema ? "default" : "outline"} size="sm" asChild>
          <Link href={base}>O que mudou</Link>
        </Button>
        {temas.map((t) => (
          <Button key={t} variant={tema === t ? "default" : "outline"} size="sm" asChild>
            <Link href={filtro({ tema: tema === t ? null : t })}>{ROTULO_TEMA[t]}</Link>
          </Button>
        ))}
      </div>

      <p className="text-muted-foreground text-xs">
        {visiveis.length} de {c.pares.length} pares
        {situacao ? ` · ${ROTULO_SITUACAO[situacao].toLowerCase()}` : " · sem as iguais"}
        {avaliacao ? ` · ${ROTULO_AVALIACAO[avaliacao].toLowerCase()}` : ""}
        {tema ? ` · ${ROTULO_TEMA[tema]}` : ""}. A avaliação é sugestão da IA — confira no texto.
      </p>

      <div className="grid gap-3">
        {visiveis.map((p) => (
          <Card key={p.id} id={`par-${p.id}`}>
            <CardContent className="grid gap-3 pt-5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{ROTULO_SITUACAO[p.situacao]}</Badge>
                {p.avaliacao && (
                  <Badge variant="outline" className={CLASSE_AVALIACAO[p.avaliacao]}>
                    {ROTULO_AVALIACAO[p.avaliacao]}
                    {p.avaliacaoManual ? " (conferida)" : ""}
                  </Badge>
                )}
                {p.tema && <Badge variant="outline">{ROTULO_TEMA[p.tema]}</Badge>}
                {p.origem === "ia" && (
                  <Badge variant="outline" className="text-muted-foreground">
                    par sugerido pela IA
                  </Badge>
                )}
              </div>
              <div className="grid gap-1 text-sm md:grid-cols-2">
                <p>
                  <span className="text-muted-foreground text-xs">A · </span>
                  {rotuloLado(p.a)}
                </p>
                <p>
                  <span className="text-muted-foreground text-xs">B · </span>
                  {rotuloLado(p.b)}
                </p>
              </div>
              {p.resumo && <p className="text-sm leading-relaxed">{p.resumo}</p>}
              {p.avaliacaoMotivo && <p className="text-muted-foreground text-xs">{p.avaliacaoMotivo}</p>}

              {p.situacao === "alterada" || p.situacao === "igual" ? (
                <VerDiferenca comparacaoId={id} parId={p.id} />
              ) : (
                <details>
                  <summary className="text-muted-foreground cursor-pointer text-xs">Ver o texto</summary>
                  <p className="bg-muted/30 mt-2 max-h-[28rem] overflow-auto rounded-md border p-3 text-sm whitespace-pre-wrap">
                    {(p.a ?? p.b)?.texto}
                  </p>
                </details>
              )}

              <div className="flex flex-wrap items-center gap-1 border-t pt-2">
                {p.situacao !== "igual" &&
                  AVALIACOES.map((av) => (
                    <form key={av} action={definirAvaliacaoAction}>
                      <input type="hidden" name="comparacao_id" value={id} />
                      <input type="hidden" name="par_id" value={p.id} />
                      <input type="hidden" name="avaliacao" value={av} />
                      <Button
                        type="submit"
                        variant={p.avaliacao === av ? "secondary" : "ghost"}
                        size="sm"
                        className="h-7 text-xs"
                      >
                        {av === "favoravel" ? "Favorável" : av === "desfavoravel" ? "Desfavorável" : "Neutra"}
                      </Button>
                    </form>
                  ))}
                {p.situacao !== "igual" && <AnalisarPar comparacaoId={id} parId={p.id} jaAnalisado={Boolean(p.resumo)} />}
                {p.a && p.b && <DesfazerPar comparacaoId={id} parId={p.id} />}
              </div>
              {p.situacao === "suprimida" && <ParearManual comparacaoId={id} parId={p.id} novas={novas} />}
            </CardContent>
          </Card>
        ))}
      </div>

      <form action={excluirComparacaoAction} className="flex justify-end">
        <input type="hidden" name="comparacao_id" value={id} />
        <Button type="submit" variant="ghost" size="sm" className="text-destructive">
          <Trash2 />
          Excluir comparação
        </Button>
      </form>
    </>
  )
}
