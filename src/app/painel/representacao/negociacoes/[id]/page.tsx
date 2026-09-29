import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import {
  ArrowLeft,
  CalendarClock,
  Columns3,
  FileText,
  GitCompareArrows,
  Lock,
  Pencil,
  Vote,
} from "lucide-react"

import { RotuloTrilha } from "@/components/layout/trilha-rotulos"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ROTULO_TIPO } from "@/lib/acordos-constantes"
import { requirePermissao } from "@/lib/auth"
import { obterNegociacao, opcoesNegociacao, type NegociacaoDetalhe } from "@/lib/db/negociacoes"
import { formatarData } from "@/lib/formato"
import { ROTULO_EVENTO, ROTULO_PAPEL, ROTULO_SITUACAO_NEGOCIACAO } from "@/lib/negociacoes-constantes"

import {
  ConcluirNegociacao,
  EditarDocumento,
  ExcluirEvento,
  ExcluirNegociacao,
  NegociacaoForm,
  NovoDocumento,
  NovoEvento,
} from "../negociacao-forms"

export const metadata: Metadata = { title: "Negociação — Confluir" }

type ItemTempo = {
  chave: string
  data: string
  rotulo: string
  titulo: string
  descricao?: string | null
  href?: string
  eventoId?: string
}

/** Linha do tempo: registros à mão + documentos + rodadas da campanha + marcos. */
function linhaDoTempo(n: NegociacaoDetalhe): ItemTempo[] {
  const itens: ItemTempo[] = []
  if (n.inicio) itens.push({ chave: "inicio", data: n.inicio, rotulo: "Marco", titulo: "Início da negociação" })
  for (const d of n.documentos) {
    if (!d.data) continue
    itens.push({
      chave: `doc-${d.id}`,
      data: d.data,
      rotulo: ROTULO_PAPEL[d.papel] + (d.rodada ? ` · ${d.rodada}ª rodada` : ""),
      titulo: d.titulo,
      href: `/painel/representacao/acordos/${d.id}`,
    })
  }
  for (const r of n.rodadas) {
    const data = (r.inicio ?? r.termino)?.slice(0, 10)
    if (!data) continue
    itens.push({
      chave: `rod-${r.id}`,
      data,
      rotulo: "Votação",
      titulo: r.nome ?? "Rodada",
      descricao: r.apuracao_encerrada ? "Apuração encerrada" : r.termino ? `Até ${formatarData(r.termino)}` : null,
      href: `/painel/representacao/votacoes/rodadas/${r.id}`,
    })
  }
  for (const e of n.eventos) {
    itens.push({
      chave: `ev-${e.id}`,
      data: e.data,
      rotulo: ROTULO_EVENTO[e.tipo],
      titulo: e.titulo,
      descricao: [e.descricao, e.autor ? `— ${e.autor}` : null].filter(Boolean).join(" ") || null,
      eventoId: e.id,
    })
  }
  if (n.conclusao) itens.push({ chave: "fim", data: n.conclusao, rotulo: "Marco", titulo: "Negociação concluída" })
  return itens.sort((a, b) => b.data.localeCompare(a.data))
}

export default async function NegociacaoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ editar?: string; salvo?: string; concluida?: string }>
}) {
  await requirePermissao("negociacoes")
  const { id } = await params
  const sp = await searchParams
  const n = await obterNegociacao(id)
  if (!n) notFound()

  const editando = sp.editar === "1"
  const opcoes = editando ? await opcoesNegociacao() : null
  const aqui = `/painel/representacao/negociacoes/${id}`
  const aberta = n.situacao === "preparacao" || n.situacao === "em_curso"
  const temPauta = n.documentos.some((d) => d.papel === "pauta")
  const podeQuadro = Boolean(n.acordoVigente) || n.documentos.length > 0
  const tempo = linhaDoTempo(n)

  return (
    <>
      <RotuloTrilha valores={{ negociacoes: "Negociações", [id]: n.titulo }} />
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/representacao/negociacoes">
            <ArrowLeft />
            Negociações sindicais
          </Link>
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight text-balance">{n.titulo}</h1>
              <Badge variant="secondary">{ROTULO_TIPO[n.tipo]}</Badge>
              <Badge variant={n.situacao === "em_curso" ? "default" : "outline"}>
                {ROTULO_SITUACAO_NEGOCIACAO[n.situacao]}
              </Badge>
            </div>
            <p className="text-muted-foreground mt-1 flex flex-wrap items-center gap-1.5 text-xs">
              <Lock className="size-3.5" />
              Sigiloso
              {n.dataBase ? ` · data-base ${n.dataBase}` : ""}
              {n.empresas.length ? ` · ${n.empresas.map((e) => e.nome).join(", ")}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {podeQuadro && (
              <Button asChild>
                <Link href={`${aqui}/quadro`}>
                  <Columns3 />
                  Quadro comparativo
                </Link>
              </Button>
            )}
            {!editando && (
              <Button variant="outline" asChild>
                <Link href={`${aqui}?editar=1`}>
                  <Pencil />
                  Editar
                </Link>
              </Button>
            )}
          </div>
        </div>
      </div>

      {sp.salvo === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Negociação salva.</AlertDescription>
        </Alert>
      )}
      {sp.concluida === "1" && n.acordoFinal && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>
            Negociação concluída.{" "}
            <Link href={`/painel/representacao/acordos/${n.acordoFinal.id}`} className="underline">
              {n.acordoFinal.titulo}
            </Link>{" "}
            agora é o acordo vigente em Acordos coletivos.
          </AlertDescription>
        </Alert>
      )}

      {editando && opcoes ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Dados da negociação</CardTitle>
          </CardHeader>
          <CardContent>
            <NegociacaoForm negociacao={n} opcoes={opcoes} aoCancelarHref={aqui} />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="grid gap-4 pt-6 sm:grid-cols-2 lg:grid-cols-4">
            <Campo rotulo="Acordo vigente">
              {n.acordoVigente ? (
                <Link href={`/painel/representacao/acordos/${n.acordoVigente.id}`} className="text-primary hover:underline">
                  {n.acordoVigente.titulo}
                </Link>
              ) : (
                "—"
              )}
              {n.acordoVigente?.vigenciaFim && (
                <span className="text-muted-foreground block text-xs">
                  vence {formatarData(n.acordoVigente.vigenciaFim)}
                </span>
              )}
            </Campo>
            <Campo rotulo="Votações">
              {n.campanha ? (
                <Link
                  href={`/painel/representacao/votacoes/campanhas/${n.campanha.id}`}
                  className="text-primary inline-flex items-center gap-1 hover:underline"
                >
                  <Vote className="size-3.5" />
                  {n.campanha.tema}
                </Link>
              ) : (
                "—"
              )}
              {n.campanha && (
                <span className="text-muted-foreground block text-xs">{n.rodadas.length} rodada(s)</span>
              )}
            </Campo>
            <Campo rotulo="Início">{n.inicio ? formatarData(n.inicio) : "—"}</Campo>
            <Campo rotulo={n.acordoFinal ? "Acordo final" : "Conclusão"}>
              {n.acordoFinal ? (
                <Link href={`/painel/representacao/acordos/${n.acordoFinal.id}`} className="text-primary hover:underline">
                  {n.acordoFinal.titulo}
                </Link>
              ) : (
                "—"
              )}
              {n.conclusao && <span className="text-muted-foreground block text-xs">em {formatarData(n.conclusao)}</span>}
            </Campo>
            {n.observacoes && (
              <div className="sm:col-span-2 lg:col-span-4">
                <p className="text-muted-foreground text-xs">Observações</p>
                <p className="mt-0.5 text-sm whitespace-pre-wrap">{n.observacoes}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card id="documentos">
        <CardHeader>
          <CardTitle className="text-base">Pauta e propostas</CardTitle>
          <CardDescription>
            Cada documento guarda o PDF e as cláusulas extraídas. Compare um com o anterior ou abra o quadro vigente ×
            pauta × proposta.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {n.documentos.length === 0 && (
            <p className="text-muted-foreground text-sm">
              Nenhum documento ainda. Comece pela pauta de reivindicações aprovada pela categoria.
            </p>
          )}
          {n.documentos.map((d, i) => {
            const anterior = n.documentos
              .slice(0, i)
              .reverse()
              .find((x) => x.clausulas > 0)
            const base = anterior ?? (n.acordoVigente ? { id: n.acordoVigente.id } : null)
            return (
              <div key={d.id} className="grid gap-2 rounded-md border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={d.papel === "final" ? "default" : "secondary"}>{ROTULO_PAPEL[d.papel]}</Badge>
                  {d.rodada && <Badge variant="outline">{d.rodada}ª rodada</Badge>}
                  <span className="text-muted-foreground text-xs">{d.data ? formatarData(d.data) : ""}</span>
                </div>
                <Link
                  href={`/painel/representacao/acordos/${d.id}`}
                  className="text-primary inline-flex items-center gap-1.5 text-sm font-medium hover:underline"
                >
                  <FileText className="size-4" />
                  {d.titulo}
                </Link>
                <p className="text-muted-foreground text-xs">
                  {!d.temPdf
                    ? "Sem PDF — abra o documento para enviar."
                    : d.clausulas === 0
                      ? "PDF enviado, cláusulas ainda não extraídas."
                      : `${d.clausulas} cláusulas`}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  {d.clausulas > 0 && base && (
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/painel/representacao/acordos/comparacoes?a=${base.id}&b=${d.id}`}>
                        <GitCompareArrows />
                        Comparar com {anterior ? "o anterior" : "o vigente"} (IA)
                      </Link>
                    </Button>
                  )}
                  {n.acordoFinal?.id !== d.id && (
                    <details className="w-full">
                      <summary className="text-muted-foreground cursor-pointer text-xs">Editar tipo, rodada e data</summary>
                      <div className="mt-3">
                        <EditarDocumento doc={d} />
                      </div>
                    </details>
                  )}
                </div>
              </div>
            )
          })}
          {aberta && (
            <details className="rounded-md border border-dashed p-3" open={n.documentos.length === 0}>
              <summary className="cursor-pointer text-sm font-medium">Adicionar documento</summary>
              <div className="mt-4">
                <NovoDocumento negociacaoId={id} temPauta={temPauta} />
              </div>
            </details>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarClock className="size-4" />
            Linha do tempo
          </CardTitle>
          <CardDescription>Documentos, rodadas de votação da campanha e o que for registrado aqui.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <details className="rounded-md border border-dashed p-3">
            <summary className="cursor-pointer text-sm font-medium">Registrar acontecimento</summary>
            <div className="mt-3">
              <NovoEvento negociacaoId={id} />
            </div>
          </details>
          {tempo.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nada registrado ainda.</p>
          ) : (
            <ol className="border-muted relative grid gap-4 border-l pl-5">
              {tempo.map((t) => (
                <li key={t.chave} className="relative">
                  <span className="bg-primary absolute top-1.5 -left-[1.6rem] size-2.5 rounded-full" />
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-muted-foreground text-xs tabular-nums">{formatarData(t.data)}</span>
                    <Badge variant="outline" className="text-xs">
                      {t.rotulo}
                    </Badge>
                    {t.eventoId && <ExcluirEvento eventoId={t.eventoId} negociacaoId={id} />}
                  </div>
                  <p className="mt-0.5 text-sm">
                    {t.href ? (
                      <Link href={t.href} className="text-primary hover:underline">
                        {t.titulo}
                      </Link>
                    ) : (
                      t.titulo
                    )}
                  </p>
                  {t.descricao && <p className="text-muted-foreground text-xs whitespace-pre-wrap">{t.descricao}</p>}
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      {aberta && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Concluir negociação</CardTitle>
            <CardDescription>Quando o acordo for assinado.</CardDescription>
          </CardHeader>
          <CardContent>
            <ConcluirNegociacao
              negociacaoId={id}
              documentos={n.documentos}
              vigenteTitulo={n.acordoVigente?.titulo ?? null}
            />
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end">
        <ExcluirNegociacao negociacaoId={id} />
      </div>
    </>
  )
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-muted-foreground text-xs">{rotulo}</p>
      <div className="mt-0.5 text-sm">{children}</div>
    </div>
  )
}
